import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { NoteSummary } from "../api/types";
import { noteHref } from "../lib/notePath";

interface FolderNode {
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  notes: NoteSummary[];
}

function makeFolder(name: string, path: string): FolderNode {
  return { name, path, folders: new Map(), notes: [] };
}

function buildTree(notes: NoteSummary[]): FolderNode {
  const root = makeFolder("", "");
  for (const note of notes) {
    const segments = note.path.split("/");
    segments.pop(); // filename, not a folder segment
    let cursor = root;
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = cursor.folders.get(seg);
      if (!child) {
        child = makeFolder(seg, acc);
        cursor.folders.set(seg, child);
      }
      cursor = child;
    }
    cursor.notes.push(note);
  }
  return root;
}

function FolderView({
  node,
  depth,
  collapsed,
  toggle,
}: {
  node: FolderNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (path: string) => void;
}) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  const notes = [...node.notes].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <ul className="note-tree-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {folders.map((f) => {
        const isCollapsed = collapsed.has(f.path);
        return (
          <li key={f.path}>
            <button
              type="button"
              className="note-tree-folder"
              onClick={() => toggle(f.path)}
              aria-expanded={!isCollapsed}
            >
              <span className={"note-tree-caret" + (isCollapsed ? " collapsed" : "")}>▸</span>
              {f.name}
            </button>
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
    </ul>
  );
}

export function NoteTree({
  notes,
  showSystem,
}: {
  notes: NoteSummary[];
  /** Show skills/templates/tooling alongside the user's own notes. Off by default. */
  showSystem: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const visible = showSystem ? notes : notes.filter((n) => !n.isSystem);
  const tree = buildTree(visible);

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (visible.length === 0) {
    return <p className="note-tree-empty">No notes match.</p>;
  }
  return <FolderView node={tree} depth={0} collapsed={collapsed} toggle={toggle} />;
}
