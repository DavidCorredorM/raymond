---
scope: Raymond, the base package (this repo, including panel/), not any single deployment
---

# Roadmap — deferred base-package work

Decisions and gaps that apply to Raymond generically, deferred rather than
lost. Not Angela-specific — anything about her vault's content or her
SIGRA skills lives in her deployment, not here.

## 5. Git remote for the vault

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
