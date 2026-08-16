import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  clamp,
  readStoredCollapsed,
  readStoredWidth,
  settleDrag,
  widthDuringDrag,
  widthFromKey,
  writeStoredCollapsed,
  writeStoredWidth,
  type ResizeBounds,
} from "../lib/resizable";
import { Icon } from "../icons/Icon";

/**
 * A panel with a draggable divider — the sidebar and the backlinks panel
 * (owner's ask #2). "The standard way — grab the division, move it.
 * Folding to zero and back should work too," with the width persisted
 * across reloads. The drag/collapse/keyboard arithmetic lives in
 * `lib/resizable.ts`, tested there without a DOM; this component is the
 * thin layer that turns pointer and keyboard events into calls into it.
 *
 * `side="start"` is a panel whose divider is on its trailing edge (the
 * sidebar: content, then divider, then the rest of the app — dragging
 * the divider right grows it). `side="end"` is the mirror (the backlinks
 * panel: the rest of the app, then divider, then content — dragging the
 * divider left grows it). This is `direction` in `resizable.ts` made
 * readable at the call site instead of a bare `1 | -1`.
 */
export function ResizablePanel({
  storageKey,
  side,
  defaultWidth,
  min,
  max,
  collapseThreshold = 80,
  ariaLabel,
  children,
}: {
  /** localStorage key prefix — `${storageKey}:width` and `${storageKey}:collapsed`. */
  storageKey: string;
  side: "start" | "end";
  defaultWidth: number;
  min: number;
  max: number;
  collapseThreshold?: number;
  ariaLabel: string;
  children: ReactNode;
}) {
  const direction = side === "start" ? 1 : -1;
  const bounds: ResizeBounds = { min, max, collapseThreshold };
  const widthKey = `${storageKey}:width`;
  const collapsedKey = `${storageKey}:collapsed`;

  // Lazy initializers: localStorage is read once, at mount, not on every
  // render — reading it is synchronous and cheap, but there is no reason
  // to repeat it.
  const [width, setWidth] = useState(() => readStoredWidth(widthKey, defaultWidth, bounds));
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed(collapsedKey));
  // The width to restore to when un-collapsing — kept separate from
  // `width` (which becomes 0 while collapsed) so Enter/double-click
  // brings back where the panel actually was, not `defaultWidth`.
  const preferredWidthRef = useRef(width || defaultWidth);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const persist = useCallback(
    (nextWidth: number, nextCollapsed: boolean) => {
      writeStoredWidth(widthKey, nextCollapsed ? preferredWidthRef.current : nextWidth);
      writeStoredCollapsed(collapsedKey, nextCollapsed);
    },
    [widthKey, collapsedKey],
  );

  const applySettled = useCallback(
    (result: { width: number; collapsed: boolean }) => {
      setWidth(result.width);
      setCollapsed(result.collapsed);
      if (!result.collapsed) preferredWidthRef.current = result.width;
      persist(result.width, result.collapsed);
    },
    [persist],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // Right-click / middle-click shouldn't start a resize.
      if (e.button !== 0) return;
      e.preventDefault();
      // `preventDefault()` on pointerdown is what stops the browser's own
      // drag/text-selection gesture — necessary for the drag itself — but
      // it also suppresses the browser's *default* click-to-focus
      // behaviour as a side effect. Verified in a real browser: without
      // this line, `document.activeElement` stayed `<body>` after
      // clicking the divider, so a plain click-then-Enter (the documented
      // fold/restore gesture) silently did nothing. `currentTarget`, not
      // `target` — a pointerdown on the grip icon inside the divider
      // targets that `<span>`/`<svg>`, neither of which is focusable;
      // `currentTarget` is always the element this handler is bound to.
      (e.currentTarget as HTMLElement).focus();
      dragRef.current = { startX: e.clientX, startWidth: collapsed ? 0 : width };
      setDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [collapsed, width],
  );

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = e.clientX - drag.startX;
      setWidth(widthDuringDrag(drag.startWidth, deltaX, direction, max));
    }
    function onUp() {
      setDragging(false);
      dragRef.current = null;
      // Read the width as it stands at release time via a functional
      // update — `settleDrag` needs the live value, and this effect's
      // closure over `width` would otherwise be stale (it only re-runs
      // when `dragging` flips true).
      setWidth((current) => {
        const settled = settleDrag(current, bounds);
        setCollapsed(settled.collapsed);
        if (!settled.collapsed) preferredWidthRef.current = settled.width;
        persist(settled.width, settled.collapsed);
        return settled.width;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const result = widthFromKey(
        e.key,
        width,
        collapsed,
        direction,
        bounds,
        preferredWidthRef.current || defaultWidth,
      );
      if (!result) return;
      e.preventDefault();
      applySettled(result);
    },
    [width, collapsed, direction, bounds, defaultWidth, applySettled],
  );

  const onDoubleClick = useCallback(() => {
    applySettled(
      collapsed
        ? { width: clamp(preferredWidthRef.current || defaultWidth, min, max), collapsed: false }
        : { width: 0, collapsed: true },
    );
  }, [collapsed, defaultWidth, min, max, applySettled]);

  const displayWidth = collapsed ? 0 : width;
  const panel = (
    <div
      className="resizable-panel-body"
      style={{ width: displayWidth, minWidth: displayWidth === 0 ? 0 : undefined }}
    >
      {children}
    </div>
  );
  const handle = (
    <div
      className={"resize-handle" + (dragging ? " dragging" : "") + (collapsed ? " collapsed" : "")}
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuenow={displayWidth}
      aria-valuemin={0}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      title={collapsed ? "Drag or press Enter to open" : "Drag to resize, double-click to fold"}
    >
      <span className="resize-handle-grip">
        <Icon name="grip" size={12} />
      </span>
    </div>
  );

  return (
    <div className={"resizable-panel resizable-panel-" + side + (dragging ? " no-transition" : "")}>
      {side === "start" ? (
        <>
          {panel}
          {handle}
        </>
      ) : (
        <>
          {handle}
          {panel}
        </>
      )}
    </div>
  );
}
