import Fastify from "fastify";
import chokidar from "chokidar";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import {
  buildIndex,
  readNote,
  writeNote,
  deriveMaps,
  brokenLinks,
  slugCollisions,
  isNote,
  safeRelPath,
  type VaultIndex,
} from "./vault.js";

const cfg = loadConfig();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

let index: VaultIndex = await buildIndex(cfg.vaultDir, cfg.ignore);
app.log.info(`Indexed ${index.notes.size} notes from ${cfg.vaultDir}`);

// The vault is edited by Obsidian, by agents writing files, and by this
// app. Watching the filesystem is the only way all three stay consistent.
const watcher = chokidar.watch(cfg.vaultDir, {
  ignored: (p) => cfg.ignore.some((d) => p.includes(`/${d}/`) || p.endsWith(`/${d}`)),
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
});

async function refresh(path: string, removed = false) {
  if (!path.endsWith(".md")) return;
  const rel = path.slice(cfg.vaultDir.length + 1).split("\\").join("/");
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
}));

/** Everything the sidebar needs, without note bodies. */
app.get("/api/notes", async () =>
  notesArray().map(({ path, slug, title, frontmatter, mtime, size }) => ({
    path,
    slug,
    title,
    frontmatter,
    mtime,
    size,
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

app.put<{ Body: { path?: string; content?: string } }>(
  "/api/note",
  async (req, reply) => {
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
    await writeNote(cfg.vaultDir, rel, content);
    await refresh(join(cfg.vaultDir, rel));
    return { ok: true, path: rel };
  },
);

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

const shutdown = async () => {
  await watcher.close();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: cfg.port, host: cfg.host });
