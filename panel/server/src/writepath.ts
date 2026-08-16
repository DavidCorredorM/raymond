/**
 * One rule, one place: **what a network client may never write.**
 *
 * This module exists because the same rule was, until now, enforced in
 * exactly one endpoint (`assertUploadAllowed` in `attachments.ts`) and
 * assumed everywhere else. That asymmetry is the bug shape recorded in
 * `panel/docs/tricks-spec.md` §2.3 and in `docs/log.md` (2026-08-15):
 *
 * > A security property that depends on an unstated premise about *who
 * > can write a file* is not enforced. It is assumed.
 *
 * `correr_script` (tricks.ts) is safe only because *declaring* what runs
 * requires filesystem access. `.claude/` is not content — it is
 * executable configuration: `trick.yaml` chooses what `correr_script`
 * executes, `SKILL.md` is instructions a future agent run obeys,
 * `app/**` is code the panel hands a browser and tells it to run, and
 * `jobs/*.sh` is what cron executes overnight (README rule 4). A network
 * client that can place or modify any of those has escalated from "can
 * write a note" to "can run code on the box," with no authentication in
 * front of it (README rule 3).
 *
 * So every write path in this server calls this — the note write route,
 * the attachment upload route, and the trick bridge — and a new one that
 * forgets to is the next instance of the same bug. Adding a write
 * endpoint without a call to this function is the thing to catch in
 * review.
 *
 * The one exception, and it is narrow on purpose: a trick's own
 * `.claude/tricks/<name>/data/` folder. That is where a trick's notes and
 * its `estado.json` live (spec §7.3, §7.4). It contains no manifest, no
 * skill, no script and no app file, so nothing in it is executed by
 * anything — it is the only sub-path of `.claude/` that is data rather
 * than configuration. The caller must name the trick explicitly; there is
 * no way to ask for "some trick's data folder."
 */

/** Thrown by `assertNetworkWritable`. `reason` is the refused prefix, for the caller's message. */
export class WritePathError extends Error {
  constructor(
    /** The thing that was refused, e.g. `.claude/` or `.git/` — safe to show a caller. */
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}

/** `.claude/tricks/<name>/data` — the one writable path under `.claude/`. */
export function trickDataDir(trick: string): string {
  return `.claude/tricks/${trick}/data`;
}

/** `child === parent`, or `child` is inside `parent`. Both vault-relative, POSIX, no trailing slash. */
export function isUnder(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * May a network client write `rel` (vault-relative, already through
 * `safeRelPath`)? Throws `WritePathError` if not.
 *
 * `allowTrickData` opts in to the single exception above, for one named
 * trick. Everything else under `.claude/` is refused whatever the caller
 * is, and so are the directories the index ignores — `.git/config` can
 * name a command git will run, `.obsidian/plugins/` is JavaScript
 * Obsidian executes on the owner's machine, and the index never shows
 * either, so a write there is invisible by construction.
 */
export function assertNetworkWritable(
  rel: string,
  ignore: string[],
  allowTrickData?: string,
): void {
  if (!rel || rel === "." || rel === "/") {
    throw new WritePathError("", `not a writable path: ${rel}`);
  }
  const segments = rel.split("/");
  if (segments.includes("..") || rel.includes("\0")) {
    // Belt: every caller runs safeRelPath first. This is the check that
    // is still correct if a future caller forgets.
    throw new WritePathError("..", `unsafe path: ${rel}`);
  }
  for (const seg of segments) {
    if (ignore.includes(seg)) {
      throw new WritePathError(`${seg}/`, `writes into ${seg}/ are not allowed`);
    }
  }

  if (rel !== ".claude" && !rel.startsWith(".claude/")) return;

  if (allowTrickData && isUnder(rel, trickDataDir(allowTrickData))) return;

  throw new WritePathError(".claude/", "writes into .claude/ are not allowed");
}
