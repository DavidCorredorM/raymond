import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { Attachment, NoteSummary } from "../api/types";
import { attachmentKind, baseName, extensionOf, formatBytes } from "../lib/attachments";
import { fileHref, noteHref } from "../lib/notePath";
import {
  buildVaultTree,
  sortedAttachments,
  sortedFolders,
  sortedNotes,
  type VaultTreeNode,
} from "../lib/vaultTree";
import { FolderUpload } from "./FolderUpload";
import { Icon } from "../icons/Icon";
import { useT } from "../i18n/store";

function FolderView({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: VaultTreeNode;
  depth: number;
  /**
   * Which folders are open. Tracked as *expanded* rather than collapsed so
   * the empty initial set means "everything folded" — and so a folder that
   * appears later (a new upload, a note an agent just wrote) starts folded
   * like its neighbours instead of springing open.
   */
  expanded: Set<string>;
  toggle: (path: string) => void;
}) {
  const folders = sortedFolders(node);
  const notes = sortedNotes(node);
  const attachments = sortedAttachments(node);
  return (
    <ul className="note-tree-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {folders.map((f) => {
        const isExpanded = expanded.has(f.path);
        return (
          <li key={f.path}>
            <FolderUpload folder={f.path} label={f.path}>
              <button
                type="button"
                className="note-tree-folder"
                onClick={() => toggle(f.path)}
                aria-expanded={isExpanded}
              >
                <span className={"note-tree-caret" + (isExpanded ? "" : " collapsed")}>
                  <Icon name="chevron-right" size={12} />
                </span>
                {f.name}
              </button>
            </FolderUpload>
            {isExpanded && (
              <FolderView node={f} depth={depth + 1} expanded={expanded} toggle={toggle} />
            )}
          </li>
        );
      })}
      {notes.map((n) => (
        <li key={n.path}>
          <NavLink
            to={noteHref(n.path)}
            className={({ isActive }) => "note-tree-item" + (isActive ? " active" : "")}
            title={n.path}
          >
            {n.title}
          </NavLink>
        </li>
      ))}
      {attachments.map((a) => (
        <li key={a.path}>
          <AttachmentItem attachment={a} />
        </li>
      ))}
    </ul>
  );
}

/**
 * An attachment is not a note route: no title, no markdown, nothing the note
 * view can render (roadmap #9). It links to /vault/file/*, which renders it
 * with whichever viewer its type maps to (src/preview/) and falls back to a
 * download when nothing can.
 *
 * Marked with its extension rather than an emoji icon — one glyph set that
 * covers every type the vault will ever hold, readable at 0.65rem, and it
 * says *which* kind of spreadsheet it is. The `data-kind` attribute is what
 * carries colour, so a badge stays a badge and not a decoration.
 */
function AttachmentItem({ attachment }: { attachment: Attachment }) {
  const ext = extensionOf(attachment.path);
  return (
    <NavLink
      to={fileHref(attachment.path)}
      className={({ isActive }) => "note-tree-item note-tree-file" + (isActive ? " active" : "")}
      title={`${attachment.path} · ${formatBytes(attachment.size)} · ${new Date(attachment.mtime).toLocaleDateString()}`}
    >
      <span className="note-tree-ext" data-kind={attachmentKind(attachment.path)}>
        {ext || "file"}
      </span>
      <span className="note-tree-file-name">{baseName(attachment.path)}</span>
    </NavLink>
  );
}

export function NoteTree({
  notes,
  attachments,
  showSystem,
}: {
  notes: NoteSummary[];
  /** Non-`.md` vault files, merged into the same folders as the notes. */
  attachments: Attachment[];
  /** Show skills/templates/tooling alongside the user's own notes. Off by default. */
  showSystem: boolean;
}) {
  const t = useT();
  // Everything starts folded: a real vault is 27 folders deep in places,
  // and an all-open tree is a wall of text you have to read before you can
  // navigate it. Opening a folder is one click; closing twenty is not.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const visibleNotes = showSystem ? notes : notes.filter((n) => !n.isSystem);
  const visibleFiles = showSystem ? attachments : attachments.filter((a) => !a.isSystem);
  const tree = buildVaultTree(visibleNotes, visibleFiles);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (visibleNotes.length === 0 && visibleFiles.length === 0) {
    return <p className="note-tree-empty">{t.noteTree.noMatch}</p>;
  }
  return (
    <>
      {/* Root is a real destination too — a file dropped here lands at the
          top of the vault, same as any other folder row. */}
      <FolderUpload folder="" label={t.noteTree.vaultRootLower}>
        <span className="note-tree-root-label">{t.noteTree.vaultRoot}</span>
      </FolderUpload>
      <FolderView node={tree} depth={0} expanded={expanded} toggle={toggle} />
    </>
  );
}
