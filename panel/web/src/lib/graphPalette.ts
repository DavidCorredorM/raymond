/**
 * The graph is painted on a `<canvas>`, and `ctx.fillStyle` cannot read a
 * CSS custom property — so the graph either restates the palette in
 * JavaScript or reads it out of the document at runtime.
 *
 * It used to restate it: six literal hex strings at the top of
 * `GraphRoute.tsx`, picked from the *old* palette and keyed off
 * `prefers-color-scheme` evaluated once at module load. That is two
 * copies of the same design decision, which is the drift this repo keeps
 * recording as a bug — the palette got replaced and the graph would have
 * kept painting the old blue on the new cream, at module scope, where no
 * theme change could ever reach it.
 *
 * So: read the tokens off `:root` with `getComputedStyle`, which resolves
 * whichever `@media (prefers-color-scheme)` block is currently winning.
 * One source of truth (`styles.css`), and the contrast test covers these
 * colours because they are the same tokens the rest of the UI uses.
 */

export interface GraphPalette {
  node: string;
  nodeHighlight: string;
  label: string;
  link: string;
  linkHighlight: string;
  linkDim: string;
}

/**
 * Used when there is no document to read (tests, SSR) or a token is
 * missing. Deliberately the *light* theme's values rather than something
 * neutral: a wrong-but-legible graph beats an invisible one, and a blank
 * canvas reads as "the graph is broken" rather than "the theme failed".
 */
export const FALLBACK_GRAPH_PALETTE: GraphPalette = {
  node: "#5555ef",
  nodeHighlight: "#2f6fed",
  label: "#1a1b29",
  link: "rgba(99, 99, 122, 0.35)",
  linkHighlight: "rgba(85, 85, 239, 0.85)",
  linkDim: "rgba(99, 99, 122, 0.08)",
};

/**
 * `rgba()` from a hex token plus an alpha. Links have to be translucent —
 * a 1099-edge vault is a solid block otherwise — and CSS `color-mix`
 * isn't available to a canvas context, so the mixing happens here.
 * Anything that isn't a 6-digit hex is passed through untouched, so a
 * token someone later writes as `rgb(...)` degrades to fully opaque
 * rather than to garbage.
 */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Build the canvas palette from resolved token values. Pure, so it is testable. */
export function graphPaletteFrom(read: (token: string) => string): GraphPalette {
  const pick = (token: string, fallback: string) => read(token).trim() || fallback;
  const accent = pick("--accent", FALLBACK_GRAPH_PALETTE.node);
  const accentHover = pick("--accent-hover", FALLBACK_GRAPH_PALETTE.nodeHighlight);
  const fg = pick("--fg", FALLBACK_GRAPH_PALETTE.label);
  const muted = pick("--fg-muted", "#645b4f");
  return {
    node: accent,
    nodeHighlight: accentHover,
    label: fg,
    link: withAlpha(muted, 0.35),
    linkHighlight: withAlpha(accent, 0.85),
    linkDim: withAlpha(muted, 0.08),
  };
}

/** Resolve the palette against the live document, or the fallback if there isn't one. */
export function readGraphPalette(): GraphPalette {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return FALLBACK_GRAPH_PALETTE;
  }
  const style = getComputedStyle(document.documentElement);
  return graphPaletteFrom((token) => style.getPropertyValue(token));
}
