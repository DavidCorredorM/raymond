import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNetworkWritable, isUnder, trickDataDir, WritePathError } from "./writepath.js";
import { assertUploadAllowed, AttachmentError } from "./attachments.js";

/**
 * The write-path refusal audit (tricks-spec.md §13 seam 5), as tests.
 *
 * Every name below says *why* rather than what, because the rule is not
 * "reject this string" — every one of these paths is a perfectly valid
 * location inside the vault and passes every traversal check there is.
 * The rule is that a **network client** may not become a filesystem
 * author (§2.2), and each test names the specific thing that would
 * otherwise execute.
 */

const IGNORE = [".git", ".obsidian", "node_modules", ".trash"];

const refuses = (rel: string, trick?: string) =>
  assert.throws(
    () => assertNetworkWritable(rel, IGNORE, trick),
    WritePathError,
    `expected ${rel} to be refused`,
  );

const allows = (rel: string, trick?: string) =>
  assert.doesNotThrow(() => assertNetworkWritable(rel, IGNORE, trick), `expected ${rel} to be allowed`);

test("a trick.yaml is what correr_script executes, so no endpoint may write one", () => {
  refuses(".claude/tricks/hijack/trick.yaml");
  refuses(".claude/tricks/gastos/trick.yaml", "gastos");
});

test("an app file is code the panel hands a browser and tells it to run", () => {
  refuses(".claude/tricks/gastos/app/index.html");
  refuses(".claude/tricks/gastos/app/app.js", "gastos");
});

test("a SKILL.md is instructions the next agent run obeys — markdown that executes", () => {
  refuses(".claude/skills/capture-note/SKILL.md");
  refuses(".claude/tricks/gastos/SKILL.md", "gastos");
});

test("a job note and a job runner are what cron reads and runs overnight (rule 4)", () => {
  refuses(".claude/jobs/nightly.md");
  refuses(".claude/jobs/nightly.sh");
});

test("a script under .claude/tricks/ is directly executable by correr_script", () => {
  refuses(".claude/tricks/gastos/resumen.sh", "gastos");
});

test(".claude itself, with no trailing slash, is the same refusal", () => {
  refuses(".claude");
});

test(".git/config can name a command git will run", () => {
  refuses(".git/config");
  refuses(".git/hooks/pre-commit");
  refuses("notas/.git/config");
});

test(".obsidian/plugins is JavaScript Obsidian runs on the owner's machine", () => {
  refuses(".obsidian/plugins/evil/main.js");
});

test("ignored directories are invisible to the index, so a write there is a lie either way", () => {
  refuses("node_modules/x.md");
  refuses(".trash/x.md");
});

test("a trick's own data/ is the one exception — it holds notes and estado.json, nothing executes", () => {
  allows(".claude/tricks/gastos/data/cafe.md", "gastos");
  allows(".claude/tricks/gastos/data/estado.json", "gastos");
  allows(".claude/tricks/gastos/data/sub/deep.md", "gastos");
});

test("the exception is that trick's own folder only — not another trick's data", () => {
  refuses(".claude/tricks/otro/data/cafe.md", "gastos");
});

test("the exception must be asked for by name; no trick means no exception", () => {
  refuses(".claude/tricks/gastos/data/cafe.md");
});

test("a sibling folder whose name merely starts with data is not inside it", () => {
  refuses(".claude/tricks/gastos/database/x.md", "gastos");
});

test("ordinary vault paths are untouched — this is a privilege rule, not a path rule", () => {
  allows("notas/cafe.md");
  allows("companies/acme/report.pdf");
  allows("a.md");
});

test("a .. segment is refused even though every caller runs safeRelPath first", () => {
  refuses("notas/../.claude/skills/x/SKILL.md");
  refuses("..");
});

test("the upload endpoint's rule is this rule — one implementation, so they cannot drift", () => {
  // assertUploadAllowed delegates; it keeps its own wording and error type
  // because its callers and its 400 status are part of an existing contract.
  assert.throws(() => assertUploadAllowed(".claude/tricks/x/trick.yaml", IGNORE), AttachmentError);
  assert.throws(() => assertUploadAllowed(".git/hooks/pre-commit", IGNORE), AttachmentError);
  assert.doesNotThrow(() => assertUploadAllowed("notas/scan.pdf", IGNORE));
  // An upload never gets the trick-data exception: uploads are not how a
  // trick writes its own data, the bridge is.
  assert.throws(() => assertUploadAllowed(".claude/tricks/x/data/a.json", IGNORE), AttachmentError);
});

test("isUnder does not treat a name-prefix sibling as a child", () => {
  assert.equal(isUnder("a/b", "a"), true);
  assert.equal(isUnder("a", "a"), true);
  assert.equal(isUnder("ab", "a"), false);
  assert.equal(isUnder("a-b/c", "a"), false);
});

test("trickDataDir is the single spelling of the exception path", () => {
  assert.equal(trickDataDir("gastos"), ".claude/tricks/gastos/data");
});
