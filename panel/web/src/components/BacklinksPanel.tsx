import { Link } from "react-router-dom";
import type { NoteSummary } from "../api/types";
import { noteHref } from "../lib/notePath";

/**
 * Flat list of titles/paths, not context-preview cards — the API returns
 * backlink *paths* only, not the linking text's surrounding context.
 * frontend-implementation-plan.md §2.4 / §9 flags this as a known gap,
 * not a silent downgrade.
 */
export function BacklinksPanel({ backlinks, notes }: { backlinks: string[]; notes: NoteSummary[] }) {
  if (backlinks.length === 0) {
    return (
      <aside className="backlinks-panel">
        <h2>Backlinks</h2>
        <p className="muted">Nothing links here yet.</p>
      </aside>
    );
  }
  const byPath = new Map(notes.map((n) => [n.path, n]));
  return (
    <aside className="backlinks-panel">
      <h2>Backlinks ({backlinks.length})</h2>
      <ul>
        {backlinks.map((path) => {
          const note = byPath.get(path);
          return (
            <li key={path}>
              <Link to={noteHref(path)}>{note?.title ?? path}</Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
