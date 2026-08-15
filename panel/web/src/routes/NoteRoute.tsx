import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useNote, useNotes } from "../api/queries";
import { Markdown } from "../markdown/Markdown";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { buildSlugIndex } from "../lib/slugIndex";
import { stripFrontmatter } from "../lib/frontmatter";

function decodePath(splat: string | undefined): string {
  if (!splat) return "";
  return splat
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
}

export function NoteRoute() {
  const params = useParams();
  const path = decodePath(params["*"]);
  const noteQuery = useNote(path || undefined);
  const notesQuery = useNotes();
  const slugIndex = useMemo(() => buildSlugIndex(notesQuery.data ?? []), [notesQuery.data]);

  if (!path) {
    return <p className="muted">No note selected.</p>;
  }
  if (noteQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }
  if (noteQuery.isError) {
    return (
      <div className="note-error">
        <p>Could not load {path}.</p>
        <p className="muted">{(noteQuery.error as Error).message}</p>
      </div>
    );
  }
  const note = noteQuery.data!;
  const frontmatterEntries = Object.entries(note.frontmatter ?? {});

  return (
    <div className="note-route">
      <article className="note-content">
        <header className="note-header">
          <h1>{note.title}</h1>
          <div className="note-meta">
            <span title={path}>{path}</span>
            <span> · </span>
            <span>{new Date(note.mtime).toLocaleString()}</span>
          </div>
          {frontmatterEntries.length > 0 && (
            <details className="frontmatter-details">
              <summary>Frontmatter ({frontmatterEntries.length})</summary>
              <table className="frontmatter-table">
                <tbody>
                  {frontmatterEntries.map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{typeof v === "string" ? v : JSON.stringify(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </header>
        <Markdown content={stripFrontmatter(note.content)} slugIndex={slugIndex} />
      </article>
      <BacklinksPanel backlinks={note.backlinks} notes={notesQuery.data ?? []} />
    </div>
  );
}
