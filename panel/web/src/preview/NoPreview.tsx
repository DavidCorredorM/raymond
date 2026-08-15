import { formatBytes } from "../lib/attachments";

/**
 * Where every path that can't render ends up: an unknown type, a decode
 * failure, a file too big to parse in the tab, a library that isn't here.
 * One component so there is exactly one shape for "you can't see this,"
 * and it always names the file, its size, and the way to get it.
 *
 * The `reason` is written by whoever failed, in their own words, because
 * "no preview available" tells the user nothing they can act on — "the
 * browser could not decode it" and "3.4 MB is over the 2.0 MB parse limit"
 * lead to different next steps.
 */
export function NoPreview({
  name,
  reason,
  size,
  downloadHref,
}: {
  name: string;
  reason: string;
  size?: number;
  downloadHref: string;
}) {
  return (
    <div className="preview-empty">
      <p className="preview-empty-name">{name}</p>
      <p className="preview-empty-reason muted">
        {reason}
        {typeof size === "number" && Number.isFinite(size) ? ` · ${formatBytes(size)}` : ""}
      </p>
      <a className="preview-button preview-button-primary" href={downloadHref}>
        Download
      </a>
    </div>
  );
}
