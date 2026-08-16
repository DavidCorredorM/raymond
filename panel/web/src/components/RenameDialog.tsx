import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../icons/Icon";
import type { RenameInputResult } from "../lib/rename";

/**
 * Owner's ask #4 ("rename is a correctness problem, not a UI feature")
 * and the owner's explicit UX instruction: "Show the user what will
 * happen: 'this note is linked from 4 other notes; they will be
 * updated.'" That sentence is `linkedFromCount`/`helperText` below —
 * shown *before* the confirm button, not after, so the person renaming
 * something sees the consequence while they can still back out.
 *
 * `validate` runs on every keystroke (lib/rename.ts, pure, no network)
 * so an empty name or a stray `/` is caught immediately; the actual
 * rename only reaches the server on submit, where the real authority —
 * basename-uniqueness across the whole vault, the destination-exists
 * check — lives (`panel/server/src/rename.ts`).
 */
export function RenameDialog({
  title,
  initialValue,
  helperText,
  validate,
  onConfirm,
  onClose,
  busy,
  serverError,
}: {
  title: string;
  initialValue: string;
  /** e.g. "This note is linked from 4 other notes; they will be updated." */
  helperText?: string;
  validate: (input: string) => RenameInputResult;
  onConfirm: (newPath: string) => void;
  onClose: () => void;
  busy: boolean;
  serverError: string | null;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const result = validate(value);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (result.path) onConfirm(result.path);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title">
        <form onSubmit={handleSubmit}>
          <div className="dialog-header">
            <Icon name="rename" size={18} />
            <h2 id="rename-dialog-title">{title}</h2>
          </div>
          <label className="dialog-label" htmlFor="rename-dialog-input">
            New name
          </label>
          <input
            id="rename-dialog-input"
            ref={inputRef}
            className="dialog-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
          />
          {helperText && <p className="dialog-hint">{helperText}</p>}
          {result.error && <p className="dialog-error">{result.error}</p>}
          {serverError && <p className="dialog-error">{serverError}</p>}
          <div className="dialog-actions">
            <button type="button" className="mode-toggle" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="save-button" disabled={busy || !result.path}>
              {busy ? "Renaming…" : "Rename"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
