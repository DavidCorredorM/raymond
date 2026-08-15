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

/**
 * GET /api/attachments item — every vault file that isn't a `.md` note
 * (roadmap #9). Deliberately not a `Note`: no frontmatter, no slug, no
 * wiki-links, so nothing the note-shaped UI reads applies to it.
 */
export interface Attachment {
  /** Vault-relative, extension included. */
  path: string;
  size: number;
  mtime: number;
  /** Same meaning as NoteSummary.isSystem — base-package plumbing, hidden by default. */
  isSystem: boolean;
}

/** POST /api/attachment success body. */
export interface AttachmentUploadResult {
  ok: true;
  /** Vault-relative path the file actually landed at. */
  path: string;
  size: number;
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

/**
 * Trick shapes mirrored from `server/src/tricks.ts` (tricks-spec.md).
 * The backend validates `titulo` (required) and shallow shapes only —
 * `ui`/`acciones` internals are typed loosely here and each renderer
 * (like each dashboard widget) parses the piece it actually uses with
 * its own zod schema.
 */

/** GET /api/tricks item. */
export interface TrickSummary {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
}

export interface TrickCorrerScript {
  ruta: string;
  args?: string[];
}

export interface TrickAccionDef {
  correr_script?: TrickCorrerScript;
  set?: Record<string, unknown>;
  crear_nota?: unknown;
  archivar?: unknown;
}

export interface TrickAccion {
  etiqueta?: string;
  control?: string;
  accion?: TrickAccionDef;
  [key: string]: unknown;
}

/** One entry of `ui.campos` — shape depends on `control`, see tricks-spec.md. */
export interface TrickCampo {
  campo?: string;
  etiqueta?: string;
  control?: string;
  [key: string]: unknown;
}

/** GET /api/tricks/:name — the full parsed trick.yaml manifest. */
export interface TrickManifest {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
  datos?: unknown;
  ui?: { layout?: string; campos?: TrickCampo[] };
  acciones?: TrickAccion[];
}

/** POST /api/tricks/:name/run */
export interface TrickRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}
