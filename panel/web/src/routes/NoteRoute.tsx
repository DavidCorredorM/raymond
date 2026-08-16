import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMoveNote, useNote, useNotes, useSaveNote } from "../api/queries";
import { Markdown } from "../markdown/Markdown";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { buildSlugIndex } from "../lib/slugIndex";
import { decodeRoutePath, noteHref } from "../lib/notePath";
import { stripFrontmatter } from "../lib/frontmatter";
import { basenameOf, buildNoteRenamePath } from "../lib/rename";
import { DashboardRenderer, isDashboardFrontmatter } from "../dashboards/DashboardRenderer";
import { useEditorStore } from "../editor/editorStore";
import { useUnsavedChangesGuard } from "../editor/useUnsavedChangesGuard";
import { ResizablePanel } from "../components/ResizablePanel";
import { RenameDialog } from "../components/RenameDialog";
import { Icon } from "../icons/Icon";

// CodeMirror + its language/autocomplete packages are a meaningful chunk of
// weight (same reasoning as react-force-graph-2d in App.tsx) and are only
// needed once a note is actually opened in edit mode — most page loads
// never touch them. Code-split rather than pay that weight on every note
// view.
const NoteEditor = lazy(() => import("../editor/NoteEditor").then((m) => ({ default: m.NoteEditor })));

export function NoteRoute() {
  const params = useParams();
  // Shared with AttachmentRoute since roadmap #9 added a second splat route
  // over the same vault paths — one decoder, not two that can drift.
  const path = decodeRoutePath(params["*"]);
  const noteQuery = useNote(path || undefined);
  const notesQuery = useNotes();
  const slugIndex = useMemo(() => buildSlugIndex(notesQuery.data ?? []), [notesQuery.data]);

  const navigate = useNavigate();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const saveNote = useSaveNote();
  const [saveError, setSaveError] = useState<string | null>(null);
  const moveNote = useMoveNote();
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const storePath = useEditorStore((s) => s.path);
  const storeContent = useEditorStore((s) => s.content);
  const storeIsDirty = useEditorStore((s) => s.isDirty);
  const markSaved = useEditorStore((s) => s.markSaved);
  // Guard against a stale dirty flag from a note the user already
  // navigated away from — the store only resets on a genuine note switch
  // (see NoteEditor's mount effect), so this comparison keeps the toolbar
  // and the leave-guard scoped to the note actually on screen.
  const isDirty = storeIsDirty && storePath === path;

  useUnsavedChangesGuard(isDirty);

  // Switching notes always lands back in view mode — edit mode doesn't
  // carry across notes, only within the same note (toggling view/edit
  // preserves the buffer, see NoteEditor's mount effect).
  useEffect(() => {
    setMode("view");
    setSaveError(null);
  }, [path]);

  async function handleSave() {
    if (!path) return;
    setSaveError(null);
    try {
      await saveNote.mutateAsync({ path, content: storeContent });
      markSaved();
    } catch (err) {
      setSaveError((err as Error).message);
    }
  }

  // Closing the dialog when the note itself changes underneath it (e.g.
  // a sidebar click while it's open) avoids renaming the wrong note with
  // a stale `path` closed over in `handleRename`.
  useEffect(() => {
    setRenaming(false);
    setRenameError(null);
  }, [path]);

  async function handleRename(newPath: string) {
    setRenameError(null);
    try {
      await moveNote.mutateAsync({ from: path, to: newPath });
      setRenaming(false);
      navigate(noteHref(newPath));
    } catch (err) {
      setRenameError((err as Error).message);
    }
  }

  useEffect(() => {
    if (mode !== "edit") return;
    function onKeydown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, path, storeContent]);

  if (!path) {
    return <p className="muted">No note selected.</p>;
  }
  // `isPending`, not `isLoading`. In TanStack Query v5 `isLoading` is
  // `isPending && isFetching`, so during the pause between a failed fetch
  // and its retry, all three of `isLoading`, `isError` and `data` are
  // falsy — execution fell through to `noteQuery.data!` and the next line
  // crashed the whole app on `undefined.frontmatter`. `isPending` is true
  // for the entire no-data period, backoff included.
  if (noteQuery.isPending) {
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
  // Structural detection only — plan §5.1/§6.3: any note whose
  // frontmatter has a `widgets` array renders as a dashboard instead of
  // plain markdown, regardless of where it lives in the tree.
  const isDashboard = isDashboardFrontmatter(note.frontmatter);

  return (
    <div className="note-route">
      <article className={"note-content" + (isDashboard ? " note-content-wide" : "")}>
        <header className="note-header">
          <div className="note-header-top">
            <h1>{note.title}</h1>
            <div className="note-editor-toolbar">
              {mode === "edit" && (
                <>
                  <span className={"dirty-indicator" + (isDirty ? " dirty" : "")}>
                    {isDirty ? "Unsaved changes" : "Saved"}
                  </span>
                  <button
                    type="button"
                    className="save-button"
                    onClick={handleSave}
                    disabled={!isDirty || saveNote.isPending}
                  >
                    {saveNote.isPending ? "Saving…" : "Save"}
                  </button>
                </>
              )}
              <button type="button" className="mode-toggle" onClick={() => setMode(mode === "edit" ? "view" : "edit")}>
                {mode === "edit" ? "View" : "Edit"}
              </button>
              <button
                type="button"
                className="mode-toggle icon-button"
                onClick={() => setRenaming(true)}
                title="Rename this note"
                aria-label="Rename this note"
              >
                <Icon name="rename" size={15} />
              </button>
            </div>
          </div>
          {saveError && <p className="note-error">Save failed: {saveError}</p>}
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
        {mode === "edit" ? (
          <div className="note-editor-wrap">
            <Suspense fallback={<p className="muted">Loading editor…</p>}>
              {/*
                Toggling view/edit fully unmounts and remounts NoteEditor
                (it's conditionally rendered, not just hidden), which
                destroys CM6's internal EditorState — @uiw/react-codemirror
                only ever uses `value` to construct a *new* document at
                mount, it doesn't resync from an external store afterward
                (that resync is exactly the feedback loop plan §2.3
                warns against). So a plain `note.content` here would
                silently discard an in-progress edit every time the user
                switched to view and back. Seed from the editorStore's
                buffer instead, when it already holds this note's
                in-progress edit — still a one-shot prop at construction
                time, never round-tripped through onChange.
              */}
              <NoteEditor
                key={note.path}
                path={note.path}
                initialContent={storePath === note.path ? storeContent : note.content}
                notes={notesQuery.data ?? []}
              />
            </Suspense>
          </div>
        ) : (
          <>
            <Markdown content={stripFrontmatter(note.content)} slugIndex={slugIndex} />
            {isDashboard && (
              <DashboardRenderer widgets={note.frontmatter.widgets} notes={notesQuery.data ?? []} />
            )}
          </>
        )}
      </article>
      <ResizablePanel
        storageKey="raymond:backlinks"
        side="end"
        defaultWidth={260}
        min={180}
        max={480}
        ariaLabel="Resize the backlinks panel"
      >
        <BacklinksPanel backlinks={note.backlinks} notes={notesQuery.data ?? []} />
      </ResizablePanel>
      {renaming && (
        <RenameDialog
          title="Rename note"
          initialValue={basenameOf(note.path).replace(/\.md$/i, "")}
          helperText={
            note.backlinks.length > 0
              ? `This note is linked from ${note.backlinks.length} other note${
                  note.backlinks.length === 1 ? "" : "s"
                }; they will be updated automatically.`
              : "Nothing links to this note yet."
          }
          validate={(input) => buildNoteRenamePath(note.path, input)}
          onConfirm={handleRename}
          onClose={() => setRenaming(false)}
          busy={moveNote.isPending}
          serverError={renameError}
        />
      )}
    </div>
  );
}
