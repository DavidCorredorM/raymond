import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AA_BODY,
  AA_NON_TEXT,
  contrastRatio,
  parseHex,
  readCustomProperties,
  relativeLuminance,
} from "./contrast";

const CSS = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");

const light = readCustomProperties(CSS, ":root {");
const dark = readCustomProperties(CSS, "@media (prefers-color-scheme: dark)");

/** Every surface a foreground colour can end up sitting on. */
const SURFACES = ["--bg", "--bg-raised", "--bg-sunken"] as const;

/** Foregrounds that carry words. AA body text: 4.5:1 on every surface. */
const TEXT = [
  "--fg",
  "--fg-muted",
  "--accent",
  "--broken",
  "--warning",
  "--ok",
  "--kind-image",
  "--kind-pdf",
  "--kind-sheet",
  "--kind-doc",
  "--kind-web",
  "--kind-media",
] as const;

describe("contrast maths", () => {
  it("parses both hex forms", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("2F4858")).toEqual([0x2f, 0x48, 0x58]);
  });

  it("rejects anything that is not a colour", () => {
    expect(() => parseHex("var(--bg)")).toThrow();
    expect(() => parseHex("#12345")).toThrow();
  });

  it("anchors on the two known luminances", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("gives 21:1 for black on white, either way round", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("reads the balanced end of a nested block, not the first brace", () => {
    const css = "@media (x) {\n  :root {\n    --a: #111;\n  }\n}\n:root { --b: #222; }";
    expect(readCustomProperties(css, "@media (x)")).toEqual({ "--a": "#111" });
  });
});

/**
 * The palette is only "checked for contrast" if something checks it. The
 * owner asked for muted colours, and muted is the direction that fails —
 * so these run against the real `styles.css`, parsed, not against a copy
 * of the values that could drift from it.
 */
describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme meets WCAG AA", (_name, theme) => {
  it("declares every token both themes need", () => {
    for (const token of [...SURFACES, ...TEXT, "--focus", "--accent-contrast"]) {
      expect(theme[token], `${token} is missing`).toBeDefined();
    }
  });

  for (const fg of TEXT) {
    for (const bg of SURFACES) {
      it(`${fg} on ${bg}`, () => {
        const ratio = contrastRatio(theme[fg]!, theme[bg]!);
        expect(ratio, `${theme[fg]} on ${theme[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_BODY,
        );
      });
    }
  }

  it("text on an accent fill is readable", () => {
    expect(contrastRatio(theme["--accent-contrast"]!, theme["--accent"]!)).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it("the focus ring is visible against every surface", () => {
    for (const bg of SURFACES) {
      expect(
        contrastRatio(theme["--focus"]!, theme[bg]!),
        `--focus on ${bg}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});
