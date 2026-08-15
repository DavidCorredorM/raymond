import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { NoteSummary } from "../api/types";

/**
 * Completion source for `[[wiki-links]]` — plan §2.4/§6.6. Built once per
 * notes-list change (`useMemo` in NoteEditor.tsx), filtered in memory on
 * every keystroke. No network call ever happens here; the notes list is
 * already cached by TanStack Query (useNotes) before the editor mounts.
 */
export function makeWikilinkSource(notes: NoteSummary[]) {
  const options = notes.map((n) => ({
    label: n.slug,
    detail: n.title !== n.slug ? n.title : undefined,
  }));

  return function wikilinkSource(context: CompletionContext): CompletionResult | null {
    const match = context.matchBefore(/\[\[[^\]]*/);
    if (!match) return null;

    const query = match.text.slice(2).toLowerCase();
    const filtered = query
      ? options.filter(
          (o) => o.label.toLowerCase().includes(query) || o.detail?.toLowerCase().includes(query),
        )
      : options;

    return {
      from: match.from + 2,
      options: filtered.slice(0, 50).map((o) => ({
        label: o.label,
        detail: o.detail,
        // `from` already sits right after `[[`, so apply only needs the
        // slug plus the closing brackets — not the `[[` again.
        apply: `${o.label}]]`,
      })),
      validFor: /^[^\]]*$/,
    };
  };
}
