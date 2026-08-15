import { useParams } from "react-router-dom";
import { useAttachments } from "../api/queries";
import { attachmentDownloadUrl, baseName, extensionOf, formatBytes } from "../lib/attachments";
import { decodeRoutePath } from "../lib/notePath";
import { AttachmentPreview } from "../preview/AttachmentPreview";

/**
 * The non-`.md` counterpart of NoteRoute (roadmap #9). Previously this was
 * `<img>`, `<embed>`, or a download link and nothing else; the preview layer
 * under `src/preview/` replaced that, and the security reasoning it was
 * built on moved with it — the short version is that the server, not this
 * route, decides what may be served inline, and HTML and SVG are safe to
 * render here only because of the `Content-Security-Policy: sandbox` header
 * it sends with them (see preview/HtmlPreview.tsx and lib/preview.ts).
 *
 * Layout is a column that fills the route's height rather than the
 * `.note-route` two-column reading layout: an attachment has no backlinks
 * panel and no 760px prose measure, and "the PDF is in a small box" was
 * literally half the complaint.
 */
export function AttachmentRoute() {
  const params = useParams();
  const path = decodeRoutePath(params["*"]);
  const { data: attachments, isLoading, isError, error } = useAttachments();
  const meta = attachments?.find((a) => a.path === path);
  const name = baseName(path);
  const ext = extensionOf(path);

  if (!path) {
    return <p className="muted">No file selected.</p>;
  }

  return (
    <div className="attachment-route">
      <header className="note-header attachment-header">
        <div className="note-header-top">
          <h1>{name}</h1>
          <div className="note-editor-toolbar">
            <a className="attachment-download" href={attachmentDownloadUrl(path)}>
              Download
            </a>
          </div>
        </div>
        <div className="note-meta">
          <span title={path}>{path}</span>
          {meta && (
            <>
              <span> · </span>
              <span>{formatBytes(meta.size)}</span>
              <span> · </span>
              <span>{new Date(meta.mtime).toLocaleString()}</span>
            </>
          )}
        </div>
        {isError && (
          <p className="note-error">
            Could not load the attachment index: {(error as Error).message}. The preview below
            still works if the file is there.
          </p>
        )}
        {!isLoading && !isError && !meta && (
          <p className="muted">
            Not in the vault's attachment index — it may have been moved or deleted.
          </p>
        )}
      </header>
      {/* Remounted per path so a viewer's local state (zoom, source toggle,
          a failed decode) never carries across to the next file. */}
      <div className="attachment-body">
        <AttachmentPreview key={path} path={path} name={name} ext={ext} size={meta?.size} />
      </div>
    </div>
  );
}
