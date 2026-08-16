import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, normalize, isAbsolute, sep } from "node:path";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import { isUnder, trickDataDir } from "./writepath.js";

/**
 * A trick is a folder under `.claude/tricks/<name>/` with a `trick.yaml`
 * manifest — see `panel/docs/tricks-spec.md`. This module mirrors
 * `vault.ts`'s style: pure functions over the filesystem, a dedicated
 * path-safety check before anything touches disk, and "one broken thing
 * degrades gracefully" (a malformed trick is skipped when listing, not a
 * crash).
 *
 * **v2** (spec rewritten 2026-08-15): a trick is an arbitrary mini app
 * under `app/`, served into an opaque-origin sandbox, plus a
 * `capacidades:` map that is the *complete* list of what its browser-side
 * code may touch. This module owns the manifest schema, the app-file
 * resolution and headers (spec §5.3), and — predating v1's renderer and
 * outliving it — the `correr_script` boundary (§11). The bridge that
 * spends those capabilities lives in `bridge.ts`.
 *
 * **There is one kind of trick.** The fixed-vocabulary v1 manifest
 * (`ui.campos`, `control: lista`, the `set`/`crear_nota`/`archivar`
 * verbs) and the `tipo: "legacy"` compatibility path were deleted
 * 2026-08-15: the one real v1 trick on the one real deployment was
 * removed first, so nothing depended on them. `app:` is therefore
 * **required**, and a manifest without it is invalid in exactly the way
 * every other invalid manifest is — skipped from the listing with a
 * logged reason, 404 on the detail route. Two code paths that render a
 * trick is the drift this repo keeps writing down as a bug; a second one
 * kept alive "for one release" is the same bug with a date on it.
 */

export const TRICKS_DIR = ".claude/tricks";

/** Thrown with an HTTP status attached, so route handlers can pass it straight through. */
export class TrickError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * `correr_script`'s declared shape (tricks-spec.md "Running a script").
 * `ruta` and `args` are read from this — from the server's own disk read
 * of trick.yaml, never from a request body — by `runTrickAction` below.
 */
const correrScriptSchema = z.object({
  ruta: z.string(),
  args: z.array(z.string()).optional().default([]),
});

/**
 * `correr_script` is now the **only** action verb.
 *
 * `set`, `crear_nota` and `archivar` used to be accepted here so that a
 * v1 manifest naming them still validated and listed. They were never
 * implemented and nothing ran them; they existed for the declarative
 * renderer that is gone. A v2 app does those things itself, through
 * `vault.write` on the bridge, so the verbs are deleted rather than left
 * as a vocabulary a manifest can name and nothing honours.
 *
 * `.passthrough()` on both levels stays: `acciones` entries in the
 * shipped starters carry a leftover `control: boton` key, and a manifest
 * may reasonably annotate an action with more than this server reads.
 * Nothing outside `correr_script` is interpreted.
 */
const trickAccionDefSchema = z
  .object({ correr_script: correrScriptSchema.optional() })
  .passthrough();

const trickAccionSchema = z
  .object({
    etiqueta: z.string().optional(),
    accion: trickAccionDefSchema.optional(),
  })
  .passthrough();

/**
 * `app:` — **required** (spec §4.1). A trick *is* an app; a manifest
 * with no `app:` block names no document to mount and is invalid. The
 * two fields are the only things the *server* needs: where the entry
 * document is, and how tall the frame should be.
 */
const appSchema = z
  .object({
    entrada: z.string().optional(),
    alto: z.number().int().min(120).max(2000).optional(),
  })
  .passthrough();

export const DEFAULT_ENTRADA = "index.html";
export const DEFAULT_ALTO = 480;

/**
 * The complete capability vocabulary (spec §7). This list is the
 * security-relevant part of the manifest schema: **an unknown key
 * invalidates the whole manifest** rather than being ignored, because a
 * silently-ignored `vault.wirte:` is indistinguishable from a denied one
 * at runtime, and the author debugging it sees "capability_denied" for
 * something they believe they declared.
 *
 * `estado` is one key granting two ops (`estado.get`, `estado.set`) — a
 * store you can write but not read is not a store. Everything else is
 * one-to-one. The mapping lives in `bridge.ts`, which is the only place
 * that spends them.
 */
export const CAPABILITY_KEYS = [
  "vault.query",
  "vault.read",
  "vault.write",
  "estado",
  "script.run",
  "trabajo.estado",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/** Ceilings from spec §7.1/§7.3/§7.4. A manifest may lower these, never raise them. */
export const DEFAULT_QUERY_LIMIT = 200;
export const MAX_QUERY_LIMIT = 2000;
export const DEFAULT_READ_EXTENSIONS = [".md"];
export const DEFAULT_WRITE_MAX_BYTES = 256 * 1024;
export const DEFAULT_ESTADO_MAX_BYTES = 64 * 1024;
/** Extensions `vault.write` may create or modify (§7.3 check 3). Not configurable per trick. */
export const WRITE_EXTENSIONS = [".md", ".json", ".csv", ".txt"];

const extensionList = z
  .array(z.string().regex(/^\.[a-z0-9]+$/, "extensions look like .md, lowercase"))
  .nonempty();

const capabilitySchemas = {
  "vault.query": z
    .object({
      carpeta: z.string(),
      frontmatter: z.record(z.string(), z.unknown()).optional(),
      frontmatter_exists: z.array(z.string()).optional(),
      campos: z.array(z.string()).optional(),
      limite: z.number().int().positive().max(MAX_QUERY_LIMIT).optional(),
    })
    .strict(),
  "vault.read": z
    .object({ carpeta: z.string(), extensiones: extensionList.optional() })
    .strict(),
  "vault.write": z
    .object({
      carpeta: z.string(),
      crear: z.boolean().optional(),
      campos: z.array(z.string()).optional(),
      cuerpo: z.boolean().optional(),
      max_bytes: z.number().int().positive().max(4 * 1024 * 1024).optional(),
    })
    .strict(),
  estado: z
    .object({ max_bytes: z.number().int().positive().max(4 * 1024 * 1024).optional() })
    .strict(),
  "script.run": z.object({ acciones: z.array(z.number().int().min(0)) }).strict(),
  "trabajo.estado": z.object({ job: z.string().min(1) }).strict(),
} satisfies Record<CapabilityKey, z.ZodTypeAny>;

/** The manifest's capabilities, with every default resolved. Denied = absent, always. */
export interface TrickCapabilities {
  "vault.query"?: {
    carpeta: string;
    frontmatter?: Record<string, unknown>;
    frontmatter_exists?: string[];
    campos?: string[];
    limite: number;
  };
  "vault.read"?: { carpeta: string; extensiones: string[] };
  "vault.write"?: {
    carpeta: string;
    crear: boolean;
    campos: string[];
    cuerpo: boolean;
    max_bytes: number;
  };
  estado?: { max_bytes: number };
  "script.run"?: { acciones: number[] };
  "trabajo.estado"?: { job: string };
}

/**
 * Top-level manifest shape. `titulo` and `app` are required: a trick is
 * a document the panel mounts, and one with no document to mount is a
 * manifest that cannot be honoured.
 *
 * The v1 `datos:` and `ui:` fields are gone from the schema, so a v1
 * manifest loses them at parse time and then fails on the missing
 * `app:` — one failure, one reason, the same as any other invalid
 * manifest.
 *
 * `capacidades` is parsed as an opaque record and validated by
 * `validateCapabilities` below, which needs the trick's *name* to apply
 * §4.1's `vault.write.carpeta` rule — a thing a zod schema alone cannot
 * see.
 */
const trickManifestSchema = z.object({
  titulo: z.string(),
  descripcion: z.string().optional(),
  icono: z.string().optional(),
  app: appSchema,
  capacidades: z.record(z.string(), z.unknown()).nullish(),
  acciones: z.array(trickAccionSchema).optional(),
  programacion: z.unknown().optional(),
});

export type TrickManifest = Omit<z.infer<typeof trickManifestSchema>, "app" | "capacidades"> & {
  /** Always present — `app:` is required. Defaults resolved. */
  app: { entrada: string; alto: number };
  /** Always present (possibly empty) so consumers never branch on undefined. */
  capacidades: TrickCapabilities;
};

export interface TrickSummary {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
  /** The frame height the manifest asked for, defaults resolved. */
  alto: number;
  /** Manifest keys, not ops (spec §6.2). `[]` means the app gets no bridge at all. */
  capacidades: CapabilityKey[];
}

/**
 * A `carpeta` is a vault-relative folder, and the rules are narrower than
 * `safeRelPath`'s because this one grants standing access rather than
 * naming one file: no `..`, no leading `/`, and **`""`, `"."` and `"/"`
 * are refused** — "the whole vault" is not a capability (spec §4.1). A
 * trick that wants everything has to say so folder by folder, which is
 * the point.
 */
function normalizeCarpeta(raw: unknown, where: string): string {
  if (typeof raw !== "string") {
    throw new TrickError(422, `${where}.carpeta is required and must be a string`);
  }
  if (raw.includes("\0") || raw.includes("\\")) {
    throw new TrickError(422, `${where}.carpeta is not a safe path: ${raw}`);
  }
  if (isAbsolute(raw) || raw.startsWith("/")) {
    throw new TrickError(422, `${where}.carpeta must be vault-relative, not absolute: ${raw}`);
  }
  const segments = raw.split("/").filter((s) => s.length > 0);
  if (segments.some((s) => s === "." || s === "..")) {
    throw new TrickError(422, `${where}.carpeta must not contain . or .. segments: ${raw}`);
  }
  const rel = segments.join("/");
  if (!rel) {
    throw new TrickError(422, `${where}.carpeta must name a folder — the whole vault is not a capability`);
  }
  return rel;
}

/**
 * §4.1 and §7, enforced. Called with the trick's own name because two
 * rules depend on it:
 *
 * - `vault.write.carpeta` may not be under `.claude/` **unless** it is
 *   this trick's own `data/` folder. That is `.claude/` being executable
 *   configuration (§2.2) enforced rather than trusted: a trick's
 *   browser-side code must never be able to write a manifest, a skill, a
 *   script or an app file — *including its own*, which is the case people
 *   assume is harmless and is not. A trick that can rewrite its own
 *   `trick.yaml` can grant itself `script.run` over any action it likes.
 * - the same rule is why nothing here is allowed to name another trick's
 *   folder for writing.
 */
function validateCapabilities(name: string, raw: unknown): TrickCapabilities {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new TrickError(422, "capacidades must be a map of capability names");
  }

  const out: TrickCapabilities = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(CAPABILITY_KEYS as readonly string[]).includes(key)) {
      throw new TrickError(
        422,
        `unknown capability "${key}" — known: ${CAPABILITY_KEYS.join(", ")}`,
      );
    }
    const cap = key as CapabilityKey;
    // `estado:` with nothing after it is valid YAML and parses to null.
    // Treating it as "declared, all defaults" is what an author means.
    const parsed = capabilitySchemas[cap].safeParse(value ?? {});
    if (!parsed.success) {
      throw new TrickError(422, `capacidades.${key} is invalid: ${parsed.error.message}`);
    }

    switch (cap) {
      case "vault.query": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["vault.query"]>;
        out["vault.query"] = {
          carpeta: normalizeCarpeta(v.carpeta, "capacidades.vault.query"),
          frontmatter: v.frontmatter,
          frontmatter_exists: v.frontmatter_exists,
          campos: v.campos,
          limite: Math.min(v.limite ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT),
        };
        break;
      }
      case "vault.read": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["vault.read"]>;
        out["vault.read"] = {
          carpeta: normalizeCarpeta(v.carpeta, "capacidades.vault.read"),
          extensiones: v.extensiones ?? DEFAULT_READ_EXTENSIONS,
        };
        break;
      }
      case "vault.write": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["vault.write"]>;
        const carpeta = normalizeCarpeta(v.carpeta, "capacidades.vault.write");
        if (
          (carpeta === ".claude" || carpeta.startsWith(".claude/")) &&
          !isUnder(carpeta, trickDataDir(name))
        ) {
          throw new TrickError(
            422,
            `capacidades.vault.write.carpeta may not be under .claude/ — only ${trickDataDir(name)}`,
          );
        }
        out["vault.write"] = {
          carpeta,
          crear: v.crear ?? false,
          campos: v.campos ?? [],
          cuerpo: v.cuerpo ?? false,
          max_bytes: v.max_bytes ?? DEFAULT_WRITE_MAX_BYTES,
        };
        break;
      }
      case "estado": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["estado"]>;
        out.estado = { max_bytes: v.max_bytes ?? DEFAULT_ESTADO_MAX_BYTES };
        break;
      }
      case "script.run": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["script.run"]>;
        out["script.run"] = { acciones: v.acciones };
        break;
      }
      case "trabajo.estado": {
        const v = parsed.data as z.infer<(typeof capabilitySchemas)["trabajo.estado"]>;
        out["trabajo.estado"] = { job: v.job };
        break;
      }
    }
  }
  return out;
}

/**
 * `app.entrada` (§4.1): a single relative path, no `..`, resolving under
 * `app/`, ending `.html`. The `.html` rule is not cosmetic — the entry
 * document is the thing the panel points an iframe at, and pointing an
 * iframe at a `.js` or a `.png` is an authoring mistake worth catching at
 * validation time rather than as a blank rectangle.
 */
function validateEntrada(raw: string | undefined): string {
  const entrada = raw ?? DEFAULT_ENTRADA;
  if (entrada.includes("\0") || entrada.includes("\\")) {
    throw new TrickError(422, `app.entrada is not a safe path: ${entrada}`);
  }
  if (isAbsolute(entrada) || entrada.startsWith("/")) {
    throw new TrickError(422, `app.entrada must be relative to app/: ${entrada}`);
  }
  const segments = entrada.split("/").filter((s) => s.length > 0);
  if (!segments.length || segments.some((s) => s === "." || s === "..")) {
    throw new TrickError(422, `app.entrada must not contain . or .. segments: ${entrada}`);
  }
  if (!entrada.toLowerCase().endsWith(".html")) {
    throw new TrickError(422, `app.entrada must be an .html file: ${entrada}`);
  }
  return segments.join("/");
}

/**
 * A trick *name* is a single path segment, never a path — same
 * discipline as `safeRelPath` in `vault.ts`, but narrower: no slashes at
 * all, since it's used to build `.claude/tricks/<name>/trick.yaml`, not
 * an arbitrary vault-relative path.
 */
export function safeTrickName(name: string): string {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name === "." ||
    name === ".."
  ) {
    throw new TrickError(400, `unsafe trick name: ${name}`);
  }
  return name;
}

/**
 * Reads and validates one trick's `trick.yaml` fresh off disk. Used both
 * by the `GET /api/tricks/:name` route and by `runTrickAction` — the
 * latter deliberately never caches, so an action's `ruta`/`args` always
 * reflect what's on disk right now, not what a client claims about a
 * previously-fetched manifest.
 */
export async function readTrickManifest(
  vaultDir: string,
  name: string,
): Promise<TrickManifest> {
  const safe = safeTrickName(name);
  const manifestPath = join(vaultDir, TRICKS_DIR, safe, "trick.yaml");

  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    throw new TrickError(404, `trick not found: ${name}`);
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(raw);
  } catch (err) {
    throw new TrickError(422, `trick.yaml is not valid YAML: ${(err as Error).message}`);
  }

  const result = trickManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new TrickError(422, `trick.yaml failed validation: ${result.error.message}`);
  }

  const { app, capacidades, ...rest } = result.data;
  return {
    ...rest,
    app: { entrada: validateEntrada(app.entrada), alto: app.alto ?? DEFAULT_ALTO },
    capacidades: validateCapabilities(safe, capacidades),
  };
}

/**
 * Scans every `.claude/tricks/<name>/trick.yaml`. A trick whose YAML fails to parse
 * or fails validation is skipped, not fatal to the listing — same
 * "one broken thing degrades gracefully" principle `buildIndex` in
 * `vault.ts` applies to a single malformed note. `onSkip`, if given, is
 * called so the caller can log *why* (the panel's Fastify logger, at the
 * route level) rather than the failure vanishing silently.
 */
export async function listTricks(
  vaultDir: string,
  onSkip?: (name: string, err: unknown) => void,
): Promise<TrickSummary[]> {
  const tricksRoot = join(vaultDir, TRICKS_DIR);
  let entries;
  try {
    entries = await readdir(tricksRoot, { withFileTypes: true });
  } catch {
    return []; // no .claude/tricks/ yet — nothing to list, not an error
  }

  const out: TrickSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const manifest = await readTrickManifest(vaultDir, e.name);
      out.push({
        name: e.name,
        titulo: manifest.titulo,
        descripcion: manifest.descripcion,
        icono: manifest.icono,
        alto: manifest.app.alto,
        capacidades: Object.keys(manifest.capacidades) as CapabilityKey[],
      });
    } catch (err) {
      onSkip?.(e.name, err);
    }
  }
  return out;
}

/**
 * The `correr_script` trust boundary (tricks-spec.md "Running a
 * script"): `ruta` must resolve, after normalization, to somewhere under
 * `.claude/tricks/` — absolute paths and any `../` escape are rejected
 * before anything runs. Deliberately not `safeRelPath` from `vault.ts`:
 * that function only guarantees "stays under the vault root," which is
 * the right rule for a note path but too loose for a script path — a
 * script must stay under `.claude/tricks/` specifically, scoped one
 * level tighter, per the spec's explicit "any script under
 * `.claude/tricks/`, not only the calling trick's own subfolder" choice.
 */
export function safeScriptPath(vaultDir: string, ruta: string): string {
  if (typeof ruta !== "string" || ruta.length === 0) {
    throw new TrickError(400, "correr_script.ruta is required");
  }
  if (ruta.includes("\0")) {
    throw new TrickError(400, `unsafe script path: ${ruta}`);
  }
  if (isAbsolute(ruta)) {
    throw new TrickError(400, `script ruta must be relative, not absolute: ${ruta}`);
  }

  const tricksRoot = normalize(join(vaultDir, TRICKS_DIR));
  const full = normalize(join(vaultDir, ruta));
  const rootWithSep = tricksRoot.endsWith(sep) ? tricksRoot : tricksRoot + sep;

  if (full !== tricksRoot && !full.startsWith(rootWithSep)) {
    throw new TrickError(400, `script path escapes ${TRICKS_DIR}/: ${ruta}`);
  }
  return full;
}

// ---------------------------------------------------------------------------
// Serving the app (spec §5.3). Everything below is about getting arbitrary
// author-written HTML/CSS/JS into an opaque origin, and refusing every other
// way of asking for it.
// ---------------------------------------------------------------------------

/** `<vault>/.claude/tricks/<name>/app` — the served root. Nothing above it is reachable. */
export function appRoot(vaultDir: string, name: string): string {
  return normalize(join(vaultDir, TRICKS_DIR, safeTrickName(name), "app"));
}

/**
 * Content types for app files, from an allowlist, **never sniffed** and
 * never derived from anything the client sent.
 *
 * Deliberately *not* `servePolicy` from `attachments.ts`, and the reason
 * is worth stating because reusing it looks obviously right and would
 * break every trick: that function's entire job is to refuse to give
 * `.html`, `.svg` and `.js` their real Content-Type, because an
 * attachment is served **on the panel's origin** where executing is the
 * whole danger. Here the danger is removed by a different mechanism — the
 * `Content-Security-Policy: sandbox` on the response plus the iframe's
 * own `sandbox` attribute (§5.1) — and the app is *supposed* to execute.
 * Two different questions; one allowlist each. What they share is the
 * rule that neither ever sniffs and both always send `nosniff`.
 *
 * An unknown extension is served as `application/octet-stream`, which
 * with `nosniff` means a browser will refuse to interpret it. That is the
 * right failure for a file type nobody has thought about.
 */
const APP_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  xml: "text/xml; charset=utf-8",
  // SVG gets its real type here, unlike in attachments.ts: inside the
  // sandbox its script (if any) runs on an opaque origin with
  // `connect-src 'none'`, which is exactly where the author's own code is
  // supposed to run.
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  wasm: "application/wasm",
  pdf: "application/pdf",
};

export function appContentType(relPath: string): string {
  const name = relPath.split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return APP_TYPES[ext] ?? "application/octet-stream";
}

/**
 * The exact policy from spec §5.3, as one string. Every directive is
 * load-bearing and the reasoning is in the spec; the two most important:
 *
 * - `sandbox allow-scripts` and **nothing else**. Never
 *   `allow-same-origin` (a frame with both can reach `window.frameElement`,
 *   strip its own sandbox attribute and reload unsandboxed on the parent's
 *   origin — §5.1). Never `allow-forms` either: its absence is what stops
 *   a form POST reaching `/api/*` (§10.4).
 * - `connect-src 'none'` is what makes the API unreachable from the frame
 *   *at all*, rather than merely unreadable. An opaque origin can still
 *   issue a CORS-simple POST that a server executes — measured, §10.3.
 *   Never relax it.
 *
 * `'self'` resolves against the document's **URL** origin (the panel's),
 * not its opaque origin, so it genuinely constrains — verified in §10.5 —
 * and using it rather than an origin built from the `Host` header keeps
 * the policy independent of a client-supplied value.
 */
export const APP_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "worker-src blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

/**
 * The panel's own CSP (spec §5.4). `frame-src 'self'` is the security
 * control here, not hygiene: a sandboxed frame may navigate *itself*
 * (`allow-top-navigation` governs only the top window), and `frame-src`
 * on the embedding page governs what URL the nested document may become,
 * whoever initiated it. It is what guarantees the frame can never turn
 * into a foreign origin, which is in turn what makes it safe for the host
 * to send the bridge port with `targetOrigin: "*"` (§6.2).
 */
export const PANEL_CSP = [
  "default-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export type AppGate = { ok: true } | { ok: false; status: number; error: string };

/**
 * Who may load an app URL, from `Sec-Fetch-*` (spec §5.3, measured in
 * §10.6). Both headers are browser-set and forbidden to page script, so a
 * page cannot lie about them; a client that sends neither is not a
 * browser.
 *
 *   panel mounts the frame        dest=iframe    site=same-origin   → serve
 *   user opens the URL in a tab   dest=document  site=none          → 403
 *   frame navigating into another
 *     trick's app                 dest=iframe    site=cross-site    → 403
 *   the app's own subresources    dest=script|style|image|font|…    → serve
 *
 * The top-level case is not hypothetical politeness: before this gate
 * existed, opening an app URL directly loaded the app as its own document
 * and it **redirected the tab to example.com**. A top-level sandboxed
 * document can navigate itself; `Content-Security-Policy: sandbox` does
 * not stop that.
 *
 * **Do NOT add a `Sec-Fetch-Site` check to the subresource branch.** An
 * app's own assets report `site=cross-site` — the initiator origin is
 * opaque, so every request the app makes for its own files looks
 * cross-site — and 403ing them makes every script, stylesheet and image
 * fail. Because the 403 body is JSON served with `nosniff`, the symptom
 * is "my assets are fetched but never execute," with no CSP violation and
 * nothing obviously wrong. That wrong version cost real diagnosis time
 * during the design (spec §10.6); this comment is the fence around it.
 *
 * `dest` absent → 403, so this fails closed for curl and for browsers old
 * enough not to send `Sec-Fetch-*`. A trick that does not render is the
 * correct failure; a trick served to an unidentifiable client is not.
 */
export function appRequestGate(dest: unknown, site: unknown): AppGate {
  if (typeof dest !== "string" || dest === "") {
    return {
      ok: false,
      status: 403,
      error:
        "trick apps are only served to browsers that send Sec-Fetch-Dest; " +
        "they are mounted in the panel, not fetched directly",
    };
  }
  if (dest === "iframe" || dest === "frame") {
    if (site !== "same-origin") {
      return { ok: false, status: 403, error: "a trick app may only be framed by the panel" };
    }
    return { ok: true };
  }
  if (dest === "document") {
    return { ok: false, status: 403, error: "a trick app cannot be opened as a page" };
  }
  // Subresource. Deliberately no Sec-Fetch-Site check — see above.
  return { ok: true };
}

/**
 * Fallback for browsers that send **no** `Sec-Fetch-*` headers at all —
 * found live, 2026-08-15, on the one real deployment: `vault-steward`
 * failed with `appRequestGate`'s own refusal message, logged with
 * `dest:null, site:null`, over a genuine Tailscale MagicDNS address. Not a
 * dev artifact — a real device on the tailnet (older Safari before 16.4,
 * an iOS in-app WebView, or a locked-down corporate browser) that never
 * sends Fetch Metadata. `appRequestGate`'s `dest absent → 403` is correct
 * for *that* signal, but it has no fallback, so those browsers cannot use
 * tricks at all.
 *
 * The constraint that makes this hard: the gate exists to stop exactly one
 * thing — a top-level sandboxed document navigating itself, the redirector
 * `§10.6` measured before the gate existed. Whatever replaces the missing
 * signal must not let that back in, and it has to authenticate **every**
 * request the mount makes (entrada and every subresource), because a
 * browser that sends no `Sec-Fetch-Dest` sends none on *any* of them —
 * this is not "the first request is unlabelled," it is "none of them are."
 *
 * **Why not a cookie.** A cookie looks like the obvious transport: set it
 * once, let the browser attach it to every subsequent request for free.
 * Measured against a real sandboxed iframe in real Chrome (throwaway
 * harness, not in this repo) before writing this code:
 *
 * - `SameSite=Lax` and `SameSite=Strict` cookies, set by a same-origin
 *   top-level request, were attached **zero times** to a request made
 *   *from inside* `<iframe sandbox="allow-scripts">` (no
 *   `allow-same-origin`) for a resource on that same real origin — not to
 *   an `<img src>`, not to a `fetch`. The frame's opaque origin breaks the
 *   ancestor-chain "same-site" check the browser uses to decide whether to
 *   attach them, and that check does not care that the *URL* being
 *   requested is same-origin — only that the *requesting document's
 *   origin* is opaque, which every trick frame's is, by design (§5.1).
 * - Only `SameSite=None` reached the server at all, and inconsistently —
 *   the `<img>` request carried it, a same-context `fetch()` did not
 *   (default `credentials: "same-origin"`, and "same-origin" from an
 *   opaque origin matches nothing). `SameSite=None` also requires
 *   `Secure`, which requires HTTPS, which this deployment does not have
 *   (`panel/deploy/README.md`: no auth, the tailnet is the perimeter,
 *   plain HTTP) — so the one variant that partially worked cannot be set
 *   on the real server at all.
 *
 * So a cookie cannot reach a trick's subresource requests on this
 * deployment, reliably or not. Nothing here reads or sets one.
 *
 * **Why not a plain GET-minted credential.** Even if delivery worked, GET
 * is CORS-simple: any page the vault's owner has open in *any* tab could
 * trigger a GET side effect with no preflight, exactly the shape §10.3
 * found for a "simple" POST. A cross-site page silently priming a fallback
 * credential ahead of a later attack is worse than not having a fallback.
 *
 * **The mechanism.** `POST /api/tricks/:name/mount` (below) mints a
 * single-use, per-trick token — reusing the cross-site guard in
 * `index.ts` rather than inventing a second one, exactly as this file's
 * own comment on `correr_script` and `§6.8`'s bridge route already do for
 * every other mutating endpoint. The panel mints one immediately before
 * setting the iframe's `src`, for **every** mount regardless of browser —
 * page script cannot read `Sec-Fetch-*`, so there is no way to feature-
 * detect the strict path and skip minting only when it's needed.
 *
 * The token authenticates the *entrada* request once (`consumeMountToken`)
 * and, on success, opens a short **per-trick-name** window
 * (`openWindows`) that subsequent subresource requests for that same
 * trick are checked against instead — subresources can't carry the token
 * themselves, since `<link href="style.css">` resolves with no query
 * string to append it to, and rewriting the app's HTML to inject one was
 * already rejected for `srcdoc` in §5.2 for the same reason: it cannot
 * reach a URL a script builds at runtime, and "no constraints on the
 * app's code" is the whole point of this design.
 *
 * **Residual risk, named rather than hidden.** During that window, *any*
 * dest-absent GET for that trick's subresource paths is served — there is
 * no way to tie the window back to one specific document instance without
 * a per-request credential, and subresources have none. If that window
 * covered `.html` (or `.svg`, or anything else a browser can render and
 * run script in as a full top-level document), a raw top-level open of
 * *that* path during the window would be exactly the redirector this gate
 * exists to prevent, just one file over from the one the token actually
 * guards. Closed, not merely accepted: `isFallbackSafeExtension` allow-
 * lists ordinary subresource types only (css, js, images, fonts, media,
 * wasm, …) and excludes `.html`/`.htm` (only the manifest's declared
 * `entrada` may ever be served that way, and only once per token) and
 * `.svg`/`.xml` (both can carry and run their own script when navigated to
 * directly, same failure mode as html). `frame-src 'none'` in `APP_CSP`
 * means a well-behaved app never needs an `.html` subresource anyway — a
 * trick cannot frame anything, including its own other pages — so the
 * exclusion costs nothing a real app was using. It does cost old-Safari-
 * class browsers the ability to use `.svg` assets in a trick (§14): a
 * known, deliberate gap, not an oversight.
 *
 * The entrada check stays single-use even within the window: a second GET
 * for the entrada path with the same (now-spent) token fails, so the
 * token itself cannot be replayed to re-open a fresh top-level load later
 * — only the one mount it was minted for gets to use it, and only once.
 *
 * **Regression safety.** None of this runs unless `Sec-Fetch-Dest` is
 * entirely absent. A browser that sends it — the strict majority — hits
 * `appRequestGate` exactly as before; this code never sees that request.
 */

/** How long a minted token stays valid for its one entrada load. */
const MOUNT_TOKEN_TTL_MS = 20_000;
/** How long, from a successful entrada load, that trick's subresources may load for. */
const MOUNT_WINDOW_MS = 20_000;

interface MountTokenState {
  trick: string;
  expiresAt: number;
  entradaServed: boolean;
}

/** token → its state. Per-process, in-memory — same posture as `bridge.ts`'s rate-limit buckets: an operational ceiling, not vault state, and losing it on restart costs nothing but a remount. */
const mountTokens = new Map<string, MountTokenState>();
/** trick name → when its subresource window closes. */
const openWindows = new Map<string, number>();

function sweepMountState(now: number): void {
  for (const [token, state] of mountTokens) {
    if (state.expiresAt <= now) mountTokens.delete(token);
  }
  for (const [name, expiresAt] of openWindows) {
    if (expiresAt <= now) openWindows.delete(name);
  }
}

/**
 * Mints a token for one trick, only after confirming — with the same
 * fresh, never-cached disk read every other trick route uses — that the
 * trick currently validates. A token minted for a name that doesn't
 * resolve to a real trick would be inert (the entrada check re-validates
 * the manifest anyway when it's actually used), but failing here means
 * the panel's mount UI sees the same 404 it would from `GET
 * /api/tricks/:name` instead of a token that can never be spent.
 */
export async function mintMountToken(
  vaultDir: string,
  name: string,
  now = Date.now(),
): Promise<string> {
  await readTrickManifest(vaultDir, name);
  sweepMountState(now);
  const token = randomBytes(24).toString("hex");
  mountTokens.set(token, { trick: name, expiresAt: now + MOUNT_TOKEN_TTL_MS, entradaServed: false });
  return token;
}

function consumeMountToken(name: string, token: unknown, now: number): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  sweepMountState(now);
  const state = mountTokens.get(token);
  if (!state || state.trick !== name || state.expiresAt <= now || state.entradaServed) {
    return false;
  }
  // Spent for the entrada regardless of what happens next — a second GET
  // for the entrada with this same token must fail (see file comment).
  state.entradaServed = true;
  openWindows.set(name, now + MOUNT_WINDOW_MS);
  return true;
}

function hasOpenWindow(name: string, now: number): boolean {
  sweepMountState(now);
  const expiresAt = openWindows.get(name);
  return typeof expiresAt === "number" && expiresAt > now;
}

/**
 * Subresource types the fallback window will ever serve. Deliberately an
 * allowlist, not a blocklist of the dangerous ones — the default for an
 * extension nobody has thought about is refuse, same posture
 * `appContentType` takes for `Content-Type` itself. `.html`/`.htm`
 * (reserved for the one-shot entrada check) and `.svg`/`.xml` (can run
 * script when navigated to directly, same as html) are the exclusions
 * that matter; see the file comment for why.
 */
const FALLBACK_SAFE_EXTENSIONS = new Set([
  "css",
  "js",
  "mjs",
  "json",
  "map",
  "txt",
  "csv",
  "md",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "wasm",
]);

function isFallbackSafeExtension(relPath: string): boolean {
  const base = relPath.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return FALLBACK_SAFE_EXTENSIONS.has(ext);
}

/**
 * The fallback decision for one `GET /api/tricks/:name/app/*` request that
 * arrived with no `Sec-Fetch-Dest` at all. `rel` is the file path already
 * resolved and validated by `resolveAppFile` (so path-escape is already
 * ruled out by the time this runs); `isEntrada` is whether it equals the
 * manifest's own `app.entrada`.
 */
export function fallbackAppGate(
  name: string,
  rel: string,
  isEntrada: boolean,
  token: unknown,
  now = Date.now(),
): AppGate {
  if (isEntrada) {
    if (!consumeMountToken(name, token, now)) {
      return {
        ok: false,
        status: 403,
        error:
          "no valid one-time mount token for this trick — a browser sending no " +
          "Sec-Fetch-Dest must be mounted through the panel, which mints one " +
          "immediately before loading the frame (POST /api/tricks/:name/mount)",
      };
    }
    return { ok: true };
  }
  if (!isFallbackSafeExtension(rel)) {
    return {
      ok: false,
      status: 403,
      error: "this file type is not servable to a browser that sends no Sec-Fetch-Dest",
    };
  }
  if (!hasOpenWindow(name, now)) {
    return {
      ok: false,
      status: 403,
      error: "no active fallback mount session for this trick — load its entrada first",
    };
  }
  return { ok: true };
}

/**
 * Resolve one `GET /api/tricks/:name/app/*` request to an absolute file
 * path. `manifestEntrada` is the validated `app.entrada`, used when the
 * remainder is empty.
 *
 * Same discipline as `safeScriptPath`, one level deeper: normalize first,
 * then require the result to be the app root or under it. The string is
 * never trusted, and the answer is re-asked of the *filesystem* by
 * `assertAppRealPath` afterwards, because a symlink is invisible to any
 * amount of string checking.
 */
export function resolveAppFile(
  vaultDir: string,
  name: string,
  splat: string,
  manifestEntrada: string,
): { full: string; rel: string } {
  const root = appRoot(vaultDir, name);
  if (splat.includes("\0")) {
    throw new TrickError(400, "unsafe app path");
  }

  let rel = splat;
  if (rel.startsWith("/")) rel = rel.slice(1);
  if (rel === "") rel = manifestEntrada;
  else if (rel.endsWith("/")) rel += "index.html";

  const full = normalize(join(root, rel));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw new TrickError(400, `path escapes the trick's app/ folder: ${splat}`);
  }
  return { full, rel: full.slice(rootWithSep.length).split(sep).join("/") };
}

/**
 * The filesystem's answer to the same question. A symlink inside `app/`
 * pointing at `~/.ssh/id_rsa` passes every string check — lexically it is
 * inside the app folder — and only `realpath` reveals otherwise.
 *
 * A trick's author is a filesystem author and could read that file
 * anyway (spec §2.2), so this is not stopping them doing something new.
 * It stops the *panel* becoming the thing that publishes it to everything
 * on the tailnet, which is a different and much cheaper mistake to make:
 * `app/` is the one folder in this design whose whole purpose is to be
 * served over HTTP.
 */
export async function assertAppRealPath(root: string, full: string): Promise<void> {
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    throw new TrickError(404, "trick has no app/ folder");
  }
  let real: string;
  try {
    real = await realpath(full);
  } catch {
    throw new TrickError(404, "not found");
  }
  const withSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
  if (real !== realRoot && !real.startsWith(withSep)) {
    throw new TrickError(400, "app path resolves outside the trick's app/ folder");
  }
  const st = await stat(real);
  if (!st.isFile()) {
    throw new TrickError(404, "not a file");
  }
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * A stub/report script has no legitimate reason to run more than a
 * couple seconds; 5s leaves real headroom above that while still
 * guaranteeing the request that triggered it can't hang indefinitely
 * (tricks-spec.md: "a hard timeout, killing the process if it runs
 * long"). Revisit per-trick if a real script genuinely needs longer —
 * deliberately not manifest-configurable, so a trick can't quietly ask
 * for an hour.
 */
const RUN_TIMEOUT_MS = 5_000;

/**
 * Runs one `acciones[actionIndex]` entry from a trick's manifest.
 *
 * Security property, stated once because it's the whole point of this
 * function: `ruta` and `args` come *only* from this function's own fresh
 * read of `trick.yaml` (`readTrickManifest`, never trusting the caller's
 * claims about the manifest). The caller supplies nothing but which
 * index to run — it cannot supply or influence what actually executes.
 * Execution is via `execFile` (never a shell), with `args` passed as an
 * array straight to the child process, so there is no shell parsing the
 * argument list for a crafted argument to break out of.
 */
export async function runTrickAction(
  vaultDir: string,
  name: string,
  actionIndex: number,
  onRun?: (fields: Record<string, unknown>) => void,
): Promise<RunResult> {
  const manifest = await readTrickManifest(vaultDir, name);
  const acciones = manifest.acciones ?? [];
  const action = acciones[actionIndex];
  if (!action) {
    throw new TrickError(400, `no action at index ${actionIndex}`);
  }
  const spec = action.accion?.correr_script;
  if (!spec) {
    throw new TrickError(400, `action ${actionIndex} is not correr_script`);
  }

  const scriptPath = safeScriptPath(vaultDir, spec.ruta);
  const args = spec.args ?? [];

  onRun?.({ trick: name, actionIndex, script: scriptPath, args });

  return new Promise((resolve) => {
    // `killSignal: "SIGKILL"` (not the default SIGTERM) so a script that
    // traps or ignores SIGTERM still actually dies on timeout — "hard
    // timeout" per the spec, not "polite request to stop."
    //
    // Known, deliberate limitation, verified empirically while building
    // this: if the script itself forks a longer-running subprocess (e.g.
    // `sleep 30 &`, or a script whose last line is a bare `sleep 30`
    // rather than `exec sleep 30`), killing the direct child on timeout
    // does not reach that grandchild — it's reparented and keeps running
    // after this request has already returned `timedOut: true`. The
    // alternative — `detached: true` plus killing the whole process
    // group — was tried and rejected: it made the *request itself* hang
    // past the timeout in testing (Node's execFile callback here waits
    // on the child's stdio pipes fully closing, and a surviving
    // grandchild that inherited those pipe fds keeps them open), which
    // is strictly worse than the orphan-process trade-off, since "the
    // request must not hang" is the actual hard requirement
    // (tricks-spec.md). A future pass could reach for `spawn` +
    // `stdio: "ignore"` or a process-group-aware supervisor if the
    // orphan case matters enough to solve properly.
    execFile(
      scriptPath,
      args,
      { timeout: RUN_TIMEOUT_MS, killSignal: "SIGKILL", encoding: "utf8", windowsHide: true },
      (err, stdout, stderr) => {
        const nodeErr = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
        const timedOut = Boolean(nodeErr?.killed);
        const exitCode = timedOut
          ? null
          : nodeErr
            ? typeof nodeErr.code === "number"
              ? nodeErr.code
              : null
            : 0;
        resolve({
          ok: !nodeErr,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode,
          timedOut,
        });
      },
    );
  });
}
