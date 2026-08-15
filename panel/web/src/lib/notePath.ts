/** Vault-relative note path -> a safe `/vault/note/*` route href. */
export function noteHref(path: string): string {
  return "/vault/note/" + path.split("/").map(encodeURIComponent).join("/");
}

/** Vault-relative attachment path -> a safe `/vault/file/*` route href. */
export function fileHref(path: string): string {
  return "/vault/file/" + path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Inverse of the two above: a splat route param back to a vault path.
 * Decodes segment by segment, because a `%2F` inside a filename must not
 * become a path separator. A segment that isn't valid percent-encoding is
 * kept verbatim rather than throwing — the resulting path just misses in the
 * index, which the routes already render as a normal not-found.
 */
export function decodeRoutePath(splat: string | undefined): string {
  if (!splat) return "";
  return splat
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
}
