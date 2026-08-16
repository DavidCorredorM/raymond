import { useQuery } from "@tanstack/react-query";
import { attachmentUrl, formatBytes } from "../lib/attachments";
import { TEXT_PREVIEW_LIMIT_BYTES } from "../lib/preview";
import { currentMessages } from "../i18n/store";

/**
 * Pulls an attachment down as text, for the two kinds that can't be shown by
 * pointing an element at a URL (source view and delimited tables).
 *
 * The size guard is checked twice on purpose. The route checks the size the
 * attachment index reported, which costs nothing and catches the normal
 * case; this checks `Content-Length` on the response, which catches the
 * index being stale — a skill rewriting a report between the poll and the
 * click is exactly the workflow roadmap #9 exists for, so "the index said
 * 40 kB" is not something to bet the tab on.
 *
 * Not cached beyond the session and not polled: an attachment is a snapshot
 * you opened, not a live document, and re-parsing a CSV every 30s to maybe
 * redraw the same table is work for nothing.
 */
export class TooLargeError extends Error {
  constructor(bytes: number) {
    super(
      currentMessages().preview.overTextPreviewLimit(
        formatBytes(bytes),
        formatBytes(TEXT_PREVIEW_LIMIT_BYTES),
      ),
    );
    this.name = "TooLargeError";
  }
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(attachmentUrl(path));
  if (!res.ok) {
    throw new Error(currentMessages().preview.readingFailed(path, res.status));
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > TEXT_PREVIEW_LIMIT_BYTES) {
    // Abandon the body rather than decoding megabytes we've decided not to
    // show; without this the guard would only save the render, not the read.
    await res.body?.cancel();
    throw new TooLargeError(declared);
  }
  const text = await res.text();
  // A chunked response has no Content-Length, so the only true size is the
  // one we ended up holding.
  if (text.length > TEXT_PREVIEW_LIMIT_BYTES) throw new TooLargeError(text.length);
  return text;
}

export function useAttachmentText(path: string) {
  return useQuery({
    queryKey: ["attachment-text", path],
    queryFn: () => fetchText(path),
    enabled: !!path,
    staleTime: Infinity,
    retry: false,
  });
}
