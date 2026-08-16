/**
 * Rename or move a note or an attachment — the panel's HTTP face of the
 * exact operation `_tools/steward.py move` already performs from a
 * terminal, and deliberately built to agree with it rather than invent a
 * second notion of "move."
 *
 * Why that discipline matters, stated in the task that created this file
 * and worth repeating next to the code: **renaming or moving a note
 * breaks every inbound `[[wiki-link]]` unless they are rewritten in the
 * same operation.** This is the exact bug class this project keeps
 * hitting (README rule 5's sibling problem, one layer down — two
 * components that both think they own "how a move works" is how both
 * become untrustworthy). `steward.py move` is the sanctioned path
 * inside a vault session; this module is the sanctioned path from the
 * browser. Read `_tools/steward.py`'s own `cmd_move` (the
 * "move — the only way a file changes place" section) before changing
 * anything here — every design choice below cites the line in that
 * script it mirrors.
 *
 * Two write paths that can each move a file and each thinks it owns
 * link integrity is exactly the failure mode rule 5 already names once
 * in this codebase (a deployment's structure leaking into the generic
 * template) — same shape, different layer.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename as fsRename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  resolveInVault,
  resolveLink,
  type VaultIndex,
} from "./vault.js";
import { assertNetworkWritable, WritePathError } from "./writepath.js";
import { assertNotSymlink, assertRealPathInVault } from "./attachments.js";

export class RenameError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Mirrors `vault.ts`'s own `WIKILINK` regex exactly, except the optional
 * `|alias` / `#heading` suffix is *captured* instead of discarded — a
 * rewrite has to carry it forward onto the new target. `steward.py`
 * carries two copies of this pattern for the identical reason: one for
 * *finding* links (`linkcheck.py`, `vault.ts`), one for *rewriting* them
 * (`steward.py`'s own `WIKILINK`, this one). Keep both letters — group 1
 * is the target text, group 2 is the whole `|...`/`#...` suffix or "".
 */
const WIKILINK_REWRITE = /\[\[([^\]|#]+)((?:[|#][^\]]*)?)\]\]/g;

/**
 * Vault-relative paths with no dot-prefixed segment — the exact scope
 * `steward.py`'s `Vault.__init__` uses for `self.md`/`by_name`, the
 * index its own basename-clash check reads
 * (`if not any(part.startswith(".") for part in p.relative_to(root).parts)`).
 * Matched here on purpose: a client refusing a move the CLI tool would
 * allow, or the reverse, is precisely the "two systems disagree" bug
 * this project keeps finding.
 */
function isDotPath(path: string): boolean {
  return path.split("/").some((seg) => seg.startsWith("."));
}

function stemOf(mdPath: string): string {
  const withoutExt = mdPath.slice(0, -3);
  return withoutExt.includes("/") ? withoutExt.slice(withoutExt.lastIndexOf("/") + 1) : withoutExt;
}

function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}

/**
 * Both `from` and `to` go through the same rule the note-write and
 * upload endpoints do, and for a reason specific to *move*: renaming a
 * file **out of** `.claude/` still modifies `.claude/` (it removes an
 * entry) even though the destination is fine on its own, so checking
 * only `to` would let an unauthenticated caller silently disable a
 * skill or a trick by relocating its file. `.claude/` is executable
 * configuration in both directions (writepath.ts) — this endpoint is
 * the only mover in this codebase where that distinction (from vs. to)
 * is easy to get half right.
 */
function assertMoveWritable(fromRel: string, toRel: string, ignore: string[]): void {
  for (const rel of [fromRel, toRel]) {
    try {
      assertNetworkWritable(rel, ignore);
    } catch (err) {
      if (err instanceof WritePathError) {
        throw new RenameError(403, `moves touching ${err.reason} are not allowed`);
      }
      throw err;
    }
  }
}

export interface NoteMovePlan {
  fromRel: string;
  toRel: string;
  newStem: string;
  /** Notes (other than the one being moved) whose raw text needs a link rewrite. */
  affected: string[];
}

/**
 * Everything decidable from the in-memory index alone, before touching
 * the filesystem — so a caller (the route handler, or a future "preview
 * this move" UI) can get a definite answer without side effects.
 *
 * Mirrors `cmd_move`'s own validation order: not-a-note, destination
 * exists, basename clash. The one check `cmd_move` also makes that this
 * skips — "is `dst` outside the vault" — is handled earlier, by
 * `safeRelPath`/`resolveInVault` on the caller's raw strings before this
 * function ever sees them; duplicating it here would be the third copy
 * of that check in this codebase.
 */
export function planNoteMove(index: VaultIndex, fromRel: string, toRel: string): NoteMovePlan {
  if (!fromRel.endsWith(".md") || !toRel.endsWith(".md")) {
    throw new RenameError(400, "only .md files go through the note move endpoint");
  }
  if (fromRel === toRel) {
    throw new RenameError(400, "source and destination are the same path");
  }
  if (!index.notes.has(fromRel)) {
    throw new RenameError(404, `${fromRel} is not an indexed note`);
  }
  if (index.notes.has(toRel)) {
    throw new RenameError(409, `${toRel} already exists`);
  }

  const newStem = stemOf(toRel);
  // Basename uniqueness (conventions.md §2, enforced by steward.py move):
  // two notes sharing a filename in different folders make every bare
  // [[wiki-link]] to that name ambiguous — resolveLink() (vault.ts) picks
  // whichever sorts first and calls it resolved, silently.
  for (const path of index.notes.keys()) {
    if (path === fromRel || isDotPath(path)) continue;
    if (stemOf(path) === newStem) {
      throw new RenameError(
        409,
        `basename "${newStem}" is already used by ${path} — basenames must be unique across the vault`,
      );
    }
  }

  const affected: string[] = [];
  for (const note of index.notes.values()) {
    if (note.path === fromRel) continue;
    if (note.links.some((target) => resolveLink(index, note.path, target) === fromRel)) {
      affected.push(note.path);
    }
  }

  return { fromRel, toRel, newStem, affected };
}

/** The set of a note's raw link targets that resolve to `fromRel`, normalised the same way `vault.ts`'s `extractLinks` already did when populating `note.links`. */
function hitTargets(index: VaultIndex, path: string, fromRel: string): Set<string> {
  const note = index.notes.get(path)!;
  const hits = new Set<string>();
  for (const target of note.links) {
    if (resolveLink(index, path, target) === fromRel) hits.add(target);
  }
  return hits;
}

/** `WIKILINK.sub` from `cmd_move`, ported: replace only the hit targets, keep every other link and the alias/heading suffix untouched. */
function rewriteLinks(text: string, hits: Set<string>, newStem: string): string {
  return text.replace(WIKILINK_REWRITE, (whole, rawTarget: string, suffix: string) => {
    const clean = rawTarget.trim().replace(/\\+$/, "").trim();
    return hits.has(clean) ? `[[${newStem}${suffix}]]` : whole;
  });
}

/** `add_rows` from steward.py, ported: append after the first markdown table, or start a new one if there isn't one yet. */
function addIndexRow(text: string, row: string): string {
  const lines = text.replace(/\n+$/, "").split("\n");
  const sepIdx = lines.findIndex((l) => /^\|[\s:-]+\|/.test(l));
  if (sepIdx === -1) {
    return `${lines.join("\n")}\n\n| Nota | Cuándo leerla |\n|---|---|\n${row}\n`;
  }
  let end = sepIdx + 1;
  while (end < lines.length && lines[end]!.startsWith("|")) end++;
  lines.splice(end, 0, row);
  return `${lines.join("\n")}\n`;
}

/** `index_template` from steward.py, ported: the deployment's own template if it exists, else the same generic fallback. */
async function indexTemplateOrFallback(vaultDir: string, folder: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = await readFile(resolveInVault(vaultDir, "_templates/index-template.md"), "utf8");
    const filled = raw.replaceAll("<carpeta>", folder).replaceAll("YYYY-MM-DD", today);
    return filled
      .split("\n")
      .filter((l) => !(l.startsWith("|") && l.includes("[[nombre-de-la-nota]]")))
      .join("\n");
  } catch {
    return (
      `---\ntitulo: ${folder}\ntipo: referencia\narea: meta\nestado: activo\n` +
      `actualizado: ${today}\netiquetas: [meta]\n` +
      `cuando-usar: "Read before opening any note in ${folder}/."\n---\n\n` +
      `# ${folder}\n\n| Nota | Cuándo leerla |\n|---|---|\n`
    );
  }
}

export interface NoteMoveResult {
  path: string;
  /** Every file this move rewrote, the moved note's own frontmatter aside — for "N notes were updated" in the UI. */
  edited: string[];
  indexRowMoved?: string;
}

/**
 * Execute a planned move: read every affected file's current text,
 * compute every rewrite, *then* rename the note, then write the
 * rewrites — rolling every write back and renaming the note back if any
 * write past that point fails. Same ordering and the same rollback
 * shape as `cmd_move`, for the reason stated there: a move that partly
 * happened is worse than a move refused outright.
 */
export async function executeNoteMove(
  vaultDir: string,
  ignore: string[],
  index: VaultIndex,
  fromRel: string,
  toRel: string,
): Promise<NoteMoveResult> {
  assertMoveWritable(fromRel, toRel, ignore);
  const plan = planNoteMove(index, fromRel, toRel);

  const fromFull = resolveInVault(vaultDir, fromRel);
  const toFull = resolveInVault(vaultDir, toRel);
  await assertRealPathInVault(vaultDir, dirname(fromFull));
  await assertRealPathInVault(vaultDir, dirname(toFull));
  await assertNotSymlink(fromFull);
  await assertNotSymlink(toFull);
  if (existsSync(toFull)) {
    // Re-checked against the real filesystem: the index above is a cache
    // built from the last reindex, same reasoning as the attachment
    // upload endpoint's own existsSync check.
    throw new RenameError(409, `${toRel} already exists`);
  }

  const originals = new Map<string, string>();
  const edited = new Map<string, string>();
  for (const path of plan.affected) {
    const text = await readFile(resolveInVault(vaultDir, path), "utf8");
    originals.set(path, text);
    edited.set(path, rewriteLinks(text, hitTargets(index, path, fromRel), plan.newStem));
  }

  // Index-row transplant. Mirrors cmd_move's own literal search — it
  // looks for `[[{new_stem}` (the *new* name) inside the *old* index,
  // which only finds the row when the basename didn't change, i.e. a
  // folder-only move. A simultaneous rename-and-move leaves the row
  // behind in the old index, exactly as steward.py move does. Ported
  // faithfully rather than "fixed" here, because the two must keep
  // agreeing or a person moving files first with one tool and then the
  // other gets two different outcomes for the same input.
  const fromDir = dirOf(fromRel);
  const toDir = dirOf(toRel);
  const oldIdxRel = fromDir ? `${fromDir}/index.md` : "index.md";
  const newIdxRel = toDir ? `${toDir}/index.md` : "index.md";
  let movedRow: string | undefined;

  if (oldIdxRel !== newIdxRel && index.notes.has(oldIdxRel)) {
    let base = edited.get(oldIdxRel);
    if (base === undefined) {
      base = await readFile(resolveInVault(vaultDir, oldIdxRel), "utf8");
      originals.set(oldIdxRel, base);
    }
    const keep: string[] = [];
    for (const line of base.split("\n")) {
      if (!movedRow && line.startsWith("|") && line.includes(`[[${plan.newStem}`)) {
        movedRow = line;
      } else {
        keep.push(line);
      }
    }
    if (movedRow) edited.set(oldIdxRel, keep.join("\n"));
  }

  await mkdir(dirname(toFull), { recursive: true });
  try {
    await fsRename(fromFull, toFull);
  } catch (err) {
    throw new RenameError(500, `move failed: ${(err as Error).message}`);
  }

  try {
    for (const [path, text] of edited) {
      await writeFile(resolveInVault(vaultDir, path), text, "utf8");
    }
    if (movedRow) {
      const newIdxFull = resolveInVault(vaultDir, newIdxRel);
      const existingNewIdx = existsSync(newIdxFull) ? await readFile(newIdxFull, "utf8") : null;
      const base = existingNewIdx ?? (await indexTemplateOrFallback(vaultDir, toDir || "."));
      await writeFile(newIdxFull, addIndexRow(base, movedRow), "utf8");
    }
  } catch (err) {
    for (const [path, text] of originals) {
      try {
        await writeFile(resolveInVault(vaultDir, path), text, "utf8");
      } catch {
        // Best effort — the rethrow below still surfaces that something
        // is now inconsistent and needs a human, same as cmd_move's own
        // rollback offers no stronger guarantee than "tried."
      }
    }
    try {
      await fsRename(toFull, fromFull);
    } catch {
      // The rename itself already succeeded before this branch could be
      // reached; nothing left to undo for it specifically.
    }
    throw new RenameError(
      500,
      `link rewrite failed after moving the file; rolled back: ${(err as Error).message}`,
    );
  }

  return {
    path: toRel,
    edited: [...edited.keys()],
    indexRowMoved: movedRow ? newIdxRel : undefined,
  };
}

export interface AttachmentMoveResult {
  path: string;
}

/**
 * The simpler half: an attachment carries no `[[wiki-links]]` (vault.ts:
 * "A [[wiki-link]] to a PDF is not a thing — links point at notes."), so
 * this is a location change and nothing else. Still: never a silent
 * overwrite — same 409 the upload endpoint uses, for the same reason
 * (`attachments.ts`: "the alternative is a generated report quietly
 * replacing a scan someone can't get back").
 */
export async function executeAttachmentMove(
  vaultDir: string,
  ignore: string[],
  index: VaultIndex,
  fromRel: string,
  toRel: string,
): Promise<AttachmentMoveResult> {
  if (toRel.toLowerCase().endsWith(".md")) {
    throw new RenameError(400, "renaming to .md goes through the note move endpoint, not this one");
  }
  if (fromRel === toRel) {
    throw new RenameError(400, "source and destination are the same path");
  }
  if (!index.attachments.has(fromRel)) {
    throw new RenameError(404, `${fromRel} is not an indexed attachment`);
  }
  assertMoveWritable(fromRel, toRel, ignore);

  const fromFull = resolveInVault(vaultDir, fromRel);
  const toFull = resolveInVault(vaultDir, toRel);
  await assertRealPathInVault(vaultDir, dirname(fromFull));
  await assertRealPathInVault(vaultDir, dirname(toFull));
  await assertNotSymlink(fromFull);
  await assertNotSymlink(toFull);
  if (existsSync(toFull)) {
    throw new RenameError(409, `${toRel} already exists`);
  }

  await mkdir(dirname(toFull), { recursive: true });
  try {
    await fsRename(fromFull, toFull);
  } catch (err) {
    throw new RenameError(500, `move failed: ${(err as Error).message}`);
  }
  return { path: toRel };
}
