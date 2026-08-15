import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useNotes } from "../api/queries";
import { NoteTree } from "../components/NoteTree";
import { SearchBox, filterNotes } from "../components/SearchBox";

export function VaultShell() {
  const { data: notes, isLoading, isError, error } = useNotes();
  const [query, setQuery] = useState("");
  // Off by default — a user's main view is their own notes, not the base
  // package's skills/templates/tooling. Toggle is the escape hatch for
  // anyone who does want to see how the plumbing is organized.
  const [showSystem, setShowSystem] = useState(false);

  const filtered = useMemo(() => filterNotes(notes ?? [], query), [notes, query]);
  const systemCount = notes?.filter((n) => n.isSystem).length ?? 0;

  return (
    <div className="vault-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <NavLink to="/" end className="brand">
            ben
          </NavLink>
          <NavLink to="/health" className={({ isActive }) => "health-link" + (isActive ? " active" : "")}>
            health
          </NavLink>
        </div>
        <SearchBox value={query} onChange={setQuery} />
        <nav className="note-tree">
          {isLoading && <p className="muted">Loading notes…</p>}
          {isError && <p className="note-error">{(error as Error).message}</p>}
          {notes && <NoteTree notes={filtered} showSystem={showSystem} />}
        </nav>
        {systemCount > 0 && (
          <label className="system-toggle">
            <input
              type="checkbox"
              checked={showSystem}
              onChange={(e) => setShowSystem(e.target.checked)}
            />
            Show {systemCount} system file{systemCount === 1 ? "" : "s"}
          </label>
        )}
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
