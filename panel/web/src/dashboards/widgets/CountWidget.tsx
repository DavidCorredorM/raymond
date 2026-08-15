import { z } from "zod";
import type { NoteSummary } from "../../api/types";
import { applyFilter } from "../filter";

const paramsSchema = z.object({
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  frontmatter_exists: z.array(z.string()).optional(),
  folder: z.string().optional(),
});

export function CountWidget({ params, notes }: { params: unknown; notes: NoteSummary[] }) {
  const p = paramsSchema.parse(params);
  const count = applyFilter(notes, p).length;
  return (
    <div className="stat-tile">
      <div className="stat-value">{count}</div>
    </div>
  );
}
