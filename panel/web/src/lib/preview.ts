/**
 * How a vault attachment gets rendered at /vault/file/*. Pure — the
 * dispatcher (preview/AttachmentPreview.tsx) is the only consumer, and this
 * file is what the tests pin so a "surely SVG is just an image" edit has to
 * argue with a named threat rather than a hunch.
 *
 * Deliberately separate from `attachmentKind` in attachments.ts: that one
 * classifies for the *tree badge* (what kind of thing is this), this one for
 * *rendering* (what element can show it). They disagree on purpose — a
 * `.csv` badges as a spreadsheet but previews as a table, a `.svg` badges as
 * an image and previews as one, and `.xlsx` badges as a spreadsheet and
 * previews as nothing at all.
 */

export type PreviewKind =
  | "image"
  | "pdf"
  | "html"
  | "audio"
  | "video"
  | "table"
  | "text"
  | "none";

/**
 * `svg` is in here rather than in its own case, and that is the whole SVG
 * security decision: it renders through `<img src=…>`, and per the SVG
 * integration spec an image-referenced SVG is in *secure static mode* —
 * script elements never execute, external references never load. The panel
 * has no auth in front of it (README rule 3), so relying on a spec-level
 * "cannot run" is worth more than relying on the file having been trusted
 * when it was uploaded. The server's `Content-Security-Policy: sandbox`
 * header covers the other way in — someone opening the raw URL directly.
 *
 * `ico` decodes in every current browser; if one doesn't, `onError` lands on
 * the download state like any other decode failure.
 */
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg"];

/** Everything `<audio>`/`<video>` will attempt. Codec support is the browser's problem — a container it can't decode fires `onError` and falls through to download. */
const AUDIO_EXTS = ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac"];
const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "ogv"];

/** Served with `Content-Security-Policy: sandbox allow-scripts`; framed with `sandbox="allow-scripts"` and never `allow-same-origin`. See HtmlPreview.tsx. */
const HTML_EXTS = ["html", "htm", "xhtml"];

/** Rendered as a real table, not as text — that is the difference between useful and not. */
const TABLE_EXTS = ["csv", "tsv"];

/**
 * Read-only source view. Deliberately a list rather than "anything that
 * isn't binary": guessing textness from bytes means pulling the file down
 * first, and a mis-guess on a 40 MB binary is the tab-lock this whole file
 * is trying to avoid.
 */
const TEXT_EXTS = [
  "txt",
  "log",
  "json",
  "jsonl",
  "ndjson",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "properties",
  "xml",
  "svgz",
  "md",
  "markdown",
  "rst",
  "tex",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "php",
  "pl",
  "lua",
  "r",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "sql",
  "graphql",
  "gql",
  "diff",
  "patch",
  "srt",
  "vtt",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
];

const PREVIEW_KINDS: Record<string, PreviewKind> = {};
for (const e of IMAGE_EXTS) PREVIEW_KINDS[e] = "image";
for (const e of AUDIO_EXTS) PREVIEW_KINDS[e] = "audio";
for (const e of VIDEO_EXTS) PREVIEW_KINDS[e] = "video";
for (const e of HTML_EXTS) PREVIEW_KINDS[e] = "html";
for (const e of TABLE_EXTS) PREVIEW_KINDS[e] = "table";
for (const e of TEXT_EXTS) PREVIEW_KINDS[e] = "text";
PREVIEW_KINDS.pdf = "pdf";

/**
 * A handful of extensionless files are text by convention and common enough
 * in a vault's `.claude/` plumbing to be worth naming. Matched on the whole
 * filename, lowercased.
 */
const TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "licence",
  "readme",
  "changelog",
  "codeowners",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".env",
]);

export function previewKindOf(path: string, ext: string): PreviewKind {
  const kind = PREVIEW_KINDS[ext];
  if (kind) return kind;
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (TEXT_FILENAMES.has(name)) return "text";
  return "none";
}

/**
 * Media streams; text is parsed in the tab. 2 MB is where CodeMirror's
 * single-document model stops being pleasant (roughly a 40k-line log) and
 * well below where the main thread would visibly stall — the point of a
 * guard is to be crossed long before the browser is in trouble.
 */
export const TEXT_PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;

/**
 * Rows rendered from a delimited file. A 200k-row export is a real thing a
 * skill produces; 200k <tr> is a locked tab, so the table says how many rows
 * it is showing out of how many and the download is right there.
 */
export const TABLE_PREVIEW_MAX_ROWS = 1000;

/**
 * True when the file has to be pulled into memory and parsed to show it at
 * all — the only kinds a size guard applies to. Images, PDFs, audio and
 * video are streamed by the browser (the server sends `Accept-Ranges`), so
 * their size is not this app's problem.
 */
export function parsesClientSide(kind: PreviewKind): boolean {
  return kind === "text" || kind === "table";
}

export function isOversizeForPreview(kind: PreviewKind, size: number | undefined): boolean {
  if (!parsesClientSide(kind)) return false;
  if (typeof size !== "number" || !Number.isFinite(size)) return false;
  return size > TEXT_PREVIEW_LIMIT_BYTES;
}

/**
 * Which CodeMirror language to load for the read-only source view, by the
 * packages already in the tree (`@codemirror/lang-{markdown,html,css,javascript}`
 * — markdown is a direct dependency, the other three arrive with it). No new
 * language package is pulled in for this: an unrecognised extension renders
 * as plain text, which is a strictly better outcome than a dependency added
 * to colour `.log` files.
 *
 * JSON rides the JavaScript parser. It has no dedicated grammar here and the
 * JS one highlights every JSON token correctly; lezer error-recovers on the
 * bare top-level object and nothing surfaces the recovery to the user
 * because no lint extension is loaded.
 */
export type PreviewLanguage = "markdown" | "html" | "css" | "javascript" | null;

const LANGUAGES: Record<string, PreviewLanguage> = {
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  xhtml: "html",
  xml: "html",
  svg: "html",
  css: "css",
  scss: "css",
  less: "css",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "javascript",
  tsx: "javascript",
  json: "javascript",
  jsonl: "javascript",
  ndjson: "javascript",
};

export function previewLanguageOf(ext: string): PreviewLanguage {
  return LANGUAGES[ext] ?? null;
}
