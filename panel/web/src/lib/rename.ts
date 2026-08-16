/**
 * Turning what a non-coder types into a vault-relative path — the
 * client-side half of the rename UI (owner's ask #4, the RenameDialog).
 * The server (`panel/server/src/rename.ts`) is the actual authority: it
 * re-derives and re-checks everything here against the real filesystem
 * and the real index. This file exists so a plainly-wrong input (an
 * empty name, a stray `/`) gets a same-tab, immediate answer instead of
 * a round trip for something that could never have worked.
 *
 * The owner is not a coder and does not think in terms of "paths" —
 * `.md` is never shown, and a note's folder never changes here. Typing
 * a new name renames it in place; moving to a different folder isn't
 * exposed in this dialog (deliberately cut scope — the API already
 * supports it, see `panel/server/src/rename.ts`).
 */

export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basenameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function joinVaultPath(folder: string, filename: string): string {
  return folder ? `${folder}/${filename}` : filename;
}

export type RenameInputResult = { path: string; error?: undefined } | { path?: undefined; error: string };

/** A note's title, typed by the user — `.md` is invisible everywhere else in this app, so it's stripped here too if someone types it out of habit. */
export function buildNoteRenamePath(currentPath: string, newTitleInput: string): RenameInputResult {
  const name = newTitleInput.trim().replace(/\.md$/i, "").trim();
  if (!name) return { error: "Enter a name." };
  if (name.includes("/") || name.includes("\\")) {
    return { error: "A name can't contain / or \\." };
  }
  return { path: joinVaultPath(folderOf(currentPath), `${name}.md`) };
}

/** An attachment's filename, extension included — unlike a note title, this app already shows attachments by their real filename, so the dialog edits that directly. */
export function buildAttachmentRenamePath(currentPath: string, newNameInput: string): RenameInputResult {
  const name = newNameInput.trim();
  if (!name) return { error: "Enter a file name." };
  if (name.includes("/") || name.includes("\\")) {
    return { error: "A file name can't contain / or \\." };
  }
  if (name.toLowerCase().endsWith(".md")) {
    return { error: "A file ending in .md is a note — rename it from the note view, not here." };
  }
  return { path: joinVaultPath(folderOf(currentPath), name) };
}
