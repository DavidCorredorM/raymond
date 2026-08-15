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
    const fileName = segments.pop()!;
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
    void fileName;
    cursor.notes.push(note);
  }
  return root;
}

function FolderView({ node, depth }: { node: FolderNode; depth: number }) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  const notes = [...node.notes].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <ul className="note-tree-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {folders.map((f) => (
        <li key={f.path}>
          <div className="note-tree-folder">{f.name}/</div>
          <FolderView node={f} depth={depth + 1} />
        </li>
      ))}
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

export function NoteTree({ notes }: { notes: NoteSummary[] }) {
  const tree = buildTree(notes);
  if (notes.length === 0) {
    return <p className="note-tree-empty">No notes match.</p>;
  }
  return <FolderView node={tree} depth={0} />;
}
