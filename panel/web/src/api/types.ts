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
 *
 * A trick is a mini app in a sandboxed frame and nothing else — the
 * fixed-vocabulary manifest (`ui.campos`, `control:`) and the renderer
 * that drew it were deleted 2026-08-15, so there is no `tipo`
 * discriminator and no second shape to branch on. A manifest the server
 * cannot validate never reaches the frontend: it is skipped from
 * `GET /api/tricks` with a logged reason and 404s on the detail route.
 *
 * The frontend deliberately does **not** model `acciones`. A v2 app runs
 * a script by sending `{ op: "script.run", params: { indice } }` over the
 * bridge; the panel is the courier and never needs to know what the
 * action is called or what it does.
 */

/** The complete capability vocabulary (spec §7). Manifest keys, not ops. */
export type TrickCapability =
  | "vault.query"
  | "vault.read"
  | "vault.write"
  | "estado"
  | "script.run"
  | "trabajo.estado";

/** GET /api/tricks item. */
export interface TrickSummary {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
  /** Frame height the manifest asked for, defaults already resolved server-side. */
  alto: number;
  /** `[]` means the app gets no bridge at all — a valid state for a purely visual trick. */
  capacidades: TrickCapability[];
}

/**
 * GET /api/tricks/:name — the full parsed manifest, with every default
 * resolved. `capacidades` values are the server's normalized capability
 * objects (`carpeta`, `campos`, `limite`, …); the host reads the keys for
 * its first-line check and the `carpeta`s for the freshness poll, and
 * treats the rest as opaque — the server is the authority on all of it.
 */
export interface TrickManifest {
  name: string;
  titulo: string;
  descripcion?: string;
  icono?: string;
  app: { entrada: string; alto: number };
  capacidades: Partial<Record<TrickCapability, unknown>>;
}
