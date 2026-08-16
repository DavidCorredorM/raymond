import { lazy, Suspense } from "react";
import { attachmentDownloadUrl, attachmentUrl, formatBytes } from "../lib/attachments";
import {
  isOversizeForPreview,
  previewKindOf,
  TEXT_PREVIEW_LIMIT_BYTES,
  type PreviewKind,
} from "../lib/preview";
import { HtmlPreview } from "./HtmlPreview";
import { ImagePreview } from "./ImagePreview";
import { MediaPreview } from "./MediaPreview";
import { NoPreview } from "./NoPreview";
import { PdfPreview } from "./PdfPreview";
import { useT } from "../i18n/store";
import type { Messages } from "../i18n/messages";

/**
 * Everything the browser can render on its own — images, PDF, HTML, audio,
 * video — is a static import: together they are a few kB of JSX around
 * platform elements, and code-splitting them would buy a round-trip in
 * exchange for nothing.
 *
 * The two viewers that parse the file in the tab are split. `TextViewer`
 * pulls CodeMirror, the largest module in the build; `TableViewer` pulls a
 * parser and is split *separately* so that opening a CSV doesn't drag
 * CodeMirror in behind it. Verified against the build's chunk list, not
 * assumed.
 */
const TextViewer = lazy(() => import("./TextViewer").then((m) => ({ default: m.TextViewer })));
const TableViewer = lazy(() => import("./TableViewer").then((m) => ({ default: m.TableViewer })));

/**
 * Types with a real editor on the desktop and no cheap, safe reader in a
 * browser. Named individually rather than swept into the generic unknown
 * case so the message can say *why* and what the plan is — an honest gap
 * beats a viewer that renders a spreadsheet wrong.
 *
 * `.xlsx`/`.xls` in particular are a deliberate omission, not an oversight:
 * the only build of SheetJS on the npm registry is 0.18.5, which carries two
 * unfixed advisories (GHSA-4r6h-8v6p-xvw6 prototype pollution,
 * GHSA-5pgg-2g8v-p4x9 ReDoS — `npm audit` says "No fix available"), and the
 * fixed releases ship only from the vendor's own CDN. Putting a parser with
 * live advisories in front of files that scheduled agents write, in an app
 * with no auth (README rule 3), is a worse outcome than a download button.
 */
/** Maps an extension to the `Messages.preview` key holding its no-reader wording. */
const NO_READER_KEY: Record<string, keyof Messages["preview"]> = {
  xlsx: "noReaderSpreadsheetOffice",
  xls: "noReaderSpreadsheetOffice",
  ods: "noReaderSpreadsheetOds",
  docx: "noReaderWordOffice",
  doc: "noReaderWordOffice",
  odt: "noReaderTextOdt",
  pptx: "noReaderPowerpointOffice",
  ppt: "noReaderPowerpointOffice",
  odp: "noReaderPresentationOdp",
  zip: "noReaderArchive",
  gz: "noReaderArchive",
  tgz: "noReaderArchive",
  "7z": "noReaderArchive",
  rar: "noReaderArchive",
};

export function AttachmentPreview({
  path,
  name,
  ext,
  size,
}: {
  path: string;
  name: string;
  ext: string;
  /** From the attachment index; undefined when the file isn't in it. */
  size?: number;
}) {
  const t = useT();
  const src = attachmentUrl(path);
  const downloadHref = attachmentDownloadUrl(path);
  const kind: PreviewKind = previewKindOf(path, ext);

  // Cheap guard first: the index already told us the size, so a 40 MB log
  // never gets requested at all. useAttachmentText re-checks against the
  // response in case the index was stale.
  if (isOversizeForPreview(kind, size)) {
    return (
      <NoPreview
        name={name}
        size={size}
        downloadHref={downloadHref}
        reason={t.preview.tooLargeToPreview(formatBytes(TEXT_PREVIEW_LIMIT_BYTES))}
      />
    );
  }

  switch (kind) {
    case "image":
      return <ImagePreview src={src} name={name} size={size} downloadHref={downloadHref} />;
    case "pdf":
      return <PdfPreview src={src} name={name} size={size} downloadHref={downloadHref} />;
    case "html":
      return (
        <HtmlPreview
          path={path}
          src={src}
          name={name}
          ext={ext}
          size={size}
          downloadHref={downloadHref}
        />
      );
    case "audio":
    case "video":
      return (
        <MediaPreview
          kind={kind}
          src={src}
          name={name}
          size={size}
          downloadHref={downloadHref}
        />
      );
    case "table":
      return (
        <Suspense fallback={<p className="muted preview-loading">{t.common.loadingTableView}</p>}>
          <TableViewer path={path} name={name} ext={ext} size={size} downloadHref={downloadHref} />
        </Suspense>
      );
    case "text":
      return (
        <Suspense fallback={<p className="muted preview-loading">{t.common.loadingTextView}</p>}>
          <TextViewer path={path} name={name} ext={ext} size={size} downloadHref={downloadHref} />
        </Suspense>
      );
    case "none": {
      const readerKey = NO_READER_KEY[ext];
      const reason = readerKey
        ? (t.preview[readerKey] as string)
        : ext
          ? t.preview.noPreviewFor(ext)
          : t.preview.noPreviewForNoExtension;
      return <NoPreview name={name} size={size} downloadHref={downloadHref} reason={reason} />;
    }
  }
}
