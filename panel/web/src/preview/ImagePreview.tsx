import { useState } from "react";
import { NoPreview } from "./NoPreview";
import { PreviewFrame } from "./PreviewFrame";
import { useT } from "../i18n/store";

/**
 * Raster images and SVG, both through `<img>`.
 *
 * SVG goes here rather than into an iframe deliberately. An SVG referenced
 * by `<img src=…>` is in the SVG spec's *secure static mode*: `<script>`
 * never runs, `<a>` never navigates, external references never load — the
 * guarantee is in the renderer, not in anything the panel checks at upload
 * time, which matters because there is no auth layer to survive being wrong
 * (README rule 3). The server's `Content-Security-Policy: sandbox` header on
 * `.svg` covers the other entry point, someone opening the raw URL.
 *
 * Fit-to-window is the default because the common case is a screenshot
 * that's wider than the column; actual size is one click away because the
 * other common case is reading small text in that screenshot.
 */
export function ImagePreview({
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
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  if (failed) {
    return (
      <NoPreview name={name} size={size} downloadHref={downloadHref} reason={t.preview.imageDecodeFailed} />
    );
  }

  return (
    <PreviewFrame
      backdrop="checker"
      status={
        dims ? (
          <>
            {dims.w} × {dims.h} px
          </>
        ) : null
      }
      actions={
        <>
          <button
            type="button"
            className="preview-button"
            onClick={() => setActualSize((v) => !v)}
            aria-pressed={actualSize}
          >
            {actualSize ? t.preview.fit : t.preview.actualSize}
          </button>
          <a className="preview-button" href={downloadHref}>
            {t.common.download}
          </a>
        </>
      }
    >
      <img
        className={"preview-image" + (actualSize ? " preview-image-actual" : "")}
        src={src}
        alt={name}
        // SVGs report 0×0 when they carry no intrinsic size; showing "0 × 0"
        // would be worse than showing nothing.
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0) setDims({ w: img.naturalWidth, h: img.naturalHeight });
        }}
        onError={() => setFailed(true)}
      />
    </PreviewFrame>
  );
}
