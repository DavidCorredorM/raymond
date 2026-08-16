import { Link } from "react-router-dom";
import { useVaultHealth } from "../api/queries";
import { noteHref } from "../lib/notePath";
import { useT } from "../i18n/store";

export function HealthRoute() {
  const { data, isPending, isError, error } = useVaultHealth();
  const t = useT();

  // `isPending`, not `isLoading` — see the note in NoteRoute.tsx. With
  // `data!` on the line below, the difference is a crash during a retry
  // backoff rather than a loading message.
  if (isPending) return <p className="muted">{t.health.loading}</p>;
  if (isError) return <p className="note-error">{(error as Error).message}</p>;
  const health = data!;

  return (
    <div className="health-route">
      <h1>{t.health.title}</h1>
      <div className="health-summary">
        <div className="stat-tile">
          <div className="stat-value">{health.notes}</div>
          <div className="stat-label">{t.health.statNotes}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.indexed}</div>
          <div className="stat-label">{t.health.statIndexedFiles}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.brokenLinks.length}</div>
          <div className="stat-label">{t.health.statBrokenLinks}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.slugCollisions.length}</div>
          <div className="stat-label">{t.health.statSlugCollisions}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.missingFrontmatter.length}</div>
          <div className="stat-label">{t.health.statMissingFrontmatter}</div>
        </div>
      </div>

      <section>
        <h2>{t.health.brokenLinksHeading(health.brokenLinks.length)}</h2>
        {health.brokenLinks.length === 0 ? (
          <p className="muted">{t.health.none}</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th>{t.health.colFrom}</th>
                <th>{t.health.colTargetUnresolved}</th>
              </tr>
            </thead>
            <tbody>
              {health.brokenLinks.map((b, i) => (
                <tr key={`${b.from}->${b.to}-${i}`}>
                  <td>
                    <Link to={noteHref(b.from)}>{b.from}</Link>
                  </td>
                  <td>
                    <code>[[{b.to}]]</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>{t.health.slugCollisionsHeading(health.slugCollisions.length)}</h2>
        {health.slugCollisions.length === 0 ? (
          <p className="muted">{t.health.none}</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th>{t.health.colSlug}</th>
                <th>{t.health.colPaths}</th>
              </tr>
            </thead>
            <tbody>
              {health.slugCollisions.map((c) => (
                <tr key={c.slug}>
                  <td>
                    <code>{c.slug}</code>
                  </td>
                  <td>
                    <ul>
                      {c.paths.map((p) => (
                        <li key={p}>
                          <Link to={noteHref(p)}>{p}</Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>{t.health.missingFrontmatterHeading(health.missingFrontmatter.length)}</h2>
        {health.missingFrontmatter.length === 0 ? (
          <p className="muted">{t.health.none}</p>
        ) : (
          <ul>
            {health.missingFrontmatter.map((p) => (
              <li key={p}>
                <Link to={noteHref(p)}>{p}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
