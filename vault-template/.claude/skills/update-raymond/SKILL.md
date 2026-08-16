---
name: update-raymond
description: Pull the latest Raymond app code and vault-template improvements from the public base package, rebuild and restart the panel only if needed, and sync machinery files into this vault without ever touching anything the deployment has customized. Use when the user asks to update, upgrade, or check for updates to Raymond, wants to preview what an update would do, or asks what's scheduled to auto-update.
---

# Update Raymond

`docs/roadmap.md` §13 is the spec. Two things get pulled forward, for two
different reasons, and this skill is the front door to both:

1. **The app code** (`~/raymond`) — `scripts/update-raymond.sh`. A real
   `git clone`, fast-forwarded only, rebuilt and restarted only if the
   pull actually touched `panel/`.
2. **The vault template** (`~/raymond-brain`, this vault) —
   `scripts/sync-vault-template.py`. A different, harder problem: this
   vault has no git ancestry to the base package, some of what it holds
   is machinery nobody customizes and some is this deployment's own
   forever, and the two must never be confused (see §3).

Both are plain scripts — deterministic, no model, no cost — the same
reasoning `schedule-job` §1 and `mender` §1 already make: an
agent run for something a script can decide is slower, costs money, and
gives a different answer on Tuesday than it gave on Monday. **This
skill's job is to run them and explain the result in plain language**,
not to re-implement their logic. If you find yourself reasoning about
whether a file is machinery or seed, stop — that answer lives in
`UPDATE-MANIFEST.md` in the base checkout, read by the sync script, not
decided fresh by a session.

## 1. Preview first if there's any doubt

Both scripts take `--dry-run`: fetch, compute, and report exactly what a
real run would do — pull, rebuild, restart, sync, conflict — without
writing, building, restarting or committing anything. Offer this
whenever the user seems unsure, is running this for the first time, or
just asks "what would updating do?":

```sh
~/raymond/scripts/update-raymond.sh --dry-run
~/raymond/scripts/sync-vault-template.py sync --dry-run
```

Read the output back in plain language — what commits are available,
whether a rebuild would happen, whether anything would sync or conflict
— not the raw script text. Someone who has never seen this repo's code
should be able to decide "yes, do it" from your summary alone.

## 2. Running it for real

```sh
~/raymond/scripts/update-raymond.sh
~/raymond/scripts/sync-vault-template.py sync
```

Run the app-code update first, the vault sync second — order matters
only a little (the sync script is what ships the *next* version of
itself and of `_tools/mender.py`, so pulling app code first means a
same-day scheduled run uses the newer tool to sync with), but nothing
breaks if they happen the other way. Run **both**, even if the first one
stops with an error: they update genuinely separate things (app code vs.
vault content) and one failing tells you nothing about whether the other
would have.

After running, tell the user, every time, in this order:

1. **What changed in the app code** — new commits pulled (or "already up
   to date"), whether the panel got rebuilt and restarted, and if the
   build failed, that the *old* panel is still running (a failed build
   never restarts into something broken — see the script's own comments)
   and that a re-run will retry automatically.
2. **What changed in this vault** — which machinery files got updated
   (and that every one of those is a normal, revertable commit —
   `git log` in this vault shows it), and whether any seed files (things
   like `CLAUDE.md`, `conventions.md`, `panel/home.md`, folder indexes —
   the deployment's own content, see `UPDATE-MANIFEST.md`) now differ
   from what the base package ships. Seed differences are never applied
   automatically — say what changed upstream so the user can decide
   whether to copy any of it in by hand.
3. **Anything that needs a decision** — a conflict card (see §3), same
   shape and same place as a `mender` finding: `steward/`,
   `tipo: hallazgo`. If the `mender` trick is installed, these
   cards already render there — same UI, same "type what you want and
   set decision" flow, because the fields are literally the same five.
4. **Nothing is urgent.** A pull that stops for a real reason (a build
   failure, local commits on `~/raymond` that should never be there) or
   a conflict card that needs an answer both wait fine until someone
   looks — nothing here is a "the panel is down" emergency. Say so, so
   nobody feels rushed into answering a card without reading it.

## 3. The conflict-detection problem, explained for whoever asks

Someone will eventually ask "how do you know it's safe to overwrite
this file automatically?" The honest answer, in plain language:

Every machinery file gets a fingerprint (a hash of its exact content)
recorded the moment this vault last synced it. Next time, the sync
script computes three fingerprints — what this vault has now, what the
base package has now, and what this vault had *at the last sync* — and
only overwrites the file when this vault's copy still matches that last
recorded fingerprint. If it doesn't match, this vault's copy was edited
since the last sync — by a person, by an agent, however — and the
script stops and asks instead of guessing. "Different from the base
package" and "edited in this vault" are different facts, and the whole
point of recording that fingerprint is being able to tell them apart
without one silently destroying the other. Full detail, including why
this beats trying to answer the question from git history alone: the
module docstring at the top of `scripts/sync-vault-template.py`.

## 4. Answering a conflict card

Same as any `mender` finding — a note in `steward/`,
`tipo: hallazgo`, five fields to fill in:

- `respuesta:` — plain words. "take theirs" (or "upstream"/"base
  package") means overwrite this vault's copy with the base package's
  newer version. Anything else, including leaving it blank, means keep
  this vault's version — the sync stops flagging that specific
  difference either way.
- `decision:` — `aplicar` to carry out what `respuesta:` says on the
  next sync run, `descartar` to close the card without changing
  anything (raised again later only if the file drifts further).
- `estado:` — set to `respondido` once the above two are filled in.

The next `sync-vault-template.py sync` run — scheduled or manual —
reads it and acts before doing anything else. Nothing else about that
file changes while its card is open.

## 5. Schedule it with `schedule-job` — don't build a second scheduler

This skill is what a human runs by hand and what a cron job runs
unattended, and installing the unattended part is **`schedule-job`'s**
job, the same way `mender` hands its own schedule off rather than
inventing a crontab-writer of its own. Do not write cron entries here.

**Kind: script**, not agent — both underlying scripts are fully
deterministic (a git fetch, a hash comparison, a keyword check on an
already-answered card), so there is no judgment step that needs a model
in the loop, and `schedule-job` §1's own advice applies directly: a
script is cheaper, faster, and gives the same answer every time.

**Cadence: daily**, by default, at an hour before `mender`'s own
`0 6 */3 * *` (e.g. `0 5 * * *` — 05:00) so a same-morning mender run
picks up a same-morning tool update rather than the reverse. Reasoning
for daily specifically, since `schedule-job` §2 asks for it to be
justified rather than assumed:

- A `git fetch` against a small, infrequently-changing repo is cheap
  enough to run daily forever — there's no real cost argument for
  spacing it out further, unlike an agent job.
- The base package is one maintainer's boutique tool, not a
  fast-moving dependency; commits land in bursts around a working
  session, not continuously. Daily means at most one day's delay behind
  a real release, which is a reasonable bound for something nobody is
  otherwise watching.
- Sub-daily (hourly, say) buys nothing here: nothing rebuilds or
  restarts unless something actually changed, so extra runs are just
  extra no-ops, not extra freshness that matters.
- Weekly was the other real option and was rejected: seed diffs and
  conflict cards are how a deployment finds out the base package moved
  at all, and a week of silence between checks is a week where "did an
  update happen" has no answer without SSHing in and running it by hand.

The runner's actual command — hand this to `schedule-job` §3a as
`<THE ACTUAL COMMAND>`, combining both scripts' exit codes so the job
note's `Runs` table reflects either one failing:

```sh
$HOME/raymond/scripts/update-raymond.sh
RC1=$?
$HOME/raymond/scripts/sync-vault-template.py sync
RC2=$?
exit $(( RC1 > RC2 ? RC1 : RC2 ))
```

Job name: `update-raymond`. Output: nothing lands under a single path —
app-code changes land in `~/raymond` (not vault content at all, hence no
vault path), and vault-template changes land wherever the manifest says
each machinery path already lives, one commit per run in **this
vault's own** `git log`. Tell `schedule-job` that directly; there is no
single "output folder" to name for this job, which is expected and not
a gap — see `UPDATE-MANIFEST.md`'s "Out of scope" section for why a
sync mechanism that only ever touches paths it already knows about is
the safe design, not an incomplete one.

Verify it the way `schedule-job` §6 always asks for: run the exact
command above with `env -i`, confirm both scripts' log lines appear
(`~/.raymond/logs/update-raymond-*.log` for the app-code side,
whatever `sync-vault-template.py` printed for the vault side), and check
`.claude/template-sync.md` in this vault gained a `Runs` row if anything
actually synced.

## 6. What this skill deliberately does not do

- **No retry loop, no backoff.** A stopped run (build failure, local
  commits, an unreachable remote) just waits for the next scheduled
  tick or a manual re-run — same as every other scheduled job in this
  vault (`docs/roadmap.md`, "Opened by rule 4's reversal, deliberately
  not done").
- **No automatic resolution of a conflict card beyond what `respuesta:`
  says.** A card left `estado: abierto` forever is inert, not urgent —
  it will not be auto-answered by a future run guessing what the user
  probably meant.
- **No touching `panel/server/` or `panel/web/` source directly.** This
  skill only ever runs the two scripts above; it does not hand-edit app
  code, and neither script does either — `update-raymond.sh` only ever
  runs `git merge --ff-only` plus the documented build commands.
