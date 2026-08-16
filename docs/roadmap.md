---
scope: Raymond, the base package (this repo, including panel/), not any single deployment
---

# Roadmap — deferred base-package work

Decisions and gaps that apply to Raymond generically, deferred rather than
lost. Not Angela-specific — anything about her vault's content or her
SIGRA skills lives in her deployment, not here.

## 5. Git remote for the vault

This is about a **deployment's own vault** (`~/raymond-brain`), which
must stay private — it is one customer's real notes. Not to be confused
with the base package's own remote, which is a different repo, decided
2026-08-15, and is now public read-only (see §13 and README, "Getting a
deployment running").

Right now a vault's git history lives only on the machine it was created
on. A disk failure loses all of it — notes and history both. Needs:

- Decide the default: does the bootstrap script prompt for a remote, or
  is this left entirely to the user?
- Document the private-repo requirement prominently — a vault is
  personal notes by default.
- Consider whether the panel should surface "no remote configured" as a
  visible warning, since a silent gap here is the dangerous kind.

## 6. Backup, distinct from git

Git is version control, not backup — it doesn't protect against the
machine itself dying, and a sync mechanism (once phase 2 picks one)
propagates deletions and corruption exactly as faithfully as edits.
Needs a real off-box target and schedule. `restic` was the working
assumption in `01-decisions.md`; not yet designed or scripted.

## 7. Dashboards-as-files spec, agent inbox, proposal/approve flow

The architectural principle is settled (see `panel/README.md`): a
dashboard is a file with a frontmatter widget spec, an agent adds a todo
or a message by writing a file, nothing lives only in the app's memory.

**Partially designed now** — `panel/docs/frontend-implementation-plan.md`
§5 specifies the widget spec (`query`, `stale`, `count`, `vault-health`,
`backlinks`, plus a phase-4 `actions` kind), with worked YAML examples,
and reasons through why it's a flat filter object rather than a query
language (this app has no auth in front of it — a query language is
arbitrary power handed to anything that can write a file).

**Re-anchored 2026-08-15, when README rule 4 was reversed.** This item
used to be load-bearing: an agent *had* to propose because unattended
application wasn't allowed. That's no longer true — an agent, scheduled
or not, may write to the vault directly, and what it owes is a file trail
(§10, and the `schedule-job` skill). A proposal/inbox flow is still worth
building, but as a **choice** for output someone wants to skim first, not
as the gate everything passes through. That changes its priority, not its
design.

Still not designed:

- Where an agent's proposals land when a user does want that flow —
  `inbox/` vs a git branch, and what the panel does with either
- The approve/reject UI and what "reject" does to the underlying file
- Conflict resolution — the plan explicitly leaves this out of phase 1;
  writes are full-file overwrites with no ETag, so two tabs editing the
  same note will clobber each other

## 8. Field names are English in prose, Spanish in the one field that matters

`vault-template/CLAUDE.md` and its tools (`vault-lint`, `vault-search`,
`linkcheck.py`, the panel's `/api/health/vault`) are written in English
but all hardcode **`cuando-usar`** — Spanish — as the retrieval-key field
name, because that's what got built and verified against Angela's real
vault. A fresh English-language deployment inherits a Spanish field name
with no indication why.

Found and partially fixed 2026-08-15: `vault-template/CLAUDE.md` had
Angela's specific `companies/icpp/`, `companies/sigra/` structure
hardcoded as if it were the generic default, and the shipped
`panel/home.md` was in Spanish prose. Both fixed — the structure section
is now generic guidance rather than one deployment's actual folders, and
`home.md`'s prose is English. The field-name coupling itself (documented
in an earlier log entry as "the abstraction is deliberately not built
yet") was not — fixing it means either parameterizing every tool's field
name or shipping two schema variants, and doing that correctly needs more
than the time available in the pass that found it.

Until fixed: **any new deployment inherits `cuando-usar` as the literal
field name**, regardless of the vault's language. Rename it consistently
across `_templates/`, `_tools/*`, and `panel/server/src/index.ts`'s
health check if a deployment wants a different name — same instruction
as before, now written down instead of only implied.

## 9. Non-markdown files — upload, download, and browsing them at all

Found 2026-08-15, while writing up Angela's deployment notes; the two
open questions it raised were **decided the same day**, below. This is
now a spec to build, not a design discussion.

### The gap

The panel currently has **zero** support for anything that isn't a `.md`
file:

- `walk()` in `vault.ts` only ever collects files ending `.md` — a PDF or
  Excel file sitting inside the vault is invisible to the index, never
  appears in `/api/notes`, the tree, or anywhere else in the UI.
- No generic file-serving endpoint exists. `@fastify/static` only serves
  the panel's own compiled frontend (`web/dist`), never vault content.
- No upload path of any kind.

This matters now specifically because it didn't before: tricks can run
scripts (`correr_script`, shipped 2026-08-15) and a real skill
regenerating a report is exactly the kind of thing that produces a PDF or
an Excel file someone will want to actually look at. Right now that
output is reachable by SSH only, regardless of where it lands — and one
real deployment (Angela's) already has this happening today: 10 ported
SIGRA skills producing real Excel/PDF/HTML output nobody can see except
over SSH.

### Decided: attachments live inside the vault, not a side folder

Two shapes were on the table; **shape 1 is the decision**, made
2026-08-15: non-markdown files are indexed, served, and uploadable **as
part of the vault**, the same tree as everything else — not a second,
panel-aware exception for specific external folders. This keeps "the
vault is the only thing the panel knows about" (README, "The vision,"
rule 1) intact rather than forking it, and it means real deliverables get
git history for free, same as a note does.

Explicitly **rejected**: the panel learning to browse fixed external
folders (e.g. `~/entrada`, `~/salidas`) alongside the vault. Angela found
that pattern confusing in practice — "she will get lost with that" — and
it would have made the panel's file-system knowledge a two-tier thing
(the vault, plus some other blessed folders) instead of one tree. Don't
resurrect this shape without a real reason the decided one can't work.

### Decided: skills write into the vault, organized by topic — not a dump folder

**A second, related requirement, not just a consequence of the first:**
skill and trick output must not land in one generic output folder at
all — `~/salidas`, or an `attachments/` catch-all, or anything
equivalent. A monthly strategy dashboard belongs near the strategy notes
it's about; a competitor financial snapshot belongs near the competitor
notes. **The destination is chosen by what the content is, the same way
a human filing that report by hand would choose a folder** — not by
which tool produced it.

Concretely, for the one real deployment that already has this problem:
the 10 SIGRA skills currently write everything to `~/salidas/` via
`_lib/rutas.py`'s `rutas.SALIDAS`. That constant, and every skill script
using it, needs to change to write to a topic-appropriate path under
`companies/sigra/` (or `companies/icpp/`, or `holding/`) instead — e.g.
`/tablero-de-gerencia`'s monthly package belongs under
`companies/sigra/00-Estrategia/`, near `seguimiento-objetivos-2026.md`,
not in a folder named after the fact that it's "output." This is
deployment-specific work (that vault's own `_lib/rutas.py` and its
skills), flagged here so it isn't lost, tracked concretely in that
vault's own `panel/pendientes.md`.

For the base package: this is a principle any future skill or trick
should follow from the start, not a rule specific to SIGRA. Worth adding
to `trick-creator`'s guidance once this is built — a trick whose
`correr_script` produces a file should declare *where*, and the
principle is "next to what it's about," not "wherever's convenient."

### What to build

**Backend:**
- Extend `walk()`/`buildIndex` (or add a parallel, lighter index) to
  include non-`.md` files. They don't have frontmatter, a `slug`, or
  wiki-links, so they don't fit the existing `Note` type as-is — a
  smaller `Attachment { path, size, mtime }` shape is probably right,
  not a forced fit into `Note`.
- A download endpoint serving raw bytes with the correct `Content-Type`
  inferred from extension.
- An upload endpoint (`multipart/form-data`). Apply the same path-safety
  discipline every write endpoint here already has
  (`safeRelPath`/`safeScriptPath` pattern) — an upload endpoint is a new
  way to place a file on disk and deserves the same rigor `correr_script`
  got, including a re-verification pass by whoever builds it, the same
  way `correr_script` was independently attacked (path traversal, this
  time via filename) before being trusted.
- Decide and enforce a size limit up front — don't discover it via an
  accidental large upload.

**Frontend:**
- The note tree already groups by folder — extend it to show non-`.md`
  entries too (icon by type, no markdown rendering attempted on them), a
  download link, an upload control scoped to the current folder (so an
  upload lands where the user is looking, which is itself a small
  instance of the "organize by what it is, not a dump folder" principle
  above).
- A PDF or image could preview inline; most other types just download.

## 10. A jobs view in the panel

Opened 2026-08-15 by the reversal of README rule 4. Scheduled unattended
runs are now a shipped feature (`vault-template/.claude/skills/schedule-job/`),
and the rule that makes them acceptable is that every run leaves a file
trail. **Today that trail is only readable by SSHing in or opening
`.claude/jobs/` in the note tree** — which is most of the way to the
failure the rule exists to prevent. The panel should show it.

What it needs, all of it reading files that already exist — no new state,
no database, consistent with rule 1:

- **A jobs list**: every `.claude/jobs/*.md` with a `job:` block in its
  frontmatter — name, schedule (rendered human-readably, not raw cron),
  kind (`agent` / `script`), and `enabled`.
- **Last run and last outcome**, from the run table each runner appends
  to its own job note (`| timestamp | exit code | duration |`). The
  parsing target is a markdown table in a note, deliberately — it is
  the same file a human reads.
- **Failure is the thing to surface.** A job whose most recent run exited
  non-zero, or that hasn't run since well past its schedule, should be
  visible without anyone going looking. A silently dead job is the
  expensive failure mode.
- **A tail of the raw log** for one job — this is the `log-tail` widget
  already sketched at `panel/docs/frontend-implementation-plan.md` §4,
  phase 5, which until now had nothing to point at.

Open questions, not decided here:

- Whether this is a route (like Tricks) or a widget kind usable in any
  dashboard. A widget composes better; a route is more discoverable. It
  could be both, the widget first.
- Whether the panel ever *writes* here — a pause/resume toggle means the
  panel editing a crontab, which is a materially different trust boundary
  from rendering a note, and one this app's no-auth reality (rule 3) says
  to think hard about. Read-only first is the obvious v1.

## Opened by rule 4's reversal, deliberately not done

Recorded so these are choices rather than oversights:

- **No `programacion` → cron materialization in the panel or server.**
  A trick can declare a schedule; installing it is `schedule-job`'s job,
  run by a human or agent in a session. Nothing on the server writes a
  crontab, and nothing should until there's a reason.
- **No retry, backoff or alerting.** A failed run is a non-zero exit code
  in a log and a row in a note. No email, no Telegram, no "job failed 3
  times" escalation. Adding notification means picking a channel and
  holding a credential, which is its own decision.
- **No catch-up after downtime.** Cron simply skips a run if the machine
  was off (see the `schedule-job` skill's cron-vs-systemd note). If a job
  ever genuinely must catch up, that job wants a systemd timer with
  `Persistent=true`, and the registry would need to describe both
  primitives rather than assuming cron.
- **No per-job cost accounting.** `--max-budget-usd` caps a single run;
  nothing sums what a job cost over a month. Worth having before anyone
  schedules something expensive hourly.
- **Bootstrap doesn't create any job.** A job is personal, not
  machine-level (`docs/08-server-setup.md`). A tempting default — nightly
  `vault-lint`, or an auto-commit-and-push of the vault — was left out
  on purpose: a fresh install should not start doing things nobody asked
  for.

## 11. Tricks v2 — deferred pieces of the mini-app design

Opened 2026-08-15 by the tricks v2 spec (`panel/docs/tricks-spec.md`).
The design is settled and its build order is in that document's §13; these
are the parts deliberately left out of it.

- **Cross-browser verification.** Every security property in the spec was
  verified in **Chrome 151 on macOS only**. Firefox and Safari are
  `assumed:`. The `Sec-Fetch-*` entry gate is the piece to re-check first:
  it fails closed, so a browser that reports those headers differently
  presents as "the trick doesn't render," not as a security hole. Do this
  before anyone relies on a trick from a phone.
- **A push transport.** Freshness is polling (5 s while visible), because
  the panel has no SSE or WebSocket today. A scheduled job writing a
  trick's data is the case this exists for (rule 4), and polling is a
  placeholder, not the answer. SSE slots in behind the same
  `datos.cambiaron` event with no protocol change.
- **Limits on `app/`.** No size or file-count ceiling is specified. Pick
  one before a trick ships a 40 MB asset, not after.
- **Retiring the v1 renderer.** `TrickRenderer`, `ListaControl`,
  `ReadOnlyField` and the v1 branches of `TrickAction` stay for one release
  as a labelled compatibility path, then get deleted along with the
  migration section of the spec. Two systems rendering tricks is the drift
  this repo keeps recording as a bug; leaving it un-scheduled is how it
  becomes permanent.
- **A capability for reading outside a trick's own scope.** Every
  `vault.*` capability is folder-scoped by design, and a whole-vault
  `carpeta` is refused at validation time. A trick that genuinely wants to
  read across the vault — "show me everything tagged #wip" — has no path
  today and should probably be a dashboard widget instead. If that turns
  out to be wrong, the answer is a *query*-shaped capability with a fixed
  filter, not a wider `carpeta`.

## 12. Vault steward — what the first version deliberately does not do

Opened 2026-08-15 with `vault-template/conventions.md`,
`vault-template/_tools/steward.py`, the `vault-steward` skill and the
trick of the same name. The design is in the skill; these are the gaps.

- **The job is not installed anywhere.** The trick declares
  `programacion: 0 6 */3 * *` and the skill hands off to `schedule-job`,
  which is correct — the base package must not write a crontab — but it
  means no steward run has ever happened unattended on any machine. The
  first real deployment to install it is the first real test of the
  brief, and of whether ten judgment cards per run is the right cap.
- **`*/3` is not "every three days".** Day-of-month `*/3` fires on days
  1, 4, 7 … 28, 31 and resets, so month boundaries give a one- or
  two-day gap. Accepted deliberately: the alternative is a runner that
  reads its own last-run date out of the job note, which is more moving
  parts than "roughly every three days" is worth. Revisit only if
  something downstream actually needs even spacing.
- **Nothing measures whether the cards get answered.** A queue that grows
  monotonically is the obvious failure mode of this whole idea, and there
  is no signal for it today. The cheapest version is a line in the run
  report — "12 open, 9 of them older than a month" — before anything
  fancier.
- **Card priority is by kind, not by consequence.** `KIND_ORDER` puts
  navigation-breaking findings first, which is right for the
  deterministic half and meaningless for the judgment half: a
  contradiction about a date somebody is about to act on sorts exactly
  like one about a project that finished last year. The steward has no
  notion of what the user is currently working on. `daily/` is the
  obvious signal and is not used.
- **Staleness detection is the weakest half and is labelled as such.**
  The skill's test — does the *claim* have an expiry, rather than is the
  note old — is a judgment a model makes inconsistently. Expect
  `confidence: low` cards that are noise, and expect to tune the wording
  in the skill rather than the script.
- **No conflict detection between the steward and a human editing at the
  same time.** Carried over from tricks v2 (§11, and `tricks-spec.md`
  §7.3): writes are plain overwrites. A scheduled run at 06:00 and
  somebody typing in Obsidian at 06:00 can clobber each other. The window
  is small and the loss is recoverable from git, which is why this is a
  note rather than a blocker.
- **The base package now ships one trick**, which `panel/docs/tricks-spec.md`
  §9 originally said it would not. That sentence was corrected rather
  than the decision reversed: the steward is default machinery whose
  queue needs a UI, not an example of what a trick can be. If a second
  default trick is ever proposed, this is the precedent to argue with —
  the rule is "no examples", not "no tricks".

## 13. Update distribution — a public repo, a puller, and a manifest

Decided 2026-08-15: the base package is now a real, pushed git repo —
`https://github.com/DavidCorredorM/raymond`, public read-only, one
collaborator (the maintainer). Not a hypothetical `<PRIVATE_REPO_URL>`
placeholder any more. See README, "Getting a deployment running", for the
reasoning on public-vs-private (no credential to provision or leak on any
deployment, at the cost of the skills and tricks being world-readable —
judged an acceptable trade for a boutique deployment whose value is the
relationship and the customization, not secret prompt text).

**What exists now:** the remote, and `git clone` in place of the tar
workaround `deployments/angela.md` documented (that workaround existed
*because* there was no remote to clone from — this is completing the
design the docs already described, not changing it).

**Built, later the same day (2026-08-15).** Everything below this line
was the spec; nothing in it needed correcting — every path this section
named an example for (`_tools/*`, the base skills, `vault-steward`
itself as machinery; `CLAUDE.md`, `index.md`, folder indexes,
`panel/home.md`, `_templates/*` as seed) landed exactly as described.
What's real now:

- `vault-template/UPDATE-MANIFEST.md` — the manifest, classifying every
  path in today's `vault-template/` tree (not just this section's
  examples — `conventions.md`, `.claude/tricks/_plantillas/`,
  `.claude/tricks/vault-steward/`, `.claude/jobs/index.md` and
  `.claude/tricks/index.md` needed a first classification, and two paths
  (`steward/index.md`, `steward/historial/index.md`) turned out to be
  neither machinery nor seed — see the manifest's own "Excluded" section).
- `scripts/update-raymond.sh` — the app-code puller, fast-forward only,
  rebuilding and restarting only when `panel/` actually moved.
- `scripts/sync-vault-template.py` — the vault-template sync, running
  inside the vault's own git repo, one commit per real change. Conflict
  detection is a stored content hash per machinery path
  (`.claude/template-sync.md`), not git archaeology — the module
  docstring explains why history-walking was considered and rejected.
- `vault-template/.claude/skills/update-raymond/` — the skill, wired to
  `schedule-job` (daily, `kind: script`, no new scheduler).

Verified against a scratch bare-remote + scratch `~/raymond` + scratch
`~/raymond-brain`, not against a real deployment (none was available to
risk) — see `docs/log.md`'s entry the same day for exactly what that
covered, including two real bugs the scratch run caught before either
script shipped (a spurious commit from a timestamp-only marker rewrite,
and a failed-build retry that silently never retried).

**What does not exist yet — the rest of this section is the spec that
was built from, kept as the historical record:**

- A skill (`update-raymond` or similar, base package) plus a script
  under `scripts/` that: `git fetch`s the public remote, fast-forwards
  `~/raymond` only (never a merge — this is machinery, no local edits
  are expected in `panel/`, `scripts/`, `docs/`), rebuilds
  (`npm install` + `tsc` + `vite build`) only when something under
  `panel/` actually changed, and restarts `raymond-panel` only when a
  rebuild happened. `~/raymond`'s own `git log -1` *is* the version
  marker — no separate file needed, now that it is a real clone.
- **A second, harder half: syncing `vault-template/` changes into a
  live deployment's vault**, which is a *different* git repo
  (`~/raymond-brain`) with no ancestry relationship to the base repo.
  This needs the machinery/seed distinction `vault-steward`'s
  `conventions.md` already established as a pattern (a written,
  checkable rule beats an implicit one): some template paths
  (`_tools/*`, the base skills, `vault-steward` itself) are machinery —
  overwrite on update, nobody edits these per-deployment — and some
  (`CLAUDE.md`, `index.md`, folder indexes, `panel/home.md`,
  `_templates/*`) are seed — copied once, then the deployment's own,
  **never** overwritten, only diffed and reported so a human can decide
  whether to hand-merge. This needs its own version marker, written
  into the vault (rule 1: files are the only state) — e.g. a note under
  `.claude/` recording which base-package commit the vault last synced
  template content from — since the vault has no git relationship to
  the base repo to read that off of.
- **`schedule-job` is the scheduling mechanism**, not a new one. This
  feature is "write a skill, then use the skill that already exists to
  install it on a cron," not a second scheduler.
- **A manifest, written down, not inferred.** A literal list (or a
  section of a doc a script parses) naming which paths are machinery and
  which are seed. Guessing this per-file from context is how a future
  skill silently overwrites someone's customized `CLAUDE.md`.
- Angela's deployment is still on a `tar`-deployed `~/raymond` with no
  git ancestry to the new remote. Converting her specifically (backup,
  re-clone, redeploy) is deployment-specific work, not base-package
  work — track it in her `deployments/angela.md` (gitignored) when this
  is built, the same split roadmap #9 used for her SIGRA skills.
