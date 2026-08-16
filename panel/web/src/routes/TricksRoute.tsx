import { Link } from "react-router-dom";
import { useTricks } from "../api/queries";
import { TrickIcon } from "../icons/TrickIcon";
import { useT } from "../i18n/store";

/**
 * Real data from `GET /api/tricks` (tricks-spec.md). Clicking a card
 * navigates to `TrickDetailRoute`, which mounts the trick's app in a
 * sandboxed frame.
 *
 * Only valid manifests are listed. A trick whose `trick.yaml` fails to
 * parse or validate — including one still written in the deleted v1
 * shape, which has no `app:` block — is skipped by the server with a
 * logged reason rather than appearing here as something half-rendered.
 */
export function TricksRoute() {
  const t = useT();
  const { data: tricks, isLoading, isError, error } = useTricks();

  if (isLoading) {
    return <p className="muted page-scroll">{t.tricks.loading}</p>;
  }

  if (isError) {
    return (
      <div className="note-error page-scroll">
        <p>{t.tricks.couldNotLoad}</p>
        <p className="muted">{(error as Error).message}</p>
      </div>
    );
  }

  const list = tricks ?? [];

  if (list.length === 0) {
    return (
      <div className="tricks-empty page-scroll">
        <h1>{t.tricks.title}</h1>
        <p>{t.tricks.emptyIntro}</p>
        <p>
          {t.tricks.emptyHowToPrefix}
          <code>trick-creator</code>
          {t.tricks.emptyHowToSuffix}
        </p>
      </div>
    );
  }

  return (
    <div className="tricks-route page-scroll">
      <h1>{t.tricks.title}</h1>
      <p className="muted">{t.tricks.countFound(list.length)}</p>
      <div className="tricks-grid">
        {list.map((trick) => (
          <Link
            key={trick.name}
            to={`/tricks/${encodeURIComponent(trick.name)}`}
            className="trick-card"
          >
            <div className="trick-card-icon">
              <TrickIcon icono={trick.icono} size={20} />
            </div>
            <div className="trick-card-body">
              <div className="trick-card-title">{trick.titulo}</div>
              {trick.descripcion && <div className="trick-card-desc muted">{trick.descripcion}</div>}
              {/* What it may touch, before you open it. `capacidades`
                  constrains the browser, not the machine — a scheduled
                  job feeding the same trick is not limited by this
                  (spec §8) — but it is the whole of what the app can
                  reach, and it belongs where someone will read it. */}
              <div className="trick-card-caps muted">
                {trick.capacidades.length ? trick.capacidades.join(" · ") : t.tricks.noCapabilities}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
