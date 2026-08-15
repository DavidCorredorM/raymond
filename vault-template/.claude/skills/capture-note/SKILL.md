---
name: capture-note
description: Write something learned into the vault as a proper note — correct frontmatter, unique filename, folder index updated, links added. Use whenever the user says "note this", "save this", "remember this", "add to the vault", or when you have just learned something non-obvious worth keeping.
---

# Capture a note

## 1. Check it doesn't already have a home

```sh
~/vault/_tools/vault-search <topic words>
```

If an existing note covers this, **update that note** instead of creating
a new one. Duplicates are the main way a vault rots.

## 2. Pick the folder

| Folder | For |
|---|---|
| `notes/` | evergreen ideas, gotchas, how-tos — the default |
| `projects/<name>/` | tied to one ongoing project |
| `reference/` | external material, not your own thinking |
| `daily/` | dated, use the `daily-log` skill instead |

## 3. Write it

Copy `_templates/note-template.md`. Never write frontmatter from memory.

- **Filename**: descriptive kebab-case, unique across the whole vault.
  Check with `find ~/vault -name '<basename>.md'` before writing.
- **Title**: the claim, not the topic. `Wi-Fi needs wpa_supplicant`, not
  `Wi-Fi notes`.
- **`cuando-usar:`**: one sentence answering "when should a future
  session open this file?" This is the field that decides whether the
  note is ever found again.
- **Labels**: prefix anything you did not verify this session with
  `observed:`, `assumed:`, or `hypothesis:`.

## 4. Link it

Add at least two `[[links]]` to existing notes, and add a link **to** this
note from at least one existing note. An unlinked note is invisible.

## 5. Update the folder's index.md

Same change, not later. Add a row with a *retrieval* description — "read
before debugging X", not "overview of X".

## 6. Verify

```sh
~/vault/_tools/vault-lint
```

All three checks must say `none` before you're done.
