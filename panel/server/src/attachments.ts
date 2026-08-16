import { lstat, realpath } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { safeRelPath, resolveInVault } from "./vault.js";
import { assertNetworkWritable, WritePathError } from "./writepath.js";

/**
 * Attachments — the non-`.md` half of the vault (roadmap #9): serving
 * bytes out, and accepting bytes in.
 *
 * This module exists separately from `vault.ts` for the same reason
 * `tricks.ts` does: it is the second thing in this codebase that gets a
 * real trust boundary rather than a path check, and the reasoning for
 * that boundary is long enough that burying it inside the indexer would
 * hide it. `vault.ts` owns *what is in the vault*; this owns *what may
 * cross the HTTP edge, in either direction*.
 *
 * The threat model is the same one `correr_script` was designed against
 * (tricks-spec.md, "Trust boundary"): **there is no authentication.**
 * Anything on the tailnet can call these endpoints. An upload endpoint
 * is a new way for any of that to place a file on this disk, and a
 * download endpoint is a new way to get the panel's own origin to
 * render one.
 */

/** Thrown with an HTTP status attached, so routes pass it straight through. Mirrors TrickError. */
export class AttachmentError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The only types served with their real Content-Type and rendered
 * inline. Everything not on this list is served as
 * `application/octet-stream` with `Content-Disposition: attachment`.
 *
 * This allowlist is a security control, not a convenience feature, and
 * it is the non-obvious half of this endpoint. The panel has no auth, so
 * anything on the tailnet can upload a file; if `/api/attachment` then
 * served an uploaded `.html`, `.svg` or `.xhtml` inline with its natural
 * Content-Type, opening that URL would execute the uploader's JavaScript
 * **on the panel's own origin** — the same origin that can rewrite every
 * note through `PUT /api/note` and fire `correr_script`. That turns
 * "someone can put a file on the disk" into "someone can run code in the
 * vault owner's browser and then on the server," which is a different
 * risk class entirely. Stored XSS is the actual exposure here, not
 * traversal.
 *
 * SVG is excluded on purpose despite being an image: it is an XML
 * document that can carry `<script>`, and it is the single most common
 * way this mistake is made.
 *
 * Adding a type here is a security decision. The bar: a browser must not
 * be able to execute script or navigate same-origin from it.
 */
const INLINE_TYPES: Record<string, string> = {
  // Raster images only. No SVG — see above.
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  // PDFs are the whole point of roadmap #9 — a skill regenerates a
  // report and someone wants to look at it. Browsers render these in a
  // sandboxed viewer, not as a same-origin document.
  pdf: "application/pdf",
  // Plain text, served as text/plain so a browser displays it rather
  // than interpreting it. `.csv` is deliberately text/plain and not
  // text/csv: nothing here needs the spreadsheet association, and
  // text/plain is the type with the fewest surprises.
  txt: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
  csv: "text/plain; charset=utf-8",
  // Audio and video decode in a media element, never as a document, so
  // they clear the bar above: there is no script and no navigation in a
  // container format. Real types matter here — a browser refuses to play
  // `application/octet-stream`.
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
};

/**
 * The third tier, added when previewing reports became a requirement:
 * types that *must* render as a document to be useful, and that can
 * carry script.
 *
 * The allowlist above cannot hold these — that is the whole point of it.
 * What makes them servable anyway is `Content-Security-Policy: sandbox`,
 * which drops the response into a **unique opaque origin**. An HTML
 * report's own charting JavaScript still runs; it just runs somewhere
 * that is not the panel's origin, so `document.cookie`, `localStorage`,
 * same-origin `fetch("/api/...")` and any reach into an embedding page
 * are all unavailable to it. Crucially this is a *response* header, so
 * it holds for direct navigation to the URL, not only for an iframe the
 * frontend happened to sandbox correctly — a client-side `sandbox=`
 * attribute protects the panel's own page and nothing else.
 *
 * `allow-scripts` is granted to HTML because reports are generated with
 * inline JS and would be blank without it. It is **not** granted to SVG:
 * an SVG needs no script to display, and `<img src=…>` disables script
 * in SVG regardless, so the strictest policy that still renders is the
 * right one.
 *
 * `allow-same-origin` must never appear here. Combined with
 * `allow-scripts` it hands the document back its real origin and the
 * sandbox becomes decoration.
 *
 * **`connect-src 'none'` was added 2026-08-15 after measuring its
 * absence**, while implementing the trick-app serving route next door.
 * An opaque origin stops a document reading *this* origin; it does
 * nothing about the document reaching the network. Verified in Chrome
 * against a real server: an uploaded `report.html` served by this route
 * issued `fetch("/api/note?path=…", {mode:"no-cors"})` and **the request
 * arrived**. The response was unreadable (no `Access-Control-Allow-Origin`
 * on data routes) and a mutating one would have been refused by the
 * cross-site guard in `index.ts`, so nothing was read or written — but
 * "talking to the outside world" is its own escalation in
 * `tricks-spec.md` §2.1, and an HTML report that can `fetch()` can beacon
 * to any host the viewer's browser can reach, and can scan the LAN.
 *
 * `connect-src 'none'` is exactly what the trick-app policy uses for the
 * same reason (§5.3), and it is the whole of the fix: only `fetch`, XHR,
 * `sendBeacon`, WebSocket and EventSource are affected, none of which a
 * static generated report uses. Images, styles and inline script — the
 * things that make a report render — are untouched. `form-action 'none'`
 * closes the same door for a form POST.
 */
const SANDBOX_NO_NETWORK = "connect-src 'none'; form-action 'none'";

const SANDBOXED_TYPES: Record<string, { type: string; csp: string }> = {
  html: { type: "text/html; charset=utf-8", csp: `sandbox allow-scripts; ${SANDBOX_NO_NETWORK}` },
  htm: { type: "text/html; charset=utf-8", csp: `sandbox allow-scripts; ${SANDBOX_NO_NETWORK}` },
  xhtml: {
    type: "application/xhtml+xml",
    csp: `sandbox allow-scripts; ${SANDBOX_NO_NETWORK}`,
  },
  svg: { type: "image/svg+xml", csp: `sandbox; ${SANDBOX_NO_NETWORK}` },
};

export interface ServePolicy {
  contentType: string;
  /** Full `Content-Disposition` header value, filename included. */
  disposition: string;
  inline: boolean;
  /** `Content-Security-Policy` value, when this type needs one. */
  csp?: string;
}

/**
 * How one attachment may be served. Note every branch sets a real
 * `Content-Disposition` — omitting it on an inline branch would leave
 * the filename to the URL, and omitting it on the download branch is how
 * "it downloads, surely" turns out to have been "it rendered."
 *
 * `forceDownload` is the `?download=1` escape hatch: any type at all,
 * served as bytes to save. It can only ever make the response stricter,
 * never looser, so it needs no validation of its own.
 */
export function servePolicy(relPath: string, forceDownload = false): ServePolicy {
  const name = relPath.split("/").pop() ?? "download";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";

  if (forceDownload) {
    return {
      contentType: "application/octet-stream",
      disposition: `attachment; ${dispositionFilename(name)}`,
      inline: false,
      csp: "default-src 'none'; sandbox",
    };
  }

  const sandboxed = SANDBOXED_TYPES[ext];
  if (sandboxed) {
    return {
      contentType: sandboxed.type,
      disposition: `inline; ${dispositionFilename(name)}`,
      inline: true,
      csp: sandboxed.csp,
    };
  }

  const inlineType = INLINE_TYPES[ext];
  return {
    contentType: inlineType ?? "application/octet-stream",
    disposition: `${inlineType ? "inline" : "attachment"}; ${dispositionFilename(name)}`,
    inline: Boolean(inlineType),
    // Belt and braces for everything not on an allowlist: even if a
    // future change got the Content-Type wrong, an opaque-origin sandbox
    // with no permitted sources cannot script this origin. Not applied
    // to the inline branch, where it would break the PDF viewer for no
    // gain — those types cannot script in the first place, which is
    // exactly why they are on that allowlist.
    csp: inlineType ? undefined : "default-src 'none'; sandbox",
  };
}

/**
 * A filename lands in a response header, so a raw `"` or newline in it
 * is header injection. RFC 6266's two-parameter form: a scrubbed ASCII
 * `filename` every client understands, plus `filename*` carrying the
 * real UTF-8 name percent-encoded for the ones that do.
 */
function dispositionFilename(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The uploaded filename, validated — never sanitised into something
 * else. A browser sends the bare basename per the HTML spec; anything
 * carrying a separator is either an attack or a client confused enough
 * that guessing what it meant is worse than saying no. Silently
 * rewriting `../../etc/passwd` to `passwd` would write a file the caller
 * never asked for, in a folder they never named.
 *
 * `..`, `.`, and any all-dots name are rejected outright — `...` is not
 * a traversal on Linux but it is a filename nobody legitimately uploads,
 * and it is the shape that finds the one path-normalizer that treats it
 * as one.
 *
 * Honest note, found by attacking this and reading the parser
 * afterwards: `@fastify/busboy` already runs its own `basename()` over
 * the Content-Disposition filename, so a separator never actually
 * reaches here through the HTTP path — `../escaped.bin` arrives as
 * `escaped.bin`. The separator check below is therefore currently
 * unreachable rather than load-bearing. Kept deliberately: it is two
 * lines, it is the check that is correct if the parser is ever swapped
 * or its behaviour changes, and "the library happens to do it for us"
 * is not a property this endpoint should depend on silently.
 */
export function safeUploadName(filename: string): string {
  const name = (filename ?? "").trim();
  if (!name) throw new AttachmentError(400, "filename required");
  if (name.includes("\0")) {
    throw new AttachmentError(400, "unsafe filename: null byte");
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new AttachmentError(400, `unsafe filename: contains a path separator: ${name}`);
  }
  if (/^\.+$/.test(name)) {
    throw new AttachmentError(400, `unsafe filename: ${name}`);
  }
  if (name.toLowerCase().endsWith(".md")) {
    // `PUT /api/note` is the one write path for notes. Two write paths
    // for the same file type is how they drift — this one would skip
    // frontmatter parsing and reindexing as a note entirely, so an
    // uploaded `.md` would sit in the vault invisible to links, the
    // graph and the health check.
    throw new AttachmentError(400, "markdown uploads go through PUT /api/note, not here");
  }
  return name;
}

/**
 * Where an upload actually lands, in three independent checks, because
 * one check that is wrong is a traversal and two checks that are wrong
 * the same way still are:
 *
 *  1. `safeRelPath` — the string rule every write endpoint here already
 *     uses (rejects `..` segments, leading `/`, backslashes, NUL).
 *  2. `resolveInVault` — the same question asked of the resolved
 *     absolute path, after `resolve()` has collapsed the string.
 *  3. `realpath` on the deepest *existing* ancestor — the only one of
 *     the three that can see a symlink. A directory inside the vault
 *     symlinked to `/etc` passes both string checks and both absolute
 *     checks: lexically it is inside the vault, and only asking the
 *     kernel where it really goes reveals that it is not. Checked before
 *     `mkdir`, since mkdir through a symlink creates on the far side.
 *
 * Plus the checks that are about privilege rather than location — see
 * `assertUploadAllowed`.
 *
 * Returns the vault-relative path and the absolute path to write.
 */
export async function resolveUploadTarget(
  vaultDir: string,
  folder: string,
  filename: string,
  ignore: string[],
): Promise<{ rel: string; full: string }> {
  const name = safeUploadName(filename);

  let folderRel: string;
  try {
    folderRel = safeRelPath(folder ?? "").replace(/\/+$/, "");
  } catch {
    throw new AttachmentError(400, `unsafe folder: ${folder}`);
  }

  const rel = folderRel ? `${folderRel}/${name}` : name;
  assertUploadAllowed(rel, ignore);

  let full: string;
  try {
    full = resolveInVault(vaultDir, rel);
  } catch {
    throw new AttachmentError(400, `unsafe path: ${rel}`);
  }

  await assertRealPathInVault(vaultDir, dirname(full));
  return { rel, full };
}

/**
 * Two places an upload may not go. Neither is a traversal — in both, the
 * file lands squarely inside the vault and every location check above is
 * satisfied and right to be. They are privilege escalations, which is a
 * different question those checks do not ask. **Both were found by
 * attacking this endpoint, not by designing it.**
 *
 * 1. **Directories the index ignores** (`.git`, `.obsidian`,
 *    `node_modules`, `.trash`). `.git/config` can set `core.pager` or
 *    `core.fsmonitor` to a command git then runs; `.obsidian/plugins/`
 *    is JavaScript Obsidian executes on the owner's machine. The rule is
 *    also just coherent: the index ignores these paths, so an upload
 *    there is invisible in the UI by construction — an endpoint whose
 *    only honest outcomes are "does nothing useful" and "compromises the
 *    machine" should not exist. Matched per segment against the same
 *    `cfg.ignore` list `walk()` uses, so the two cannot drift.
 *
 * 2. **`.claude/` — the vault's control files.** This is the serious
 *    one, and it is the whole reason this function exists. Uploading a
 *    `trick.yaml` was demonstrated end to end against a running server:
 *    a manifest naming an *already-executable* script under
 *    `.claude/tricks/` plus `args` of the attacker's choosing, then
 *    `POST /api/tricks/<name>/run`, and the script ran with those
 *    arguments and wrote outside the vault.
 *
 *    That defeats `correr_script`'s stated security property
 *    (tricks-spec.md): "the client can only select *which* pre-declared
 *    script runs, never *what* runs." The property holds only because
 *    "pre-declared" meant a file a human or an agent with filesystem
 *    access wrote. An upload endpoint with no authentication in front of
 *    it makes declaring one an unauthenticated HTTP call, and the trust
 *    boundary evaporates without a single line of tricks.ts being wrong.
 *    `PUT /api/note` never opened this door because it only writes
 *    `.md`; this endpoint writes everything else, which is exactly the
 *    set that `trick.yaml` is in.
 *
 *    Nothing legitimate needs this. Roadmap #9's actual driver is skill
 *    output — a report filed next to the notes it is about — which lives
 *    in the note tree. Tricks are authored by `trick-creator` working in
 *    the vault, not uploaded over HTTP.
 */
export function assertUploadAllowed(rel: string, ignore: string[]): void {
  try {
    // The rule itself moved to `writepath.ts` during the seam-5 audit
    // (tricks-spec.md §13), because it turned out to be *the* rule and
    // not this endpoint's rule: `PUT /api/note` and the trick bridge ask
    // the same function now. Two copies of a privilege boundary is how
    // the next one gets fixed in one place and not the other.
    //
    // Deliberately no trick-data exception here. A trick's own data is
    // written through the bridge, which knows which trick is asking; an
    // upload has no such identity, so "anything on the tailnet may drop
    // a file into some trick's data folder" would be the whole hole
    // again in a smaller shape.
    assertNetworkWritable(rel, ignore);
  } catch (err) {
    if (err instanceof WritePathError) {
      throw new AttachmentError(400, `uploads into ${err.reason} are not allowed`);
    }
    throw err;
  }
}

/**
 * Walks up from `target` to the first path that exists, resolves it
 * through every symlink, and requires the answer to still be inside the
 * vault. Anything that does not exist yet cannot be a symlink, so the
 * deepest existing ancestor is the whole question.
 */
export async function assertRealPathInVault(
  vaultDir: string,
  target: string,
): Promise<void> {
  const root = await realpath(resolve(vaultDir));
  const rootWithSep = root.endsWith(sep) ? root : root + sep;

  let probe = resolve(target);
  for (;;) {
    try {
      const real = await realpath(probe);
      if (real !== root && !real.startsWith(rootWithSep)) {
        throw new AttachmentError(400, `path resolves outside the vault: ${target}`);
      }
      return;
    } catch (err) {
      if (err instanceof AttachmentError) throw err;
      const parent = dirname(probe);
      // Ran out of ancestors without finding anything that exists. Only
      // reachable if the vault root itself is gone, which is a bigger
      // problem than this request.
      if (parent === probe) {
        throw new AttachmentError(400, `cannot resolve path: ${target}`);
      }
      probe = parent;
    }
  }
}

/**
 * Refuse to write *through* an existing symlink, whatever it points at
 * and whatever `overwrite` says. Combined with the check above this
 * closes both symlink shapes: a symlinked directory in the path, and the
 * destination filename itself being a symlink planted earlier. Neither
 * can be created through this API — but the vault is a real directory
 * that a human, Obsidian, or a trick's script can also write to.
 */
export async function assertNotSymlink(full: string): Promise<void> {
  try {
    const st = await lstat(full);
    if (st.isSymbolicLink()) {
      throw new AttachmentError(400, "destination is a symlink");
    }
  } catch (err) {
    if (err instanceof AttachmentError) throw err;
    // Does not exist — which is the normal case for an upload.
  }
}
