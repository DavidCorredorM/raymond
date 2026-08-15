---
titulo: Panel index
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta]
cuando-usar: "Read before adding or changing anything the web panel renders."
---

# Panel

Files the web panel reads directly, beyond the vault it browses.

| File | What |
|---|---|
| [[home]] | The dashboard shown at `/`. Any file with a `widgets:` array in its frontmatter works the same way, anywhere in the vault — this is just the one the panel picks for its home page. |

Full spec for widget kinds and parameters:
`panel/docs/frontend-implementation-plan.md` §5. Tricks (interactive
skill+UI plugins, not dashboards) live in `.claude/tricks/`, documented
in `panel/docs/tricks-spec.md`.
