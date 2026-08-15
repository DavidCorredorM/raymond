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
_tools/vault-search <terms>        # metadata tiers first
_tools/vault-search -l <terms>     # include note bodies
```

Relative to the vault root, not a hardcoded path — this vault might not be
named `raymond-brain`, and `_tools/vault-search` itself resolves its own
location rather than assuming any particular vault name (see the comment
at the top of `_tools/vault-search`). A hardcoded path here silently
pointed sessions at a stale, unrelated vault once already — see
`docs/log.md`, 2026-08-15.

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

```
vault/
├── CLAUDE.md         this file
├── index.md          map of the whole vault
├── panel/            dashboards, rendered by the web panel — see below
├── daily/             dated logs, append-only
├── notes/             atomic evergreen notes
├── projects/          one folder per ongoing project
├── reference/          external material worth keeping
├── attachments/
├── _templates/        note and index templates
├── _tools/            vault-search, vault-lint
└── .claude/
    ├── skills/         Claude Code skills — see below
    └── tricks/         skill + UI plugins the panel renders — see below
```

This is a starting shape, not a fixed one. If your vault covers more than
one distinct area — several companies, several separate projects that
never reference each other — a common pattern is grouping each under its
own top-level folder with its own `CLAUDE.md` for area-specific context,
plus a shared field in every note's frontmatter (e.g. `area:` or
`company:`) that the panel's dashboards can filter on. Restructure into
that once the need is real; don't build it up front.

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

Five, in `.claude/skills/`. Claude Code loads their descriptions at
startup and fires them when a task matches:

| Skill | Fires when |
|---|---|
| `capture-note` | something worth keeping was learned |
| `daily-log` | a session ends |
| `vault-health` | after an import, or when things feel messy |
| `migrate-notes` | bringing an existing vault in |
| `trick-creator` | the user wants a UI for something they'll track or manage regularly |

Keep the total under about a dozen. Every skill costs context whether it
is used or not.

## Tricks

A **trick** is a skill plus a small UI manifest that the panel renders
as an interactive mini-app — not just a note, something with buttons,
checkboxes, forms. Tricks live in `.claude/tricks/<name>/`, separate from
`.claude/skills/` so the panel can discover them by listing one
directory. `trick-creator` builds them from a plain-language request.
Full spec: `panel/docs/tricks-spec.md`.

Tricks compose a fixed set of safe primitives (list, checkbox, date,
form, button) — they never ship custom rendering code. That's
deliberate: this app has no auth, and rendering arbitrary JavaScript
that anything on the tailnet can write is a materially bigger risk than
rendering arbitrary markdown.

## The panel

There is a web UI over this vault, reachable on the tailnet. It reads
and writes the same files you do — it has no database and no state you
can't see by reading the vault directly. Three destinations:

- **Home** (`/`) — a dashboard. Renders whatever `panel/home.md` says to.
  Ships with a default; a user or an agent can edit or replace it like
  any other file.
- **Vault** — browse notes (folder tree), a force-directed link graph,
  and a health page (broken links, missing frontmatter).
- **Tricks** — renders whatever is in `.claude/tricks/`.

**Any `.md` file whose frontmatter has a `widgets:` array is a
dashboard**, rendered wherever it's opened in the panel, not just at
`panel/home.md`. Widget kinds today: `query` (a filtered, sorted table of
notes), `count`, `vault-health`. Example:

```yaml
---
widgets:
  - kind: count
    title: "Open items"
    params:
      frontmatter: { estado: activo }
  - kind: query
    title: "Recent"
    params:
      sort: { field: mtime, order: desc }
      limit: 5
      columns: [title, frontmatter.actualizado]
---
```

`params.frontmatter` keys must match whatever field names this vault's
notes actually use — the panel makes no assumption about field names or
language. Full spec, including `folder`/`frontmatter_exists`/`sort` and
worked examples: `panel/docs/frontend-implementation-plan.md` §5.

When a user asks to "see X" or "track Y" or wants a dashboard for
something, this is the mechanism — write the file, no code, no deploy.
Notes are editable directly in the panel (raw markdown, no formatting
hidden), by you in a session here, or by Obsidian if the vault is synced
there — the panel's editor is a plain source editor, not a
WYSIWYG one. There is no agent-facing API: you make a dashboard, a
trick, or anything else the panel shows by writing a file, same as
everything else in this vault.
