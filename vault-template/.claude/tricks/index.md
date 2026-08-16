---
titulo: Tricks
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta, trick]
cuando-usar: "Read before adding, changing or removing a trick — what a trick is, where its parts live, and what it is allowed to touch."
---

# Tricks

A **trick** is a small web app the panel renders inside the vault: a
checklist, a form, a chart, a button that runs a script. It is arbitrary
HTML, CSS and JavaScript — there is no widget vocabulary to stay inside —
and it runs in a sandboxed frame with no network of its own. The only
route from a trick to the vault is a capability bridge, and the trick's
manifest declares, folder by folder and field by field, exactly what that
bridge will carry.

Tricks are created by the `trick-creator` skill: describe what you want,
in plain language, and it writes the folder. Read
`panel/docs/tricks-spec.md` for the design and the reasoning behind the
sandbox.

## The tricks in this vault

| Trick | What it does |
|---|---|
| `vault-steward` | The steward's review queue. One card per thing the vault steward wants a human to decide — a contradiction between two notes, a fact that looks stale, a rename it wants to make. Type what is true; the next run acts on it. |

**One trick ships in the base package**, and it is the exception rather
than a change of policy: the steward is a default piece of machinery
whose queue needs a UI, not an example of what a trick can be. Everything
else here is mechanism — write your own with `trick-creator`, starting
from `_plantillas/`.

The steward trick is unusual in one more way worth copying: it needs no
editing after install. Its `carpeta` is `steward/`, which
`_tools/steward.py` creates and fills, so unlike the starters there is no
path in it to rewrite.

## What's in this folder

| Path | What |
|---|---|
| `<trick>/trick.yaml` | The manifest: title, the app's entry file, and the capabilities the app is granted |
| `<trick>/app/` | The app itself. `index.html` plus whatever it references, any depth |
| `<trick>/data/` | The trick's own notes and its `estado.json`, when it has either |
| `<trick>/*.sh` | Scripts a `correr_script` action names — declared here, never sent by a browser |
| `_plantillas/` | Starter apps to copy. See its own `index.md` |

## The two things worth knowing before editing one

**Everything under `.claude/` is executable configuration, not content.**
A `trick.yaml` is the input to a decision about what code runs; an
`app/` file is code the panel hands to a browser. Only someone who can
already run code on this machine — a person at a shell, Claude Code in
this vault, a cron job — may write these files. No endpoint the panel
exposes over the network may create or change anything under `.claude/`,
and that is enforced, not trusted.

**`capacidades:` constrains the browser, not the machine.** A trick's app
can only do what its manifest lists. A scheduled job that feeds the same
trick runs on the box with full filesystem access and does not go through
the bridge at all. Reading a manifest tells you what the app can reach,
not everything the trick as a whole does.
