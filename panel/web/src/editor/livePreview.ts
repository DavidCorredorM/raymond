/**
 * Live-preview markdown, phase 2b of the deferred item in
 * `panel/docs/frontend-implementation-plan.md` §2.1/§3 and
 * `docs/roadmap.md` — owner's ask #5, and per the brief "probably the
 * single highest-value item in the list" for a non-coder reading and
 * editing her own notes: **hide markdown syntax except on the cursor's
 * line**, the mechanism SilverBullet and Obsidian both independently
 * converged on (decorations over the plain-text document, not a second
 * renderer — see the plan's citations).
 *
 * This file is the *decidable* half: given one line's text, its offset
 * in the document, and whether the cursor/selection touches it, produce
 * the spans to visually collapse (the delimiter characters) and the
 * spans/line to style (bold, italic, code, heading size, the wikilink
 * colour). Pure strings in, plain data out — no CodeMirror import, so it
 * is testable without a `EditorView` or a DOM, the same reason
 * `dashboards/filter.ts` and `lib/vaultTree.ts` are structured this way
 * in this codebase. `livePreviewPlugin.ts` is the thin CM6
 * `ViewPlugin` that calls this per visible line and turns the result
 * into real `Decoration`s.
 *
 * **Formatting is not gated on the active line; delimiters are.** Bold
 * text stays visually bold while the cursor sits on that line — only the
 * `**` characters reappear so they can be edited. This matches Obsidian's
 * live preview and is *why* the "except on the cursor's line" rule is
 * about hiding, not about a wholesale switch between "rendered" and
 * "source" views of the line.
 *
 * **What is deliberately not covered here (documented, not silently
 * missing):** blockquotes, tables, and interactive checkbox widgets
 * (`- [ ]` stays plain text, not a clickable box — turning it into one
 * needs a `WidgetType` that can mutate the document on click, which is
 * real additional scope the brief's "if you must cut scope, cut
 * elsewhere" pointed at cutting). Nested/overlapping emphasis
 * (`***both***`) is not specially handled — it renders as one construct
 * or the other depending on which the single-pass scanner reaches first,
 * same simplification real vault content rarely exercises.
 */

export interface HideSpan {
  from: number;
  to: number;
}

export interface MarkSpan {
  from: number;
  to: number;
  className: string;
}

export interface LineAnalysis {
  /** Delimiter ranges to visually collapse — only populated when `!isActive`. */
  hide: HideSpan[];
  /** Ranges to style — always populated, active line or not. */
  marks: MarkSpan[];
  /** A class for the whole line (heading size) — always applied. */
  lineClass?: string;
}

const EMPTY: LineAnalysis = { hide: [], marks: [] };

const HEADING = /^(#{1,6})(\s+)(?=\S)/;

/**
 * One pass, one regex, five constructs — ordering inside the alternation
 * is the whole conflict-avoidance strategy: `exec`'s `lastIndex` only
 * ever advances past a full match, so two constructs can never claim the
 * same character. Bold (`**`) is listed before italic (`*`) so `**x**`
 * is never read as `*` + literal `*x*` + `*`. Lookaround on the
 * single-star form keeps `**bold**` and `*italic*` from tripping each
 * other on shared asterisks; underscores get no such guard because `_`
 * doesn't collide with `*`.
 */
const INLINE =
  /\*\*(?<bold>[^\n]+?)\*\*|(?<!\*)\*(?<italic>[^\n*]+?)\*(?!\*)|_(?<italic2>[^\n_]+?)_|`(?<code>[^`\n]+?)`|~~(?<strike>[^\n]+?)~~/g;

/** `[[target]]`, `[[target|alias]]`, `[[target#heading]]` — same capture shape `vault.ts`'s server-side WIKILINK regex uses. */
const WIKILINK = /\[\[([^\]|#]+)(?:([|#])([^\]]*))?\]\]/g;

/**
 * Analyse one line. `lineStart` is that line's offset in the full
 * document — every span returned is in document coordinates, ready to
 * hand to `Decoration.set` unchanged.
 */
export function analyzeLine(lineText: string, lineStart: number, isActive: boolean): LineAnalysis {
  if (!lineText) return EMPTY;

  const hide: HideSpan[] = [];
  const marks: MarkSpan[] = [];
  let lineClass: string | undefined;

  const heading = HEADING.exec(lineText);
  if (heading) {
    const level = heading[1]!.length;
    lineClass = `cm-live-h${level}`;
    if (!isActive) {
      hide.push({ from: lineStart, to: lineStart + heading[0].length });
    }
  }

  // Inline constructs scan the whole line regardless of the heading
  // match above — "# **bold** heading" is real content, not a conflict,
  // since the heading hide-span only covers the leading `#`s.
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(lineText))) {
    const g = m.groups!;
    let className: string;
    let delimLen: number;
    let inner: string;
    if (g.bold !== undefined) {
      className = "cm-live-bold";
      delimLen = 2;
      inner = g.bold;
    } else if (g.italic !== undefined) {
      className = "cm-live-italic";
      delimLen = 1;
      inner = g.italic;
    } else if (g.italic2 !== undefined) {
      className = "cm-live-italic";
      delimLen = 1;
      inner = g.italic2;
    } else if (g.code !== undefined) {
      className = "cm-live-code";
      delimLen = 1;
      inner = g.code;
    } else {
      className = "cm-live-strike";
      delimLen = 2;
      inner = g.strike!;
    }
    const matchStart = lineStart + m.index;
    const innerStart = matchStart + delimLen;
    const innerEnd = innerStart + inner.length;
    const matchEnd = innerEnd + delimLen;

    marks.push({ from: innerStart, to: innerEnd, className });
    if (!isActive) {
      hide.push({ from: matchStart, to: innerStart });
      hide.push({ from: innerEnd, to: matchEnd });
    }
  }

  WIKILINK.lastIndex = 0;
  let wm: RegExpExecArray | null;
  while ((wm = WIKILINK.exec(lineText))) {
    const [whole, target, sep] = wm;
    const matchStart = lineStart + wm.index;
    const matchEnd = matchStart + whole!.length;
    const openEnd = matchStart + 2; // past "[["
    const closeStart = matchEnd - 2; // before "]]"

    // An alias (`|`) replaces the visible text; a heading ref (`#`) is
    // kept visible next to the target so the preview still shows which
    // section a link points at.
    const hasAlias = sep === "|";
    const visibleStart = hasAlias ? openEnd + target!.length + 1 : openEnd;
    const visibleEnd = closeStart;

    marks.push({ from: visibleStart, to: visibleEnd, className: "cm-wikilink" });
    if (!isActive) {
      hide.push({ from: matchStart, to: visibleStart });
      hide.push({ from: visibleEnd, to: matchEnd });
    }
  }

  if (hide.length === 0 && marks.length === 0 && !lineClass) return EMPTY;
  return { hide, marks, lineClass };
}

const FENCE = /^ {0,3}(```|~~~)/;

/**
 * Which lines sit inside (or are the delimiter of) a fenced code block —
 * `_tools/mender.py`'s own `conventions.md` §4 rule for why this
 * matters applies here too: a code sample containing `**`, `#` or
 * `[[...]]` as literal text must not be read as formatting. `analyzeLine`
 * has no document-wide context (by design — it only sees one line), so
 * this is computed once per document and consulted per line by the CM6
 * plugin rather than folded into `analyzeLine` itself.
 *
 * One forward pass over the whole document, not just the visible range —
 * a fence can open above the viewport, and knowing whether line 400 is
 * "inside a fence" requires having seen every toggle above it. Cheap for
 * a personal vault's notes; the perf-critical scan (rebuilding
 * decorations) still stays viewport-scoped in the caller.
 */
export function computeFenceLines(lines: readonly string[]): boolean[] {
  const out = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i]!)) {
      out[i] = true; // the delimiter line itself is code-ish too
      inFence = !inFence;
    } else {
      out[i] = inFence;
    }
  }
  return out;
}
