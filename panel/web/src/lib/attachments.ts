/**
 * Pure helpers for the non-`.md` half of the vault (roadmap #9). No
 * formatting helper existed for byte sizes before this; dates deliberately
 * stay on `toLocaleDateString()`/`toLocaleString()` like the rest of the app
 * (QueryWidget.tsx, NoteRoute.tsx) instead of growing a second convention.
 */
import { currentMessages } from "../i18n/store";

/** Enforced server-side; repeated here only to write an actionable message. */
export const UPLOAD_LIMIT_MB = 25;

/**
 * Raw-bytes endpoint. Served inline with an accurate `Content-Type` and
 * `X-Content-Type-Options: nosniff`; for HTML and SVG the server also sends
 * `Content-Security-Policy: sandbox allow-scripts`, which puts the response
 * in an opaque origin even when someone opens this URL directly. Used as an
 * element `src` for every streamed type, and fetched only for the text-ish
 * kinds that have to be parsed to be shown (lib/preview.ts).
 */
export function attachmentUrl(path: string): string {
  return `/api/attachment?path=${encodeURIComponent(path)}`;
}

/**
 * Same bytes, `Content-Disposition: attachment`. The HTML `download`
 * attribute is only a hint and browsers ignore it in cases that matter here
 * (a PDF the built-in viewer wants to display, a cross-origin-ish sandboxed
 * frame), so "Download" asks the server to force it rather than asking the
 * browser to please.
 */
export function attachmentDownloadUrl(path: string): string {
  return `/api/attachment?path=${encodeURIComponent(path)}&download=1`;
}

export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** Parent folder of a vault path; "" for a file sitting at the vault root. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Lowercase extension without the dot; "" for a file that has none. */
export function extensionOf(path: string): string {
  const name = baseName(path);
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return "";
  return name.slice(i + 1).toLowerCase();
}

/**
 * What the tree badge says a file *is*. Not what the preview route can
 * *render* — that's `previewKindOf` in lib/preview.ts, and the two disagree
 * on purpose (a `.csv` is a spreadsheet here and a table there; an `.xlsx`
 * is a spreadsheet here and nothing there).
 */
export type AttachmentKind =
  | "image"
  | "pdf"
  | "web"
  | "audio"
  | "video"
  | "sheet"
  | "doc"
  | "text"
  | "archive"
  | "other";

const KINDS: Record<string, AttachmentKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  ico: "image",
  svg: "image",
  pdf: "pdf",
  html: "web",
  htm: "web",
  xhtml: "web",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  oga: "audio",
  flac: "audio",
  aac: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  ogv: "video",
  xlsx: "sheet",
  xls: "sheet",
  csv: "sheet",
  tsv: "sheet",
  ods: "sheet",
  docx: "doc",
  doc: "doc",
  odt: "doc",
  pptx: "doc",
  ppt: "doc",
  odp: "doc",
  txt: "text",
  log: "text",
  json: "text",
  yaml: "text",
  yml: "text",
  xml: "text",
  zip: "archive",
  gz: "archive",
  tgz: "archive",
  "7z": "archive",
};

export function attachmentKind(path: string): AttachmentKind {
  return KINDS[extensionOf(path)] ?? "other";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Upload failures the user can act on. 409 is handled as a question before
 * it ever reaches here (see FolderUpload.tsx); this is the wording if that
 * flow is ever bypassed, plus the cases that are genuinely dead ends.
 *
 * A plain function, not a component, so it can't call `useT()` — reads
 * `currentMessages()` (i18n/store.ts) instead, which is the same store a
 * hook would read, just outside React. No `language` parameter: every
 * caller in this app wants "whatever the panel is showing right now", and
 * threading it through FolderUpload's whole call chain for a value that's
 * already global state would just be prop-drilling the store's own job.
 */
export function describeUploadError(
  status: number,
  fileName: string,
  serverMessage?: string,
): string {
  const t = currentMessages().folderUpload;
  switch (status) {
    case 0:
      return t.couldNotReach(fileName);
    case 409:
      return t.alreadyExists(fileName);
    case 413:
      return t.overLimit(fileName, UPLOAD_LIMIT_MB);
    case 400:
      return serverMessage ? t.rejected(fileName, serverMessage) : t.rejectedNoDetail(fileName);
    case 404:
      return t.noUploadEndpoint(fileName);
    default:
      return serverMessage
        ? t.uploadFailedStatusDetail(fileName, status, serverMessage)
        : t.uploadFailedStatus(fileName, status);
  }
}
