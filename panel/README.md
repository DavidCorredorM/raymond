# panel

The web UI half of [Ben](../README.md). Reads, edits, and renders
dashboards from plain files — no database, no state that isn't on disk.
See `docs/frontend-implementation-plan.md` for the build plan.

## Principles

These are load-bearing, not preferences:

1. **The vault is the only source of truth.** Every piece of state —
   notes, todos, dashboards, agent messages, scheduled task definitions —
   is a file. The app holds an in-memory index and nothing else. Delete
   the app and lose nothing.
2. **Agents write files, not API calls.** There is no agent-facing
   endpoint. An agent adds a todo by writing a markdown file. This is why
   integration is free.
3. **Dashboards are files too.** A new dashboard is a new file with a
   frontmatter widget spec. No deploy, no code.
4. **Nothing is hardcoded to one user or one vault.** Path comes from
   config.

## Layout

| Path | What |
|---|---|
| `server/` | Fastify API over the vault: index, read, write, search, watch |
| `web/` | Vite + React + CodeMirror 6 |

## Config

`VAULT_DIR` environment variable, or `config.json`. Never a literal path
in source.

## Status

Phase 1: read-only viewer.
