import { readFile, readdir } from "node:fs/promises";
import { join, normalize, isAbsolute, sep } from "node:path";
import { execFile } from "node:child_process";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

/**
 * A trick is a folder under `.claude/tricks/<name>/` with a `trick.yaml`
 * manifest — see `panel/docs/tricks-spec.md`. This module mirrors
 * `vault.ts`'s style: pure functions over the filesystem, a dedicated
 * path-safety check before anything touches disk, and "one broken thing
 * degrades gracefully" (a malformed trick is skipped when listing, not a
 * crash).
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
 * Every other write-action verb the spec documents (`set`/`crear_nota`/
 * `archivar`) is accepted here so a manifest that uses them still passes
 * validation and lists correctly — this pass just doesn't implement
 * *running* them. `.passthrough()` on both levels because the manifest
 * format has more shape (e.g. `formulario`'s `campos`) than this backend
 * needs to understand to do its job: list tricks and run `correr_script`
 * actions safely.
 */
const trickAccionDefSchema = z
  .object({
    correr_script: correrScriptSchema.optional(),
    set: z.record(z.string(), z.unknown()).optional(),
    crear_nota: z.unknown().optional(),
    archivar: z.unknown().optional(),
  })
  .passthrough();

const trickAccionSchema = z
  .object({
    etiqueta: z.string().optional(),
    control: z.string().optional(),
    accion: trickAccionDefSchema.optional(),
  })
  .passthrough();

/**
 * Top-level manifest shape. Per the task brief: only `titulo` is
 * required — a trick can be action-only (a single `correr_script`
 * button) with no tracked items, so `datos`/`ui` are optional, not
 * required-but-empty. `datos`/`ui` are validated only as "present or
 * not" here; the frontend owns the deeper shape of `ui.campos` (same
 * "widget owns its own params schema" split dashboards already use,
 * plan §6.7) since the backend's job is listing and running scripts, not
 * rendering.
 */
const trickManifestSchema = z.object({
  titulo: z.string(),
  descripcion: z.string().optional(),
  icono: z.string().optional(),
  datos: z.unknown().optional(),
  ui: z.unknown().optional(),
  acciones: z.array(trickAccionSchema).optional(),
});

export type TrickManifest = z.infer<typeof trickManifestSchema>;

export interface TrickSummary {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
}

/**
 * A trick *name* is a single path segment, never a path — same
 * discipline as `safeRelPath` in `vault.ts`, but narrower: no slashes at
 * all, since it's used to build `.claude/tricks/<name>/trick.yaml`, not
 * an arbitrary vault-relative path.
 */
function safeTrickName(name: string): string {
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
  return result.data;
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
 * not exposed as manifest-configurable in v1, so a trick can't quietly
 * ask for an hour.
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
