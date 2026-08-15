# Tricks — a plugin system for the panel

Status: proposal, not yet implemented. Extends the frontend plan
(`frontend-implementation-plan.md`) — read that first, especially §5 (the
widget spec) and §5.5 (row actions), which this generalizes.

## What a trick is

A **trick** = a Claude Code skill + a declarative UI manifest, living
together as one folder. Drop the folder in, the panel renders it — no
code, no rebuild, no deploy. A non-technical user (or an agent, on their
behalf) describes what they want in plain language; the **trick-creator**
skill (see below) writes the folder.

This is the same "arrangement vs kind" split the dashboard system already
uses (plan §8), one level up:

| Level | Needs code? | Who does it |
|---|---|---|
| A new **trick** using existing primitives | No | Any user, or the trick-creator skill on their behalf |
| A new **primitive** (a control type the manifest can use) | Yes | Whoever maintains the base package |

## Why not arbitrary rendered code per trick

The obvious alternative — a trick ships a real React component, the panel
dynamically imports and runs it — gives genuine free-form "mini app"
power. Rejected for v1, for a reason specific to this project: **the
panel has no auth.** Rendering arbitrary markdown that anything on the
tailnet can write is already the trust model. Rendering and *executing*
arbitrary JavaScript that anything on the tailnet can write is a
different risk class — code can call `fetch()`, read every note, and send
it anywhere, not just render a broken widget. A malformed dashboard
degrades to one broken tile (plan §6.7); malformed arbitrary code doesn't
degrade, it just runs.

**v1 ships a fixed vocabulary of interactive primitives** (below) — safe
by construction, same trust model as the rest of the app, because a
trick can only ever compose things the base package already knows how to
render safely.

**v2, later, deliberately deferred:** a sandboxed escape hatch (iframe +
strict CSP + a narrow postMessage bridge exposing only the specific vault
calls a trick declares it needs — the same isolation pattern VS Code
webviews and Figma plugins use) for tricks that genuinely need custom
rendering the primitive vocabulary can't express. Not designed here. Do
not build this before v1 has real usage to learn from.

## Folder shape

```
.claude/tricks/<trick-name>/
├── SKILL.md          the Claude Code skill — identical shape to any
│                      other skill in .claude/skills/, loaded the same
│                      way when Claude Code works in this vault
├── trick.yaml         the UI manifest (below) — this is what makes it
│                      a trick and not just a skill
└── data/              optional — where the trick's own notes live, if
                        it manages a collection (e.g. todo items). Plain
                        vault notes, normal frontmatter, nothing special.
```

Tricks live under `.claude/tricks/`, not `.claude/skills/`, so the panel
can discover "which skills are tricks" by listing one directory rather
than opening every `SKILL.md` to check for a manifest. `SKILL.md` inside
a trick is still a completely normal skill — Claude Code loads it the
same way regardless of which directory it's in, so a trick's skill works
in chat exactly like any other skill, with the UI as an addition, not a
replacement.

## `trick.yaml` schema

```yaml
titulo: "Lista de pendientes"
descripcion: "Pendientes personales, con fecha límite opcional."
icono: "✓"

datos:
  fuente: nota                    # nota | carpeta
  ruta: ".claude/tricks/todo/data"
  esquema:                        # frontmatter fields this trick's notes use
    hecho: boolean
    vence: date?

ui:
  layout: lista
  campos:
    - campo: titulo
      control: texto
    - campo: hecho
      control: checkbox
      accion: { set: { hecho: "$valor" } }
    - campo: vence
      control: fecha

acciones:
  - etiqueta: "Agregar"
    control: formulario
    campos: [titulo, vence]
    accion: { crear_nota: { plantilla: "data/_item.md" } }
```

Field names are Spanish here because that's this vault's schema — the
manifest format itself is language-agnostic (it's a fixed set of YAML
keys, not user-facing prose), so the same schema serves an English-schema
deployment without change.

### v1 primitives

| `control` | Renders | Reads | Writes |
|---|---|---|---|
| `texto` | plain text | a frontmatter field or the body | — |
| `checkbox` | toggle | a boolean field | `set` one field |
| `fecha` | date picker | a date field | `set` one field |
| `select` | dropdown | an enum field | `set` one field |
| `lista` | repeats a row per matching note | a `datos` query (same shape as dashboard `query`, plan §5.3) | — |
| `formulario` | a small input form | — | `crear_nota` (from a template) |
| `boton` | a single action | — | `set` / `crear_nota` / `archivar` |

Every write action funnels through the same mechanism the dashboard's
row-actions already use (plan §5.5): read the note's current `content`,
patch only the relevant piece with `js-yaml`, `PUT` the whole file back.
No new backend endpoint. Same known limitation carried over honestly, not
hidden: **plain overwrite, no conflict detection** (plan §5.5, §9) — a
trick action can clobber a concurrent edit exactly like a dashboard
action can.

## Scheduling — the part that reopens a closed decision

**Flagging explicitly:** the project decided against unattended scheduled
agents (spend, permission, runaway-loop risk — `docs/roadmap.md`
context). A general "any trick can schedule anything" capability
reintroduces exactly that surface if left unconstrained. This spec
narrows it rather than reopening it wholesale:

```yaml
programacion:
  cron: "0 7 * * *"
  accion: revisar_vencidos       # a named action the trick's SKILL.md defines
  requiere_llm: false            # true only if the action needs Claude
```

- **`requiere_llm: false`** — a scheduled action that's pure data logic
  (e.g. "flag todos past their `vence` date") runs as a plain script via
  a systemd timer. No LLM call, no spend risk, no runaway loop possible —
  it's deterministic code with a fixed cost per run, the same risk
  profile as any cron job.
- **`requiere_llm: true`** — a scheduled action that needs Claude (e.g.
  "summarize this week's completed todos") invokes `claude -p` the same
  way the SIGRA skill port will, **and defaults to proposing, not
  applying** — it writes its output to `panel/pendientes.md`-style inbox
  note or the dashboard's existing proposal/approve pattern (plan §5.5,
  roadmap #7), never edits vault notes directly, unless a user explicitly
  marks that specific trick `auto_aplicar: true` after seeing it run
  correctly a few times. This is the same "agent proposes, human
  approves" principle the roadmap already commits to — tricks don't get
  a quieter path around it just because they're user-authored.

Materializing `programacion` into actual systemd timers is server-side
work, not designed here — noted as a dependency for whoever implements
scheduling, not assumed solved.

## The trick-creator skill

Lives in the base package at `vault-template/.claude/skills/trick-creator/`
— every deployment gets it, same as the four existing skills. Its job:
turn a plain-language request into a valid `trick.yaml` + `SKILL.md`,
using only the primitives above. It does not write arbitrary UI code —
that constraint is what keeps every trick it produces inside the safe,
declarative system this spec defines.

## Open, not decided here

- Exact systemd-timer materialization for `programacion`
- Whether `lista`/`formulario` need pagination once a trick's `data/`
  folder gets large
- The v2 sandboxed escape hatch (deliberately deferred, see above)

## Relationship to the widget spec

A trick's `ui.campos` with `control: lista` is deliberately the same
query shape as a dashboard's `kind: query` widget (plan §5.3) — one
`DataQuery` type, two renderers. Do not fork this into two similar-but-different
filter languages; if dashboards' query params grow a feature, tricks'
`datos` block should either grow the same feature or explicitly not need
it, not silently diverge.
