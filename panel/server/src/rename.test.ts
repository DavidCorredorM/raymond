import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "./vault.js";
import {
  executeAttachmentMove,
  executeNoteMove,
  planNoteMove,
  RenameError,
} from "./rename.js";

const IGNORE = [".git", ".obsidian", "node_modules", ".trash"];

/**
 * A real temp vault, not a mock index — `executeNoteMove` reads and
 * writes real files (link rewrites, the index-row transplant), and the
 * whole point of this move being trustworthy is that it behaves the same
 * way `_tools/mender.py move` does against a real filesystem. `files`
 * is `{ relPath: content }`.
 */
async function scratchVault(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "raymond-rename-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf8");
  }
  return dir;
}

test("planNoteMove refuses anything that isn't .md", async () => {
  const dir = await scratchVault({ "a.md": "# A\n" });
  const index = await buildIndex(dir, IGNORE);
  assert.throws(() => planNoteMove(index, "a.md", "b.txt"), RenameError);
  assert.throws(() => planNoteMove(index, "a.txt", "b.md"), RenameError);
});

test("planNoteMove refuses a no-op move", async () => {
  const dir = await scratchVault({ "a.md": "# A\n" });
  const index = await buildIndex(dir, IGNORE);
  assert.throws(() => planNoteMove(index, "a.md", "a.md"), RenameError);
});

test("planNoteMove 404s on a source that isn't indexed", async () => {
  const dir = await scratchVault({ "a.md": "# A\n" });
  const index = await buildIndex(dir, IGNORE);
  assert.throws(
    () => planNoteMove(index, "missing.md", "new.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 404,
  );
});

test("planNoteMove 409s on a destination that already exists", async () => {
  const dir = await scratchVault({ "a.md": "# A\n", "b.md": "# B\n" });
  const index = await buildIndex(dir, IGNORE);
  assert.throws(
    () => planNoteMove(index, "a.md", "b.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 409,
  );
});

test("planNoteMove 409s on a basename collision anywhere in the vault — conventions.md §2", async () => {
  const dir = await scratchVault({
    "notes/cafe.md": "# Coffee\n",
    "projects/x/cafe.md": "# Also coffee\n",
  });
  const index = await buildIndex(dir, IGNORE);
  assert.throws(
    () => planNoteMove(index, "notes/cafe.md", "notes/moved/cafe.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 409,
  );
});

test("planNoteMove's basename check excludes dot-paths, matching mender.py move's own self.md filter", async () => {
  const dir = await scratchVault({
    "notes/cafe.md": "# Coffee\n",
    ".claude/skills/cafe/SKILL.md": "---\nname: cafe\n---\n",
  });
  const index = await buildIndex(dir, IGNORE);
  // Would collide if .claude/ paths counted — they must not, because
  // mender.py move's own clash check doesn't see them either.
  assert.doesNotThrow(() => planNoteMove(index, "notes/cafe.md", "notes/moved/cafe.md"));
});

test("planNoteMove finds every inbound link form: bare, root-relative, note-relative", async () => {
  const dir = await scratchVault({
    "notes/target.md": "# Target\n",
    "notes/bare.md": "See [[target]].\n",
    "notes/rooted.md": "See [[notes/target]].\n",
    "projects/x/relative.md": "See [[../../notes/target]].\n",
    "notes/unrelated.md": "No link here.\n",
  });
  const index = await buildIndex(dir, IGNORE);
  const plan = planNoteMove(index, "notes/target.md", "notes/renamed.md");
  assert.deepEqual(
    plan.affected.sort(),
    ["notes/bare.md", "notes/rooted.md", "projects/x/relative.md"].sort(),
  );
});

test("executeNoteMove rewrites every inbound link form to the new bare slug, preserving alias/heading", async () => {
  const dir = await scratchVault({
    "notes/target.md": "# Target\n",
    "notes/bare.md": "See [[target]] and [[target|a friendly name]].\n",
    "notes/rooted.md": "See [[notes/target#Section]].\n",
    "projects/x/relative.md": "See [[../../notes/target]] again.\n",
    "notes/unrelated.md": "No link here, untouched.\n",
  });
  const index = await buildIndex(dir, IGNORE);

  const result = await executeNoteMove(dir, IGNORE, index, "notes/target.md", "notes/renamed.md");

  assert.equal(result.path, "notes/renamed.md");
  assert.ok(!existsSync(join(dir, "notes/target.md")), "old path should be gone");
  assert.ok(existsSync(join(dir, "notes/renamed.md")), "new path should exist");

  assert.equal(
    await readFile(join(dir, "notes/bare.md"), "utf8"),
    "See [[renamed]] and [[renamed|a friendly name]].\n",
  );
  assert.equal(await readFile(join(dir, "notes/rooted.md"), "utf8"), "See [[renamed#Section]].\n");
  assert.equal(
    await readFile(join(dir, "projects/x/relative.md"), "utf8"),
    "See [[renamed]] again.\n",
  );
  assert.equal(
    await readFile(join(dir, "notes/unrelated.md"), "utf8"),
    "No link here, untouched.\n",
  );
});

test("executeNoteMove leaves an unrelated link with the same raw text to a different note alone", async () => {
  // Two notes named similarly enough that a naive string-replace (rather
  // than a resolve-then-match) would over-rewrite.
  const dir = await scratchVault({
    "notes/target.md": "# Target\n",
    "notes/target-two.md": "# Target Two\n",
    "notes/linker.md": "[[target]] and [[target-two]].\n",
  });
  const index = await buildIndex(dir, IGNORE);
  await executeNoteMove(dir, IGNORE, index, "notes/target.md", "notes/renamed.md");
  assert.equal(await readFile(join(dir, "notes/linker.md"), "utf8"), "[[renamed]] and [[target-two]].\n");
});

test("executeNoteMove transplants the index row on a folder-only move (same basename)", async () => {
  const dir = await scratchVault({
    "notes/index.md": "# Notes\n\n| Nota | Cuándo leerla |\n|---|---|\n| [[cafe]] | Coffee notes |\n",
    "notes/cafe.md": "---\ncuando-usar: Coffee notes\n---\n\n# Coffee\n",
    "projects/x/index.md": "# X\n\n| Nota | Cuándo leerla |\n|---|---|\n",
  });
  const index = await buildIndex(dir, IGNORE);
  const result = await executeNoteMove(dir, IGNORE, index, "notes/cafe.md", "projects/x/cafe.md");

  assert.equal(result.indexRowMoved, "projects/x/index.md");
  const oldIdx = await readFile(join(dir, "notes/index.md"), "utf8");
  assert.ok(!oldIdx.includes("[[cafe]]"), "row should be removed from the old index");
  const newIdx = await readFile(join(dir, "projects/x/index.md"), "utf8");
  assert.ok(newIdx.includes("[[cafe]]"), "row should land in the new index");
});

test("executeNoteMove refuses a destination that appeared on disk since the index was built", async () => {
  const dir = await scratchVault({ "a.md": "# A\n" });
  const index = await buildIndex(dir, IGNORE);
  // A file lands on disk after the in-memory index was built — the same
  // race the upload endpoint's own existsSync re-check guards against.
  await writeFile(join(dir, "b.md"), "# B, arrived after indexing\n", "utf8");
  await assert.rejects(
    executeNoteMove(dir, IGNORE, index, "a.md", "b.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 409,
  );
});

test("executeNoteMove refuses to touch .claude/ on either side of the move", async () => {
  const dir = await scratchVault({
    "notes/a.md": "# A\n",
    ".claude/skills/x/SKILL.md": "---\nname: x\n---\n",
  });
  const index = await buildIndex(dir, IGNORE);
  await assert.rejects(
    executeNoteMove(dir, IGNORE, index, "notes/a.md", ".claude/skills/x/a.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 403,
  );
  await assert.rejects(
    executeNoteMove(dir, IGNORE, index, ".claude/skills/x/SKILL.md", "notes/stolen.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 403,
  );
});

test("executeAttachmentMove moves a file with no link rewriting involved", async () => {
  const dir = await scratchVault({ "scans/a.pdf": "not a real pdf\n" });
  const index = await buildIndex(dir, IGNORE);
  const result = await executeAttachmentMove(dir, IGNORE, index, "scans/a.pdf", "scans/b.pdf");
  assert.equal(result.path, "scans/b.pdf");
  assert.ok(!existsSync(join(dir, "scans/a.pdf")));
  assert.ok(existsSync(join(dir, "scans/b.pdf")));
});

test("executeAttachmentMove never silently overwrites — same 409 the upload endpoint uses", async () => {
  const dir = await scratchVault({ "a.pdf": "one\n", "b.pdf": "two\n" });
  const index = await buildIndex(dir, IGNORE);
  await assert.rejects(
    executeAttachmentMove(dir, IGNORE, index, "a.pdf", "b.pdf"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 409,
  );
  assert.equal(await readFile(join(dir, "b.pdf"), "utf8"), "two\n");
});

test("executeAttachmentMove refuses a .md destination — that goes through the note endpoint", async () => {
  const dir = await scratchVault({ "a.pdf": "one\n" });
  const index = await buildIndex(dir, IGNORE);
  await assert.rejects(
    executeAttachmentMove(dir, IGNORE, index, "a.pdf", "a.md"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 400,
  );
});

test("executeAttachmentMove 404s on a source that isn't an indexed attachment", async () => {
  const dir = await scratchVault({ "a.pdf": "one\n" });
  const index = await buildIndex(dir, IGNORE);
  await assert.rejects(
    executeAttachmentMove(dir, IGNORE, index, "missing.pdf", "new.pdf"),
    (err: unknown) => err instanceof RenameError && err.statusCode === 404,
  );
});
