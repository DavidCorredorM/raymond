import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { analyzeLine, computeFenceLines } from "./livePreview";

/**
 * The CM6 glue for `livePreview.ts` — turns its pure per-line analysis
 * into real `Decoration`s. Everything decidable without CodeMirror lives
 * in that file and is unit-tested there; this file is deliberately thin
 * and untested directly, matching this codebase's existing split (the
 * v1 `wikilinkDecorationPlugin` this replaces had the same shape).
 *
 * `Decoration.replace({})` — an empty options object — is the standard
 * CM6 idiom for "collapse this range to zero width": the document text
 * is untouched, only the *rendering* of that range disappears. That is
 * the hide half of live preview. `Decoration.set(ranges, true)` sorts
 * for us, so mark/replace/line decorations can be built in whatever
 * order `analyzeLine` produced them rather than hand-merging three
 * pre-sorted streams.
 */

const hideDeco = Decoration.replace({});

const markCache = new Map<string, Decoration>();
function markFor(className: string): Decoration {
  let d = markCache.get(className);
  if (!d) {
    d = Decoration.mark({ class: className });
    markCache.set(className, d);
  }
  return d;
}

const lineCache = new Map<string, Decoration>();
function lineFor(className: string): Decoration {
  let d = lineCache.get(className);
  if (!d) {
    d = Decoration.line({ class: className });
    lineCache.set(className, d);
  }
  return d;
}

/** Every line number (1-based, CM6's convention) touched by any selection range. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(range.from).number;
    const toLine = view.state.doc.lineAt(range.to).number;
    for (let n = fromLine; n <= toLine; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const active = activeLines(view);

  // One pass over the whole document to find fenced code blocks (see
  // computeFenceLines' own comment for why this can't be viewport-scoped),
  // then the perf-sensitive part — building decorations — stays scoped to
  // `view.visibleRanges` per plan §2.1.
  const doc = view.state.doc;
  const allLineTexts: string[] = [];
  for (let n = 1; n <= doc.lines; n++) allLineTexts.push(doc.line(n).text);
  const fenced = computeFenceLines(allLineTexts);

  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      if (!fenced[line.number - 1]) {
        const result = analyzeLine(line.text, line.from, active.has(line.number));
        for (const h of result.hide) ranges.push(hideDeco.range(h.from, h.to));
        for (const m of result.marks) ranges.push(markFor(m.className).range(m.from, m.to));
        if (result.lineClass) ranges.push(lineFor(result.lineClass).range(line.from));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      // selectionSet, not just docChanged/viewportChanged (the v1
      // wikilink-only plugin's list) — the whole point of "except on the
      // cursor's line" is that moving the cursor with no doc change must
      // still re-reveal/re-hide delimiters.
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
