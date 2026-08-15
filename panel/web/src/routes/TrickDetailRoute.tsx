import { Link, useParams } from "react-router-dom";
import { useNotes, useTrick } from "../api/queries";
import { WidgetErrorBoundary } from "../dashboards/WidgetErrorBoundary";
import { TrickRenderer } from "../tricks/TrickRenderer";

/**
 * Renders `GET /api/tricks/:name`'s manifest. The whole render is also
 * wrapped in its own `WidgetErrorBoundary` (on top of `TrickRenderer`'s
 * per-field/per-action ones) so a manifest shape this route's own code
 * doesn't expect can't take down the Tricks page either.
 */
export function TrickDetailRoute() {
  const { name } = useParams();
  const trickQuery = useTrick(name);
  const notesQuery = useNotes();

  if (!name) {
    return <p className="muted page-scroll">No trick selected.</p>;
  }
  if (trickQuery.isLoading) {
    return <p className="muted page-scroll">Loading…</p>;
  }
  if (trickQuery.isError) {
    return (
      <div className="note-error page-scroll">
        <p>Could not load trick &ldquo;{name}&rdquo;.</p>
        <p className="muted">{(trickQuery.error as Error).message}</p>
      </div>
    );
  }

  const trick = trickQuery.data!;

  return (
    <div className="trick-detail page-scroll">
      <p>
        <Link to="/tricks">&larr; Tricks</Link>
      </p>
      <h1>
        {trick.icono ? `${trick.icono} ` : ""}
        {trick.titulo}
      </h1>
      {trick.descripcion && <p className="muted">{trick.descripcion}</p>}

      <WidgetErrorBoundary>
        <TrickRenderer trick={trick} notes={notesQuery.data ?? []} />
      </WidgetErrorBoundary>
    </div>
  );
}
