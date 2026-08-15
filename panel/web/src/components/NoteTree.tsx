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

function FolderView({
  node,
  depth,
  collapsed,
  toggle,
}: {
  node: VaultTreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (path: string) => void;
}) {
  const folders = sortedFolders(node);
  const notes = sortedNotes(node);
  const attachments = sortedAttachments(node);
  return (
    <ul className="note-tree-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {folders.map((f) => {
        const isCollapsed = collapsed.has(f.path);
        return (
          <li key={f.path}>
            <FolderUpload folder={f.path} label={f.path}>
              <button
                type="button"
                className="note-tree-folder"
                onClick={() => toggle(f.path)}
                aria-expanded={!isCollapsed}
              >
                <span className={"note-tree-caret" + (isCollapsed ? " collapsed" : "")}>▸</span>
                {f.name}
              </button>
            </FolderUpload>
            {!isCollapsed && (
              <FolderView node={f} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
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
 * view can render (roadmap #9). It links to /vault/file/*, which previews it
 * if it's an image or a PDF and otherwise offers the download.
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const visibleNotes = showSystem ? notes : notes.filter((n) => !n.isSystem);
  const visibleFiles = showSystem ? attachments : attachments.filter((a) => !a.isSystem);
  const tree = buildVaultTree(visibleNotes, visibleFiles);

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (visibleNotes.length === 0 && visibleFiles.length === 0) {
    return <p className="note-tree-empty">No notes match.</p>;
  }
  return (
    <>
      {/* Root is a real destination too — a file dropped here lands at the
          top of the vault, same as any other folder row. */}
      <FolderUpload folder="" label="the vault root">
        <span className="note-tree-root-label">Vault root</span>
      </FolderUpload>
      <FolderView node={tree} depth={0} collapsed={collapsed} toggle={toggle} />
    </>
  );
}
