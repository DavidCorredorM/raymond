import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

/**
 * Marks `[[...]]` ranges with a CSS class for visual distinction — a plain
 * `Decoration.mark`, nothing hidden or replaced. This is explicitly *not*
 * phase-2b live preview (hiding syntax characters, swapping text for
 * rendered widgets) — see plan §2.1/§6.6 and the out-of-scope note in §9.
 *
 * Scans only `view.visibleRanges`, not the whole document, per the
 * perf-critical detail called out in plan §2.1 — cheap even on a long note.
 */
const WIKILINK_RE = /\[\[[^\]]*\]\]/g;
const wikilinkMark = Decoration.mark({ class: "cm-wikilink" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(text))) {
      builder.add(from + m.index, from + m.index + m[0].length, wikilinkMark);
    }
  }
  return builder.finish();
}

export const wikilinkDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
