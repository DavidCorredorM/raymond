import { Link } from "react-router-dom";
import { useTricks } from "../api/queries";

/**
 * Real data from `GET /api/tricks` (tricks-spec.md) — replaces the
 * earlier placeholder that only derived trick *names* from indexed
 * `SKILL.md` paths. Clicking a card navigates to `TrickDetailRoute`,
 * which renders the manifest's `ui`/`acciones`.
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
          A trick is a small interactive mini-app — a todo list, a habit
          tracker, a simple form — backed by a Claude Code skill. This vault
          doesn&apos;t have any yet.
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
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
