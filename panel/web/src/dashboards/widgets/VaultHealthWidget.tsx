import { z } from "zod";
import { Link } from "react-router-dom";
import { useVaultHealth } from "../../api/queries";
import type { VaultHealth } from "../../api/types";
import { useT } from "../../i18n/store";

const SHOW_KEYS = ["brokenLinks", "slugCollisions", "missingFrontmatter"] as const;
type ShowKey = (typeof SHOW_KEYS)[number];

const paramsSchema = z.object({
  show: z.array(z.enum(SHOW_KEYS)).optional(),
});

/** Thin passthrough over GET /api/health/vault — real backend data, no
 *  mockup (plan §5.3). */
export function VaultHealthWidget({ params }: { params: unknown; notes: unknown }) {
  const t = useT();
  const p = paramsSchema.parse(params);
  const show = p.show?.length ? p.show : SHOW_KEYS;
  const { data, isLoading, isError, error } = useVaultHealth();
  const labels: Record<ShowKey, string> = {
    brokenLinks: t.widgetHealth.brokenLinks,
    slugCollisions: t.widgetHealth.slugCollisions,
    missingFrontmatter: t.widgetHealth.missingFrontmatter,
  };

  if (isLoading) return <p className="muted">{t.common.loading}</p>;
  if (isError) return <p className="widget-error">{(error as Error).message}</p>;
  const health = data as VaultHealth;

  return (
    <div className="widget-stat-row">
      {show.map((key) => (
        <div className="stat-tile" key={key}>
          <div className="stat-value">{health[key].length}</div>
          <div className="stat-label">{labels[key]}</div>
        </div>
      ))}
      <Link to="/vault/health" className="widget-link">
        {t.widgetHealth.fullReport}
      </Link>
    </div>
  );
}
