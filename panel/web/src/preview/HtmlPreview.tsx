import { lazy, Suspense, useState } from "react";
import { PreviewFrame } from "./PreviewFrame";

// The source view is CodeMirror, i.e. the heaviest thing in the build. It is
// a toggle most people never press, so it stays behind a dynamic import even
// though the rendered view it sits next to is free.
const TextViewer = lazy(() => import("./TextViewer").then((m) => ({ default: m.TextViewer })));

/**
 * HTML reports — the mandatory case. Most skill output in a real deployment
 * is an HTML file with its own JavaScript charts, so "render it, but don't
 * let it run against the panel" is the whole problem.
 *
 * Two independent things make that safe, and both are load-bearing because
 * README rule 3 means there is no auth layer to fall back on if one of them
 * is wrong:
 *
 * 1. `sandbox="allow-scripts"` here, and **never** `allow-same-origin`.
 *    Scripts run — charts draw — but the document is in an opaque origin: no
 *    `parent.document`, no cookies, no `fetch('/api/...')` that the panel's
 *    origin would honour. The two tokens together are specifically excluded:
 *    a frame with both can reach into its own `sandbox` attribute and remove
 *    it, so `allow-scripts allow-same-origin` is not a weaker sandbox, it is
 *    no sandbox.
 * 2. The server's `Content-Security-Policy: sandbox allow-scripts` on the
 *    response itself. That covers the entry point this component doesn't
 *    control — someone following "Open in new tab", or pasting the raw
 *    `/api/attachment` URL — where there is no frame to carry an attribute.
 *
 * `allow-popups`, `allow-forms`, `allow-downloads` and `allow-modals` are
 * all withheld: a report that draws charts needs none of them, and each one
 * is a way for a generated page to act on the user's behalf. Add one only
 * with a report that actually needs it in hand.
 */
export function HtmlPreview({
  path,
  src,
  name,
  ext,
  size,
  downloadHref,
}: {
  path: string;
  src: string;
  name: string;
  ext: string;
  size?: number;
  downloadHref: string;
}) {
  const [showSource, setShowSource] = useState(false);

  const sourceToggle = (
    <button
      type="button"
      className="preview-button"
      onClick={() => setShowSource((v) => !v)}
      aria-pressed={showSource}
    >
      {showSource ? "Rendered" : "Source"}
    </button>
  );

  if (showSource) {
    return (
      <Suspense fallback={<p className="muted preview-loading">Loading source view…</p>}>
        <TextViewer
          path={path}
          name={name}
          ext={ext}
          size={size}
          downloadHref={downloadHref}
          language="html"
          actions={sourceToggle}
        />
      </Suspense>
    );
  }

  return (
    <PreviewFrame
      flush
      status="Sandboxed — scripts run, the page can't reach the panel"
      actions={
        <>
          {sourceToggle}
          {/* Safe to open directly *because* of the server's CSP sandbox
              header; without it this link would hand a generated page the
              panel's own origin. */}
          <a className="preview-button" href={src} target="_blank" rel="noopener noreferrer">
            Open in new tab
          </a>
          <a className="preview-button" href={downloadHref}>
            Download
          </a>
        </>
      }
    >
      <iframe
        className="preview-frame"
        src={src}
        title={`Preview of ${name}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
      />
    </PreviewFrame>
  );
}
