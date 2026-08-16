import { describe, expect, it } from "vitest";
import { FALLBACK_GRAPH_PALETTE, graphPaletteFrom, withAlpha } from "./graphPalette";

describe("withAlpha", () => {
  it("converts a 6-digit hex to rgba", () => {
    expect(withAlpha("#2f4858", 0.35)).toBe("rgba(47, 72, 88, 0.35)");
  });

  it("passes through anything that isn't a plain hex, rather than mangling it", () => {
    expect(withAlpha("rgb(1,2,3)", 0.5)).toBe("rgb(1,2,3)");
    expect(withAlpha("not-a-colour", 0.5)).toBe("not-a-colour");
  });
});

describe("graphPaletteFrom", () => {
  it("reads the four tokens the canvas needs and derives the translucent link colours", () => {
    const tokens: Record<string, string> = {
      "--accent": "#2f4858",
      "--accent-hover": "#3e5f72",
      "--fg": "#26221c",
      "--fg-muted": "#645b4f",
    };
    const palette = graphPaletteFrom((t) => tokens[t] ?? "");
    expect(palette.node).toBe("#2f4858");
    expect(palette.nodeHighlight).toBe("#3e5f72");
    expect(palette.label).toBe("#26221c");
    expect(palette.link).toBe(withAlpha("#645b4f", 0.35));
    expect(palette.linkHighlight).toBe(withAlpha("#2f4858", 0.85));
    expect(palette.linkDim).toBe(withAlpha("#645b4f", 0.08));
  });

  it("falls back per-token when a read comes back empty, rather than an invisible graph", () => {
    const palette = graphPaletteFrom(() => "");
    expect(palette.node).toBe(FALLBACK_GRAPH_PALETTE.node);
    expect(palette.label).toBe(FALLBACK_GRAPH_PALETTE.label);
  });
});
