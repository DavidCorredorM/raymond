import { useCallback, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type LinkObject, type NodeObject } from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { useGraph } from "../api/queries";
import { noteHref } from "../lib/notePath";

interface GraphNodeDatum {
  id: string;
  title: string;
  /** Link count (in + out). Drives node size — see `nodeRadius`. */
  degree: number;
}

// Canvas fillStyle can't read CSS custom properties, so these are picked
// once to read reasonably against both the light and dark palettes in
// styles.css (--accent / --fg), not recomputed per frame.
const PREFERS_DARK =
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const NODE_COLOR = PREFERS_DARK ? "#7c93ff" : "#3b5bdb";
const NODE_HIGHLIGHT_COLOR = PREFERS_DARK ? "#c3ceff" : "#1b3bb3";
const LABEL_COLOR = PREFERS_DARK ? "#e8e8ea" : "#1a1a1a";
const LINK_COLOR = PREFERS_DARK ? "rgba(154,154,162,0.4)" : "rgba(107,107,107,0.35)";
const LINK_HIGHLIGHT_COLOR = PREFERS_DARK ? "rgba(195,206,255,0.9)" : "rgba(27,59,179,0.8)";
const LINK_DIM_COLOR = PREFERS_DARK ? "rgba(154,154,162,0.1)" : "rgba(107,107,107,0.08)";

/** How much of its colour an unrelated node keeps while something else is hovered. */
const DIM_ALPHA = 0.18;

/**
 * A node is either the one under the cursor, one link away from it,
 * pushed to the background because something *else* is hovered, or in
 * the plain no-hover state. Labels, colour and dimming all follow from
 * this one classification.
 */
export type HoverRelation = "hovered" | "neighbour" | "faded" | "none";

/**
 * Zoom range over which labels appear. force-graph starts at zoom 1, so
 * a threshold just above it means the first thing you ever see is the
 * shape of the vault rather than a wall of titles — which is the whole
 * complaint. Full opacity is held back to 2.2 because labels are drawn
 * at a constant *screen* size: it takes roughly that much zoom before
 * neighbouring nodes are far enough apart on screen for their titles not
 * to collide. The ramp between the two is what stops labels popping in.
 */
export const LABEL_FADE_START = 1.15;
export const LABEL_FADE_END = 2.2;

/**
 * Opacity for a node's label. Hover wins over zoom in both directions:
 * the hovered node and its neighbours are always readable (that is how
 * you inspect a dense cluster without zooming), and everything else is
 * suppressed entirely so the neighbourhood stands alone.
 */
export function labelAlpha(zoom: number, relation: HoverRelation): number {
  if (relation === "hovered" || relation === "neighbour") return 1;
  if (relation === "faded") return 0;
  if (!Number.isFinite(zoom) || zoom <= LABEL_FADE_START) return 0;
  if (zoom >= LABEL_FADE_END) return 1;
  return (zoom - LABEL_FADE_START) / (LABEL_FADE_END - LABEL_FADE_START);
}

/**
 * Node size by link count. sqrt, not linear: link counts are heavy-tailed
 * (a handful of index notes carry most of the edges) and a linear map
 * turns those into blobs that swallow their own neighbourhood, while the
 * long tail stays indistinguishable. The cap keeps the worst hub from
 * dominating a small vault.
 */
export const NODE_MIN_RADIUS = 2.4;
export const NODE_MAX_RADIUS = 9;
const NODE_DEGREE_GROWTH = 1.1;

export function nodeRadius(degree: number): number {
  const d = Number.isFinite(degree) && degree > 0 ? degree : 0;
  return Math.min(NODE_MAX_RADIUS, NODE_MIN_RADIUS + NODE_DEGREE_GROWTH * Math.sqrt(d));
}

/**
 * Hit area. Padded past the drawn circle so the smallest (orphan) nodes
 * stay comfortably clickable, and derived from `nodeRadius` so it can't
 * drift out of sync with what's actually painted — a hardcoded radius
 * here is exactly how a node ends up looking clickable but not being it.
 */
const POINTER_PADDING = 4;

export function pointerRadius(degree: number): number {
  return nodeRadius(degree) + POINTER_PADDING;
}

/** Screen-pixel width a label may occupy before it gets an ellipsis. */
export const LABEL_MAX_WIDTH_PX = 130;

/**
 * Truncate to fit `maxWidth`, measured by the caller (the canvas context
 * at its current font) so this stays pure and testable. Binary search
 * rather than trimming a character at a time: this runs per visible node
 * per frame.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string {
  if (maxWidth <= 0) return "";
  if (measure(text) <= maxWidth) return text;
  const ellipsis = "…";
  if (measure(ellipsis) > maxWidth) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, mid) + ellipsis) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low) + ellipsis;
}

/** Where one node stands relative to whatever is currently hovered. */
export function hoverRelation(
  id: string,
  hoveredId: string | null,
  neighboursOfHovered: ReadonlySet<string>,
): HoverRelation {
  if (!hoveredId) return "none";
  if (id === hoveredId) return "hovered";
  return neighboursOfHovered.has(id) ? "neighbour" : "faded";
}

/** force-graph replaces link endpoints with node objects once it ingests the data. */
function endpointId(end: LinkObject<GraphNodeDatum>["source"]): string | undefined {
  if (typeof end === "string") return end;
  if (typeof end === "number") return String(end);
  if (end && typeof end === "object" && typeof end.id === "string") return end.id;
  return undefined;
}

/**
 * Global graph only (plan §11.3/§11.4) — the whole vault, not a
 * current-note-neighborhood filter. That's explicitly follow-up work.
 */
export function GraphRoute() {
  const { data, isLoading, isError, error } = useGraph();
  const navigate = useNavigate();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /**
   * A callback ref, not `useRef` + `useEffect([])`. The effect version ran
   * on the first commit — while `useGraph()` was still loading and this
   * component had returned the "Loading graph…" paragraph instead of the
   * container. `containerRef.current` was null, the effect bailed, and an
   * empty dependency list meant it never ran again once the real div
   * mounted, so no observer was ever attached and `size` kept its 600×400
   * default. A callback ref fires *when the node actually attaches*, which
   * is the event we care about.
   *
   * `observed:` the canvas rendering at 600×400 inside a 2196×1166
   * container. Not confirmed to be *this* bug's doing: the only browser
   * available here had the tab backgrounded, where `requestAnimationFrame`
   * never fires and therefore no ResizeObserver callback is ever delivered
   * — a hand-attached observer on the same element stayed silent too. That
   * throttling alone reproduces the same symptom, so the sizing needs one
   * look in a foreground tab. The defect fixed here is real regardless:
   * it is visible by reading the effect, not by measuring it.
   */
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!el) {
      observerRef.current = null;
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  const { graphData, adjacency } = useMemo(() => {
    if (!data) return { graphData: { nodes: [], links: [] }, adjacency: new Map<string, Set<string>>() };
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      const set = adj.get(a) ?? new Set<string>();
      set.add(b);
      adj.set(a, set);
    };
    for (const e of data.edges) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    return {
      // Degree counts distinct neighbours, so a pair of notes that link
      // each other both ways doesn't render as twice as important.
      graphData: {
        nodes: data.nodes.map((n) => ({
          id: n.path,
          title: n.title,
          degree: adj.get(n.path)?.size ?? 0,
        })),
        links: data.edges.map((e) => ({ source: e.from, target: e.to })),
      },
      adjacency: adj,
    };
  }, [data]);

  const neighboursOfHovered = useMemo(
    () => (hoveredId ? (adjacency.get(hoveredId) ?? new Set<string>()) : new Set<string>()),
    [adjacency, hoveredId],
  );

  const handleNodeClick = useCallback(
    (node: NodeObject<GraphNodeDatum>) => {
      if (typeof node.id === "string") navigate(noteHref(node.id));
    },
    [navigate],
  );

  const handleNodeHover = useCallback((node: NodeObject<GraphNodeDatum> | null) => {
    setHoveredId(node && typeof node.id === "string" ? node.id : null);
  }, []);

  const touchesHovered = useCallback(
    (link: LinkObject<GraphNodeDatum>) =>
      !!hoveredId &&
      (endpointId(link.source) === hoveredId || endpointId(link.target) === hoveredId),
    [hoveredId],
  );

  if (isLoading) return <p className="muted page-scroll">Loading graph…</p>;
  if (isError) return <p className="note-error page-scroll">{(error as Error).message}</p>;
  if (graphData.nodes.length === 0) {
    return <p className="muted page-scroll">No notes to graph yet — add some [[links]] between notes.</p>;
  }

  return (
    <div className="graph-route" ref={containerRef}>
      <ForceGraph2D<GraphNodeDatum>
        graphData={graphData}
        width={size.width}
        height={size.height}
        // Native tooltip stays: the canvas label is truncated, this is
        // how you read a long title in full.
        nodeLabel="title"
        // nodeVal/nodeRelSize aren't used for painting (nodeCanvasObject
        // does that) but force-graph derives a radius from them to place
        // arrowheads; feeding it the same radius keeps arrows landing on
        // the edge of the circle we actually drew.
        nodeRelSize={1}
        nodeVal={(node) => nodeRadius(node.degree) ** 2}
        linkColor={(link) =>
          hoveredId ? (touchesHovered(link) ? LINK_HIGHLIGHT_COLOR : LINK_DIM_COLOR) : LINK_COLOR
        }
        linkWidth={(link) => (touchesHovered(link) ? 2 : 1)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const relation = hoverRelation(String(node.id), hoveredId, neighboursOfHovered);
          const radius = nodeRadius(node.degree);

          ctx.globalAlpha = relation === "faded" ? DIM_ALPHA : 1;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle =
            relation === "hovered" || relation === "neighbour" ? NODE_HIGHLIGHT_COLOR : NODE_COLOR;
          ctx.fill();

          const alpha = labelAlpha(globalScale, relation);
          if (alpha > 0) {
            // Divided by globalScale so the label holds a constant size in
            // screen pixels: zooming reveals more labels, it doesn't grow
            // the ones already on screen into each other.
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            const label = truncateToWidth(
              node.title ?? String(node.id),
              LABEL_MAX_WIDTH_PX / globalScale,
              (s) => ctx.measureText(s).width,
            );
            ctx.globalAlpha = alpha;
            ctx.fillStyle = LABEL_COLOR;
            ctx.textBaseline = "middle";
            ctx.fillText(label, x + radius + 3 / globalScale, y);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, pointerRadius(node.degree), 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />
    </div>
  );
}
