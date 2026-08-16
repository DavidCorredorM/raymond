import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import {
  readTrickManifest,
  runTrickAction,
  safeTrickName,
  TrickError,
  WRITE_EXTENSIONS,
  type TrickCapabilities,
} from "./tricks.js";
import { safeRelPath, resolveInVault, writeNote, type Note, type VaultIndex } from "./vault.js";
import { assertNetworkWritable, isUnder, trickDataDir, WritePathError } from "./writepath.js";

/**
 * The trick bridge, server side (spec §6 and §7) — the one funnel every
 * capability a trick's browser code has passes through.
 *
 * **The host is a courier, not the authority.** The panel's frontend
 * validates first, so an author gets fast, precise errors; this module
 * assumes none of that happened. Every decision here is re-derived from
 * this server's own fresh read of `trick.yaml` on every single request:
 * which capabilities exist, which folder they scope to, which action
 * indices are runnable. Nothing in the request body is trusted beyond
 * "which of the things you already declared do you want" — the same
 * discipline `runTrickAction` has always applied to `ruta`/`args`,
 * generalized to the whole vocabulary (§6.7). A frontend bug must not
 * become a vault-scope bug, and a caller with `curl` and no frontend at
 * all must get exactly the same answers (§10.8).
 *
 * The trick's *identity* is the URL path segment, which the panel's own
 * code chose. There is deliberately no trick name in the body to be
 * forged: over `postMessage` the identity is the MessagePort, and over
 * HTTP it is the route — in neither case is it a field (§6.3).
 */

export type BridgeCode =
  | "capability_denied"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "unsupported_op"
  | "internal";

/**
 * HTTP status per error code. The response body is always the §6.4
 * envelope, whatever the status — the host must be able to surface
 * `capability_denied` to the author visibly (§6.5), so the code in the
 * body is the contract and the status is there so that an HTTP-level log
 * or a `curl` attack transcript does not read "200 OK" for a refused
 * write.
 */
const STATUS: Record<BridgeCode, number> = {
  capability_denied: 403,
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  unsupported_op: 501,
  internal: 500,
};

export class BridgeError extends Error {
  constructor(
    public code: BridgeCode,
    message: string,
  ) {
    super(message);
  }
}

/** Every op in the vocabulary, and the manifest key that grants it (§7). */
const OP_CAPABILITY = {
  "vault.query": "vault.query",
  "vault.read": "vault.read",
  "vault.write": "vault.write",
  "estado.get": "estado",
  "estado.set": "estado",
  "script.run": "script.run",
  "trabajo.estado": "trabajo.estado",
} as const satisfies Record<string, keyof TrickCapabilities>;

export type BridgeOp = keyof typeof OP_CAPABILITY;

export interface BridgeContext {
  vaultDir: string;
  ignore: string[];
  getIndex: () => VaultIndex;
  /** Reindex one absolute path after a write, so the GET after a POST is correct. */
  refresh: (fullPath: string) => Promise<void>;
  log: (fields: Record<string, unknown>, msg: string) => void;
}

export interface BridgeResult {
  status: number;
  body: Record<string, unknown>;
}

/** Reading a whole file into a JSON response needs a ceiling that is not "the disk." */
const MAX_READ_BYTES = 1024 * 1024;

/**
 * Rate limit, server side, per trick (§6.6's numbers). The spec puts
 * enforcement in the host, and the host should do it — that is where the
 * per-frame accounting and the fast error live. This is here for the same
 * reason every other check in this file is: the host is not the
 * authority, and a caller reaching this endpoint with `curl` has no host
 * in front of it at all.
 *
 * In-memory and per-process, which is consistent with rule 1 — this is a
 * ceiling against accident and spin, not vault state, and losing it on
 * restart costs nothing.
 */
const BUCKET_RATE = 20;
const BUCKET_BURST = 40;
const buckets = new Map<string, { tokens: number; last: number }>();

function takeToken(key: string, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: BUCKET_BURST, last: now };
  b.tokens = Math.min(BUCKET_BURST, b.tokens + ((now - b.last) / 1000) * BUCKET_RATE);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/**
 * Envelope validation (§6.4). Over `postMessage` a malformed message is
 * dropped rather than answered, because answering is a probing oracle for
 * a frame that can send thousands of them. HTTP has no "drop" — a
 * response is going back regardless — so this answers `bad_request` and
 * says nothing more than which field was wrong.
 */
function parseEnvelope(raw: unknown): { id: unknown; op: string; params: Record<string, unknown> } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BridgeError("bad_request", "body must be a JSON object");
  }
  const msg = raw as Record<string, unknown>;
  if (msg.v !== 1) {
    throw new BridgeError("bad_request", "unsupported or missing protocol version v");
  }
  if (typeof msg.op !== "string") {
    throw new BridgeError("bad_request", "op must be a string");
  }
  const params = msg.params ?? {};
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new BridgeError("bad_request", "params must be an object");
  }
  // `id` is opaque and echoed verbatim — never parsed, never used as an
  // object key here (§6.4). Restricted to a primitive so it cannot smuggle
  // a structure into a log line or a response the host will index by.
  const id = msg.id;
  if (id !== undefined && typeof id !== "string" && typeof id !== "number") {
    throw new BridgeError("bad_request", "id must be a string or number");
  }
  return { id, op: msg.op, params: params as Record<string, unknown> };
}

/**
 * One bridge call, end to end. Returns an HTTP status and the §6.4
 * response envelope; it never throws for a caller error.
 */
export async function handleBridge(
  ctx: BridgeContext,
  trickName: string,
  raw: unknown,
): Promise<BridgeResult> {
  let id: unknown;
  try {
    const name = safeTrickName(trickName);
    const envelope = parseEnvelope(raw);
    id = envelope.id;

    if (!takeToken(name)) {
      throw new BridgeError("too_many_requests", "slow down");
    }

    const op = envelope.op;
    if (!(op in OP_CAPABILITY)) {
      throw new BridgeError("unsupported_op", `no such op: ${op}`);
    }

    // Fresh from disk, every request. Not cached, not taken from the
    // body, not remembered from the mount. This is the line the whole
    // design rests on (§4.1, §6.7).
    const manifest = await readTrickManifest(ctx.vaultDir, name);
    const capKey = OP_CAPABILITY[op as BridgeOp];
    if (!manifest.capacidades[capKey]) {
      throw new BridgeError(
        "capability_denied",
        `${name} did not declare ${capKey}`,
      );
    }

    const result = await runOp(ctx, name, manifest.capacidades, op as BridgeOp, envelope.params);
    return { status: 200, body: { v: 1, ...(id !== undefined ? { id } : {}), ok: true, result } };
  } catch (err) {
    const be = toBridgeError(err);
    if (be.code === "internal") {
      // Details go to the server log, never to the frame (§6.5).
      ctx.log({ trick: trickName, err }, "bridge call failed unexpectedly");
    } else {
      ctx.log({ trick: trickName, code: be.code, reason: be.message }, "bridge call refused");
    }
    return {
      status: STATUS[be.code],
      body: {
        v: 1,
        ...(id !== undefined ? { id } : {}),
        ok: false,
        error: {
          code: be.code,
          message: be.code === "internal" ? "internal error" : be.message,
        },
      },
    };
  }
}

function toBridgeError(err: unknown): BridgeError {
  if (err instanceof BridgeError) return err;
  if (err instanceof TrickError) {
    if (err.statusCode === 404) return new BridgeError("not_found", err.message);
    if (err.statusCode === 400 || err.statusCode === 422) {
      return new BridgeError("bad_request", err.message);
    }
  }
  if (err instanceof WritePathError) {
    return new BridgeError("capability_denied", err.message);
  }
  return new BridgeError("internal", (err as Error)?.message ?? "unknown");
}

async function runOp(
  ctx: BridgeContext,
  name: string,
  caps: TrickCapabilities,
  op: BridgeOp,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (op) {
    case "vault.query":
      return opQuery(ctx, caps["vault.query"]!, params);
    case "vault.read":
      return opRead(ctx, caps["vault.read"]!, params);
    case "vault.write":
      return opWrite(ctx, name, caps["vault.write"]!, params);
    case "estado.get":
      return opEstadoGet(ctx, name);
    case "estado.set":
      return opEstadoSet(ctx, name, caps.estado!, params);
    case "script.run":
      return opScriptRun(ctx, name, caps["script.run"]!, params);
    case "trabajo.estado":
      // Declared in the vocabulary (§7.6) and deliberately not built yet
      // — it is seam 6, and it must share the jobs-view parser rather
      // than grow a second one. `unsupported_op` is exactly the code for
      // "a valid-looking op this panel version doesn't implement" (§6.5);
      // answering `capability_denied` would send an author hunting a
      // manifest bug that isn't there.
      throw new BridgeError("unsupported_op", "trabajo.estado is not implemented yet");
  }
}

// ---------------------------------------------------------------------------
// vault.query (§7.1) — params may narrow, never widen.
// ---------------------------------------------------------------------------

function opQuery(
  ctx: BridgeContext,
  cap: NonNullable<TrickCapabilities["vault.query"]>,
  params: Record<string, unknown>,
): unknown {
  let folder = cap.carpeta;
  if (params.subcarpeta !== undefined) {
    if (typeof params.subcarpeta !== "string") {
      throw new BridgeError("bad_request", "subcarpeta must be a string");
    }
    const sub = relInside(cap.carpeta, params.subcarpeta, "subcarpeta");
    folder = sub;
  }

  // The manifest's frontmatter constraint is ALWAYS applied and the
  // request's is ANDed on top: a request can add a constraint, never
  // remove one (§7.1).
  const required: Record<string, unknown> = { ...(cap.frontmatter ?? {}) };
  if (params.frontmatter !== undefined) {
    if (
      typeof params.frontmatter !== "object" ||
      params.frontmatter === null ||
      Array.isArray(params.frontmatter)
    ) {
      throw new BridgeError("bad_request", "frontmatter must be an object");
    }
    for (const [k, v] of Object.entries(params.frontmatter as Record<string, unknown>)) {
      if (k in required && !sameValue(required[k], v)) {
        // Asking for `tipo: otro` when the manifest pins `tipo: gasto`
        // is not a narrowing, it is an attempt to leave the scope.
        throw new BridgeError(
          "capability_denied",
          `frontmatter.${k} is pinned by the manifest and cannot be changed`,
        );
      }
      required[k] = v;
    }
  }

  const exists = new Set<string>(cap.frontmatter_exists ?? []);
  if (params.frontmatter_exists !== undefined) {
    if (!Array.isArray(params.frontmatter_exists)) {
      throw new BridgeError("bad_request", "frontmatter_exists must be an array");
    }
    for (const f of params.frontmatter_exists) {
      if (typeof f !== "string") throw new BridgeError("bad_request", "frontmatter_exists entries must be strings");
      exists.add(f);
    }
  }

  const limite = clampLimit(params.limite, cap.limite);
  const { field, desc } = parseSort(params.sort);

  const matched: Note[] = [];
  for (const note of ctx.getIndex().notes.values()) {
    if (!isUnder(note.path, folder) || note.path === folder) continue;
    const fm = note.frontmatter ?? {};
    let ok = true;
    for (const [k, v] of Object.entries(required)) {
      if (!matchesValue(fm[k], v)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      for (const f of exists) {
        if (fm[f] === undefined || fm[f] === null) {
          ok = false;
          break;
        }
      }
    }
    if (ok) matched.push(note);
  }

  matched.sort((a, b) => {
    const av = sortKey(a, field);
    const bv = sortKey(b, field);
    const cmp = av === bv ? 0 : av < bv ? -1 : 1;
    return desc ? -cmp : cmp;
  });

  const page = matched.slice(0, limite);
  return {
    total: matched.length,
    notes: page.map((n) => project(n, cap.campos)),
  };
}

/**
 * The projection allowlist (`campos`). Addresses either a top-level note
 * field or `frontmatter.<key>` by dot path, exactly like the dashboard
 * `query` widget's `columns` (frontend plan §5.3) — one shape, so the two
 * renderers do not fork. Absent `campos` means the default summary; it
 * never means "the note body," which the bridge does not return from a
 * query at all.
 *
 * **The title key is `title`, decided here and written into the spec.**
 * The spec's §7.1 example said `titulo` while the `Note` type, the
 * `/api/notes` listing, the graph and the dashboard `columns` all say
 * `title`, and the same paragraph says not to fork the dashboard shape —
 * so one of the two had to give. `title` wins because it is the existing
 * data model in five places and `titulo` was in one example: a starter
 * app hedging with `n.title || n.titulo` is the cost of leaving it
 * ambiguous, and that hedge is exactly what a decision is for. The
 * *manifest's* keys stay Spanish (`carpeta`, `campos`, `limite`) — those
 * are the capability vocabulary, not the note model.
 *
 * `titulo` is still accepted as an input spelling in `campos` and in
 * `sort.field`, because refusing it would break nothing usefully. The
 * output key is always `title`.
 */
const QUERY_TOP_FIELDS = new Set(["path", "slug", "title", "mtime", "size"]);

/** Input tolerance only: one alias in, one canonical name out. */
function canonicalField(campo: string): string {
  return campo === "titulo" ? "title" : campo;
}

function project(note: Note, campos?: string[]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    path: note.path,
    slug: note.slug,
    title: note.title,
    mtime: note.mtime,
    size: note.size,
    frontmatter: note.frontmatter ?? {},
  };
  if (!campos?.length) return base;

  const out: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.startsWith("frontmatter.")) {
      const key = campo.slice("frontmatter.".length);
      if (!key || key.includes(".")) continue;
      const fm = (out.frontmatter as Record<string, unknown>) ?? {};
      fm[key] = (note.frontmatter ?? {})[key] ?? null;
      out.frontmatter = fm;
    } else {
      const field = canonicalField(campo);
      if (QUERY_TOP_FIELDS.has(field)) out[field] = base[field];
    }
  }
  return out;
}

function sortKey(note: Note, field: string): string | number {
  if (field === "path") return note.path;
  if (field === "title") return note.title;
  if (field === "size") return note.size;
  if (field === "mtime") return note.mtime;
  const key = field.startsWith("frontmatter.")
    ? field.slice("frontmatter.".length)
    : field;
  const v = (note.frontmatter ?? {})[key];
  return typeof v === "number" ? v : v === undefined || v === null ? "" : String(v);
}

/**
 * `sort: { field, order }` — the dashboard `query` widget's shape
 * (frontend plan §5.3), not a second one.
 *
 * The dashboard writes `sort: { field: actualizado, order: desc }`, i.e.
 * a bare *frontmatter* key, while its `columns` writes
 * `frontmatter.actualizado` for the same value. That inconsistency is in
 * the plan, not something to inherit blindly and not something worth
 * breaking either spelling over: a bare name that is not one of the note
 * fields is read as a frontmatter key, and `frontmatter.<key>` is always
 * accepted and unambiguous. Default is newest-first by `mtime`, which is
 * what every other list in this app defaults to.
 */
function parseSort(raw: unknown): { field: string; desc: boolean } {
  if (raw === undefined || raw === null) return { field: "mtime", desc: true };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BridgeError("bad_request", "sort must be { field, order }");
  }
  const { field, order } = raw as { field?: unknown; order?: unknown };
  if (field !== undefined && typeof field !== "string") {
    throw new BridgeError("bad_request", "sort.field must be a string");
  }
  if (field === "") throw new BridgeError("bad_request", "sort.field must not be empty");
  const f = canonicalField((field as string) ?? "mtime");
  if (order !== undefined && order !== "asc" && order !== "desc") {
    throw new BridgeError("bad_request", "sort.order must be asc or desc");
  }
  return { field: f, desc: order ? order === "desc" : f === "mtime" };
}

function clampLimit(raw: unknown, ceiling: number): number {
  if (raw === undefined || raw === null) return ceiling;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new BridgeError("bad_request", "limite must be a positive integer");
  }
  return Math.min(raw, ceiling);
}

/** Frontmatter equality, with the two coercions a real vault needs and no more. */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((v) => sameValue(v, expected));
  return sameValue(actual, expected);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    const av = a instanceof Date ? a.toISOString().slice(0, 10) : String(a);
    const bv = b instanceof Date ? b.toISOString().slice(0, 10) : String(b);
    return av === bv;
  }
  if (typeof a === "object" || typeof b === "object") return false;
  return String(a) === String(b);
}

// ---------------------------------------------------------------------------
// vault.read (§7.2)
//
// Params:  { path }            relative to the capability's `carpeta`
// Result:  { path, content }                                for any file
//          { path, content, cuerpo, frontmatter }           for .md
//
// `content` is the file exactly as it is on disk, frontmatter fence and
// all, so an app can round-trip it. `cuerpo` and `frontmatter` are the
// parsed halves, present only for `.md`, because an app that wants to
// render a note should not have to carry a YAML parser into a sandbox
// that cannot load one from a CDN. The three names are the same three
// `vault.write` accepts, in the same spellings, so read→edit→write needs
// no translation layer.
// ---------------------------------------------------------------------------

async function opRead(
  ctx: BridgeContext,
  cap: NonNullable<TrickCapabilities["vault.read"]>,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (typeof params.path !== "string") {
    throw new BridgeError("bad_request", "path is required");
  }
  const rel = relInside(cap.carpeta, params.path, "path", true);
  const ext = extensionOf(rel);
  if (!cap.extensiones.includes(ext)) {
    // `capability_denied`, not `not_found` — the difference leaks whether
    // the file exists, and the answer to "may I read this" must not
    // depend on the answer to "is it there" (§7.2).
    throw new BridgeError("capability_denied", `this trick may not read ${ext || "extensionless"} files`);
  }

  const full = resolveInVault(ctx.vaultDir, rel);
  let size: number;
  try {
    size = (await stat(full)).size;
  } catch {
    throw new BridgeError("not_found", "nothing at that path");
  }
  if (size > MAX_READ_BYTES) {
    throw new BridgeError("bad_request", `file is larger than ${MAX_READ_BYTES} bytes`);
  }
  const raw = await readFile(full, "utf8");
  if (ext === ".md") {
    const parsed = matter(raw);
    return {
      path: rel,
      content: raw,
      cuerpo: parsed.content,
      frontmatter: parsed.data as Record<string, unknown>,
    };
  }
  return { path: rel, content: raw };
}

// ---------------------------------------------------------------------------
// vault.write (§7.3) — the checks, in the spec's order, all of them.
//
// Params:  { path, frontmatter?, cuerpo? }   at least one of the two
// Result:  { path, bytes, created }
//
// **There is no `crear` param, and that is deliberate.** `crear` is a
// manifest flag, so whether creating is allowed is the author's standing
// decision, not a per-call one; the server infers "this is a creation"
// from the file not existing and checks it against the flag. A caller
// that wants to know which happened reads `created` in the result. A
// `crear` param would be a second, forgeable answer to a question the
// filesystem already answers.
//
// Setting a frontmatter key to `null` **deletes** it. That is a field
// edit, not a file deletion — it is still bounded by `campos`, and the
// file, its history and `git checkout` are all untouched, so it does not
// cross the "deletion is not a capability" line (§7.3).
// ---------------------------------------------------------------------------

/**
 * Keys that are not data. A frontmatter merge is `data[key] = value` on a
 * plain object, so `__proto__` in the request is prototype pollution for
 * this process, and `constructor`/`prototype` are the same shape one step
 * along. Refused rather than sanitised: nothing legitimate writes a note
 * field called `__proto__`.
 */
const POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

async function opWrite(
  ctx: BridgeContext,
  name: string,
  cap: NonNullable<TrickCapabilities["vault.write"]>,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (typeof params.path !== "string") {
    throw new BridgeError("bad_request", "path is required");
  }

  // 1. safeRelPath, then under `carpeta`.
  const rel = relInside(cap.carpeta, params.path, "path", true);

  // 2. Not under `.claude/` unless it is this trick's own data folder.
  //    The shared rule, so this endpoint cannot drift from the upload
  //    endpoint's version of it (writepath.ts).
  assertNetworkWritable(rel, ctx.ignore, name);

  // 3. No dotfiles, and an extension on the write allowlist.
  const base = rel.split("/").pop() ?? "";
  if (base.startsWith(".")) {
    throw new BridgeError("capability_denied", "cannot write a dotfile");
  }
  const ext = extensionOf(rel);
  if (!WRITE_EXTENSIONS.includes(ext)) {
    throw new BridgeError(
      "capability_denied",
      `may only write ${WRITE_EXTENSIONS.join(", ")} files`,
    );
  }

  const full = resolveInVault(ctx.vaultDir, rel);
  let existing: string | null = null;
  try {
    existing = await readFile(full, "utf8");
  } catch {
    existing = null;
  }

  // 4. Creating requires `crear: true`.
  if (existing === null && !cap.crear) {
    throw new BridgeError("capability_denied", "this trick may not create new files");
  }

  const wantsFrontmatter = params.frontmatter !== undefined;
  const wantsBody = params.cuerpo !== undefined;
  if (!wantsFrontmatter && !wantsBody) {
    throw new BridgeError("bad_request", "nothing to write: send frontmatter, cuerpo, or both");
  }
  if (wantsBody && typeof params.cuerpo !== "string") {
    throw new BridgeError("bad_request", "cuerpo must be a string");
  }

  let content: string;
  if (ext === ".md") {
    const parsed = existing === null ? { data: {}, content: "" } : matter(existing);
    const data = { ...(parsed.data as Record<string, unknown>) };

    if (wantsFrontmatter) {
      const incoming = params.frontmatter;
      if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
        throw new BridgeError("bad_request", "frontmatter must be an object");
      }
      for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
        if (POISON_KEYS.has(k)) {
          throw new BridgeError("bad_request", `refusing frontmatter key: ${k}`);
        }
        // 5. Keys *being changed* must be in `campos`. Resending a key
        //    unchanged is a no-op and allowed, so a client can round-trip
        //    a whole frontmatter object without needing to declare fields
        //    it never touches.
        if (!sameValue(data[k], v) && !cap.campos.includes(k)) {
          throw new BridgeError(
            "capability_denied",
            `this trick may not set frontmatter field "${k}"`,
          );
        }
        if (v === null) delete data[k];
        else data[k] = v;
      }
    }

    let body = parsed.content;
    if (wantsBody) {
      // 6. Body replacement requires `cuerpo: true`.
      if (!cap.cuerpo) {
        throw new BridgeError("capability_denied", "this trick may not replace the note body");
      }
      body = params.cuerpo as string;
    }

    content = Object.keys(data).length ? matter.stringify(body, data) : body;
  } else {
    // A `.json`/`.csv`/`.txt` file has no frontmatter to merge — it is
    // all body, so writing one is a body replacement and needs `cuerpo`.
    if (wantsFrontmatter) {
      throw new BridgeError("bad_request", `${ext} files have no frontmatter`);
    }
    if (!cap.cuerpo) {
      throw new BridgeError("capability_denied", "this trick may not replace file contents");
    }
    content = params.cuerpo as string;
  }

  // 7. Size.
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > cap.max_bytes) {
    throw new BridgeError("bad_request", `result is ${bytes} bytes, over the ${cap.max_bytes} limit`);
  }

  await writeNote(ctx.vaultDir, rel, content);
  await ctx.refresh(full);
  ctx.log({ trick: name, path: rel, bytes, created: existing === null }, "trick wrote a file");
  return { path: rel, bytes, created: existing === null };
}

// ---------------------------------------------------------------------------
// estado (§7.4) — one JSON file in the trick's own data folder.
//
// estado.get  params: none          result: { valor }   (`null` if unset)
// estado.set  params: { valor }     result: { path, bytes }
//
// The result is `{ valor }` and not the bare value, symmetric with
// `set`'s params: one name for the thing, in both directions. It also
// leaves room to add a sibling field (an mtime, say) without changing the
// shape of every app that reads it, which a bare value could not do. An
// unset store answers `{ valor: null }` rather than an error — "nothing
// saved yet" is the normal first run of every app that has this
// capability, not a failure.
// ---------------------------------------------------------------------------

function estadoPath(name: string): string {
  return `${trickDataDir(name)}/estado.json`;
}

async function opEstadoGet(ctx: BridgeContext, name: string): Promise<unknown> {
  const full = join(ctx.vaultDir, estadoPath(name));
  let raw: string;
  try {
    raw = await readFile(full, "utf8");
  } catch {
    return { valor: null };
  }
  try {
    return { valor: JSON.parse(raw) };
  } catch {
    // A person or an agent edited it into something that is not JSON.
    // Say so rather than pretending the store is empty, which would
    // invite the app to overwrite whatever they were doing.
    throw new BridgeError("conflict", "estado.json on disk is not valid JSON");
  }
}

async function opEstadoSet(
  ctx: BridgeContext,
  name: string,
  cap: NonNullable<TrickCapabilities["estado"]>,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!("valor" in params)) {
    throw new BridgeError("bad_request", "valor is required");
  }
  let serialized: string;
  try {
    serialized = `${JSON.stringify(params.valor, null, 2)}\n`;
  } catch {
    throw new BridgeError("bad_request", "valor is not serializable as JSON");
  }
  if (serialized === "undefined\n") {
    throw new BridgeError("bad_request", "valor is not serializable as JSON");
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > cap.max_bytes) {
    throw new BridgeError("bad_request", `estado is ${bytes} bytes, over the ${cap.max_bytes} limit`);
  }

  const rel = estadoPath(name);
  // Belt: this is the one path in the whole server that writes under
  // `.claude/` on behalf of a network client, so it asks the shared rule
  // explicitly rather than relying on having constructed the path itself.
  assertNetworkWritable(rel, ctx.ignore, name);
  const full = resolveInVault(ctx.vaultDir, rel);
  await writeNote(ctx.vaultDir, rel, serialized);
  await ctx.refresh(full);
  return { path: rel, bytes };
}

// ---------------------------------------------------------------------------
// script.run (§7.5) — the `correr_script` boundary, reached through the
// bridge. It predates the deleted v1 renderer and is unchanged by its
// removal: the four constraints in §11 are what make it safe, and none
// of them had anything to do with how a trick was drawn.
// ---------------------------------------------------------------------------

async function opScriptRun(
  ctx: BridgeContext,
  name: string,
  cap: NonNullable<TrickCapabilities["script.run"]>,
  params: Record<string, unknown>,
): Promise<unknown> {
  const indice = params.indice;
  if (typeof indice !== "number" || !Number.isInteger(indice) || indice < 0) {
    throw new BridgeError("bad_request", "indice must be a non-negative integer");
  }
  if (!cap.acciones.includes(indice)) {
    throw new BridgeError("capability_denied", `action ${indice} is not in script.run.acciones`);
  }

  // `runTrickAction` is called **unchanged**. It re-reads `trick.yaml`
  // itself and takes `ruta` and `args` only from that read — the caller
  // supplied one integer and there is no path anywhere in this function
  // for it to supply anything else. That is the property (§11), and the
  // only new thing v2 adds is a second gate in front of it: the index
  // must also be listed in `script.run.acciones`, so declaring an action
  // and exposing it to browser code are two separate decisions.
  const result = await runTrickAction(ctx.vaultDir, name, indice, (fields) =>
    ctx.log(fields, "running trick script (bridge)"),
  );
  ctx.log(
    { trick: name, indice, ok: result.ok, exitCode: result.exitCode, timedOut: result.timedOut },
    "trick script finished (bridge)",
  );
  return result;
}

// ---------------------------------------------------------------------------
// Shared path helpers.
// ---------------------------------------------------------------------------

/**
 * Resolve a client-supplied path against a capability's `carpeta` and
 * require the answer to stay inside it.
 *
 * `safeRelPath` first (the string rule every write path here uses), then
 * the `..`-collapsing join, then the containment test — because
 * `notas/gastos/../secreto.md` is inside the folder as a string and
 * outside it as a path (§10.8).
 */
function relInside(carpeta: string, input: string, what: string, file = false): string {
  let cleaned: string;
  try {
    cleaned = safeRelPath(input);
  } catch {
    throw new BridgeError("capability_denied", `${what} is outside this trick's scope`);
  }
  const segments: string[] = [];
  for (const seg of `${carpeta}/${cleaned}`.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  const rel = segments.join("/");
  if (!isUnder(rel, carpeta) || (file && rel === carpeta)) {
    throw new BridgeError("capability_denied", `${what} is outside this trick's scope`);
  }
  return rel;
}

function extensionOf(rel: string): string {
  const base = rel.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}
