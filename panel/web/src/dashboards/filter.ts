import type { NoteSummary } from "../api/types";

/**
 * Shared filter/sort shape for `query` and `count` widgets
 * (frontend-implementation-plan.md §5.3). `frontmatter` keys are equality
 * matches ANDed together; `frontmatter_exists` ANDs a presence check.
 * Deliberately no OR, no comparison operators — see plan §2.2 for why.
 */
export interface FilterParams {
  frontmatter?: Record<string, unknown>;
  frontmatter_exists?: string[];
  folder?: string;
  sort?: { field: string; order?: "asc" | "desc" };
  limit?: number;
}

/**
 * Resolves either a top-level note field (`title`, `path`, `mtime`) or a
 * `frontmatter.<key>` dot path. Missing values return undefined, never an
 * error — plan §5.3: "missing values render blank, not an error."
 */
export function resolveField(note: NoteSummary, field: string): unknown {
  if (field.startsWith("frontmatter.")) {
    return note.frontmatter?.[field.slice("frontmatter.".length)];
  }
  return (note as unknown as Record<string, unknown>)[field];
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Applies a dashboard filter to the already-fetched notes list — no new
 * endpoint, all client-side (plan §5.3, §6.2). System notes (skills,
 * templates, tooling) are excluded by default, same reasoning as
 * `NoteTree`'s default and `/api/graph`'s `isSystem` exclusion: a
 * dashboard is about a user's own vault content.
 */
export function applyFilter(notes: NoteSummary[], params: FilterParams): NoteSummary[] {
  let out = notes.filter((n) => !n.isSystem);

  if (params.folder) {
    out = out.filter((n) => n.path.startsWith(params.folder!));
  }

  if (params.frontmatter) {
    for (const [key, value] of Object.entries(params.frontmatter)) {
      out = out.filter((n) => n.frontmatter?.[key] === value);
    }
  }

  if (params.frontmatter_exists?.length) {
    for (const key of params.frontmatter_exists) {
      out = out.filter((n) => n.frontmatter != null && n.frontmatter[key] !== undefined);
    }
  }

  if (params.sort) {
    const { field, order = "desc" } = params.sort;
    out = [...out].sort((a, b) => {
      const cmp = compareValues(resolveField(a, field), resolveField(b, field));
      return order === "asc" ? cmp : -cmp;
    });
  }

  if (typeof params.limit === "number") {
    out = out.slice(0, params.limit);
  }

  return out;
}
