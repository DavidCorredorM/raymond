/**
 * The panel's whole HTTP surface. Fourteen endpoints:
 *
 *   GET  /api/health              is it up, and what is it indexing
 *   GET  /api/notes               every note, no bodies — the sidebar
 *   GET  /api/note?path=          one note: body, frontmatter, backlinks
 *   PUT  /api/note                write one note (the only note write path)
 *   GET  /api/attachments         every non-.md file in the vault
 *   GET  /api/attachment?path=    one attachment's raw bytes
 *   POST /api/attachment          upload one attachment (multipart)
 *   GET  /api/graph               the full link graph in one call
 *   GET  /api/health/vault        broken links, slug collisions, frontmatter
 *   GET  /api/tricks              every valid trick manifest, summarized
 *   GET  /api/tricks/:name        one trick's full manifest
 *   POST /api/tricks/:name/run    run one pre-declared action (code execution)
 *   GET  /api/tricks/:name/app/*  a trick's mini app, into an opaque origin
 *   POST /api/tricks/:name/bridge the one funnel for a trick's capabilities
 *
 * No endpoint here does anything a human couldn't do by editing a file
 * directly — the API is a faster path to the same filesystem, not a
 * separate capability (README, "The vision"). The exceptions to "boring"
 * are `POST /api/tricks/:name/run` and `POST /api/tricks/:name/bridge`
 * (both run code), `POST /api/attachment` (puts a file on the disk) and
 * `GET /api/tricks/:name/app/*` (hands a browser code and tells it to
 * run); each has a written trust boundary — `tricks.ts`, `bridge.ts`,
 * `attachments.ts` and `writepath.ts` — because there is no
 * authentication in front of any of this.
 */
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import chokidar from "chokidar";
import { readFile, copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync, createReadStream, constants as fsConstants } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import {
  buildIndex,
  readNote,
  readAttachment,
  writeNote,
  deriveMaps,
  brokenLinks,
  slugCollisions,
  isNote,
  resolveLink,
  safeRelPath,
  resolveInVault,
  type VaultIndex,
} from "./vault.js";
import {
  APP_CSP,
  PANEL_CSP,
  appContentType,
  appRequestGate,
  appRoot,
  assertAppRealPath,
  listTricks,
  readTrickManifest,
  resolveAppFile,
  runTrickAction,
  TrickError,
} from "./tricks.js";
import { handleBridge } from "./bridge.js";
import { assertNetworkWritable, WritePathError } from "./writepath.js";
import {
  AttachmentError,
  assertNotSymlink,
  assertRealPathInVault,
  resolveUploadTarget,
  servePolicy,
} from "./attachments.js";

const cfg = loadConfig();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

/**
 * Cross-site write guard. Found 2026-08-15 by testing a claim the tricks
 * v2 design left labelled `assumed:`, and it was real.
 *
 * There is no auth (rule 3), so there is no session cookie to steal —
 * which is exactly why this is easy to dismiss and wrong to. The attack
 * needs no credentials: any page the vault's owner visits in any tab can
 * `fetch("http://<tailnet-host>:8710/api/attachment", {method:"POST",
 * body: formData, mode:"no-cors"})`. `multipart/form-data` is a
 * **CORS-simple** request, so the browser sends it with no preflight to
 * refuse. CORS then hides the *response* from the attacker — but the
 * write already happened. Confirmed against this server: a POST bearing
 * `Origin: https://evil.example` wrote `notes/payload.txt` into the
 * vault and answered 200.
 *
 * `PUT /api/note` and the JSON trick-run endpoint are not reachable this
 * way — PUT is never simple, and `application/json` forces a preflight —
 * so the guard is about closing the shape, not just the one route.
 *
 * Both checks are browser-supplied and unforgeable *by page script*:
 * `Origin` and `Sec-Fetch-*` are forbidden header names. A request with
 * neither is not a browser (curl, a cron script, `scripts/`), and is
 * allowed — this is a same-site guard, not authentication, and pretending
 * otherwise would be the more dangerous mistake.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.addHook("onRequest", async (req, reply) => {
  if (!MUTATING.has(req.method)) return;

  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") {
    req.log.warn({ url: req.url, site }, "cross-site write refused");
    return reply.code(403).send({ error: "cross-site request refused" });
  }

  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== "null") {
    // Compare against the address the client actually reached us on: the
    // panel is opened by tailnet IP or MagicDNS name, never one fixed
    // hostname, so an allowlist of origins cannot be written up front.
    const expected = `${req.protocol}://${req.headers.host}`;
    if (origin !== expected) {
      req.log.warn({ url: req.url, origin, expected }, "cross-origin write refused");
      return reply.code(403).send({ error: "cross-origin request refused" });
    }
  }
});

/**
 * `limits` here is the size limit, and it is enforced *by the parser as
 * it streams* — busboy stops feeding the file stream at `fileSize` and
 * raises FST_REQ_FILE_TOO_LARGE. Checking the size after the fact would
 * mean a 4 GB body was already read into memory or onto the disk before
 * anyone objected, which is the denial-of-service the limit exists to
 * prevent, not a defence against it.
 *
 * `files: 1` matches the contract (one file part per request). The field
 * limits bound the non-file half of the body, which is otherwise an
 * unbounded thing anything on the tailnet can send.
 */
await app.register(fastifyMultipart, {
  limits: {
    fileSize: cfg.maxUploadBytes,
    files: 1,
    fields: 8,
    fieldSize: 4096,
    parts: 16,
  },
});

let index: VaultIndex = await buildIndex(cfg.vaultDir, cfg.ignore);
app.log.info(
  `Indexed ${index.notes.size} notes and ${index.attachments.size} attachments from ${cfg.vaultDir}`,
);

// The vault is edited by Obsidian, by agents writing files, and by this
// app. Watching the filesystem is the only way all three stay consistent.
const watcher = chokidar.watch(cfg.vaultDir, {
  ignored: (p) => cfg.ignore.some((d) => p.includes(`/${d}/`) || p.endsWith(`/${d}`)),
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
});

async function refresh(path: string, removed = false) {
  const rel = path.slice(cfg.vaultDir.length + 1).split("\\").join("/");

  // Attachments go in the other map. This used to be an early return on
  // anything that isn't `.md`, which was correct when the index only
  // held notes — left as-is it would mean an uploaded PDF stays
  // invisible until the process restarts, and a deleted one stays
  // listed and 404s on download. Same reason the watcher exists at all:
  // this process is only one of the three things writing to the vault.
  if (!path.endsWith(".md")) {
    try {
      if (removed) index.attachments.delete(rel);
      else index.attachments.set(rel, await readAttachment(cfg.vaultDir, rel));
      app.log.debug(`reindexed attachment ${rel}`);
    } catch (err) {
      app.log.warn({ err, rel }, "attachment reindex failed");
    }
    return;
  }

  try {
    if (removed) index.notes.delete(rel);
    else index.notes.set(rel, await readNote(cfg.vaultDir, rel));
    Object.assign(index, deriveMaps(index.notes));
    app.log.debug(`reindexed ${rel}`);
  } catch (err) {
    app.log.warn({ err, rel }, "reindex failed");
  }
}

watcher
  .on("add", (p) => refresh(p))
  .on("change", (p) => refresh(p))
  .on("unlink", (p) => refresh(p, true));

const notesArray = () =>
  [...index.notes.values()].sort((a, b) => b.mtime - a.mtime);

app.get("/api/health", async () => ({
  ok: true,
  vault: cfg.vaultDir,
  notes: index.notes.size,
  attachments: index.attachments.size,
}));

/**
 * Everything the sidebar needs, without note bodies.
 *
 * `isSystem` reuses the same isNote() predicate the health check already
 * governs — skills, templates, tooling, CLAUDE.md — rather than the
 * frontend re-deriving its own path rules and drifting from it. A user's
 * main navigation should show their notes, not the base package's own
 * plumbing; a "system" view can still list everything.
 */
app.get("/api/notes", async () =>
  notesArray().map(({ path, slug, title, frontmatter, mtime, size }) => ({
    path,
    slug,
    title,
    frontmatter,
    mtime,
    size,
    isSystem: !isNote(path),
  })),
);

app.get<{ Querystring: { path?: string } }>("/api/note", async (req, reply) => {
  if (!req.query.path) return reply.code(400).send({ error: "path required" });
  let rel: string;
  try {
    rel = safeRelPath(req.query.path);
  } catch {
    return reply.code(400).send({ error: "unsafe path" });
  }
  const meta = index.notes.get(rel);
  if (!meta) return reply.code(404).send({ error: "not found" });

  const content = await readFile(join(cfg.vaultDir, rel), "utf8");
  return {
    ...meta,
    content,
    backlinks: index.backlinks.get(rel) ?? [],
  };
});

/**
 * The one note write path — and, since the seam-5 audit
 * (tricks-spec.md §13), one of three places that must ask
 * `assertNetworkWritable` before touching the disk.
 *
 * It used to be reasonable to skip that here: this route only writes
 * `.md`, and the escalation found in the upload endpoint needed a
 * `trick.yaml`. That reasoning was too narrow. A skill's `SKILL.md` under
 * `.claude/skills/` is instructions the next Claude Code run in the vault
 * reads and obeys, and a job note under `.claude/jobs/` is the registry a
 * scheduled run consults —
 * markdown that is executed by something, which is the definition of
 * executable configuration in §2.2. Rewriting one over HTTP, with no
 * authentication in front of it, is a code-execution path with a delay
 * fuse on it. Refused now, by the same shared rule the upload endpoint
 * uses, so the two cannot drift.
 *
 * This does mean the panel's editor cannot save a file under `.claude/`.
 * That is the intended trade and it is the spec's explicit instruction
 * ("no network-reachable endpoint may create or modify any file under
 * `.claude/`", §11 constraint 4): editing a skill is a filesystem
 * author's job, done on the box.
 */
app.put<{ Body: { path?: string; content?: string } }>(
  "/api/note",
  async (req, reply) => {
    // A mutating endpoint states its content type rather than inheriting
    // whatever a parser happens to accept (spec §10.3). `application/json`
    // is not a CORS-simple content type, so this is also the check that
    // forces a preflight a cross-origin page cannot satisfy — the second
    // lock behind the cross-site guard above, not a duplicate of it.
    const ct = String(req.headers["content-type"] ?? "");
    if (!ct.toLowerCase().startsWith("application/json")) {
      return reply.code(415).send({ error: "application/json required" });
    }
    const { path, content } = req.body ?? {};
    if (!path || typeof content !== "string") {
      return reply.code(400).send({ error: "path and content required" });
    }
    let rel: string;
    try {
      rel = safeRelPath(path);
    } catch {
      return reply.code(400).send({ error: "unsafe path" });
    }
    if (!rel.endsWith(".md")) {
      return reply.code(400).send({ error: "only .md files" });
    }
    try {
      assertNetworkWritable(rel, cfg.ignore);
    } catch (err) {
      if (err instanceof WritePathError) {
        app.log.warn({ path: rel, reason: err.message }, "note write refused");
        return reply.code(403).send({ error: err.message });
      }
      throw err;
    }
    await writeNote(cfg.vaultDir, rel, content);
    await refresh(join(cfg.vaultDir, rel));
    return { ok: true, path: rel };
  },
);

/**
 * Every non-`.md` file in the vault (roadmap #9) — the same tree as the
 * notes, not a second blessed location, because "the vault is the only
 * thing the panel knows about" is rule 1 and forking it for PDFs would
 * have been the start of a second file system.
 *
 * `isSystem` is `isNote()`, the exact predicate `/api/notes` uses, for
 * the exact same reason: one set of path rules, in one place. An image
 * under `.claude/tricks/` is plumbing; a scan sitting next to the note
 * it belongs to is not, and the frontend should not be re-deriving that
 * distinction from a second list of prefixes that drifts.
 */
app.get("/api/attachments", async () =>
  [...index.attachments.values()]
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ path, size, mtime }) => ({
      path,
      size,
      mtime,
      isSystem: !isNote(path),
    })),
);

/**
 * One attachment's raw bytes.
 *
 * Membership in the attachment index is the primary gate, not a
 * convenience: `walk()` never indexes a symlink, so "is it in the index"
 * already answers "is it a real file that is really inside the vault."
 * The path checks below are the second and third answers to the same
 * question, kept because the index is a cache and a cache is a thing
 * that can be wrong.
 *
 * The headers are the interesting part. See `servePolicy` in
 * attachments.ts for why an uploaded `.svg` or `.html` must never come
 * back with its natural Content-Type: it would execute script on this
 * origin, which is the origin that can rewrite every note and run
 * `correr_script`. `nosniff` is what stops a browser from deciding for
 * itself that our `application/octet-stream` is really HTML.
 */
app.get<{ Querystring: { path?: string; download?: string } }>(
  "/api/attachment",
  async (req, reply) => {
    if (!req.query.path) return reply.code(400).send({ error: "path required" });
    let rel: string;
    try {
      rel = safeRelPath(req.query.path);
    } catch {
      return reply.code(400).send({ error: "unsafe path" });
    }
    if (!index.attachments.has(rel)) {
      return reply.code(404).send({ error: "not found" });
    }

    let full: string;
    try {
      full = resolveInVault(cfg.vaultDir, rel);
      await assertRealPathInVault(cfg.vaultDir, full);
    } catch {
      return reply.code(400).send({ error: "unsafe path" });
    }

    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      // Indexed but gone — deleted between the watcher event and now.
      return reply.code(404).send({ error: "not found" });
    }

    const policy = servePolicy(rel, req.query.download === "1");
    reply
      .header("Content-Type", policy.contentType)
      .header("Content-Disposition", policy.disposition)
      .header("X-Content-Type-Options", "nosniff")
      // Advertised unconditionally: a client decides whether to ask for a
      // range, and `<video>` only offers a seek bar once it knows it can.
      .header("Accept-Ranges", "bytes");
    if (policy.csp) reply.header("Content-Security-Policy", policy.csp);

    // Seeking in a media element is a range request, not a re-download.
    // Without this a 200 MB screen recording has to arrive in full before
    // it can be scrubbed, and Safari refuses to play at all — it requires
    // a 206 for media. Only `bytes=start-end` is honoured; anything
    // exotic (multipart ranges, suffix-only) falls through to the whole
    // file, which is a legal answer to any Range request.
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (match && size > 0) {
      const [, rawStart, rawEnd] = match;
      const start = rawStart ? Number(rawStart) : 0;
      const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
      if (rawStart && start >= size) {
        // Past the end: 416 must carry the real length or a client can
        // loop asking for the same impossible range. The Content-Type set
        // above is the *file's* — sending a JSON error under it makes
        // Fastify fail to serialize and answer 500, which is how this
        // branch was found to be broken. Put it back to JSON here.
        return reply
          .code(416)
          .header("Content-Type", "application/json; charset=utf-8")
          .header("Content-Range", `bytes */${size}`)
          .send({ error: "range not satisfiable" });
      }
      if (start <= end) {
        return reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${size}`)
          .header("Content-Length", String(end - start + 1))
          .send(createReadStream(full, { start, end }));
      }
    }

    reply.header("Content-Length", String(size));
    return reply.send(createReadStream(full));
  },
);

/**
 * Upload one file into the vault (roadmap #9). `folder` picks the
 * destination — `""` is the vault root — which is the API-level shape of
 * the decision that skill output is filed by *what it is about*, not
 * dumped in one output folder.
 *
 * This is the second endpoint in this codebase that deserved a real
 * adversarial pass rather than a happy-path test (roadmap #9 says so),
 * and the reasoning for every check lives in `attachments.ts` next to
 * the check itself. The short version, in the order they run:
 *
 *   parser  — size ceiling, enforced while streaming
 *   name    — no separators, no NUL, no all-dots, no `.md`
 *   folder  — safeRelPath, then resolveInVault on the absolute result
 *   allowed — nothing into .git/, .obsidian/ or .claude/: escalation
 *             rather than traversal, and an uploaded trick.yaml defeats
 *             correr_script outright (attachments.ts, assertUploadAllowed)
 *   symlink — realpath of the deepest existing ancestor, before mkdir
 *   exists  — 409 unless overwrite=true, then COPYFILE_EXCL to close the
 *             gap between asking and writing
 *
 * Never silently overwrites. An upload that would clobber a file is an
 * error the caller has to answer for, because the alternative is a
 * generated report quietly replacing a scan someone can't get back.
 */
app.post("/api/attachment", async (req, reply) => {
  if (!req.isMultipart()) {
    return reply.code(400).send({ error: "multipart/form-data required" });
  }

  // Drains the whole request to a temp file outside the vault, so
  // nothing is written anywhere near the destination until every check
  // below has passed. Temp files are removed by the plugin's onResponse
  // hook whether this succeeds or throws.
  let saved;
  try {
    saved = await req.saveRequestFiles();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") {
      return reply
        .code(413)
        .send({ error: `file exceeds the ${cfg.maxUploadBytes} byte limit` });
    }
    if (code === "FST_FILES_LIMIT") {
      return reply.code(400).send({ error: "exactly one file part expected" });
    }
    if (code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT") {
      return reply.code(413).send({ error: "too many form parts" });
    }
    app.log.warn({ err }, "upload parse failed");
    return reply.code(400).send({ error: "malformed multipart body" });
  }

  const file = saved[0];
  if (!file) return reply.code(400).send({ error: "a file part is required" });
  // Second, independent read of the same fact: busboy marks the stream
  // truncated at the limit, and it does so whether or not the error
  // above fired. The limit is the one check here that protects the disk
  // rather than the vault's shape, so it gets asked twice.
  if (file.file.truncated) {
    return reply
      .code(413)
      .send({ error: `file exceeds the ${cfg.maxUploadBytes} byte limit` });
  }

  // `fields` is populated as the body is parsed, and the body was fully
  // drained above — so `folder` is found whether the client sent it
  // before or after the file part. Ordering is not part of the contract.
  const fieldValue = (name: string): string => {
    const f = file.fields[name];
    const one = Array.isArray(f) ? f[0] : f;
    return one && one.type === "field" ? String(one.value) : "";
  };
  const overwrite = fieldValue("overwrite") === "true";

  let target: { rel: string; full: string };
  try {
    target = await resolveUploadTarget(
      cfg.vaultDir,
      fieldValue("folder"),
      file.filename,
      cfg.ignore,
    );
  } catch (err) {
    if (err instanceof AttachmentError) {
      app.log.warn(
        { folder: fieldValue("folder"), filename: file.filename, reason: err.message },
        "upload rejected",
      );
      return reply.code(err.statusCode).send({ error: err.message });
    }
    throw err;
  }

  try {
    await assertNotSymlink(target.full);
  } catch (err) {
    if (err instanceof AttachmentError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    throw err;
  }

  if (!overwrite && existsSync(target.full)) {
    return reply.code(409).send({ error: "file exists", path: target.rel });
  }

  await mkdir(dirname(target.full), { recursive: true });
  try {
    // COPYFILE_EXCL makes the "does it exist" question atomic on the
    // non-overwrite path — the existsSync above is the friendly answer,
    // this is the one that can't lose a race with a concurrent upload.
    await copyFile(
      file.filepath,
      target.full,
      overwrite ? 0 : fsConstants.COPYFILE_EXCL,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return reply.code(409).send({ error: "file exists", path: target.rel });
    }
    throw err;
  }

  // Index it now rather than waiting on the watcher, so the GET that
  // follows this POST works. The watcher will see the same file and set
  // the same entry; that's idempotent, not a double-add.
  await refresh(target.full);
  const size = (await stat(target.full)).size;
  app.log.info({ path: target.rel, size, overwrite }, "attachment uploaded");
  return { ok: true, path: target.rel, size };
});

/**
 * The full link graph in one call — every note as a node, every resolved
 * link as an edge. Without this, rendering a graph view means fetching
 * every note individually (N+1). Reuses `resolveLink` against the index
 * already held in memory; no new computation, just a new shape over
 * existing data. System files excluded — a graph view is for a user's
 * own notes, same reasoning as `isSystem` on `/api/notes`.
 */
app.get("/api/graph", async () => {
  const nodes = notesArray()
    .filter((n) => isNote(n.path))
    .map((n) => ({ path: n.path, title: n.title }));

  const edgeSet = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];
  for (const note of index.notes.values()) {
    if (!isNote(note.path)) continue;
    for (const target of note.links) {
      const resolved = resolveLink(index, note.path, target);
      if (!resolved || !isNote(resolved) || resolved === note.path) continue;
      const key = `${note.path} ${resolved}`;
      if (edgeSet.has(key)) continue; // a note can link the same target twice
      edgeSet.add(key);
      edges.push({ from: note.path, to: resolved });
    }
  }
  return { nodes, edges };
});

/** Vault health, same three checks as the vault-lint script. */
app.get("/api/health/vault", async () => {
  const real = notesArray().filter((n) => isNote(n.path));
  // Schema is Spanish: this vault's notes were authored that way and
  // converting 175 of them buys nothing. `cuando-usar` is the retrieval
  // key — the one field the original vault lacked.
  const missingFrontmatter = real
    .filter((n) => !n.frontmatter || !("cuando-usar" in n.frontmatter))
    .map((n) => n.path);
  return {
    notes: real.length,
    indexed: index.notes.size,
    brokenLinks: brokenLinks(index),
    slugCollisions: slugCollisions(index),
    missingFrontmatter,
  };
});

/**
 * List every valid trick under `.claude/tricks/` (tricks-spec.md). A
 * trick whose `trick.yaml` fails to parse or validate is skipped, not
 * fatal to the list — logged here so the failure leaves a trail instead
 * of silently vanishing, same reasoning as `reindex failed` above.
 */
app.get("/api/tricks", async () =>
  listTricks(cfg.vaultDir, (name, err) =>
    app.log.warn({ err, trick: name }, "trick skipped: invalid manifest"),
  ),
);

/**
 * The full manifest for one trick — `datos`, `ui`, `acciones` — so the
 * frontend can render it. 404 for both "no such trick" and "trick.yaml
 * doesn't parse/validate": from the client's perspective there is
 * nothing renderable at that name either way.
 */
app.get<{ Params: { name: string } }>("/api/tricks/:name", async (req, reply) => {
  try {
    const manifest = await readTrickManifest(cfg.vaultDir, req.params.name);
    return { name: req.params.name, ...manifest };
  } catch (err) {
    const status = err instanceof TrickError ? 404 : 500;
    return reply.code(status).send({ error: (err as Error).message });
  }
});

/**
 * Runs one pre-declared `acciones[actionIndex]` entry from that trick's
 * own `trick.yaml` — the client selects an index, nothing more. `ruta`
 * and `args` are read by the server itself inside `runTrickAction`
 * (tricks.ts), never taken from this request body — that's the core
 * security property of `correr_script`, see tricks.ts for the full
 * writeup. This is code execution: log what ran regardless of outcome.
 */
app.post<{ Params: { name: string }; Body: { actionIndex?: number } }>(
  "/api/tricks/:name/run",
  async (req, reply) => {
    const { actionIndex } = req.body ?? {};
    if (typeof actionIndex !== "number" || !Number.isInteger(actionIndex)) {
      return reply.code(400).send({ error: "actionIndex (integer) required" });
    }
    try {
      const result = await runTrickAction(
        cfg.vaultDir,
        req.params.name,
        actionIndex,
        (fields) => app.log.info(fields, "running trick script"),
      );
      app.log.info(
        { trick: req.params.name, actionIndex, ...result, stdout: undefined, stderr: undefined },
        "trick script finished",
      );
      return result;
    } catch (err) {
      if (err instanceof TrickError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      app.log.error({ err, trick: req.params.name, actionIndex }, "trick run failed unexpectedly");
      return reply.code(500).send({ error: "internal error running trick action" });
    }
  },
);

/**
 * A trick's mini app, served into an **opaque origin** (tricks-spec.md
 * §5). This is the endpoint the whole v2 design turns on, so the two
 * mechanisms doing the work are stated here as well as in `tricks.ts`:
 *
 * 1. `Content-Security-Policy: sandbox allow-scripts` on the *response*,
 *    which drops the document into a unique opaque origin wherever it is
 *    loaded — not only inside an iframe the frontend remembered to
 *    sandbox. The panel additionally uses `<iframe sandbox="allow-scripts">`,
 *    which forces the same thing from the other side. Either alone is
 *    sufficient; both are set because forgetting both is silent and
 *    catastrophic.
 * 2. The `Sec-Fetch-*` gate (`appRequestGate`), which decides *who* may
 *    load the entry document at all. Read the comment on that function
 *    before changing anything here — the obvious wrong version of the
 *    rule 403s every asset the app loads and presents as "my scripts are
 *    fetched but never execute."
 *
 * `Access-Control-Allow-Origin: *` is on app files and **never** on the
 * data routes. ES module scripts are always fetched in CORS mode and the
 * frame's origin is opaque, so without it `<script type="module">` does
 * not load at all (§10.2). It reopens nothing: `connect-src 'none'` means
 * the frame cannot do anything with a fetch, and the residual — anything
 * that can reach the tailnet address can read a trick's app source — is
 * already true of every other endpoint here.
 */
app.get<{ Params: { name: string; "*": string } }>(
  "/api/tricks/:name/app/*",
  async (req, reply) => {
    const gate = appRequestGate(
      req.headers["sec-fetch-dest"],
      req.headers["sec-fetch-site"],
    );
    if (!gate.ok) {
      req.log.warn(
        {
          trick: req.params.name,
          url: req.url,
          dest: req.headers["sec-fetch-dest"] ?? null,
          site: req.headers["sec-fetch-site"] ?? null,
        },
        "trick app request refused by the Sec-Fetch gate",
      );
      return reply.code(gate.status).send({ error: gate.error });
    }

    let manifest;
    try {
      manifest = await readTrickManifest(cfg.vaultDir, req.params.name);
    } catch (err) {
      const status = err instanceof TrickError ? (err.statusCode === 404 ? 404 : 404) : 500;
      return reply.code(status).send({ error: "no such trick app" });
    }
    if (!manifest.app) {
      return reply.code(404).send({ error: "this trick declares no app" });
    }

    let file: { full: string; rel: string };
    try {
      file = resolveAppFile(
        cfg.vaultDir,
        req.params.name,
        req.params["*"] ?? "",
        manifest.app.entrada,
      );
      await assertAppRealPath(appRoot(cfg.vaultDir, req.params.name), file.full);
    } catch (err) {
      if (err instanceof TrickError) {
        if (err.statusCode >= 500) throw err;
        return reply.code(err.statusCode).send({ error: err.message });
      }
      throw err;
    }

    const size = (await stat(file.full)).size;
    return reply
      .header("Content-Type", appContentType(file.rel))
      .header("X-Content-Type-Options", "nosniff")
      // App files change the moment an author saves one, and a stale
      // cached `index.html` inside an opaque origin is not something a
      // user can clear from the panel's UI.
      .header("Cache-Control", "no-store")
      .header("Access-Control-Allow-Origin", "*")
      .header("Content-Security-Policy", APP_CSP)
      .header("Content-Length", String(size))
      .send(createReadStream(file.full));
  },
);

/**
 * `/app` without the trailing slash. Relative URLs inside the app would
 * resolve one level too high, so this never serves the document — it
 * sends the browser to the real app root and lets that request go
 * through the gate normally.
 */
app.get<{ Params: { name: string } }>("/api/tricks/:name/app", async (req, reply) =>
  reply.redirect(`/api/tricks/${encodeURIComponent(req.params.name)}/app/`, 308),
);

/**
 * The bridge (tricks-spec.md §6, §7): the single funnel through which a
 * mounted trick reaches the vault. All the reasoning is in `bridge.ts`;
 * the two things worth seeing from the route table are:
 *
 * - **The trick's identity is this URL's `:name`, never a field in the
 *   body.** The panel's host code puts it there, bound to the frame it
 *   mounted. A body field would be forgeable by the frame; a port and a
 *   route are not (§6.3).
 * - **`application/json` is required explicitly.** A cross-origin page
 *   can always send a CORS-simple POST (`text/plain`,
 *   `application/x-www-form-urlencoded`, `multipart/form-data`) with no
 *   preflight to refuse; requiring JSON means any cross-origin attempt
 *   must first pass a preflight that this server does not answer. That is
 *   independent of — and behind — the cross-site guard at the top of this
 *   file, and independent again of the frame's own `connect-src 'none'`,
 *   which stops it ever reaching the network. Three fences, because the
 *   thing on the other side of them is "write the vault, run a script."
 */
app.post<{ Params: { name: string } }>(
  "/api/tricks/:name/bridge",
  // §6.6's per-message ceiling, enforced by the parser rather than after
  // the body is in memory.
  { bodyLimit: 256 * 1024 },
  async (req, reply) => {
    const ct = String(req.headers["content-type"] ?? "");
    if (!ct.toLowerCase().startsWith("application/json")) {
      return reply.code(415).send({
        v: 1,
        ok: false,
        error: { code: "bad_request", message: "application/json required" },
      });
    }
    const result = await handleBridge(
      {
        vaultDir: cfg.vaultDir,
        ignore: cfg.ignore,
        getIndex: () => index,
        refresh: (full) => refresh(full),
        log: (fields, msg) => app.log.info(fields, msg),
      },
      req.params.name,
      req.body,
    );
    return reply.code(result.status).send(result.body);
  },
);

/**
 * Serve the built frontend from the same process and port as the API —
 * the intended production topology, per the `@fastify/static` dependency
 * that sat unused since the backend was first built (plan §1). One
 * process, one port, reachable over Tailscale with nothing else to run.
 *
 * `dist/` only exists after `npm run build` in `panel/web/`. In
 * development the Vite dev server (`vite --port 5183`) serves the
 * frontend instead and proxies `/api` to this process — so a missing
 * `dist/` is normal there, not an error. Log once and skip registering
 * static serving rather than crash the API on startup.
 */
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    /**
     * The panel's own CSP (tricks-spec.md §5.4), on the document only —
     * a policy on a `.js` or `.css` response governs nothing.
     *
     * `frame-src 'self'` is the security control in it, not hygiene. A
     * sandboxed frame may navigate *itself* (`allow-top-navigation`
     * governs only the top window), and `frame-src` on the embedding
     * page decides what URL the nested document may become, whoever
     * initiated the navigation. It is what guarantees a trick frame can
     * never turn into a foreign origin — which is in turn what makes it
     * safe for the host to hand the bridge port over with
     * `targetOrigin: "*"`, the only value an opaque origin accepts (§6.2).
     *
     * Note for whoever changes the frontend build: this policy has no
     * `'unsafe-inline'` for scripts, so an inline `<script>` in
     * `index.html` will be blocked. That is deliberate — the panel's
     * origin is the one that can rewrite every note and fire
     * `correr_script` — but it is a real constraint on the build, not a
     * detail. Add a nonce; do not add `'unsafe-inline'`.
     */
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        res.setHeader("Content-Security-Policy", PANEL_CSP);
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
    },
  });

  // SPA fallback: any GET that isn't /api/* and doesn't match a real
  // static file (JS/CSS/etc.) is a client-side route (e.g. /vault/graph,
  // /note/some/path) — serve index.html and let React Router take it
  // from there. Without this, a hard reload or a shared deep link 404s.
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== "GET" || req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not found" });
    }
    return reply.sendFile("index.html");
  });
  app.log.info(`Serving built frontend from ${webDist}`);
} else {
  app.log.warn(
    `${webDist} not found — frontend not served. Run "npm run build" in panel/web/, ` +
      "or run the Vite dev server separately during development.",
  );
}

const shutdown = async () => {
  await watcher.close();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: cfg.port, host: cfg.host });
