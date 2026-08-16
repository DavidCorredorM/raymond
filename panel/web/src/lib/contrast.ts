/**
 * WCAG relative luminance and contrast ratio.
 *
 * This exists so the palette in `styles.css` is *checked* rather than
 * eyeballed. The owner asked for matte, muted colours, and muted is the
 * exact direction that quietly fails contrast — every step you take
 * toward "calm" is a step toward foreground and background being the
 * same lightness. `contrast.test.ts` reads the real stylesheet and
 * asserts the AA thresholds, so a future tweak that looks nicer and
 * reads worse fails the build instead of shipping.
 *
 * Formulae: WCAG 2.2 §"relative luminance" and §"contrast ratio".
 */

/** `#rgb` or `#rrggbb` -> [r, g, b] in 0..255. Throws on anything else. */
export function parseHex(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, "");
  const full =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours, 1..21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA for body text is 4.5:1; large text (>=18.66px bold or 24px) is 3:1. */
export const AA_BODY = 4.5;
export const AA_LARGE = 3;
/** Non-text UI (borders that carry meaning, focus rings, icons) is 3:1. */
export const AA_NON_TEXT = 3;

/**
 * Pull `--name: value;` declarations out of a CSS source string, for one
 * block. Deliberately dumb — it exists to read our own stylesheet in a
 * test, not to be a CSS parser. `startAfter` picks which block: the file
 * has a `:root` block and a `prefers-color-scheme: dark` one that
 * redeclares the same names.
 */
export function readCustomProperties(css: string, startAfter: string): Record<string, string> {
  const start = css.indexOf(startAfter);
  if (start === -1) throw new Error(`No block starting with ${startAfter}`);
  const open = css.indexOf("{", start);
  // Balance braces so a nested block (the dark theme wraps `:root` in a
  // media query) ends where it really ends, not at the first `}`.
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}
