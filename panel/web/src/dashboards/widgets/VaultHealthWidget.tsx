import { z } from "zod";
import { Link } from "react-router-dom";
import { useVaultHealth } from "../../api/queries";
import type { VaultHealth } from "../../api/types";

const SHOW_KEYS = ["brokenLinks", "slugCollisions", "missingFrontmatter"] as const;
type ShowKey = (typeof SHOW_KEYS)[number];

const paramsSchema = z.object({
  show: z.array(z.enum(SHOW_KEYS)).optional(),
});

const LABELS: Record<ShowKey, string> = {
  brokenLinks: "broken links",
  slugCollisions: "slug collisions",
  missingFrontmatter: "missing frontmatter",
};

/** Thin passthrough over GET /api/health/vault — real backend data, no
 *  mockup (plan §5.3). */
export function VaultHealthWidget({ params }: { params: unknown; notes: unknown }) {
  const p = paramsSchema.parse(params);
  const show = p.show?.length ? p.show : SHOW_KEYS;
  const { data, isLoading, isError, error } = useVaultHealth();

  if (isLoading) return <p className="muted">Loading…</p>;
  if (isError) return <p className="widget-error">{(error as Error).message}</p>;
  const health = data as VaultHealth;

  return (
    <div className="widget-stat-row">
      {show.map((key) => (
        <div className="stat-tile" key={key}>
          <div className="stat-value">{health[key].length}</div>
          <div className="stat-label">{LABELS[key]}</div>
        </div>
      ))}
      <Link to="/vault/health" className="widget-link">
        Full report →
      </Link>
    </div>
  );
}
