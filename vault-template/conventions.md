---
titulo: Vault conventions
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta, conventions]
cuando-usar: "Read before creating a folder, naming a file, or arguing with something the steward flagged. This is the document it checks against."
---

# Vault conventions

`CLAUDE.md` says how to work here. **This file says what the result has
to look like**, precisely enough for a script to check it and for a human
to disagree with it.

That second half matters. "Keep the vault organized" is not enforceable
against anything. Every rule below is written so that a tool can decide
pass or fail, and so that when the `vault-steward` skill flags your file
you can come here, read the rule, and either fix the file or change the
rule. **Changing the rule is a legitimate outcome.** Edit this file; the
checks follow it, not the other way round. The values a script actually
reads are collected in [the numbers](#the-numbers) at the bottom — change
them there and in `_tools/steward.py`'s header block together.

Where this file and `CLAUDE.md` overlap, they must agree. If they don't,
`CLAUDE.md` is the instruction and this is the specification; fix
whichever is wrong in the same change.

---

## 1. Folders

### The base shape

```
vault/
├── index.md          map of the whole vault
├── CLAUDE.md         how to work here
├── conventions.md    this file
├── daily/            dated logs, append-only
├── notes/            atomic evergreen notes — the main body
├── projects/         one folder per ongoing project
├── reference/        external material worth keeping
├── steward/          open findings from the vault-steward run
├── panel/            dashboards the panel renders
├── attachments/      non-markdown files with no better home
├── _templates/       note and index templates
├── _tools/           vault-search, vault-lint, steward.py
└── .claude/          skills, tricks, jobs — machinery, not content
```

**Only these live at the root.** A new top-level folder is a real
decision, not a filing convenience: it costs everyone who reads the vault
a new place to look. Add one only when a whole area of life or work does
not reference anything already here — several separate companies, a
research project with its own vocabulary. When you do, give it its own
`index.md` and say in the root `index.md` what it is for.

`attachments/` is the exception that proves the point. It is **not** an
output folder. A PDF, a spreadsheet or an image belongs next to the notes
it is about — `projects/<project>/q3-numbers.xlsx`, not
`attachments/q3-numbers.xlsx`. `attachments/` is only for files that
genuinely belong to no subject: a scanned form, a logo. If you are about
to put a generated report there, you have chosen the wrong folder. There
is no top-level folder named after the fact that something is *output* —
whatever you would call it — and adding one is the wrong answer to
whatever problem prompted it (`docs/roadmap.md` §9).

### Depth

**Notes sit between one and three folders below the root. Four is the
hard ceiling.**

```
notes/docker-dev-uses-the-beta-database.md               depth 1  ok
projects/<project>/decisions/why-postgres.md             depth 3  ok
projects/<project>/2026/q3/vendors/notes/call.md         depth 5  too deep
```

Depth is not a virtue and neither is flatness. Three levels is enough to
express "project → area → note", which is as much hierarchy as a person
holds in their head while browsing. Past that you are encoding facts in
the path that belong in frontmatter or in a link.

**No note at the vault root.** The root holds `index.md`, `CLAUDE.md`,
`conventions.md` and folders. A note dropped at the root is a note nobody
filed.

### Fan-out

**A folder holding more than 20 notes and no subfolders needs
subfolders.** Twenty is roughly where a folder listing stops being
something you scan and starts being something you search — and if you are
searching it, the folder has stopped doing its one job, which is telling
you where a thing lives.

Two exceptions, both because the folder is a stream rather than a
structure:

- `daily/` — dated logs. Subdivide by year (`daily/2026/`) only once it
  is genuinely unwieldy; the filenames already sort.
- `steward/` — findings, which are transient by design and capped per
  run.

Splitting a flat folder is a **judgment call about what the groups are**,
not a mechanical one. The steward flags the folder and proposes a
grouping; it never invents subfolders on its own.

### Every folder with notes in it has an `index.md`

The index lists **every** note in that folder, with a retrieval
description — "read it before doing X", not "about X". Copy
`_templates/index-template.md`.

An index that is missing notes is worse than no index, because it is read
as complete. Update it in the same change that adds, moves or renames a
note. `index.md` files do not count towards the fan-out limit and are
never themselves subject to the naming rules below.

---

## 2. File names

**Lowercase, ASCII, kebab-case, `.md`.**

```
regex:  ^[a-z0-9]+(-[a-z0-9]+)*\.md$
```

| Good | Bad | Why |
|---|---|---|
| `docker-dev-uses-the-beta-database.md` | `Docker Notes.md` | spaces and capitals break links across filesystems that differ on case |
| `wifi-setup-needs-wpa-supplicant.md` | `Untitled 3.md` | a name that says nothing costs a file open to find out |
| `postgres-over-mysql-for-json-columns.md` | `notes.md` | generic names collide and describe nothing |
| `renewal-deadline-is-the-31st.md` | `nota-sobre-la-renovación.md` | accents and non-ASCII do not survive every sync tool |

Four more rules, each with a reason that has cost somebody time:

1. **The name is the claim, shortened.** `title` is the sentence;
   the filename is that sentence in three to eight words. If you cannot
   name it, you do not yet know what the note says.
2. **Basenames are unique across the whole vault.** Two `meeting.md` in
   different folders make every bare link to `meeting` ambiguous, and
   Obsidian resolves the ambiguity silently and inconsistently.
3. **No dates as the whole name, except in `daily/`.** `2026-08-11.md`
   in `notes/` tells you when it was written, which the filesystem
   already knows, and nothing about what it says. In `daily/` the date
   *is* the subject: `daily/2026-08-11.md`, exactly that format.
4. **Length between 3 and 60 characters.** Under three is not a name.
   Over sixty wraps in every file listing and every link.

**Non-markdown files follow the same rules**, with their own extension:
`q3-revenue-by-region.xlsx`, not `Q3 Revenue (final v2).xlsx`.

---

## 3. Frontmatter

Every note starts with YAML frontmatter. **Five fields are required**;
a note missing any of them is broken, not merely untidy.

```yaml
---
titulo: Docker dev uses the beta database          # required
tipo: gotcha                                       # required
area: infra                                        # optional
estado: activo                                     # required
actualizado: 2026-08-12                            # required
etiquetas: [docker, gotcha]                        # optional
cuando-usar: "Read before pointing anything at the dev stack."  # required
---
```

| Field | Rule |
|---|---|
| `titulo` | A sentence stating the claim, not a topic. `Docker dev uses the beta database`, never `Docker notes`. |
| `tipo` | Exactly one of: `nota`, `decision`, `gotcha`, `referencia`, `log`, `persona`, `hallazgo`. Anything else is a typo or a new category that belongs in this table first. |
| `area` | Free text, one word. What part of life or work this belongs to. Optional but nearly always worth setting — dashboards filter on it. |
| `estado` | `activo` or `reemplazado`. Superseded notes stay, marked `reemplazado`, linking to what replaced them. |
| `actualizado` | `YYYY-MM-DD`. The day the content last changed, not the day the file was touched. |
| `etiquetas` | A list. Cross-cutting state and themes only (`wip`, `needs-review`). **Not a second copy of the folder tree** — if a tag names a folder, delete the tag. |
| `cuando-usar` | One sentence answering "when should a future reader open this file?" This is the retrieval key: search reads it first, and a note without it is effectively invisible. Never `"Sobre X"` / `"About X"`. |

Machine-readable blocks — `widgets:` on a dashboard, `job:` on a job
note, `finding:` on a steward finding — sit alongside these and are not
part of the note schema.

### On the field names being Spanish

They are, in the base package, and this is a known wart rather than a
choice: the schema was built and verified against a Spanish-language
vault, and every tool here hardcodes `cuando-usar` as the retrieval key
(`docs/roadmap.md` §8). **Prose is English; field names are Spanish.**

If your vault's language is not Spanish, rename them — but rename them
**everywhere in one change**: `_templates/`, `_tools/vault-lint`,
`_tools/vault-search`, `_tools/steward.py`, this file, `CLAUDE.md`, and
the panel's health check. A half-translated schema is worse than either
language, because both halves then look like typos.

---

## 4. Links

- **Every note links at least two others, and is linked from at least
  one.** A note nothing points at is invisible to a person browsing and
  to an agent walking the graph, no matter how good it is.
- A wiki-link to a note that does not exist yet is **fine**. It marks
  something worth writing. It is not an error and the steward will not
  ask you to fix it — it will only ask about links whose target looks
  like something the vault already has under a slightly different name.
- **Folders say where a thing lives. Tags say cross-cutting state. Links
  say meaning.** One job each. Do not rebuild the folder tree as tags:
  you will maintain two hierarchies and they will drift.
- Link with the bare name — the note's basename, nothing else — and rely
  on basenames being unique (§2). A path inside a link breaks on the
  first move.
- **A document that only talks *about* link syntax must not contain a
  live example of a broken one.** The link checker cannot tell an example
  from a mistake, so a page of good advice starts reporting itself as
  damage. That is why this section names targets in prose and why
  `_templates/` is skipped by `vault-lint` entirely. The steward's own
  cards follow the same rule.

---

## 5. What the steward may change by itself

The `vault-steward` skill checks this document every three days. The line
it must not cross:

> **Anything that can lose information is a proposal, never an automatic
> action** — however confident the analysis is.

| It just does it | It asks first |
|---|---|
| Create a missing `index.md` | Delete anything |
| Add a missing row to an index | Merge two notes |
| Repoint a broken link whose target resolves unambiguously to exactly one existing note | Repoint a link that has more than one plausible target |
| | Rename or move a file |
| | Rewrite a `titulo` or `cuando-usar` |
| | Resolve a contradiction between two notes |
| | Create or remove a folder |

A file is renamed only through `_tools/steward.py move`, which rewrites
every inbound link in the same operation or does nothing at all. A move
that leaves the links behind is not a fix; it is a second problem on top
of the first.

Findings live in `steward/`, one file each, with a free-text answer field
you can fill in the panel or in any editor. Answering is not urgent and
nothing expires.

---

## The numbers

Everything a checker reads, in one place.

| Setting | Value |
|---|---|
| Maximum folder depth for a note | 4 |
| Preferred folder depth | 1–3 |
| Notes in a flat folder before it needs subfolders | 20 |
| Filename pattern | `^[a-z0-9]+(-[a-z0-9]+)*\.md$` |
| Filename length | 3–60 characters |
| Date format, everywhere | `YYYY-MM-DD` |
| Required frontmatter | `titulo`, `tipo`, `estado`, `actualizado`, `cuando-usar` |
| Allowed `tipo` | `nota`, `decision`, `gotcha`, `referencia`, `log`, `persona`, `hallazgo` |
| Allowed `estado` on a note | `activo`, `reemplazado` |
| Minimum outbound links per note | 2 |
| Minimum inbound links per note | 1 |
| Open findings written per steward run | 25 |
| Folders exempt from the naming rules | `_templates/`, `_tools/`, `.claude/`, `.git/` |
| Folders exempt from fan-out | `daily/`, `steward/` |

## Related

- [[index]] — the map of the vault
- [[CLAUDE]] — how to work here, of which this is the checkable half
