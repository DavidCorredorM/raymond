import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ApiError } from "../api/client";
import { useUploadAttachment } from "../api/queries";
import { describeUploadError } from "../lib/attachments";
import { useT } from "../i18n/store";

type Decision = "replace" | "skip";

interface Progress {
  file: string;
  fraction: number;
  index: number;
  total: number;
}

/**
 * Upload scoped to one folder — the folder whose row this wraps. There is
 * deliberately no global "upload" button anywhere in the app: roadmap #9
 * decided files are filed by what they are (a report next to the strategy
 * notes it's about), so the destination has to be a place the user is
 * already looking at, not a default.
 *
 * Wraps the folder row rather than sitting inside it so the whole row is the
 * drop target; `children` is the row's own toggle button.
 */
export function FolderUpload({
  folder,
  label,
  children,
}: {
  /** Vault-relative destination; "" is the vault root. */
  folder: string;
  /** Human name of the destination, for button titles and messages. */
  label: string;
  children: ReactNode;
}) {
  const t = useT();
  const upload = useUploadAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // The 409 answer arrives from a click, not from the upload loop — park the
  // loop on a promise and let the buttons resolve it.
  const [conflict, setConflict] = useState<string | null>(null);
  const decide = useRef<((d: Decision) => void) | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // A pending question would otherwise leave the loop awaiting forever.
      decide.current?.("skip");
    };
  }, []);

  const askAboutConflict = useCallback((fileName: string): Promise<Decision> => {
    setConflict(fileName);
    return new Promise<Decision>((resolve) => {
      decide.current = (d) => {
        decide.current = null;
        setConflict(null);
        resolve(d);
      };
    });
  }, []);

  const send = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);
      setDone(null);
      let uploaded = 0;
      for (const [i, file] of files.entries()) {
        const track = (fraction: number) =>
          setProgress({ file: file.name, fraction, index: i + 1, total: files.length });
        // A failure stops the queue — but say so, rather than leaving the
        // user to work out which of the files they dropped actually landed.
        const stop = (message: string) => {
          const left = files.length - i - 1;
          setProgress(null);
          setError(left > 0 ? `${message} ${t.folderUpload.moreFilesNotUploaded(left)}` : message);
        };
        track(0);
        try {
          await upload.mutateAsync({ folder, file, onProgress: track });
          uploaded += 1;
        } catch (err) {
          const status = err instanceof ApiError ? err.status : -1;
          if (status === 409) {
            // Never silently overwrite, and never dead-end: ask.
            const answer = await askAboutConflict(file.name);
            if (answer === "skip") continue;
            try {
              await upload.mutateAsync({ folder, file, overwrite: true, onProgress: track });
              uploaded += 1;
              continue;
            } catch (retryErr) {
              const retryStatus = retryErr instanceof ApiError ? retryErr.status : -1;
              if (!alive.current) return;
              stop(
                describeUploadError(
                  retryStatus,
                  file.name,
                  retryErr instanceof ApiError ? retryErr.serverMessage : undefined,
                ),
              );
              return;
            }
          }
          if (!alive.current) return;
          stop(
            status === -1
              ? t.folderUpload.uploadOfFileFailed(file.name, (err as Error).message)
              : describeUploadError(
                  status,
                  file.name,
                  err instanceof ApiError ? err.serverMessage : undefined,
                ),
          );
          return;
        }
      }
      if (!alive.current) return;
      setProgress(null);
      if (uploaded > 0) {
        setDone(
          uploaded === 1
            ? t.folderUpload.uploadedTo(label)
            : t.folderUpload.uploadedNTo(uploaded, label),
        );
      }
    },
    [askAboutConflict, folder, label, t, upload],
  );

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 5000);
    return () => clearTimeout(timer);
  }, [done]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation(); // nested folders: the innermost row wins, not its parent
    setDragOver(false);
    const files = [...e.dataTransfer.files];
    if (files.length > 0) void send(files);
  }

  return (
    <div
      className={"folder-upload" + (dragOver ? " drag-over" : "")}
      onDragOver={(e) => {
        // Without preventDefault on dragover the browser never fires drop.
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div className="folder-upload-row">
        {children}
        <button
          type="button"
          className="folder-upload-button"
          title={t.folderUpload.uploadInto(label)}
          aria-label={t.folderUpload.uploadInto(label)}
          onClick={() => inputRef.current?.click()}
        >
          ＋
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="folder-upload-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = ""; // re-picking the same file must fire change again
            if (files.length > 0) void send(files);
          }}
        />
      </div>
      {progress && (
        <p className="folder-upload-status" role="status">
          {progress.total > 1 && t.folderUpload.progressPrefix(progress.index, progress.total)}
          {t.folderUpload.uploadingStatus(progress.file, Math.round(progress.fraction * 100))}
          <progress className="folder-upload-bar" max={1} value={progress.fraction} />
        </p>
      )}
      {conflict && (
        <div
          className="folder-upload-conflict"
          role="alertdialog"
          aria-label={t.folderUpload.fileExistsAriaLabel}
        >
          <span>{t.folderUpload.fileExistsQuestion(conflict)}</span>
          <button type="button" onClick={() => decide.current?.("replace")}>
            {t.folderUpload.replace}
          </button>
          <button type="button" onClick={() => decide.current?.("skip")}>
            {t.folderUpload.skip}
          </button>
        </div>
      )}
      {error && <p className="folder-upload-error note-error">{error}</p>}
      {done && <p className="folder-upload-status muted">{done}</p>}
    </div>
  );
}
