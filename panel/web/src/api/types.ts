/**
 * Response shapes mirrored from `panel/server/src/index.ts` and
 * `panel/server/src/vault.ts`. Kept in sync by hand — server is out of
 * scope for this package (panel/web), so there is no shared types
 * package to import from.
 */

/** GET /api/notes item — no body, enough for the tree/search/dashboards. */
export interface NoteSummary {
  path: string;
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
  size: number;
  /** Skills, templates, tooling, CLAUDE.md — not a user's vault content. */
  isSystem: boolean;
}

/** GET /api/note?path= — summary plus body and resolved backlinks. */
export interface NoteDetail extends NoteSummary {
  /** Raw file content, frontmatter block included. */
  content: string;
  /** Outgoing [[wiki-link]] targets, unresolved (raw text from the note). */
  links: string[];
  /** Paths of notes that link to this one — already resolved server-side. */
  backlinks: string[];
}

export interface BrokenLink {
  from: string;
  to: string;
}

export interface SlugCollision {
  slug: string;
  paths: string[];
}

/** GET /api/health/vault */
export interface VaultHealth {
  notes: number;
  indexed: number;
  brokenLinks: BrokenLink[];
  slugCollisions: SlugCollision[];
  missingFrontmatter: string[];
}

export interface GraphNode {
  path: string;
  title: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

/** GET /api/graph — isSystem notes excluded, deduped, no self-loops. */
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
