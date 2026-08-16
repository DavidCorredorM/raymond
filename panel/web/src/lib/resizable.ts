/**
 * Pure logic behind the resizable sidebar and backlinks panel (owner's
 * ask #2: "the standard way — grab the division, move it. Folding to
 * zero and back should work too."). Kept apart from
 * `useResizablePanel.ts` so the drag arithmetic and the collapse
 * threshold are testable without a DOM, a pointer, or a browser.
 *
 * The gesture this implements, same as VS Code's and Chrome DevTools'
 * side panels: dragging the divider follows the pointer continuously
 * down to 0; letting go below `collapseThreshold` snaps shut instead of
 * leaving an oddly-thin sliver nobody meant to leave. A double-click (or
 * Enter/Space with focus on the divider) toggles collapsed against the
 * last width the panel actually had — folding to zero and back restores
 * where it was, not some fixed default.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ResizeBounds {
  min: number;
  max: number;
  /** Width below which a released drag snaps to fully collapsed. */
  collapseThreshold: number;
}

/**
 * Width while a drag is in progress — unclamped at the bottom except at
 * 0, so the panel visibly follows the pointer all the way to the edge
 * instead of stopping at `min` and leaving a gap before the cursor.
 * `direction` is `1` for a panel whose divider sits on its right (the
 * sidebar: dragging right grows it) and `-1` for one whose divider sits
 * on its left (the backlinks panel: dragging left grows it).
 */
export function widthDuringDrag(
  startWidth: number,
  deltaPx: number,
  direction: 1 | -1,
  max: number,
): number {
  return clamp(startWidth + direction * deltaPx, 0, max);
}

/** Where a drag lands once the pointer is released. */
export function settleDrag(
  draggedWidth: number,
  bounds: ResizeBounds,
): { width: number; collapsed: boolean } {
  if (draggedWidth < bounds.collapseThreshold) {
    return { width: 0, collapsed: true };
  }
  return { width: clamp(draggedWidth, bounds.min, bounds.max), collapsed: false };
}

/** Arrow-key step from the divider when it has keyboard focus. */
export const KEYBOARD_STEP = 24;

/**
 * Keyboard equivalent of the drag gesture — same rules, no pointer.
 * `key` is the raw `KeyboardEvent.key`; returns `null` for anything this
 * divider doesn't handle, so the caller knows not to `preventDefault()`.
 */
export function widthFromKey(
  key: string,
  currentWidth: number,
  collapsed: boolean,
  direction: 1 | -1,
  bounds: ResizeBounds,
  preferredWidth: number,
): { width: number; collapsed: boolean } | null {
  const grow = direction === 1 ? "ArrowRight" : "ArrowLeft";
  const shrink = direction === 1 ? "ArrowLeft" : "ArrowRight";
  const effective = collapsed ? 0 : currentWidth;

  if (key === grow) {
    return settleDrag(effective + KEYBOARD_STEP, bounds);
  }
  if (key === shrink) {
    return settleDrag(effective - KEYBOARD_STEP, bounds);
  }
  if (key === "Home") {
    return { width: 0, collapsed: true };
  }
  if (key === "End") {
    return { width: clamp(bounds.max, bounds.min, bounds.max), collapsed: false };
  }
  if (key === "Enter" || key === " ") {
    return collapsed
      ? { width: clamp(preferredWidth, bounds.min, bounds.max), collapsed: false }
      : { width: 0, collapsed: true };
  }
  return null;
}

/** localStorage read/write — UI state, not vault state, so this is fine (README rule 1 doesn't apply). */
export function readStoredWidth(key: string, fallback: number, bounds: ResizeBounds): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, bounds.min, bounds.max) : fallback;
  } catch {
    // Private browsing, storage disabled, or no `window` (SSR/tests) — the
    // panel still works, it just forgets the width on reload.
    return fallback;
  }
}

export function readStoredCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeStoredWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Same as above — losing the preference is fine, throwing is not.
  }
}

export function writeStoredCollapsed(key: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    /* ditto */
  }
}
