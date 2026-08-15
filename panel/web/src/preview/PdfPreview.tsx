import { NoPreview } from "./NoPreview";
import { PreviewFrame } from "./PreviewFrame";

/**
 * PDFs render in the browser's own viewer, framed.
 *
 * This is a decision against bundling `pdfjs-dist`, taken on the numbers.
 * Chrome, Edge, Firefox and Safari all ship a full PDF UI — continuous
 * scroll, page thumbnails, a page-number box, zoom, text selection, find,
 * rotate, print — and Chrome's *is* pdf.js. Bundling the library means
 * ~350 kB gzipped plus a separately-versioned worker asset, and then
 * re-implementing that toolbar by hand to get back to where an `<iframe>`
 * already is. The brief's own rule applies: don't add a dependency for
 * something the platform does well.
 *
 * `<iframe>` rather than the `<embed>` that was here before, for two
 * reasons: it accepts fallback content and a `title` (so it is not an
 * unlabelled black box to a screen reader), and it is the element the
 * Fullscreen API and PDF open-parameters (`#page=`, `#zoom=`) are specified
 * against. The stage it sits in fills the route's height instead of the old
 * fixed 75vh, and full screen gives it the display — which was most of what
 * "there is no nice PDF previewer" was actually about.
 *
 * Not sandboxed, unlike the HTML preview: the sandbox attribute disables the
 * built-in viewer's own scripting and the toolbar goes with it. A PDF is not
 * markup executing on the panel's origin — the plugin decodes it out of
 * process — so the threat that forces `sandbox` on HTML doesn't apply.
 */
export function PdfPreview({
  src,
  name,
  size,
  downloadHref,
}: {
  src: string;
  name: string;
  size?: number;
  downloadHref: string;
}) {
  // `navigator.pdfViewerEnabled` is the standardised replacement for sniffing
  // `navigator.plugins`, and reports false when the user has turned
  // "download PDFs instead of opening them" on. Undefined on browsers that
  // don't implement it — assume a viewer there and let the fallback content
  // inside the frame handle being wrong, rather than refusing to try.
  const viewerEnabled = navigator.pdfViewerEnabled ?? true;

  if (!viewerEnabled) {
    return (
      <NoPreview
        name={name}
        size={size}
        downloadHref={downloadHref}
        reason="This browser is set to download PDFs rather than display them, so there's no viewer to embed."
      />
    );
  }

  return (
    <PreviewFrame
      flush
      status="Browser PDF viewer"
      actions={
        <>
          <a className="preview-button" href={src} target="_blank" rel="noopener noreferrer">
            Open in new tab
          </a>
          <a className="preview-button" href={downloadHref}>
            Download
          </a>
        </>
      }
    >
      <iframe className="preview-frame" src={src} title={`PDF preview of ${name}`}>
        {/* Shown only by a browser that can't frame a PDF at all. */}
        <p className="muted">
          This browser can't display PDFs inline. <a href={downloadHref}>Download {name}</a>.
        </p>
      </iframe>
    </PreviewFrame>
  );
}
