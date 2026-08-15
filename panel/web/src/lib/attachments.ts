/**
 * Pure helpers for the non-`.md` half of the vault (roadmap #9). No
 * formatting helper existed for byte sizes before this; dates deliberately
 * stay on `toLocaleDateString()`/`toLocaleString()` like the rest of the app
 * (QueryWidget.tsx, NoteRoute.tsx) instead of growing a second convention.
 */

/** Enforced server-side; repeated here only to write an actionable message. */
export const UPLOAD_LIMIT_MB = 25;

/** Raw-bytes endpoint. Used as a plain `href`, never fetched. */
export function attachmentUrl(path: string): string {
  return `/api/attachment?path=${encodeURIComponent(path)}`;
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

export type AttachmentKind = "image" | "pdf" | "sheet" | "doc" | "text" | "archive" | "other";

const KINDS: Record<string, AttachmentKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  pdf: "pdf",
  xlsx: "sheet",
  xls: "sheet",
  csv: "sheet",
  ods: "sheet",
  docx: "doc",
  doc: "doc",
  odt: "doc",
  pptx: "doc",
  txt: "text",
  log: "text",
  json: "text",
  yaml: "text",
  yml: "text",
  zip: "archive",
  gz: "archive",
  tgz: "archive",
  "7z": "archive",
};

export function attachmentKind(path: string): AttachmentKind {
  return KINDS[extensionOf(path)] ?? "other";
}

/**
 * Only these preview inline. SVG and HTML are missing from the image list on
 * purpose: the server serves them as downloads because rendering
 * user-uploaded markup on the panel's own origin would be stored XSS
 * (README rule 3 — no auth, the tailnet is the whole perimeter), so a
 * preview here would render a broken image at best and defeat that decision
 * at worst.
 */
export function canPreviewInline(path: string): boolean {
  const kind = attachmentKind(path);
  return kind === "image" || kind === "pdf";
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
 */
export function describeUploadError(
  status: number,
  fileName: string,
  serverMessage?: string,
): string {
  switch (status) {
    case 0:
      return `Couldn't reach the panel server while uploading ${fileName}. Check the connection and try again.`;
    case 409:
      return `${fileName} already exists in this folder.`;
    case 413:
      return `${fileName} is over the ${UPLOAD_LIMIT_MB} MB upload limit. Put it somewhere else and link to it, or split it up.`;
    case 400:
      return `The server rejected ${fileName}${serverMessage ? `: ${serverMessage}` : " (bad request)"}. Renaming the file usually fixes this.`;
    case 404:
      return `This panel's server has no upload endpoint (${fileName} was not sent). It needs the attachments backend deployed.`;
    default:
      return `Upload of ${fileName} failed (${status})${serverMessage ? `: ${serverMessage}` : ""}.`;
  }
}
