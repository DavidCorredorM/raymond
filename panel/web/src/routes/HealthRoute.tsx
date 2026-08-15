import { Link } from "react-router-dom";
import { useVaultHealth } from "../api/queries";
import { noteHref } from "../lib/notePath";

export function HealthRoute() {
  const { data, isPending, isError, error } = useVaultHealth();

  // `isPending`, not `isLoading` — see the note in NoteRoute.tsx. With
  // `data!` on the line below, the difference is a crash during a retry
  // backoff rather than a loading message.
  if (isPending) return <p className="muted">Loading vault health…</p>;
  if (isError) return <p className="note-error">{(error as Error).message}</p>;
  const health = data!;

  return (
    <div className="health-route">
      <h1>Vault health</h1>
      <div className="health-summary">
        <div className="stat-tile">
          <div className="stat-value">{health.notes}</div>
          <div className="stat-label">notes</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.indexed}</div>
          <div className="stat-label">indexed files</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.brokenLinks.length}</div>
          <div className="stat-label">broken links</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.slugCollisions.length}</div>
          <div className="stat-label">slug collisions</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{health.missingFrontmatter.length}</div>
          <div className="stat-label">missing frontmatter</div>
        </div>
      </div>

      <section>
        <h2>Broken links ({health.brokenLinks.length})</h2>
        {health.brokenLinks.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Target (unresolved)</th>
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
        <h2>Slug collisions ({health.slugCollisions.length})</h2>
        {health.slugCollisions.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <table className="health-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Paths</th>
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
        <h2>Missing frontmatter ({health.missingFrontmatter.length})</h2>
        {health.missingFrontmatter.length === 0 ? (
          <p className="muted">None.</p>
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
