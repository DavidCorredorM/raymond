# Vault rules

Loaded automatically by Claude Code in every session inside this vault.
These are instructions, not suggestions.

Adapted from a larger team vault. Trimmed to what actually earns its
keep for one person.

---

## The two jobs

Every session has two, at equal priority:

1. Do the thing the user asked for.
2. Leave the vault more useful than you found it.

A session that answers perfectly and writes nothing down is half done.
The vault is how future-you stays fast. Skipping it saves 30 seconds
today and costs an hour next month.

---

## Reading

- **Search the vault before answering.** Architecture, decisions, how
  something works, why something was done — check here first. If the
  answer was in the vault and you didn't find it, you failed the task.
- **Read a folder's `index.md` before opening notes inside it.** The
  index says what's there so you can jump straight to the right file.
  Skipping it is slower, not faster.
- **`cuando-usar:` in the frontmatter is the primary retrieval key.**
  Search it before reading any note bodies.

```sh
~/vault/_tools/vault-search <terms>        # metadata tiers first
~/vault/_tools/vault-search -l <terms>     # include note bodies
```

`vault-search` ranks by where the match landed: `cuando-usar` beats
alias beats título beats índice beats etiqueta. A note whose `cuando-usar`
matches your task is far more likely to be the right one than a note
that merely mentions the word. **Start every lookup here.** Drop to plain
`grep -r` only when `-l` also comes back empty.

---

## Writing

- **Write notes as a side effect of work, not as a separate task.**
- **Capture on discovery.** The moment you learn something non-obvious —
  a gotcha, a config quirk, the reason behind a decision — write it
  down. Don't wait to be asked.
- **Never write secrets, keys, passwords or tokens into the vault.**
  Reference them by the name of the password-manager entry instead.

### Every note needs frontmatter — in Spanish

This vault's schema is Spanish, matching the notes that already exist.
Do not mix English field names in; a half-translated schema is worse
than either language.

```yaml
---
titulo: Ficha de Juan Manuel Martínez
tipo: nota | decision | gotcha | referencia | log | persona
area: Personas
estado: activo | reemplazado
actualizado: 2026-08-12
etiquetas: [aliados, cacao]
cuando-usar: "Léela antes de preparar una reunión con Fedemol."
---
```

`cuando-usar` is the most important field, and the only one added to the
original schema. It is the one sentence that lets a future session decide
whether to open the file without reading it.

### Naming

Descriptive kebab-case: `wifi-setup-needs-wpa-supplicant.md`, never
`notes.md` or `2026-08-11.md`.

**Basenames must be unique across the whole vault.** Two notes with the
same filename in different folders collide silently and break links.

### Title is the claim, not the topic

`Docker dev uses the beta database`, not `Docker notes`. A good title is
a sentence you could link to from anywhere.

### One concept per note

Split when a note exceeds a screen **and** holds two separately linkable
ideas. Otherwise keep it together — over-fragmentation hurts more than
it helps at this scale.

---

## Updating

- **Fix stale content in place**, in the same session you notice it.
  Don't just flag it.
- **Supersede, don't delete.** When a decision changes, mark the old
  note `estado: reemplazado` and link to what replaced it.
- **Update the folder's `index.md` in the same change** that adds,
  moves or renames a note. Otherwise the index lies, and an index that
  lies is worse than no index.
- **After answering from the vault, ask: did I just learn something the
  vault doesn't know?** If yes, add it before moving on.

---

## Honesty

Unlabelled claims are read as verified fact. So label everything else:

- `observed:` — you saw it in output, logs or code this session
- `assumed:` — plausible, not checked
- `hypothesis:` — untested guess

A note that guesses without saying so is worse than no note, because it
gets trusted later.

---

## Structure

Two companies under one holding. They stay separate but can link to each
other — that is the whole reason for one vault instead of two.

```
vault/
├── CLAUDE.md         this file — holding-level rules
├── index.md          map of the whole vault
├── companies/
│   ├── icpp/         + its own CLAUDE.md for company-specific context
│   └── sigra/        + its own CLAUDE.md
├── holding/          cross-company: shared people, decisions, strategy
├── panel/            dashboards, rendered by the web panel
├── daily/            dated logs, append-only
├── notes/            atomic evergreen notes
├── reference/        external material worth keeping
├── attachments/
├── _templates/       note and index templates
├── _tools/           vault-search, vault-lint
└── .claude/          skills — shared across both companies
```

**Every note carries `company:`** — `icpp`, `sigra`, or `holding`. That
field, not the folder, is what the panel filters on, so a single
dashboard can show both companies or either one.

A note belongs in `holding/` when it is genuinely about both. The test:
if updating it for one company would require updating a near-copy for the
other, it is a holding note. Mirror-maintenance across two files is the
problem this structure exists to remove.

Folders, tags and links each have exactly one job:

- **Folders** — where a thing lives and who owns it
- **Tags** — cross-cutting state (`#wip`, `#needs-review`)
- **Links** — meaning

Don't recreate the folder tree as tags. You'll maintain two hierarchies
and they will drift apart.

---

## Linking

Every new note should link **at least two** existing notes and be linked
from **at least one**. Orphans are invisible both to a person browsing
and to an agent walking the graph.

A `[[link]]` to a note that doesn't exist yet is fine — it marks
something worth writing, not an error.

---

## Writing style

- Cut filler: no "Great question", no restating the question, no
  "I hope this helps".
- No metaphors or decorative phrasing. If a sentence still works with
  the image removed, remove the image.
- Short beats complete. A ten-line note with the actual gotcha beats a
  hundred-line guide nobody reads.
- Plain words over impressive ones: use, not leverage; show, not
  showcase; is, not serves as.

---

## Tools

| Command | Does |
|---|---|
| `_tools/vault-search <terms>` | Tiered search, metadata before body |
| `_tools/vault-lint` | Broken links, missing indexes, missing frontmatter |

Run `vault-lint` after any bulk move, rename or import. Those are when
links rot.

## Skills

Four, in `.claude/skills/`. Claude Code loads their descriptions at
startup and fires them when a task matches:

| Skill | Fires when |
|---|---|
| `capture-note` | something worth keeping was learned |
| `daily-log` | a session ends |
| `vault-health` | after an import, or when things feel messy |
| `migrate-notes` | bringing an existing vault in |

Keep the total under about a dozen. Every skill costs context whether it
is used or not.
