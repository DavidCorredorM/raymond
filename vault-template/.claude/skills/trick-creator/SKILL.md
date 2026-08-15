---
name: trick-creator
description: Create a "trick" — a small interactive mini-app that appears in the panel UI, backed by a skill. Use when the user describes something they want to track, manage, or interact with regularly (a todo list, a habit tracker, a reading list, a simple form) and wants a UI for it, not just a note. Triggers on "make me a [thing] tracker", "I want a UI for X", "can you build a trick for Y", "turn this into an app".
---

# Trick creator

A trick is a skill plus a UI manifest, living in `.claude/tricks/<name>/`.
The panel renders it automatically — no code, no rebuild. Your job is to
translate what the user describes into a valid manifest using only the
primitives the panel already knows how to render safely. You are not
writing UI code. If what they want cannot be expressed with the
primitives below, say so and propose the closest thing that can — do not
invent a new primitive or write custom rendering code.

Read `panel/docs/tricks-spec.md` in full before creating a trick. This
file summarizes it; that file is the source of truth if they disagree.

## 1. Ask what you need, don't guess

At minimum you need: what does one "item" look like (its fields), what
can the user do to an item (check it off? edit a date? just view it?),
and whether anything should happen automatically on a schedule. If any
of these is unclear, ask — a trick built on a guessed data shape is
expensive to redo once real data exists in it.

## 2. Design the data shape first

Every trick's items are plain vault notes. Decide:

- Where they live: `.claude/tricks/<name>/data/`
- What frontmatter fields they carry — follow this vault's existing
  schema conventions (check `CLAUDE.md` at the vault root for the field
  names and language this vault uses; do not introduce a different
  schema for trick data than the rest of the vault uses)
- A note template for new items, at `data/_item.md`

## 3. Pick primitives, don't invent them

| `control` | For |
|---|---|
| `texto` | A text field, read or written |
| `checkbox` | A boolean toggle |
| `fecha` | A date |
| `select` | One of a fixed set of values |
| `lista` | A repeating list of items, filtered/sorted by frontmatter — same query shape as a dashboard's `query` widget |
| `formulario` | A small form that creates a new item |
| `boton` | A single action with no input |

If the request needs something none of these express — a drawing canvas,
a chat interface, a chart — say clearly that v1 tricks can't do that yet,
and offer the nearest thing that fits the vocabulary instead of forcing
it.

## 4. Write `trick.yaml`

Follow the schema in `panel/docs/tricks-spec.md` exactly. Every write
action (`set`, `crear_nota`, `archivar`) must map to one of the actions
that schema defines — don't invent new action verbs.

## 5. Scheduling — ask before adding, and be honest about the two kinds

If the user wants something automatic ("remind me every morning",
"check for overdue items"), first ask: **does this need Claude to decide
something, or is it a fixed rule a script can check?**

- A fixed rule ("flag anything past its due date") → `requiere_llm:
  false`. Cheap, deterministic, no spend risk. Prefer this whenever it's
  genuinely sufficient.
- Something needing judgment ("summarize what I got done this week") →
  `requiere_llm: true`. **This must default to proposing an output for
  the user to review, never editing their notes directly**, until they've
  seen it run correctly a few times and explicitly opt into
  `auto_aplicar: true`. Explain this default to the user in plain terms
  when you set it up — don't silently make something run unattended
  without them understanding that's what's happening.

## 6. Write the skill itself

`SKILL.md` inside the trick folder is a normal skill — same frontmatter,
same rules as any other skill in this vault. It should let the user
interact with the trick's data conversationally too (not just through the
panel UI), since the same notes back both.

## 7. Tell the user what you built

After creating a trick, say in plain language: what it tracks, where its
data lives, what they can click in the panel, and — if you added
scheduling — exactly when it runs and whether it needs their review or
applies automatically. Someone non-technical should understand this
without reading YAML.
