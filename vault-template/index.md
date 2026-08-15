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
| `panel/` | Dashboards the web panel renders — files with a `widgets:` frontmatter array. `panel/home.md` is the panel's home page. |
| `_templates/` | Starting points. Copy, never write frontmatter from scratch. |
| `_tools/` | `vault-search` (tiered search) and `vault-lint` (health check). |
| `.claude/skills/` | Skills Claude Code loads here: capture-note, daily-log, vault-health, migrate-notes, trick-creator, schedule-job. |
| `.claude/tricks/` | Skill + UI plugins the panel renders as mini-apps. Made by `trick-creator`. |
| `.claude/jobs/` | Scheduled jobs — one note and one runner script each, plus a run log per job. Made by `schedule-job`. |

Rules for how to read and write here: `CLAUDE.md`.

## Nothing here yet

This is a fresh vault. The first real note replaces this section.
