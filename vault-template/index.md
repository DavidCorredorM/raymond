---
titulo: Índice del vault
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta]
cuando-usar: "Empieza aquí. Mapa de todo el vault — léelo antes de buscar a ciegas."
---

# Vault index

| Folder | What lives there |
|---|---|
| `daily/` | Dated append-only logs. One file per day, `YYYY-MM-DD.md`. |
| `notes/` | Atomic evergreen notes. The main body of the vault. |
| `projects/` | One folder per ongoing project, each with its own `index.md`. |
| `reference/` | External material worth keeping — docs, specs, saved articles. |
| `steward/` | Open findings from the vault steward: one file per thing it wants a human to decide. Answer them here or in the panel. |
| `panel/` | Dashboards the web panel renders — files with a `widgets:` frontmatter array. `panel/home.md` is the panel's home page. |
| `_templates/` | Starting points. Copy, never write frontmatter from scratch. |
| `_tools/` | `vault-search` (tiered search), `vault-lint` (health check), `steward.py` (the full convention sweep). |
| `.claude/skills/` | Skills Claude Code loads here: capture-note, daily-log, vault-health, vault-steward, migrate-notes, trick-creator, schedule-job. |
| `.claude/tricks/` | Mini apps the panel renders over the vault — arbitrary HTML/CSS/JS in a sandboxed frame, reaching the vault only through declared capabilities. Made by `trick-creator`; starters to copy in `_plantillas/`. |
| `.claude/jobs/` | Scheduled jobs — one note and one runner script each, plus a run log per job. Made by `schedule-job`. |

Rules for how to read and write here: `CLAUDE.md`. What the result has to
look like — folder shapes, naming, frontmatter, the numbers a checker
reads: [[conventions]].

## Nothing here yet

This is a fresh vault. The first real note replaces this section.
