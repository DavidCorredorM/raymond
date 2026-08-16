import { z } from "zod";
import { Link } from "react-router-dom";
import type { NoteSummary } from "../../api/types";
import { applyFilter, resolveField } from "../filter";
import { noteHref } from "../../lib/notePath";
import { useT } from "../../i18n/store";

/**
 * Owns its own params schema (plan §6.7) — a malformed `params` object
 * throws here, caught by <WidgetErrorBoundary> one level up.
 */
const paramsSchema = z.object({
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  frontmatter_exists: z.array(z.string()).optional(),
  folder: z.string().optional(),
  sort: z
    .object({ field: z.string(), order: z.enum(["asc", "desc"]).optional() })
    .optional(),
  limit: z.number().optional(),
  columns: z.array(z.string()).optional(),
});

function columnLabel(field: string): string {
  return field.startsWith("frontmatter.") ? field.slice("frontmatter.".length) : field;
}

function renderCell(note: NoteSummary, field: string) {
  if (field === "title") {
    return <Link to={noteHref(note.path)}>{note.title}</Link>;
  }
  const value = resolveField(note, field);
  if (value == null) return "";
  if (field === "mtime" && typeof value === "number") return new Date(value).toLocaleDateString();
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function QueryWidget({ params, notes }: { params: unknown; notes: NoteSummary[] }) {
  const t = useT();
  const p = paramsSchema.parse(params);
  const rows = applyFilter(notes, p);
  const columns = p.columns?.length ? p.columns : ["title", "path"];

  if (rows.length === 0) {
    return <p className="muted">{t.widgetQuery.noMatches}</p>;
  }

  return (
    <table className="dashboard-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{columnLabel(c)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.path}>
            {columns.map((c) => (
              <td key={c}>{renderCell(n, c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
