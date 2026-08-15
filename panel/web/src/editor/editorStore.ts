import { create } from "zustand";

/**
 * The one piece of editor state that needs a store instead of plain React
 * state (plan §6.2): the dirty buffer. It's read by the save button, the
 * route-leave guard (useUnsavedChangesGuard.ts), and written by the CM6
 * editor's onChange — none of which are in a parent/child relationship, so
 * prop-drilling would mean threading it through NoteRoute for no reason
 * other than passing it along.
 *
 * CM6's `value` prop is never derived from this store (plan §2.3/§6.6
 * pitfall #2) — it's always the server-sourced `initialContent`. This store
 * only holds the buffer `onChange` populates and the `original` snapshot
 * used to compute `isDirty`.
 */
interface EditorStore {
  /** Path of the note currently being edited, or null if none. */
  path: string | null;
  /** Current buffer content (mirrors CM6's onChange output). */
  content: string;
  /** Snapshot to diff against — the last-saved (or last-loaded) content. */
  original: string;
  isDirty: boolean;
  startEditing: (path: string, content: string) => void;
  updateContent: (content: string) => void;
  /** Called after a successful PUT — resets the dirty baseline. */
  markSaved: () => void;
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  path: null,
  content: "",
  original: "",
  isDirty: false,
  startEditing: (path, content) => set({ path, content, original: content, isDirty: false }),
  updateContent: (content) => set({ content, isDirty: content !== get().original }),
  markSaved: () => set((s) => ({ original: s.content, isDirty: false })),
}));
