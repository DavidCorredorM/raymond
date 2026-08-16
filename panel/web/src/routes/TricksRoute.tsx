import { Link } from "react-router-dom";
import { useTricks } from "../api/queries";

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
  const { data: tricks, isLoading, isError, error } = useTricks();

  if (isLoading) {
    return <p className="muted page-scroll">Loading…</p>;
  }

  if (isError) {
    return (
      <div className="note-error page-scroll">
        <p>Could not load tricks.</p>
        <p className="muted">{(error as Error).message}</p>
      </div>
    );
  }

  const list = tricks ?? [];

  if (list.length === 0) {
    return (
      <div className="tricks-empty page-scroll">
        <h1>Tricks</h1>
        <p>
          A trick is a small web app that runs over this vault — a checklist, a form, a
          chart, a drawing pad, a button that runs a script. Arbitrary HTML, CSS and
          JavaScript in a sandboxed frame with no network of its own, reaching the vault
          only through the capabilities its manifest declares. This vault doesn&apos;t have
          any yet.
        </p>
        <p>
          Tricks aren&apos;t built by hand: open Claude Code in this vault
          and describe what you want tracked — &ldquo;make me a reading
          list&rdquo;, &ldquo;I want a habit tracker&rdquo; — and the{" "}
          <code>trick-creator</code> skill writes the folder for you.
          Nothing to install, no rebuild.
        </p>
      </div>
    );
  }

  return (
    <div className="tricks-route page-scroll">
      <h1>Tricks</h1>
      <p className="muted">
        {list.length} trick{list.length === 1 ? "" : "s"} found in this vault.
      </p>
      <div className="tricks-grid">
        {list.map((t) => (
          <Link key={t.name} to={`/tricks/${encodeURIComponent(t.name)}`} className="trick-card">
            <div className="trick-card-icon">{t.icono || "⚙️"}</div>
            <div className="trick-card-body">
              <div className="trick-card-title">{t.titulo}</div>
              {t.descripcion && <div className="trick-card-desc muted">{t.descripcion}</div>}
              {/* What it may touch, before you open it. `capacidades`
                  constrains the browser, not the machine — a scheduled
                  job feeding the same trick is not limited by this
                  (spec §8) — but it is the whole of what the app can
                  reach, and it belongs where someone will read it. */}
              <div className="trick-card-caps muted">
                {t.capacidades.length ? t.capacidades.join(" · ") : "no capabilities"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
