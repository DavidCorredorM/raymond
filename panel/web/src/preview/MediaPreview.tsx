import { useState, type SyntheticEvent } from "react";
import { NoPreview } from "./NoPreview";
import { PreviewFrame } from "./PreviewFrame";

/**
 * Audio and video, native elements with native controls.
 *
 * Seeking is the server's half of this: `<audio>`/`<video>` scrub by issuing
 * ranged requests, so a response without `Accept-Ranges: bytes` and real
 * `206`s plays from the start and nothing else. That's specified in the
 * attachment endpoint's contract, not implemented here.
 *
 * `preload="metadata"` rather than `auto`: opening a folder of recordings
 * shouldn't pull megabytes per click, but the duration and the scrub bar
 * have to be there before the user presses play or the control is a lie.
 *
 * A codec the browser can't decode is the expected failure — an `.mov` full
 * of ProRes, an `.ogg` in Safari — and it surfaces as `error` on the media
 * element, which lands on the download state with the browser's own reason.
 */
export function MediaPreview({
  kind,
  src,
  name,
  size,
  downloadHref,
}: {
  kind: "audio" | "video";
  src: string;
  name: string;
  size?: number;
  downloadHref: string;
}) {
  const [failure, setFailure] = useState<string | null>(null);

  if (failure) {
    return <NoPreview name={name} size={size} downloadHref={downloadHref} reason={failure} />;
  }

  const onError = (e: SyntheticEvent<HTMLMediaElement>) => {
    const code = e.currentTarget.error?.code;
    setFailure(
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? "This browser can't decode this file's codec or container. Download it and open it in a media player."
        : "Playback failed — the file may be truncated or the connection dropped.",
    );
  };

  const actions = (
    <a className="preview-button" href={downloadHref}>
      Download
    </a>
  );

  if (kind === "audio") {
    return (
      <PreviewFrame status="Audio" actions={actions}>
        <audio className="preview-audio" src={src} controls preload="metadata" onError={onError} />
      </PreviewFrame>
    );
  }

  return (
    <PreviewFrame flush status="Video" actions={actions}>
      <video
        className="preview-video"
        src={src}
        controls
        preload="metadata"
        playsInline
        onError={onError}
      />
    </PreviewFrame>
  );
}
