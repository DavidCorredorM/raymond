import { useEffect, useMemo, useState, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { NoPreview } from "./NoPreview";
import { PreviewFrame } from "./PreviewFrame";
import { previewLanguageOf, type PreviewLanguage } from "../lib/preview";
import { TooLargeError, useAttachmentText } from "./useAttachmentText";
import { useT } from "../i18n/store";

/**
 * Read-only source view, CodeMirror 6 — the same editor the note editor
 * uses, so highlighting a `.json` or a `.py` needs no new dependency.
 * **Only ever reached through a dynamic `import()`** (AttachmentPreview.tsx):
 * CM6 and its language packages are the largest thing in this build, and
 * someone looking at a PNG must not pay for them.
 *
 * Read-only both ways round: `editable={false}` stops the DOM being a text
 * input, `readOnly` refuses transactions. There is no write endpoint for
 * attachments — the point is that this reads as a viewer rather than as an
 * editor whose Save button went missing.
 */

/**
 * One further split inside this chunk. Only four grammars exist in the tree
 * (`@codemirror/lang-markdown` is a direct dependency; html, css and
 * javascript arrive with it) and a `.log` file needs none of them, so each
 * is fetched on demand rather than welded into the viewer.
 */
const LANGUAGE_LOADERS: Record<Exclude<PreviewLanguage, null>, () => Promise<Extension>> = {
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
};

export function TextViewer({
  path,
  name,
  ext,
  size,
  downloadHref,
  /** Overrides the extension's own language — the HTML preview's source view passes "html". */
  language,
  /** Extra toolbar controls from the caller (the source-view toggle). */
  actions,
}: {
  path: string;
  name: string;
  ext: string;
  size?: number;
  downloadHref: string;
  language?: PreviewLanguage;
  actions?: ReactNode;
}) {
  const t = useT();
  const { data, isLoading, isError, error } = useAttachmentText(path);
  const langId = language !== undefined ? language : previewLanguageOf(ext);
  const [langExt, setLangExt] = useState<Extension | null>(null);

  useEffect(() => {
    if (!langId) {
      setLangExt(null);
      return;
    }
    let cancelled = false;
    LANGUAGE_LOADERS[langId]()
      .then((ext_) => {
        if (!cancelled) setLangExt(ext_);
      })
      // A grammar that fails to load costs highlighting, not the document.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [langId]);

  const extensions = useMemo(
    // Wrapping, not horizontal scroll: the common cases here are a log line
    // and a minified JSON blob, and both are unreadable behind a scrollbar.
    () => (langExt ? [EditorView.lineWrapping, langExt] : [EditorView.lineWrapping]),
    [langExt],
  );

  if (isLoading) return <p className="muted preview-loading">{t.common.reading(name)}</p>;
  if (isError) {
    const err = error as Error;
    return (
      <NoPreview
        name={name}
        size={size}
        downloadHref={downloadHref}
        reason={
          err instanceof TooLargeError
            ? t.preview.tooLargeAsText(err.message)
            : t.preview.couldntRead(err.message)
        }
      />
    );
  }

  const text = data ?? "";
  const lines = text ? text.split("\n").length : 0;

  return (
    <PreviewFrame
      flush
      status={`${t.preview.lines(lines)}${langId ? ` · ${langId}` : ""}`}
      actions={
        <>
          {actions}
          <a className="preview-button" href={downloadHref}>
            {t.common.download}
          </a>
        </>
      }
    >
      <CodeMirror
        className="preview-code"
        value={text}
        extensions={extensions}
        editable={false}
        readOnly
        basicSetup={{
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          closeBrackets: false,
        }}
        height="100%"
      />
    </PreviewFrame>
  );
}
