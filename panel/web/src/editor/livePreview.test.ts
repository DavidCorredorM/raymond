import { describe, expect, it } from "vitest";
import { analyzeLine, computeFenceLines } from "./livePreview";

/** Slice `hide`/`marks` spans back out of `text` for readable assertions, rather than asserting raw offsets everywhere. */
function slices(text: string, spans: Array<{ from: number; to: number }>): string[] {
  return spans.map((s) => text.slice(s.from, s.to));
}

describe("analyzeLine — headings", () => {
  it("hides the # marker and whitespace when inactive, keeps the text visible", () => {
    const text = "## A heading";
    const r = analyzeLine(text, 0, false);
    expect(slices(text, r.hide)).toEqual(["## "]);
    expect(r.lineClass).toBe("cm-live-h2");
  });

  it("keeps the # marker visible on the active line, but the heading class still applies", () => {
    const text = "## A heading";
    const r = analyzeLine(text, 0, true);
    expect(r.hide).toEqual([]);
    expect(r.lineClass).toBe("cm-live-h2");
  });

  it("caps at 6 levels — a 7th # is not a heading construct at all", () => {
    const text = "####### too many";
    const r = analyzeLine(text, 0, false);
    expect(r.lineClass).toBeUndefined();
  });

  it("a bare # with no following space is not a heading (matches CommonMark)", () => {
    const text = "#nohash";
    const r = analyzeLine(text, 0, false);
    expect(r.lineClass).toBeUndefined();
  });

  it("offsets are correct mid-document, not just at column 0", () => {
    const text = "# Title";
    const lineStart = 100;
    const r = analyzeLine(text, lineStart, false);
    expect(r.hide).toEqual([{ from: 100, to: 102 }]); // "# "
  });
});

describe("analyzeLine — bold, italic, code, strikethrough", () => {
  it("bold: hides ** on both sides when inactive, marks the inner text", () => {
    const text = "a **bold** word";
    const r = analyzeLine(text, 0, false);
    expect(slices(text, r.hide)).toEqual(["**", "**"]);
    expect(r.marks).toEqual([{ from: 4, to: 8, className: "cm-live-bold" }]);
    expect(text.slice(4, 8)).toBe("bold");
  });

  it("bold: delimiters stay visible on the active line, but the mark still applies", () => {
    const text = "a **bold** word";
    const r = analyzeLine(text, 0, true);
    expect(r.hide).toEqual([]);
    expect(r.marks).toEqual([{ from: 4, to: 8, className: "cm-live-bold" }]);
  });

  it("asterisk italic doesn't get confused by an adjacent bold run", () => {
    const text = "**bold** then *italic*";
    const r = analyzeLine(text, 0, false);
    const bold = r.marks.find((m) => m.className === "cm-live-bold")!;
    const italic = r.marks.find((m) => m.className === "cm-live-italic")!;
    expect(text.slice(bold.from, bold.to)).toBe("bold");
    expect(text.slice(italic.from, italic.to)).toBe("italic");
  });

  it("underscore italic", () => {
    const text = "an _italic_ word";
    const r = analyzeLine(text, 0, false);
    expect(r.marks).toEqual([{ from: 4, to: 10, className: "cm-live-italic" }]);
    expect(text.slice(4, 10)).toBe("italic");
  });

  it("inline code", () => {
    const text = "run `vault-lint` now";
    const r = analyzeLine(text, 0, false);
    expect(r.marks).toEqual([{ from: 5, to: 15, className: "cm-live-code" }]);
    expect(text.slice(5, 15)).toBe("vault-lint");
  });

  it("strikethrough", () => {
    const text = "~~old~~ new";
    const r = analyzeLine(text, 0, false);
    expect(r.marks).toEqual([{ from: 2, to: 5, className: "cm-live-strike" }]);
    expect(text.slice(2, 5)).toBe("old");
  });

  it("two separate bold runs on one line both get found", () => {
    const text = "**a** and **b**";
    const r = analyzeLine(text, 0, false);
    const bolds = r.marks.filter((m) => m.className === "cm-live-bold");
    expect(bolds.map((m) => text.slice(m.from, m.to))).toEqual(["a", "b"]);
  });

  it("a line with no markdown constructs returns nothing to do", () => {
    const r = analyzeLine("plain text, nothing special", 0, false);
    expect(r.hide).toEqual([]);
    expect(r.marks).toEqual([]);
    expect(r.lineClass).toBeUndefined();
  });

  it("an empty line is a no-op", () => {
    expect(analyzeLine("", 0, false)).toEqual({ hide: [], marks: [] });
  });
});

describe("analyzeLine — wiki-links", () => {
  it("bare target: hides the brackets, keeps the target visible and marked", () => {
    const text = "see [[some-note]] for more";
    const r = analyzeLine(text, 0, false);
    expect(slices(text, r.hide)).toEqual(["[[", "]]"]);
    expect(r.marks).toEqual([{ from: 6, to: 15, className: "cm-wikilink" }]);
    expect(text.slice(6, 15)).toBe("some-note");
  });

  it("aliased: hides the brackets AND the target+pipe, shows only the alias", () => {
    const text = "[[some-note|a friendly name]]";
    const r = analyzeLine(text, 0, false);
    expect(slices(text, r.hide)).toEqual(["[[some-note|", "]]"]);
    const mark = r.marks[0]!;
    expect(text.slice(mark.from, mark.to)).toBe("a friendly name");
  });

  it("heading-anchored: keeps target#heading fully visible (no alias to prefer)", () => {
    const text = "[[some-note#Section]]";
    const r = analyzeLine(text, 0, false);
    expect(slices(text, r.hide)).toEqual(["[[", "]]"]);
    const mark = r.marks[0]!;
    expect(text.slice(mark.from, mark.to)).toBe("some-note#Section");
  });

  it("on the active line, nothing is hidden but the mark still applies", () => {
    const text = "[[some-note|alias]]";
    const r = analyzeLine(text, 0, true);
    expect(r.hide).toEqual([]);
    expect(r.marks.length).toBe(1);
  });

  it("two links on one line are both found, independently", () => {
    const text = "[[a]] and [[b|B]]";
    const r = analyzeLine(text, 0, false);
    expect(r.marks.length).toBe(2);
    expect(text.slice(r.marks[0]!.from, r.marks[0]!.to)).toBe("a");
    expect(text.slice(r.marks[1]!.from, r.marks[1]!.to)).toBe("B");
  });
});

describe("computeFenceLines", () => {
  it("marks a fenced block's delimiters and its contents, nothing outside it", () => {
    const lines = ["before", "```", "**not bold**", "# not a heading", "```", "after"];
    expect(computeFenceLines(lines)).toEqual([false, true, true, true, true, false]);
  });

  it("supports the ~~~ fence spelling too", () => {
    const lines = ["~~~", "code", "~~~"];
    expect(computeFenceLines(lines)).toEqual([true, true, true]);
  });

  it("an unclosed fence marks everything after it as code — better than guessing where it 'should' end", () => {
    const lines = ["```", "one", "two"];
    expect(computeFenceLines(lines)).toEqual([true, true, true]);
  });

  it("allows up to 3 leading spaces on a fence, per CommonMark", () => {
    const lines = ["  ```", "code", "  ```", "after"];
    expect(computeFenceLines(lines)).toEqual([true, true, true, false]);
  });

  it("a document with no fence at all is all false", () => {
    expect(computeFenceLines(["a", "b", "**c**"])).toEqual([false, false, false]);
  });
});

describe("analyzeLine — headings and inline constructs together", () => {
  it("a heading containing bold text gets both the heading hide and the bold mark", () => {
    const text = "## A **bold** heading";
    const r = analyzeLine(text, 0, false);
    expect(r.lineClass).toBe("cm-live-h2");
    expect(slices(text, r.hide)).toEqual(["## ", "**", "**"]);
    const bold = r.marks.find((m) => m.className === "cm-live-bold")!;
    expect(text.slice(bold.from, bold.to)).toBe("bold");
  });
});
