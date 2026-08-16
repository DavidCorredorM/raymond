import { Link, useParams } from "react-router-dom";
import { useTrick } from "../api/queries";
import { WidgetErrorBoundary } from "../dashboards/WidgetErrorBoundary";
import { TrickHost } from "../tricks/TrickHost";
import { Icon } from "../icons/Icon";
import { TrickIcon } from "../icons/TrickIcon";

/**
 * One trick: the panel's own chrome, and the app mounted inside it.
 *
 * Everything interesting is in `TrickHost` — this route only fetches the
 * manifest and draws the frame around the frame. The chrome is not
 * decoration: a trick can draw a convincing fake inside its own
 * rectangle, so the name, the icon and the "mini app" label live out
 * here where its code cannot reach them, and the iframe never occupies
 * the whole viewport (tricks-spec.md §2.4).
 *
 * There is one renderer. The v1 declarative one — `ui.campos`,
 * `control: lista`, the read-only field previews — was deleted
 * 2026-08-15 along with the manifests that fed it. A manifest that is not
 * valid v2 does not reach here at all: it 404s, the same as a trick that
 * does not exist, and the listing route logs why it was skipped.
 */
export function TrickDetailRoute() {
  const { name } = useParams();
  const trickQuery = useTrick(name);

  if (!name) {
    return <p className="muted page-scroll">No trick selected.</p>;
  }
  // `isPending`, not `isLoading` — see the note in NoteRoute.tsx. With
  // `trickQuery.data!` below, the difference is a crash during a retry
  // backoff rather than a loading message.
  if (trickQuery.isPending) {
    return <p className="muted page-scroll">Loading…</p>;
  }
  if (trickQuery.isError) {
    return (
      <div className="note-error page-scroll">
        <p>Could not load trick &ldquo;{name}&rdquo;.</p>
        <p className="muted">{(trickQuery.error as Error).message}</p>
        <p className="muted">
          A trick whose <code>trick.yaml</code> fails validation is skipped rather than
          half-rendered; the panel&apos;s log says which rule it broke.
        </p>
      </div>
    );
  }

  const trick = trickQuery.data!;

  return (
    <div className="trick-detail page-scroll">
      <p>
        <Link to="/tricks" className="back-link">
          <Icon name="chevron-right" size={14} style={{ transform: "rotate(180deg)" }} /> Tricks
        </Link>
      </p>
      <h1 className="trick-detail-title">
        <TrickIcon icono={trick.icono} size={22} />
        {trick.titulo}
      </h1>
      {trick.descripcion && <p className="muted">{trick.descripcion}</p>}

      <WidgetErrorBoundary>
        <TrickHost
          name={name}
          titulo={trick.titulo}
          alto={trick.app.alto}
          capacidades={trick.capacidades}
        />
      </WidgetErrorBoundary>
    </div>
  );
}
