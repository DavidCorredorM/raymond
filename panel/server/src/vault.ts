import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname, resolve, sep } from "node:path";
import matter from "gray-matter";

export interface Note {
  /** Vault-relative path, POSIX separators. The stable id for a note. */
  path: string;
  /** Filename without .md — what [[wiki-links]] resolve against. */
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  /** Outgoing [[wiki-link]] targets, unresolved. */
  links: string[];
  mtime: number;
  size: number;
}

/**
 * A non-`.md` file living in the vault: a generated PDF, an Excel
 * report, an image pasted into a note (roadmap #9).
 *
 * Deliberately *not* a `Note`. An attachment has no frontmatter, no
 * slug, and no wiki-links, so forcing it into `Note` would mean three
 * fields that are permanently empty and a stream of `if (isAttachment)`
 * exceptions in every consumer of the notes map — link resolution,
 * backlinks, slug-collision detection and the health check all iterate
 * `index.notes` and all of them would be wrong. Separate map, separate
 * type, no special cases.
 */
export interface Attachment {
  /** Vault-relative path, POSIX separators. The stable id, same as Note. */
  path: string;
  size: number;
  mtime: number;
}

export interface VaultIndex {
  notes: Map<string, Note>;
  /** Every indexed non-`.md` file, keyed by vault-relative path. */
  attachments: Map<string, Attachment>;
  /** slug -> paths. A slug with >1 path is a collision and breaks links. */
  bySlug: Map<string, string[]>;
  /**
   * Note path -> paths of notes linking to it. Keyed by *resolved path*,
   * not raw link text, so `[[foo]]` and `[[../folder/foo]]` both land on
   * the same target.
   */
  backlinks: Map<string, string[]>;
}

const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

export function extractLinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK)) {
    // Inside markdown tables the alias pipe is escaped: [[target\|alias]].
    // The capture stops at the pipe but keeps the backslash, so a link to
    // `nutresa` arrives as `nutresa\` and never resolves.
    const target = m[1]?.trim().replace(/\\+$/, "").trim();
    if (target) out.add(target);
  }
  return [...out];
}

/** First H1 if present, else the filename. Titles drive the UI, not the path. */
export function extractTitle(body: string, slug: string): string {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m?.[1]?.trim() || slug;
}

export interface WalkResult {
  /** Vault-relative paths of `.md` files. */
  notes: string[];
  /** Vault-relative paths of everything else (roadmap #9). */
  attachments: string[];
}

/**
 * One traversal, two buckets. Attachments were bolted on here rather
 * than in a second walk because the tree is walked on every start and
 * the split is a one-line predicate — a parallel walk would double the
 * IO to answer the same question, and the two indexes could then
 * disagree about what `ignore` means.
 *
 * `isFile()`/`isDirectory()` are both false for a symlink, so symlinks
 * are neither indexed nor descended into. That is load-bearing, not
 * incidental: a symlink inside the vault pointing outside it would
 * otherwise become a downloadable path (`/api/attachment` serves what
 * the index lists), which is exactly the escape the upload endpoint
 * refuses to create. Keep it.
 */
async function walk(
  dir: string,
  root: string,
  ignore: string[],
  acc: WalkResult = { notes: [], attachments: [] },
): Promise<WalkResult> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc; // unreadable dir shouldn't abort the whole index
  }
  for (const e of entries) {
    if (ignore.includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, root, ignore, acc);
    } else if (e.isFile()) {
      const rel = relative(root, full).split(sep).join("/");
      (e.name.endsWith(".md") ? acc.notes : acc.attachments).push(rel);
    }
  }
  return acc;
}

export async function readNote(
  vaultDir: string,
  relPath: string,
): Promise<Note> {
  const full = join(vaultDir, relPath);
  const [raw, st] = await Promise.all([readFile(full, "utf8"), stat(full)]);
  const parsed = matter(raw);
  const slug = relPath.replace(/\.md$/, "").split("/").pop()!;
  return {
    path: relPath,
    slug,
    title: extractTitle(parsed.content, slug),
    frontmatter: parsed.data as Record<string, unknown>,
    links: extractLinks(parsed.content),
    mtime: st.mtimeMs,
    size: st.size,
  };
}

/**
 * An attachment's whole content is its bytes, so indexing one is a
 * `stat` — no parse, no read. This is why a 200 MB Excel file in the
 * vault costs the index nothing beyond a directory entry.
 */
export async function readAttachment(
  vaultDir: string,
  relPath: string,
): Promise<Attachment> {
  const st = await stat(join(vaultDir, relPath));
  return { path: relPath, size: st.size, mtime: st.mtimeMs };
}

export async function buildIndex(
  vaultDir: string,
  ignore: string[],
): Promise<VaultIndex> {
  const paths = await walk(vaultDir, vaultDir, ignore);
  const notes = new Map<string, Note>();
  const attachments = new Map<string, Attachment>();

  await Promise.all([
    ...paths.notes.map(async (p) => {
      try {
        notes.set(p, await readNote(vaultDir, p));
      } catch {
        // A single malformed note must not take down the index.
      }
    }),
    ...paths.attachments.map(async (p) => {
      try {
        attachments.set(p, await readAttachment(vaultDir, p));
      } catch {
        // Same rule: a file that vanished mid-walk is not fatal.
      }
    }),
  ]);

  return { notes, attachments, ...deriveMaps(notes) };
}

/**
 * Slug and backlink maps are pure functions of the notes, so they are
 * recomputed together whenever a file changes.
 *
 * Order matters: bySlug must exist before links can be resolved, since
 * resolution consults it first.
 */
export function deriveMaps(notes: Map<string, Note>) {
  const bySlug = new Map<string, string[]>();
  for (const note of notes.values()) {
    const list = bySlug.get(note.slug) ?? [];
    list.push(note.path);
    bySlug.set(note.slug, list);
  }

  // Attachments are empty here and that is correct, not a shortcut:
  // resolveLink only ever consults notes/bySlug. A [[wiki-link]] to a
  // PDF is not a thing — links point at notes.
  const partial: VaultIndex = {
    notes,
    attachments: new Map(),
    bySlug,
    backlinks: new Map(),
  };
  const backlinks = new Map<string, string[]>();
  for (const note of notes.values()) {
    for (const target of note.links) {
      const resolved = resolveLink(partial, note.path, target);
      if (!resolved) continue;
      const list = backlinks.get(resolved) ?? [];
      if (!list.includes(note.path)) list.push(note.path);
      backlinks.set(resolved, list);
    }
  }

  return { bySlug, backlinks };
}

/**
 * Is this a *note*, as opposed to machinery that happens to be markdown?
 *
 * SKILL.md files under `.claude/skills` use a different frontmatter
 * schema (name/description, not when-to-use). Templates contain
 * deliberate placeholder links. CLAUDE.md is instructions. All are
 * indexed so the UI can display them — but none should be judged by
 * note rules.
 */
export function isNote(path: string): boolean {
  if (path.startsWith(".claude/")) return false;
  if (path.startsWith("_templates/")) return false;
  if (path.startsWith("_tools/")) return false;
  if (path === "CLAUDE.md" || path.endsWith("/CLAUDE.md")) return false;
  return true;
}

/**
 * Resolve a wiki-link target to a note path, or null if nothing matches.
 *
 * Obsidian accepts three forms and real vaults mix all of them:
 *   [[note-name]]                    bare slug, shortest unique path
 *   [[folder/note-name]]             path from the vault root
 *   [[../sibling/note-name]]         path relative to the linking note
 *
 * Extensions are optional in every form. Resolving only bare slugs, as a
 * first implementation naturally does, reports most of a real vault's
 * links as broken.
 */
export function resolveLink(
  index: VaultIndex,
  fromPath: string,
  target: string,
): string | null {
  const clean = target.trim().replace(/\.md$/i, "");
  if (!clean) return null;

  // 1. Bare slug — the common case.
  const bySlug = index.bySlug.get(clean);
  if (bySlug?.length) return bySlug[0]!;

  const candidates: string[] = [];

  // 2. Vault-root-relative.
  candidates.push(clean);

  // 3. Relative to the linking note's directory.
  const fromDir = fromPath.includes("/")
    ? fromPath.slice(0, fromPath.lastIndexOf("/"))
    : "";
  candidates.push(normalisePath(fromDir ? `${fromDir}/${clean}` : clean));

  for (const c of candidates) {
    if (!c) continue;
    if (index.notes.has(`${c}.md`)) return `${c}.md`;
    if (index.notes.has(c)) return c;
  }
  return null;
}

/** Collapse `.` and `..` segments. Paths are vault-relative, never absolute. */
function normalisePath(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** Links that resolve to nothing. The vault-lint check, in-app. */
export function brokenLinks(index: VaultIndex): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (const note of index.notes.values()) {
    if (!isNote(note.path)) continue;
    for (const target of note.links) {
      if (!resolveLink(index, note.path, target)) {
        out.push({ from: note.path, to: target });
      }
    }
  }
  return out;
}

/**
 * Slugs provided by more than one file — these silently break wiki-links,
 * because `[[foo]]` cannot say which `foo.md` it means.
 *
 * `index` is exempt. One index.md per folder is the vault convention, and
 * indexes are reached by navigating into a folder, never by bare wiki-link.
 * Without this exemption every vault reports a permanent false positive.
 */
const COLLISION_EXEMPT = new Set(["index"]);

export function slugCollisions(index: VaultIndex): Array<{ slug: string; paths: string[] }> {
  const out: Array<{ slug: string; paths: string[] }> = [];
  for (const [slug, paths] of index.bySlug) {
    if (COLLISION_EXEMPT.has(slug)) continue;
    const real = paths.filter(isNote);
    if (real.length > 1) out.push({ slug, paths: real });
  }
  return out;
}

export async function writeNote(
  vaultDir: string,
  relPath: string,
  content: string,
): Promise<void> {
  const full = join(vaultDir, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

/**
 * Reject anything escaping the vault. Every path from the client goes
 * through this before touching the filesystem.
 */
export function safeRelPath(input: string): string {
  const norm = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (norm.split("/").includes("..") || norm.includes("\0")) {
    throw new Error(`Unsafe path: ${input}`);
  }
  return norm;
}

/**
 * `safeRelPath`'s answer, checked again against the actual filesystem
 * path it produces. Second line of defence, and deliberately redundant:
 * `safeRelPath` is a string check, and every path-traversal bug in
 * history is a string check that missed one encoding. This one cannot
 * miss an encoding, because it runs after `resolve()` has collapsed
 * whatever the string meant into one absolute path.
 *
 * The prefix test compares against `vaultDir + sep`, never the bare
 * prefix: `/home/x/vault-evil/secrets` starts with `/home/x/vault` and
 * a naive `startsWith` would wave it through.
 */
export function resolveInVault(vaultDir: string, relPath: string): string {
  const root = resolve(vaultDir);
  const full = resolve(root, relPath);
  if (full !== root && !full.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new Error(`Path escapes the vault: ${relPath}`);
  }
  return full;
}
