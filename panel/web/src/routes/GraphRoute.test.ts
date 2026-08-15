import { describe, expect, it, vi } from "vitest";

// force-graph touches `window` at import time and there's no DOM
// environment installed (vitest runs in node here), so the component's
// dependency is stubbed. Nothing below renders anything — these are the
// pure visibility/sizing rules the canvas painter reads, which is the
// only part of a canvas visualisation that can be asserted at all.
vi.mock("react-force-graph-2d", () => ({ default: () => null }));

import {
  LABEL_FADE_END,
  LABEL_FADE_START,
  NODE_MAX_RADIUS,
  NODE_MIN_RADIUS,
  hoverRelation,
  labelAlpha,
  nodeRadius,
  pointerRadius,
  truncateToWidth,
} from "./GraphRoute";

describe("labelAlpha — zoom ramp with nothing hovered", () => {
  it("draws nothing below the threshold", () => {
    expect(labelAlpha(0.5, "none")).toBe(0);
    expect(labelAlpha(LABEL_FADE_START, "none")).toBe(0);
  });

  it("ramps linearly through the fade range", () => {
    const mid = (LABEL_FADE_START + LABEL_FADE_END) / 2;
    expect(labelAlpha(mid, "none")).toBeCloseTo(0.5, 6);
    const quarter = LABEL_FADE_START + (LABEL_FADE_END - LABEL_FADE_START) / 4;
    expect(labelAlpha(quarter, "none")).toBeCloseTo(0.25, 6);
  });

  it("is fully opaque at and above the end of the ramp", () => {
    expect(labelAlpha(LABEL_FADE_END, "none")).toBe(1);
    expect(labelAlpha(8, "none")).toBe(1);
  });

  it("never leaves 0..1, including for nonsense zoom values", () => {
    for (const z of [-5, 0, 1, 1.5, 2, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const a = labelAlpha(z, "none");
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe("labelAlpha — hover overrides zoom", () => {
  it("shows the hovered node's label even fully zoomed out", () => {
    expect(labelAlpha(0.2, "hovered")).toBe(1);
  });

  it("shows the hovered node's neighbours even fully zoomed out", () => {
    expect(labelAlpha(0.2, "neighbour")).toBe(1);
  });

  it("hides an unrelated node's label even when zoomed right in", () => {
    expect(labelAlpha(10, "faded")).toBe(0);
  });
});

describe("hoverRelation", () => {
  const neighbours = new Set(["b.md", "c.md"]);

  it("reports no hover state when nothing is hovered", () => {
    expect(hoverRelation("a.md", null, new Set())).toBe("none");
  });

  it("identifies the hovered node, its neighbours, and everything else", () => {
    expect(hoverRelation("a.md", "a.md", neighbours)).toBe("hovered");
    expect(hoverRelation("b.md", "a.md", neighbours)).toBe("neighbour");
    expect(hoverRelation("z.md", "a.md", neighbours)).toBe("faded");
  });
});

describe("nodeRadius", () => {
  it("gives an unlinked note the minimum size", () => {
    expect(nodeRadius(0)).toBe(NODE_MIN_RADIUS);
  });

  it("treats missing or nonsense degrees as unlinked rather than NaN", () => {
    expect(nodeRadius(-3)).toBe(NODE_MIN_RADIUS);
    expect(nodeRadius(Number.NaN)).toBe(NODE_MIN_RADIUS);
  });

  it("grows with degree but with diminishing returns", () => {
    expect(nodeRadius(1)).toBeGreaterThan(nodeRadius(0));
    expect(nodeRadius(10)).toBeGreaterThan(nodeRadius(1));
    // sqrt growth: the step from 1 to 4 links must outpace 4 to 7.
    expect(nodeRadius(4) - nodeRadius(1)).toBeGreaterThan(nodeRadius(7) - nodeRadius(4));
  });

  it("caps so one hub can't swallow the graph", () => {
    expect(nodeRadius(10_000)).toBe(NODE_MAX_RADIUS);
  });
});

describe("pointerRadius", () => {
  it("always covers the drawn circle, at every degree", () => {
    for (const d of [0, 1, 5, 40, 5000]) {
      expect(pointerRadius(d)).toBeGreaterThan(nodeRadius(d));
    }
  });

  it("tracks degree-based sizing instead of a fixed radius", () => {
    expect(pointerRadius(25)).toBeGreaterThan(pointerRadius(0));
  });
});

describe("truncateToWidth", () => {
  // One unit per character keeps the expectations readable; the real
  // caller measures with the canvas context.
  const measure = (s: string) => s.length;

  it("leaves a title that fits untouched", () => {
    expect(truncateToWidth("short", 10, measure)).toBe("short");
  });

  it("ellipsises a title that doesn't", () => {
    const out = truncateToWidth("a very long note title indeed", 10, measure);
    expect(out).toBe("a very lo…");
    expect(measure(out)).toBeLessThanOrEqual(10);
  });

  it("keeps as much as fits, never more", () => {
    for (const width of [1, 2, 3, 7, 12, 28]) {
      expect(measure(truncateToWidth("a very long note title indeed", width, measure))).toBeLessThanOrEqual(
        width,
      );
    }
  });

  it("draws nothing when there is no room at all", () => {
    expect(truncateToWidth("anything", 0, measure)).toBe("");
    expect(truncateToWidth("anything", -1, measure)).toBe("");
  });
});
