import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAttachments, useNotes } from "../api/queries";
import { NoteTree } from "../components/NoteTree";
import { SearchBox, filterAttachments, filterNotes } from "../components/SearchBox";
import { ResizablePanel } from "../components/ResizablePanel";
import { useT } from "../i18n/store";

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
  const t = useT();
  const { data: notes, isLoading, isError, error } = useNotes();
  // Attachments are a second, independent index (roadmap #9). Its failure is
  // non-fatal on purpose: an older panel server with no /api/attachments
  // still gets a working note tree, with one muted line saying what's
  // missing, instead of an empty sidebar.
  const attachmentsQuery = useAttachments();
  const attachments = attachmentsQuery.data ?? [];
  const [query, setQuery] = useState("");
  // Off by default — a user's main view is their own notes, not the base
  // package's skills/templates/tooling. Toggle is the escape hatch for
  // anyone who does want to see how the plumbing is organized.
  const [showSystem, setShowSystem] = useState(false);

  const filtered = useMemo(() => filterNotes(notes ?? [], query), [notes, query]);
  const filteredFiles = useMemo(() => filterAttachments(attachments, query), [attachments, query]);
  const systemCount =
    (notes?.filter((n) => n.isSystem).length ?? 0) + attachments.filter((a) => a.isSystem).length;

  return (
    <div className="vault-shell">
      <ResizablePanel
        storageKey="raymond:sidebar"
        side="start"
        defaultWidth={300}
        min={220}
        max={560}
        ariaLabel={t.vaultShell.resizeNoteList}
      >
        <aside className="sidebar">
          <nav className="vault-subnav">
            <NavLink to="/vault" end className={subnavClass}>
              {t.vaultSubnav.notes}
            </NavLink>
            <NavLink to="/vault/graph" className={subnavClass}>
              {t.vaultSubnav.graph}
            </NavLink>
            <NavLink to="/vault/health" className={subnavClass}>
              {t.vaultSubnav.health}
            </NavLink>
          </nav>
          <SearchBox value={query} onChange={setQuery} />
          <nav className="note-tree">
            {isLoading && <p className="muted">{t.vaultShell.loadingNotes}</p>}
            {isError && <p className="note-error">{(error as Error).message}</p>}
            {notes && (
              <NoteTree notes={filtered} attachments={filteredFiles} showSystem={showSystem} />
            )}
            {attachmentsQuery.isError && (
              <p className="muted attachment-index-error">{t.vaultShell.attachmentIndexError}</p>
            )}
          </nav>
          {systemCount > 0 && (
            <label className="system-toggle">
              <input
                type="checkbox"
                checked={showSystem}
                onChange={(e) => setShowSystem(e.target.checked)}
              />
              {t.vaultShell.systemFilesToggle(systemCount)}
            </label>
          )}
        </aside>
      </ResizablePanel>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
