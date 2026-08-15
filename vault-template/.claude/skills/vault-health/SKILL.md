---
name: vault-health
description: Check the vault for broken links, folders missing an index, and notes without frontmatter — then fix what it finds. Use after importing or migrating notes, after any bulk rename or move, or when the user asks whether the vault is healthy or tidy.
---

# Vault health

## Run the linter

```sh
~/vault/_tools/vault-lint
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
~/vault/_tools/vault-lint && echo "vault is clean"
```
