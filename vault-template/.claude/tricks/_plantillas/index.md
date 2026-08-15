---
titulo: Trick starters
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta, trick]
cuando-usar: "Read before writing a trick app from scratch — one of these four is usually closer to the request than an empty file."
---

# Trick starters

Four complete, working trick apps. Copy the one closest to what is being
asked for, then change it; write from scratch when none of them fits,
which is a normal outcome and not a failure of the starters. Between them
they cover every shape the retired v1 widget vocabulary could express,
which is the floor, not the ceiling — a trick is arbitrary HTML, CSS and
JavaScript.

| Starter | Capabilities it declares | What it is here to teach |
|---|---|---|
| `lista/` | `vault.query`, `vault.write` | Read a folder of notes, write one frontmatter field back. Optimistic UI with rollback, an empty state, a visible error, and re-reading when something else changes the files. The multi-file layout. |
| `tablero/` | `vault.query` only | A read-only view with a chart drawn as plain SVG — no library, because there is no network to load one from. Feature detection: it uses `trabajo.estado` if granted and says nothing if not. |
| `formulario/` | `vault.write` (`crear`, `cuerpo`) | The smallest useful trick: one file, markup, styles and script inline. Creating a note, and what a narrow capability forces you to design around. |
| `boton/` | `script.run`, `estado` | The `correr_script` boundary reached through the bridge, and the app's own persistence — one JSON file a person can read, because a sandboxed frame has no `localStorage`. |

## Copying one

The panel never lists these. `listTricks` only looks one level down from
`.claude/tricks/`, at folders holding a `trick.yaml`, and this folder
holds none — so `_plantillas/` is skipped and the starters stay invisible
until one is copied out.

```sh
cp -r .claude/tricks/_plantillas/lista .claude/tricks/<new-name>
```

Then, in order:

1. `trick.yaml` — `titulo`, `descripcion`, `icono`.
2. Every `carpeta:` and every `ruta:` in `trick.yaml`. These are literal
   paths, not derived from the folder name (a trick is allowed to read a
   folder it does not live in), so nothing rewrites them for you. A trick
   left pointing at `_plantillas`' paths writes into the wrong folder or
   is denied outright.
3. Any path constant in the app itself — `formulario` names its folder in
   `app/index.html` as well as in the manifest, and both must agree.
4. Delete the example item in `data/` once real ones exist.

`trick-creator` does all of this; this list is what it is doing, and what
to check if a copied trick behaves oddly.

## Where a trick's data should live

The starters write into their own `.claude/tricks/<name>/data/`, because
a starter has to be self-contained. That is the right home for the app's
own bookkeeping — an `estado.json`, a scratch list nobody would look for
by hand.

It is the wrong home for anything the user thinks of as their notes.
Those belong in a normal vault folder next to what they are about, where
search, the graph, the link checker and Obsidian can all see them
(`docs/roadmap.md` §9). Point `carpeta:` there instead. `vault.query` can
read any folder; `vault.write` can write any folder **except** under
`.claude/`, other than the trick's own `data/`.
