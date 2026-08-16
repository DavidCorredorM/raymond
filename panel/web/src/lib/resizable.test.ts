import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clamp,
  KEYBOARD_STEP,
  readStoredCollapsed,
  readStoredWidth,
  settleDrag,
  widthDuringDrag,
  widthFromKey,
  writeStoredCollapsed,
  writeStoredWidth,
} from "./resizable";

const bounds = { min: 200, max: 500, collapseThreshold: 80 };

describe("clamp", () => {
  it("holds a value inside [min, max]", () => {
    expect(clamp(10, 0, 100)).toBe(10);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(200, 0, 100)).toBe(100);
  });
});

describe("widthDuringDrag", () => {
  it("follows the pointer for a right-hand divider (sidebar)", () => {
    expect(widthDuringDrag(300, 50, 1, 500)).toBe(350);
    expect(widthDuringDrag(300, -50, 1, 500)).toBe(250);
  });

  it("flips direction for a left-hand divider (backlinks panel)", () => {
    expect(widthDuringDrag(300, 50, -1, 500)).toBe(250);
    expect(widthDuringDrag(300, -50, -1, 500)).toBe(350);
  });

  it("goes all the way to 0 rather than stopping at min — the drag must reach the edge", () => {
    expect(widthDuringDrag(300, -290, 1, 500)).toBe(10);
    expect(widthDuringDrag(300, -400, 1, 500)).toBe(0);
  });

  it("never exceeds max", () => {
    expect(widthDuringDrag(490, 100, 1, 500)).toBe(500);
  });
});

describe("settleDrag", () => {
  it("clamps into [min, max] above the collapse threshold", () => {
    expect(settleDrag(250, bounds)).toEqual({ width: 250, collapsed: false });
    expect(settleDrag(150, bounds)).toEqual({ width: 200, collapsed: false }); // clamped up to min
    expect(settleDrag(600, bounds)).toEqual({ width: 500, collapsed: false }); // clamped down to max
  });

  it("snaps to fully collapsed below the threshold", () => {
    expect(settleDrag(79, bounds)).toEqual({ width: 0, collapsed: true });
    expect(settleDrag(0, bounds)).toEqual({ width: 0, collapsed: true });
  });

  it("the threshold itself is not yet collapsed", () => {
    expect(settleDrag(80, bounds)).toEqual({ width: 200, collapsed: false });
  });
});

describe("widthFromKey", () => {
  it("grows toward the panel's own side and shrinks the other way", () => {
    expect(widthFromKey("ArrowRight", 300, false, 1, bounds, 300)).toEqual({
      width: 300 + KEYBOARD_STEP,
      collapsed: false,
    });
    expect(widthFromKey("ArrowLeft", 300, false, 1, bounds, 300)).toEqual({
      width: 300 - KEYBOARD_STEP,
      collapsed: false,
    });
    // Reversed for a left-hand divider.
    expect(widthFromKey("ArrowLeft", 300, false, -1, bounds, 300)).toEqual({
      width: 300 + KEYBOARD_STEP,
      collapsed: false,
    });
  });

  it("Home collapses, End goes to max", () => {
    expect(widthFromKey("Home", 300, false, 1, bounds, 300)).toEqual({
      width: 0,
      collapsed: true,
    });
    expect(widthFromKey("End", 300, false, 1, bounds, 300)).toEqual({
      width: 500,
      collapsed: false,
    });
  });

  it("Enter/Space toggles collapse, restoring the last preferred width", () => {
    expect(widthFromKey("Enter", 0, true, 1, bounds, 340)).toEqual({
      width: 340,
      collapsed: false,
    });
    expect(widthFromKey(" ", 300, false, 1, bounds, 340)).toEqual({
      width: 0,
      collapsed: true,
    });
  });

  it("shrinking from collapsed with the arrow key un-collapses from 0, not from the stale width", () => {
    expect(widthFromKey("ArrowRight", 300, true, 1, bounds, 300)).toEqual(
      settleDrag(KEYBOARD_STEP, bounds),
    );
  });

  it("returns null for a key it doesn't handle, so the caller won't preventDefault() it", () => {
    expect(widthFromKey("Tab", 300, false, 1, bounds, 300)).toBeNull();
  });
});

/**
 * This project's vitest environment is plain Node (no jsdom/happy-dom
 * dependency, and the other test files never needed one) — so there is
 * no real `window`. `readStoredWidth`/`writeStoredWidth` reach through
 * `window.localStorage` on purpose (that's the real API in a browser),
 * which means testing them means providing a `window`, not rewriting
 * them to take an injected store just to dodge that. `vi.stubGlobal` is
 * the narrowest way to do that — scoped to this describe block, undone
 * after each test, no new dependency.
 */
function fakeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("localStorage helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: fakeLocalStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a width", () => {
    writeStoredWidth("k", 342.6);
    expect(readStoredWidth("k", 999, bounds)).toBe(343); // rounded on write, still inside [min, max]
  });

  it("falls back when nothing is stored", () => {
    expect(readStoredWidth("missing", 275, bounds)).toBe(275);
  });

  it("falls back on a corrupt value instead of throwing", () => {
    window.localStorage.setItem("k", "not-a-number");
    expect(readStoredWidth("k", 275, bounds)).toBe(275);
  });

  it("clamps a stored value that predates a bounds change", () => {
    window.localStorage.setItem("k", "5000");
    expect(readStoredWidth("k", 275, bounds)).toBe(500);
  });

  it("round-trips the collapsed flag", () => {
    writeStoredCollapsed("c", true);
    expect(readStoredCollapsed("c")).toBe(true);
    writeStoredCollapsed("c", false);
    expect(readStoredCollapsed("c")).toBe(false);
  });

  it("defaults to not collapsed when nothing is stored", () => {
    expect(readStoredCollapsed("missing-c")).toBe(false);
  });

  it("degrades to the fallback rather than throwing when storage itself throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
      },
    });
    expect(readStoredWidth("k", 275, bounds)).toBe(275);
    expect(readStoredCollapsed("c")).toBe(false);
  });
});
