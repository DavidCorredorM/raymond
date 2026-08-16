import { Link } from "react-router-dom";
import type { NoteSummary } from "../api/types";
import { noteHref } from "../lib/notePath";
import { useT } from "../i18n/store";

/**
 * Flat list of titles/paths, not context-preview cards — the API returns
 * backlink *paths* only, not the linking text's surrounding context.
 * frontend-implementation-plan.md §2.4 / §9 flags this as a known gap,
 * not a silent downgrade.
 */
export function BacklinksPanel({ backlinks, notes }: { backlinks: string[]; notes: NoteSummary[] }) {
  const t = useT();
  if (backlinks.length === 0) {
    return (
      <aside className="backlinks-panel">
        <h2>{t.backlinks.heading}</h2>
        <p className="muted">{t.backlinks.none}</p>
      </aside>
    );
  }
  const byPath = new Map(notes.map((n) => [n.path, n]));
  return (
    <aside className="backlinks-panel">
      <h2>{t.backlinks.headingWithCount(backlinks.length)}</h2>
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
