#!/usr/bin/env bash
#
# Pull the base package (~/raymond) forward, fast-forward only, and
# rebuild + restart the panel if that pull actually touched panel/.
# docs/roadmap.md §13 is the spec this implements.
#
# Fast-forward only, never a real merge: ~/raymond is machinery on a
# deployment (README rule 5 — no local edits are expected in panel/,
# scripts/, docs/), so a merge commit here would mean either a genuine
# problem (someone edited the checkout directly) or a bug in this
# script. Neither should be resolved automatically; both should stop
# loudly and wait for a human. `git merge --ff-only` already refuses on
# its own when a real merge would be needed — this script does not add
# a fallback path that bypasses that refusal.
#
# Safe to re-run, and safe with nothing to do: a second run with no
# upstream change is a clean no-op (exit 0, one log line), not an error.
#
#   ./update-raymond.sh              run it
#   ./update-raymond.sh --dry-run    fetch and report; pull, build and
#                                     restart nothing
#
set -uo pipefail
# Not -e: every failure path here needs to log a line and exit with a
# specific code, not just die mid-script with no trail — rule 4 ("scheduled
# unattended runs... nothing it did is invisible the next morning") applies
# to failures at least as much as to successes.

RAYMOND_DIR="${RAYMOND_DIR:-$HOME/raymond}"
LOG_DIR="${RAYMOND_UPDATE_LOG_DIR:-$HOME/.raymond/logs}"
# Which commit's panel/ was last built *successfully*. Not the same
# question as "which commit is HEAD at" — see the BUILD_REF logic below
# for the bug this exists to avoid: a failed build still leaves HEAD
# fast-forwarded, so "nothing new to pull" is not the same as "the
# running panel matches what's on disk." Kept outside $RAYMOND_DIR
# entirely (same reason as LOG_DIR): it is operational state about this
# script's own runs, not app code, and a stray untracked file inside a
# fast-forward-only clone is one thing fewer to ever have to reason about.
BUILD_MARKER="${RAYMOND_BUILD_MARKER:-$HOME/.raymond/last-build-commit}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

mkdir -p "$LOG_DIR" "$(dirname "$BUILD_MARKER")"
LOG="$LOG_DIR/update-raymond-$(date +%Y-%m).log"
STAMP=$(date -Iseconds)
START=$(date +%s)

# Every line goes to the log AND stderr — stderr so a human running this
# by hand sees it live, the log so cron's run (which nobody is watching)
# leaves the same trail. This mirrors the schedule-job skill's own runner
# skeleton (§3a): the log is the file trail, not stdout that cron discards.
log() { printf '%s  %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG" >&2; }

finish() {
  local code=$1
  local dur=$(( $(date +%s) - START ))
  log "run finished  exit=$code  ${dur}s"
  exit "$code"
}

$DRY_RUN && log "=== $STAMP  (--dry-run: reporting only, nothing will be pulled, built or restarted) ===" \
         || log "=== $STAMP ==="

# Never let two runs overlap — a slow rebuild colliding with the next
# scheduled tick is exactly the failure schedule-job §3a's flock guards
# against, and it applies here for the same reason.
LOCK="$LOG_DIR/.update-raymond.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  log "skipped: a previous run is still going"
  exit 0
fi

# --- preflight ---------------------------------------------------------

if [[ ! -d "$RAYMOND_DIR" ]]; then
  log "STOP: no directory at $RAYMOND_DIR"
  finish 1
fi

cd "$RAYMOND_DIR" || finish 1

if [[ ! -d .git ]]; then
  # Angela's deployment is exactly this today (deployments/angela.md,
  # 2026-08-15): tar-deployed, no git ancestry to the public remote.
  # Converting her is deployment-specific work (roadmap §13's own last
  # bullet), not something this script does silently on her behalf.
  log "STOP: $RAYMOND_DIR is not a git clone (tar-deployed, or a stray"
  log "      directory). This script only updates a real 'git clone"
  log "      https://github.com/DavidCorredorM/raymond.git' checkout."
  log "      Converting one is deployment-specific work — see"
  log "      docs/roadmap.md §13's last bullet."
  finish 1
fi

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [[ -z "$BRANCH" ]]; then
  log "STOP: HEAD is detached in $RAYMOND_DIR — not on a branch that"
  log "      tracks a remote. A human needs to look at this by hand."
  finish 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  log "STOP: no 'origin' remote configured in $RAYMOND_DIR"
  finish 1
fi

# --- fetch ---------------------------------------------------------------

if ! git fetch origin --quiet 2>>"$LOG"; then
  log "STOP: git fetch origin failed — network, DNS, or the remote is"
  log "      unreachable. Nothing local was touched."
  finish 1
fi

BEFORE=$(git rev-parse HEAD)
UPSTREAM="origin/$BRANCH"

if ! git rev-parse --verify "$UPSTREAM" >/dev/null 2>&1; then
  log "STOP: no $UPSTREAM on the remote — local branch '$BRANCH' has no"
  log "      upstream counterpart to fast-forward against."
  finish 1
fi

AHEAD_BEHIND=$(git rev-list --left-right --count "HEAD...$UPSTREAM")
LOCAL_AHEAD=$(awk '{print $1}' <<<"$AHEAD_BEHIND")

if [[ "$LOCAL_AHEAD" -gt 0 ]]; then
  # This should never happen on a deployment (README rule 5: scripts/,
  # panel/, docs/ are machinery, no local edits expected) — which is
  # exactly why it gets a loud stop instead of a quiet workaround. Both
  # options that "fix" this automatically are wrong: force-reset throws
  # away whatever those commits are without anyone having looked at
  # them, and a real merge is the thing this script exists specifically
  # not to do (see the header comment).
  log "STOP: $RAYMOND_DIR has $LOCAL_AHEAD local commit(s) not on"
  log "      $UPSTREAM. Refusing to force anything. Look at:"
  log "        git -C $RAYMOND_DIR log --oneline $UPSTREAM..HEAD"
  log "      then either push them somewhere safe or reset by hand."
  finish 2
fi

REMOTE_AHEAD=$(awk '{print $2}' <<<"$AHEAD_BEHIND")

# BUILD_REF is the commit the marker says panel/ was last built at
# successfully. A missing marker (first run of this script ever, on a
# checkout that was built manually per README's "Getting a deployment
# running") means "assume the current checkout is already built" —
# BEFORE, not AFTER, since nothing has fast-forwarded yet at this point.
#
# That assumption is written to disk immediately, not just held in a
# shell variable — if it stayed in-memory only and *this very run* then
# pulled a new commit and failed its build, the next run would have no
# marker file at all, fall back to "assume BEFORE" again, and this time
# BEFORE would be the *new, unbuilt* HEAD (already fast-forwarded), not
# the last one that actually ran. That silently turns a retry into a
# permanent skip — caught by the scratch verification this script
# shipped with, which is exactly the "run twice, no upstream change
# between runs" case roadmap §13 asks to check, except with a failure
# in between rather than nothing happening.
if [[ ! -f "$BUILD_MARKER" ]]; then
  $DRY_RUN || echo "$BEFORE" > "$BUILD_MARKER"
  BUILD_REF="$BEFORE"
else
  BUILD_REF=$(cat "$BUILD_MARKER")
fi

if [[ "$REMOTE_AHEAD" -eq 0 && "$BUILD_REF" == "$BEFORE" ]]; then
  log "OK  already up to date at $BEFORE — nothing to pull, nothing owed to the build"
  finish 0
fi

if $DRY_RUN; then
  if [[ "$REMOTE_AHEAD" -gt 0 ]]; then
    log "DRY-RUN  $REMOTE_AHEAD commit(s) available on $UPSTREAM:"
    git log --oneline "HEAD..$UPSTREAM" | while IFS= read -r line; do log "         $line"; done
  else
    log "DRY-RUN  nothing new to pull, but the last successful build was at"
    log "         $BUILD_REF and HEAD is $BEFORE — a real run would retry the build"
  fi
  if git diff --name-only "$BUILD_REF" "$UPSTREAM" | grep -q '^panel/'; then
    log "DRY-RUN  panel/ differs between the last successful build and $UPSTREAM — a real run would rebuild + restart"
  else
    log "DRY-RUN  nothing under panel/ changed since the last successful build — a real run would skip rebuild + restart"
  fi
  finish 0
fi

# --- fast-forward, only if there's something to pull ----------------------

AFTER="$BEFORE"
if [[ "$REMOTE_AHEAD" -gt 0 ]]; then
  if ! git merge --ff-only "$UPSTREAM" >>"$LOG" 2>&1; then
    log "STOP: fast-forward refused by git even though the ahead/behind"
    log "      check above said it should work — something changed"
    log "      between the two checks, or the working tree is dirty."
    log "      Nothing else in this run will proceed."
    finish 2
  fi
  AFTER=$(git rev-parse HEAD)
  log "OK  fast-forwarded $BRANCH: $BEFORE -> $AFTER ($REMOTE_AHEAD commit(s))"
else
  log "OK  already up to date at $BEFORE — nothing to pull, but retrying an earlier failed build"
fi

# --- rebuild, only if panel/ actually moved since the last successful build
#
# Compared against BUILD_REF, not BEFORE: BEFORE is "where HEAD was when
# this run started", which is the wrong reference the run after a build
# failure — HEAD was already fast-forwarded then, so comparing against
# it would see no new commits and skip the retry entirely (this was a
# real bug here, caught by the scratch verification this script shipped
# with: a failed build never got retried because the next run saw
# "nothing to pull" and stopped). BUILD_REF is "where the panel that is
# actually running was last built from", which is the comparison that
# matters.
#
# The literal test is "anything under panel/", not just panel/server or
# panel/web — docs/roadmap.md §13 says "rebuilds... only when something
# under panel/ actually changed", and that is what is implemented. A
# panel/docs/-only change triggers a rebuild it doesn't strictly need;
# accepted rather than second-guessing the spec's own boundary.
if git diff --name-only "$BUILD_REF" "$AFTER" | grep -q '^panel/'; then
  log "panel/ changed between the last successful build ($BUILD_REF) and $AFTER — rebuilding"

  BUILD_OK=true
  if ! ( cd panel/server && npm install && npx tsc -p tsconfig.json ) >>"$LOG" 2>&1; then
    BUILD_OK=false
  fi
  if $BUILD_OK && ! ( cd panel/web && npm install && npm run build ) >>"$LOG" 2>&1; then
    BUILD_OK=false
  fi

  if ! $BUILD_OK; then
    log "BUILD FAILED — see $LOG for the npm/tsc output. NOT restarting"
    log "      raymond-panel: better to keep serving the old, working"
    log "      build than to restart into a broken one. The build marker"
    log "      is left at $BUILD_REF (not bumped to $AFTER), so the next"
    log "      run — even with nothing new to pull — retries this build"
    log "      instead of silently believing it's current."
    finish 3
  fi

  echo "$AFTER" > "$BUILD_MARKER"
  log "build OK — restarting raymond-panel"
  if systemctl --user restart raymond-panel >>"$LOG" 2>&1; then
    log "OK  raymond-panel restarted"
  else
    RC=$?
    log "RESTART FAILED (rc=$RC) — the new build is on disk but the"
    log "      running process is still the old one. Check:"
    log "        systemctl --user status raymond-panel"
    log "        journalctl --user -u raymond-panel -e"
    finish 4
  fi
else
  echo "$AFTER" > "$BUILD_MARKER"
  log "OK  nothing under panel/ changed since the last successful build — rebuild and restart skipped"
fi

finish 0
