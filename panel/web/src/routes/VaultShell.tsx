import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useNotes } from "../api/queries";
import { NoteTree } from "../components/NoteTree";
import { SearchBox, filterNotes } from "../components/SearchBox";

export function VaultShell() {
  const { data: notes, isLoading, isError, error } = useNotes();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterNotes(notes ?? [], query), [notes, query]);

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
          {notes && <NoteTree notes={filtered} />}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
