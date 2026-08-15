import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useNotes } from "../api/queries";
import { NoteTree } from "../components/NoteTree";
import { SearchBox, filterNotes } from "../components/SearchBox";

function subnavClass({ isActive }: { isActive: boolean }): string {
  return "vault-subnav-link" + (isActive ? " active" : "");
}

/**
 * Notes/Graph/Health sub-nav lives here, not in AppShell — all three are
 * views over the same vault, and Health moved from a top-level nav item
 * to this row (plan §11.2: "reachable from within Vault, not a top-level
 * nav item").
 */
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
        <nav className="vault-subnav">
          <NavLink to="/vault" end className={subnavClass}>
            Notes
          </NavLink>
          <NavLink to="/vault/graph" className={subnavClass}>
            Graph
          </NavLink>
          <NavLink to="/vault/health" className={subnavClass}>
            Health
          </NavLink>
        </nav>
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
