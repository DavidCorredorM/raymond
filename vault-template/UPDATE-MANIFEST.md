# Update manifest — machinery vs. seed

Not vault content. This file lives only in the base package's checkout
(`~/raymond/vault-template/UPDATE-MANIFEST.md`) and is read directly from
there by `scripts/sync-vault-template.py`. It is never copied into any
deployment's vault — a copy of the file that classifies files would
itself need classifying, and the honest answer is that a deployment
never needs its own copy: the sync always runs against the live base
checkout.

`docs/roadmap.md` §13 asked for exactly this: "a literal list… naming
which paths are machinery and which are seed. Guessing this per-file
from context is how a future skill silently overwrites someone's
customized `CLAUDE.md`." This is that list, plus the reasoning behind
each line — because "why" is what lets a future author extend it
correctly instead of by pattern-matching the existing rows.

---

## The two categories, and what each buys

**Machinery** — the base package's own code and content. Nobody
customizes it per-deployment. If the deployment's copy is unmodified
since the last sync and the base package's copy has changed, the sync
overwrites it and commits. If the deployment's copy *has* been modified
since the last sync, that is a conflict — never silently overwritten,
always turned into a card in `steward/` for a human to answer, the same
shape `vault-steward` already uses (see `scripts/sync-vault-template.py`'s
own docstring for exactly how "modified since the last sync" is
computed, and why that is a different question from "different from
upstream").

**Seed** — copied once at install (`scripts/bootstrap.sh`'s
`cp -rn "$SKEL"/. "$VAULT_DIR"/`), then the deployment's own forever.
Never overwritten by the sync, at any confidence — this is rule 5 (README:
"the base package and any one deployment are different things") applied
to a mechanism that runs unattended, which is exactly the situation rule
5's two real violations this project already had (a deployment's company
structure and its Spanish schema leaking into the generic template)
should make everyone nervous about automating. The sync only diffs a
seed path against the base package's current copy and reports what
changed upstream, so a human can hand-merge if the upstream change is
worth having.

A third bucket exists below for paths that are neither — content the
base package ships as a starting stub but that a running deployment's
*own machinery* (`_tools/steward.py`) regenerates locally, wholesale,
every time it runs. Syncing those against the base package would compare
apples to a script's own leftovers.

Patterns are matched against the base checkout's `vault-template/`
filesystem, not the deployment's. `**` at the end of a pattern means
"this path and everything below it, any depth" — the whole tree, not one
level. A pattern like `.claude/skills/*/SKILL.md` matches whatever skills
exist in the base package *right now*, including ones added after this
file was last edited — new skills fall under the rule without a manifest
change, only genuinely new *kinds* of path need a new line here.

---

## Machinery

```
_tools/*
.claude/skills/*/SKILL.md
.claude/skills/vault-steward/brief.md
.claude/tricks/_plantillas/**
.claude/tricks/vault-steward/**
```

- **`_tools/*`** — `vault-lint`, `vault-search`, `steward.py`,
  `linkcheck.py`. Named explicitly in roadmap §13. These are read-only
  tools invoked by path; there is no supported way to customize them in
  place other than the field-name rename `conventions.md` §3 describes
  (see the *Coupled, not ambiguous* note below on why that rename is
  still safe under this manifest).
- **`.claude/skills/*/SKILL.md`** — the seven base skills. Named
  explicitly in roadmap §13 as "the base skills." A deployment that wants
  different skill behavior writes a *new* skill rather than editing a
  shipped one in place — the same reason `_plantillas/` is copied-from,
  never edited-in-place, below.
- **`.claude/skills/vault-steward/brief.md`** — not a `SKILL.md`, so the
  glob above misses it; the brief is the agent prompt `schedule-job`
  copies into `.claude/jobs/vault-steward.prompt.md` at install time (a
  copy the sync mechanism never touches — see "Out of scope" below), and
  it ships and evolves with the skill, not per-deployment.
- **`.claude/tricks/_plantillas/**`** — the four starter trick apps.
  Their own `index.md` says it directly: "Copy the one closest to what
  is being asked for, then change it" — the copy gets edited, never the
  original. Contrast with `_templates/*` below, which *is* edited in
  place; that distinction is the whole reason these two look similar and
  sort into different buckets.
- **`.claude/tricks/vault-steward/**`** — named explicitly in roadmap
  §13 ("`vault-steward` itself"). Its own header comment invites
  changing `titulo`/`icono` for cosmetics, which means a deployment that
  does so will show as "locally modified" the next time the base package
  changes this trick's app code or capabilities — a real conflict card,
  not a bug. Cheap and safe: worst case is one extra card to answer,
  never a silent loss of either side.

## Seed

```
CLAUDE.md
conventions.md
index.md
daily/index.md
notes/index.md
projects/index.md
reference/index.md
panel/home.md
panel/index.md
.claude/jobs/index.md
.claude/tricks/index.md
_templates/*
```

- **`CLAUDE.md`, `index.md`** — named explicitly in roadmap §13.
- **Folder indexes** (`daily/`, `notes/`, `projects/`, `reference/`,
  `panel/`) — named explicitly in roadmap §13 as "folder indexes." Every
  one of these accumulates rows as the deployment adds real notes;
  overwriting them with the base package's empty stub would delete a
  deployment's own index rows, which is exactly the failure mode this
  whole manifest exists to prevent.
- **`panel/home.md`** — named explicitly in roadmap §13. The dashboard a
  deployment edits to show what matters to them.
- **`.claude/jobs/index.md`** — same shape as the folder indexes above:
  ships as an empty stub ("Nothing scheduled yet") and `schedule-job`
  adds a row per job the deployment actually schedules. Not named in
  roadmap §13's examples, classified here by the same reasoning as the
  folder indexes it is structurally identical to.
- **`_templates/*`** — named explicitly in roadmap §13. Unlike
  `_plantillas/`, these *are* meant to be edited in place: `conventions.md`
  §3's field-name rename instructions list `_templates/` among the
  files to edit *directly* if a deployment's language isn't Spanish.
  That is the deciding test used throughout this file — edited in place
  per-deployment is seed, copied-from-and-then-edited is machinery.

### `conventions.md` — seed, but coupled to machinery in one way

Classified seed for two reasons in the document's own text: it invites
editing directly ("Changing the rule is a legitimate outcome. Edit this
file"), and the field-name rename section names it as one of the files
a deployment edits in place. But **`conventions.md` § "The numbers" and
`_tools/steward.py`'s header constants are the same data, kept in two
files on purpose** ("change them there and in `_tools/steward.py`'s
header block together" — `conventions.md` §"The numbers"). `steward.py`
is machinery and can be silently updated by a sync the moment its base
value changes upstream; `conventions.md` is seed and never is. If the
base package ever changes a default (say, the fan-out limit from 20 to
25) and a deployment has never touched either file, the sync will update
`steward.py`'s constant and leave `conventions.md` describing the old
number — a real drift the sync cannot close, because closing it would
mean writing into a file this manifest promises never to touch. Flagged
here rather than solved: the sync's seed-diff report is exactly the
mechanism that surfaces this ("what changed upstream, so a human can
hand-merge if they want to"), and a human resolving it by hand is the
correct outcome, not a gap.

### `.claude/tricks/index.md` — seed, with an inherited gap

A deployment appends a row here for every trick `trick-creator` writes,
which makes it deployment content by the same test as the folder
indexes above. But it currently *also* documents the one machinery trick
(`vault-steward`) that ships in the base package. If the base package
ever ships a second default trick (`docs/roadmap.md` §12 says this
would need arguing for, but doesn't rule it out), that new trick's files
would sync in as machinery under `.claude/tricks/<name>/**` — but
nothing would add its row to this seed file, because seed is never
written. A human adding the row by hand, prompted by the sync's seed
diff, is the intended path; noted here so it is a known gap and not a
rediscovered one.

## Excluded — neither machinery nor seed

```
steward/index.md
steward/historial/index.md
```

Both are shipped as harmless install-time stubs (their own text says so:
"Regenerated by `_tools/steward.py`; edits to this file are lost") and
regenerated **wholesale** by `_tools/steward.py check` every time it
runs on a live deployment. A difference between the base package's stub
and a deployment's real, steward-generated version is expected on every
single run and means nothing — reporting it as a seed diff would be
noise nobody could act on, and overwriting it as machinery would erase
real, current findings. The sync does not read, hash, diff, or write
either path.

## Unclassified paths — the fallback, and why it's the safe direction

Any file that exists in the base package's `vault-template/` and matches
none of the patterns above (a new top-level file added upstream without
a matching manifest update) is treated as **seed**: reported if
different, never written. Silence in this manifest defaults to the
direction that cannot destroy anything, mirroring `conventions.md` §5's
own rule for the steward ("anything that can lose information is a
proposal, never an automatic action"). `scripts/sync-vault-template.py`
prints a loud, named warning every run an unclassified path is found, so
the gap gets fixed here rather than quietly relied on forever.

## Out of scope for this manifest entirely

Content the deployment created that never shipped in `vault-template/`
at all — real notes in `notes/`, a deployment's own tricks, jobs, and
findings, `companies/*` or any other area folder a deployment added —
is invisible to the sync by construction: it only ever iterates the base
package's own file list, never the vault's. It cannot classify what it
never looks at, and it never deletes anything it finds in the vault that
isn't in the base package — machinery sync is *only* ever "overwrite a
path the base package still ships," never "make the vault's tree match
the base package's tree."

`.claude/jobs/vault-steward.prompt.md` (the brief, copied at install
time per `vault-steward` SKILL.md §7) is likewise out of scope even
though its source (`.claude/skills/vault-steward/brief.md`) is
machinery: the copy is deployment state the moment `schedule-job` writes
it, same as any other job's prompt file. If the brief changes upstream,
the skill's own copy goes stale silently — a real gap, not one this
manifest closes, because the copy lives under `.claude/jobs/`, a path
namespace this manifest does not enumerate at all (deployments name
their own jobs; there is no fixed list of paths to classify there).
