---
titulo: Home
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta]
cuando-usar: "The panel's home page — open it to see recent notes and vault health at a glance."
widgets:
  - kind: vault-health
    title: "Vault health"
    params: {}
  - kind: query
    title: "Recent notes"
    params:
      sort: { field: mtime, order: desc }
      limit: 10
      columns: [title, frontmatter.tipo, frontmatter.actualizado]
  - kind: count
    title: "Active notes"
    params:
      frontmatter:
        estado: activo
---

# Home

This file is the dashboard the panel shows at `/` — a normal file,
editable like any other. Delete it, move it, or change its widgets
without touching code; the panel only looks for a `widgets:` array in
the frontmatter.

Want an interactive view for something you'll track or manage often — a
todo list, a habit, a form? That's a **trick**, not a dashboard. Open
Claude Code and describe it in plain language; the `trick-creator` skill
writes the folder for you. There's no UI for creating them by hand —
they're made through chat.
