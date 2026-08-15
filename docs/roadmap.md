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

Still not designed:

- Where the agent's proposals land before a human approves them —
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
