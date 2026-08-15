import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type NodeObject } from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { useGraph } from "../api/queries";
import { noteHref } from "../lib/notePath";

interface GraphNodeDatum {
  id: string;
  title: string;
}

// Canvas fillStyle can't read CSS custom properties, so these are picked
// once to read reasonably against both the light and dark palettes in
// styles.css (--accent / --fg), not recomputed per frame.
const PREFERS_DARK =
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const NODE_COLOR = PREFERS_DARK ? "#7c93ff" : "#3b5bdb";
const LABEL_COLOR = PREFERS_DARK ? "#e8e8ea" : "#1a1a1a";
const LINK_COLOR = PREFERS_DARK ? "rgba(154,154,162,0.4)" : "rgba(107,107,107,0.35)";

/**
 * Global graph only (plan §11.3/§11.4) — the whole vault, not a
 * current-note-neighborhood filter. That's explicitly follow-up work.
 */
export function GraphRoute() {
  const { data, isLoading, isError, error } = useGraph();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    return {
      nodes: data.nodes.map((n) => ({ id: n.path, title: n.title })),
      links: data.edges.map((e) => ({ source: e.from, target: e.to })),
    };
  }, [data]);

  const handleNodeClick = useCallback(
    (node: NodeObject<GraphNodeDatum>) => {
      if (typeof node.id === "string") navigate(noteHref(node.id));
    },
    [navigate],
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
        nodeLabel="title"
        nodeRelSize={4}
        linkColor={() => LINK_COLOR}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, 2 * Math.PI, false);
          ctx.fillStyle = NODE_COLOR;
          ctx.fill();

          const fontSize = 11 / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = LABEL_COLOR;
          ctx.textBaseline = "middle";
          ctx.fillText(node.title ?? String(node.id), x + 6, y);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />
    </div>
  );
}
