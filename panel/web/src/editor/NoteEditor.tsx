import { useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { autocompletion } from "@codemirror/autocomplete";
import type { NoteSummary } from "../api/types";
import { useEditorStore } from "./editorStore";
import { livePreviewPlugin } from "./livePreviewPlugin";
import { makeWikilinkSource } from "./wikilinkAutocomplete";

/**
 * CM6 editor, live-preview mode (owner's ask #5; plan §2.1/§3 phase 2b,
 * pulled forward from "polish pass, revisit later" per the owner's
 * instruction that this is "probably the single highest-value item" for
 * a non-coder). Rendered with `key={note.path}` by the caller (NoteRoute)
 * so React fully remounts it on note switch instead of diffing (plan
 * §2.3 pitfall #2). `initialContent` is a one-shot value used only to
 * construct CM6's document at mount — never round-tripped through the
 * `editorStore` buffer `onChange` populates on every keystroke (that
 * round-trip is the controlled-input feedback loop §2.3 warns against).
 * NoteRoute passes either server-sourced content or the store's own
 * buffer (when re-entering edit mode for a note that already has one) —
 * either way it's a single fixed value for this mount, not a prop that
 * changes underneath the running editor.
 *
 * `livePreviewPlugin` (editor/livePreview.ts + livePreviewPlugin.ts)
 * hides `**`/`*`/`` ` ``/`#`/`[[`/`]]` except on the line the cursor is
 * on, and colours/weights the text they wrap — so a reader sees close to
 * formatted prose, not `##` and `**`, without a second renderer or a
 * mode switch. It replaces the older `wikilinkDecorationPlugin`, which
 * only ever coloured `[[links]]` and hid nothing; that behaviour is now
 * one case of the general mechanism rather than a separate plugin.
 *
 * Frontmatter is not stripped or given a separate editing UI — `content`
 * is the full raw file, `---` block included (plan §6.7, deferred as a
 * separate structured form; out of scope for this pass).
 */
export function NoteEditor({
  path,
  initialContent,
  notes,
}: {
  path: string;
  initialContent: string;
  notes: NoteSummary[];
}) {
  const updateContent = useEditorStore((s) => s.updateContent);
  const startEditing = useEditorStore((s) => s.startEditing);

  useEffect(() => {
    // Only reset the buffer when this is genuinely a different note than
    // the store already holds. Toggling between view/edit mode for the
    // *same* note remounts this component (conditional render in
    // NoteRoute) but must not discard an in-progress edit — the store
    // outlives the component, so we only re-seed it on a real note switch.
    if (useEditorStore.getState().path !== path) {
      startEditing(path, initialContent);
    }
  }, [path, initialContent, startEditing]);

  const wikilinkSource = useMemo(() => makeWikilinkSource(notes), [notes]);

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      livePreviewPlugin,
      autocompletion({ override: [wikilinkSource] }),
    ],
    [wikilinkSource],
  );

  return (
    <CodeMirror
      value={initialContent}
      extensions={extensions}
      basicSetup={{ closeBrackets: false, autocompletion: false, foldGutter: false }}
      onChange={(value) => updateContent(value)}
      height="100%"
      className="note-editor-cm"
    />
  );
}
