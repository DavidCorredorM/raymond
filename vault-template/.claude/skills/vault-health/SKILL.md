---
name: vault-health
description: Check the vault for broken links, folders missing an index, and notes without frontmatter — then fix what it finds. Use after importing or migrating notes, after any bulk rename or move, or when the user asks whether the vault is healthy or tidy.
---

# Vault health

## Run the linter

```sh
_tools/vault-lint
```

Three checks. All should report `none`.

## Fix, don't just report

| Finding | Fix |
|---|---|
| Broken `[[wiki-link]]` | The target was renamed or never written. Point the link at the real note, or create the missing note if the idea deserves one. |
| Folder missing `index.md` | Copy `_templates/index-template.md` and list every note in that folder with a retrieval description. |
| Note missing frontmatter | Add it from `_templates/note-template.md`. `cuando-usar:` is not optional. |

## After a bulk import

Expect a long list. Work through it in this order, because each stage
reduces the next:

1. **Frontmatter first** — until notes have `cuando-usar:`, they are
   unfindable, and you cannot judge which duplicates to merge.
2. **Indexes second** — now you can describe what each folder holds.
3. **Links last** — many broken links resolve themselves once files are
   in their final places.

## Re-run until clean

```sh
_tools/vault-lint && echo "vault is clean"
```

## When this isn't enough

These three checks are the fast ones, meant for right after an import or
a bulk rename. They say nothing about naming conventions, duplicate
basenames, orphans, folders that have outgrown flat, or two notes
claiming different things.

That is the `mender` skill, which runs on a schedule, checks the
whole of `conventions.md`, and leaves a card in `steward/` for anything
needing a human decision. It shares this skill's link resolution —
`_tools/mender.py` imports `_tools/linkcheck.py` rather than resolving
wiki-links a second way — so the two never disagree about what "broken"
means.

Reach for `mender` when the vault feels disorganized rather than
merely unlinted, when a rename or a reorganization is on the table (it
owns `mender.py move`, the only safe way to move a note), or when two
notes seem to contradict each other.
