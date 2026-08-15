import { useParams } from "react-router-dom";
import { useAttachments } from "../api/queries";
import {
  attachmentKind,
  attachmentUrl,
  baseName,
  canPreviewInline,
  extensionOf,
  formatBytes,
} from "../lib/attachments";
import { decodeRoutePath } from "../lib/notePath";

/**
 * The non-`.md` counterpart of NoteRoute (roadmap #9). Deliberately thin:
 * download always, inline preview only for images and PDFs.
 *
 * Anything else is a download link and nothing more — no `<iframe>`/
 * `<object>` fallback for arbitrary types. The server decides what may be
 * served inline (uploaded HTML/SVG rendered on the panel's origin would be
 * stored XSS, and README rule 3 means there's no auth layer behind which
 * that would be survivable); working around it here would move that decision
 * to the client, which is exactly the wrong place for it.
 */
export function AttachmentRoute() {
  const params = useParams();
  const path = decodeRoutePath(params["*"]);
  const { data: attachments, isLoading, isError, error } = useAttachments();
  const meta = attachments?.find((a) => a.path === path);
  const href = attachmentUrl(path);
  const name = baseName(path);
  const ext = extensionOf(path);

  if (!path) {
    return <p className="muted">No file selected.</p>;
  }

  return (
    <div className="note-route">
      <article className="note-content">
        <header className="note-header">
          <div className="note-header-top">
            <h1>{name}</h1>
            <div className="note-editor-toolbar">
              {/* `download` is a hint the browser honours for inline types
                  (images, PDFs); for everything else the server's own
                  Content-Disposition already forces a download. */}
              <a className="attachment-download" href={href} download={name}>
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
              Could not load the attachment index: {(error as Error).message}. The download link
              above still works if the file is there.
            </p>
          )}
          {!isLoading && !isError && !meta && (
            <p className="muted">
              Not in the vault's attachment index — it may have been moved or deleted.
            </p>
          )}
        </header>
        <AttachmentPreview path={path} href={href} name={name} ext={ext} />
      </article>
    </div>
  );
}

function AttachmentPreview({
  path,
  href,
  name,
  ext,
}: {
  path: string;
  href: string;
  name: string;
  ext: string;
}) {
  if (!canPreviewInline(path)) {
    return (
      <p className="muted attachment-no-preview">
        No preview for {ext ? `.${ext}` : "this type of"} files — download it to open it in whatever
        app owns it.
      </p>
    );
  }
  if (attachmentKind(path) === "pdf") {
    return <embed className="attachment-pdf" src={href} type="application/pdf" title={name} />;
  }
  return <img className="attachment-image" src={href} alt={name} />;
}
