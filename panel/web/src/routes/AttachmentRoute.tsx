import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAttachments, useMoveAttachment } from "../api/queries";
import { attachmentDownloadUrl, baseName, extensionOf, formatBytes } from "../lib/attachments";
import { decodeRoutePath, fileHref } from "../lib/notePath";
import { buildAttachmentRenamePath } from "../lib/rename";
import { AttachmentPreview } from "../preview/AttachmentPreview";
import { RenameDialog } from "../components/RenameDialog";
import { Icon } from "../icons/Icon";
import { useT } from "../i18n/store";

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
  const t = useT();
  const params = useParams();
  const path = decodeRoutePath(params["*"]);
  const navigate = useNavigate();
  const { data: attachments, isLoading, isError, error } = useAttachments();
  const meta = attachments?.find((a) => a.path === path);
  const name = baseName(path);
  const ext = extensionOf(path);

  const moveAttachment = useMoveAttachment();
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  async function handleRename(newPath: string) {
    setRenameError(null);
    try {
      await moveAttachment.mutateAsync({ from: path, to: newPath });
      setRenaming(false);
      navigate(fileHref(newPath));
    } catch (err) {
      setRenameError((err as Error).message);
    }
  }

  if (!path) {
    return <p className="muted">{t.attachment.noneSelected}</p>;
  }

  return (
    <div className="attachment-route">
      <header className="note-header attachment-header">
        <div className="note-header-top">
          <h1>{name}</h1>
          <div className="note-editor-toolbar">
            <a className="attachment-download" href={attachmentDownloadUrl(path)}>
              {t.attachment.download}
            </a>
            <button
              type="button"
              className="mode-toggle icon-button"
              onClick={() => setRenaming(true)}
              title={t.attachment.renameThisFile}
              aria-label={t.attachment.renameThisFile}
            >
              <Icon name="rename" size={15} />
            </button>
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
          <p className="note-error">{t.attachment.couldNotLoadIndex((error as Error).message)}</p>
        )}
        {!isLoading && !isError && !meta && <p className="muted">{t.attachment.notInIndex}</p>}
      </header>
      {/* Remounted per path so a viewer's local state (zoom, source toggle,
          a failed decode) never carries across to the next file. */}
      <div className="attachment-body">
        <AttachmentPreview key={path} path={path} name={name} ext={ext} size={meta?.size} />
      </div>
      {renaming && (
        <RenameDialog
          title={t.attachment.renameDialogTitle}
          initialValue={name}
          helperText={t.attachment.filesNotLinked}
          validate={(input) => buildAttachmentRenamePath(path, input)}
          onConfirm={handleRename}
          onClose={() => setRenaming(false)}
          busy={moveAttachment.isPending}
          serverError={renameError}
        />
      )}
    </div>
  );
}
