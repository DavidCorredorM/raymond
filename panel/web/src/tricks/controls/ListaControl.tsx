import { z } from "zod";
import { Link } from "react-router-dom";
import type { NoteSummary, TrickCampo } from "../../api/types";
import { applyFilter, resolveField } from "../../dashboards/filter";
import { noteHref } from "../../lib/notePath";

/**
 * `control: lista` reuses the exact same query shape as a dashboard's
 * `query` widget (tricks-spec.md "Relationship to the widget spec": "one
 * `DataQuery` type, two renderers"). This schema is intentionally
 * field-for-field identical to `QueryWidget`'s — the *filtering* itself
 * (`applyFilter`/`resolveField`) is imported from `dashboards/filter.ts`,
 * not reimplemented; only the zod parsing (each control owns its own
 * schema, same pattern as each dashboard widget kind) and the cell
 * rendering below are local to this file.
 */
const listaCampoSchema = z.object({
  campo: z.string().optional(),
  etiqueta: z.string().optional(),
  control: z.literal("lista"),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  frontmatter_exists: z.array(z.string()).optional(),
  folder: z.string().optional(),
  sort: z.object({ field: z.string(), order: z.enum(["asc", "desc"]).optional() }).optional(),
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

export function ListaControl({ campo, notes }: { campo: TrickCampo; notes: NoteSummary[] }) {
  const p = listaCampoSchema.parse(campo);
  const rows = applyFilter(notes, p);
  const columns = p.columns?.length ? p.columns : ["title", "path"];

  return (
    <div className="trick-lista">
      {p.etiqueta && <h3 className="dashboard-widget-title">{p.etiqueta}</h3>}
      {rows.length === 0 ? (
        <p className="muted">No matching notes.</p>
      ) : (
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
      )}
    </div>
  );
}
