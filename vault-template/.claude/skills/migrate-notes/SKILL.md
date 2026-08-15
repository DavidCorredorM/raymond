---
name: migrate-notes
description: Import an existing Obsidian vault or folder of markdown into this vault, cleaning it up in the process — adding frontmatter, fixing filenames, deduplicating, building indexes. Use when the user says "migrate my vault", "import my notes", "bring in my old notes", or is moving from another system.
---

# Migrate notes in

Migration is the one chance to clean up. Notes imported raw stay messy
forever, because nobody goes back.

## 1. Measure before touching anything

```sh
SRC=<path to old vault>
du -sh "$SRC"
find "$SRC" -name '*.md' | wc -l
find "$SRC" -type f -not -name '*.md' | wc -l          # attachments
find "$SRC" -type f -size +5M -exec ls -lh {} \; | head # big files
```

Report these to the user before proceeding. Attachment volume decides
whether the vault needs git-LFS; note count decides whether cleanup is a
session or a project.

## 2. Copy, never move

```sh
cp -r "$SRC" ~/vault-import-staging
```

Work on the copy. The original stays untouched until the user confirms
the result, and there is no step where a mistake destroys the only copy.

## 3. Triage before importing

Do not import everything by default. For each file, one of:

- **Keep** — still true and useful
- **Merge** — duplicates something already in the vault
- **Archive** — historically interesting, not active; `reference/`
- **Drop** — empty, superseded, or scratch

Find the obvious drops first:

```sh
find ~/vault-import-staging -name '*.md' -size -100c   # near-empty
find ~/vault-import-staging -name '*.md' | xargs -n1 basename | sort | uniq -d
```

**Ask the user before dropping anything.** Your judgement of "useless" and
theirs will differ.

## 4. Normalise each kept note

- Filename to descriptive kebab-case, unique vault-wide
- Add frontmatter from `_templates/note-template.md`
- Write a real `cuando-usar:` — this is the work, and it cannot be
  automated well. A generated one-liner that restates the title is worse
  than none, because it looks done.
- Title becomes the claim, not the topic
- Label unverified content `observed:` / `assumed:` / `hypothesis:`

## 5. Attachments

Put them in `attachments/`, referenced relatively. If they exceed a few
hundred MB, raise git-LFS with the user before the first commit — adding
LFS later means rewriting history.

## 6. Build the indexes and check

```sh
_tools/vault-lint
```

Work the findings via the `vault-health` skill until all three say
`none`.

## 7. Commit in stages

One commit per batch, not one giant import commit. If something was
mangled, a staged history is what lets you find where.
