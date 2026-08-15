import type { Attachment, NoteSummary } from "../api/types";
import { baseName } from "./attachments";

/**
 * One folder tree over both indexes. Notes and attachments come from two
 * endpoints because they're two different shapes server-side (roadmap #9),
 * but the vault is one tree and the user shouldn't be shown the seam — a
 * folder holding only a PDF has to appear exactly like any other folder.
 *
 * Lives here rather than inside NoteTree.tsx so the merge is testable
 * without a DOM (there's no jsdom in this package).
 */
export interface VaultTreeNode {
  name: string;
  /** Vault-relative folder path; "" is the root. */
  path: string;
  folders: Map<string, VaultTreeNode>;
  notes: NoteSummary[];
  attachments: Attachment[];
}

function makeFolder(name: string, path: string): VaultTreeNode {
  return { name, path, folders: new Map(), notes: [], attachments: [] };
}

/** Walks/creates the folder chain owning `filePath`, returning that folder. */
function folderFor(root: VaultTreeNode, filePath: string): VaultTreeNode {
  const segments = filePath.split("/");
  segments.pop(); // filename, not a folder segment
  let cursor = root;
  let acc = "";
  for (const seg of segments) {
    if (!seg) continue;
    acc = acc ? `${acc}/${seg}` : seg;
    let child = cursor.folders.get(seg);
    if (!child) {
      child = makeFolder(seg, acc);
      cursor.folders.set(seg, child);
    }
    cursor = child;
  }
  return cursor;
}

export function buildVaultTree(
  notes: NoteSummary[],
  attachments: Attachment[] = [],
): VaultTreeNode {
  const root = makeFolder("", "");
  for (const note of notes) folderFor(root, note.path).notes.push(note);
  for (const attachment of attachments) folderFor(root, attachment.path).attachments.push(attachment);
  return root;
}

export function sortedFolders(node: VaultTreeNode): VaultTreeNode[] {
  return [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sortedNotes(node: VaultTreeNode): NoteSummary[] {
  return [...node.notes].sort((a, b) => a.title.localeCompare(b.title));
}

/** Attachments sort by filename — they have no title to sort by. */
export function sortedAttachments(node: VaultTreeNode): Attachment[] {
  return [...node.attachments].sort((a, b) => baseName(a.path).localeCompare(baseName(b.path)));
}
