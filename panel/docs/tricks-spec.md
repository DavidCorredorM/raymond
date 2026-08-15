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
| `boton` | a single action | — | `set` / `crear_nota` / `archivar` / `correr_script` |

Every write action (`set`/`crear_nota`/`archivar`) funnels through the
same mechanism the dashboard's row-actions already use (plan §5.5): read
the note's current `content`, patch only the relevant piece with
`js-yaml`, `PUT` the whole file back. Same known limitation carried over
honestly, not hidden: **plain overwrite, no conflict detection** (plan
§5.5, §9) — a trick action can clobber a concurrent edit exactly like a
dashboard action can.

`correr_script` is different in kind, not degree — it runs code on the
server, not a file write. Its own section below.

## Running a script — `correr_script`

Decided 2026-08-15, when the first trick that needed to shell out (a
button regenerating a report, not just editing a note) came up.

```yaml
acciones:
  - etiqueta: "Generar cierre de este mes"
    control: boton
    accion:
      correr_script:
        ruta: ".claude/tricks/cierre-financiero-mensual/generar.sh"
        args: []
```

### Trust boundary — read this before adding one

This app has **no authentication**. A trick that can run a script is a
materially bigger trust boundary than one that can only write files —
"anything on the tailnet can press a button" now means "anything on the
tailnet can execute code," not just "edit a note." Three constraints, all
enforced server-side, none optional:

1. **`ruta` must resolve to somewhere under `.claude/tricks/`.** Absolute
   paths and anything that normalizes outside that directory (`../../`
   escapes) are rejected before the script ever runs. Chosen scope:
   **any** script under `.claude/tricks/`, not only the calling trick's
   own subfolder — a trick can reuse another trick's script. Looser than
   scoping each trick to its own folder, but still a real, checked
   boundary: nothing outside `.claude/tricks/` is reachable this way, no
   matter what a trick's author writes.
2. **Run via `execFile`, never a shell.** `args` is a fixed array from
   `trick.yaml`, passed straight to the child process — never
   concatenated into a shell string, never built from live user input at
   request time. This is what makes shell injection structurally
   impossible rather than merely unlikely: there is no shell parsing the
   argument list, so there is nothing for a crafted argument to break out
   of.
3. **A hard timeout**, killing the process if it runs long. A script that
   hangs must not hang the request that triggered it forever.

### What actually runs, and when the result appears

A manually clicked `boton` runs the script **immediately** and shows the
result inline — stdout, exit code, success or failure. No queue, no
staging step: the result of the run *is* the record, visible where it was
triggered. If the script writes to a vault file, that file updates
through the normal filesystem watcher like any other change — no
special-casing needed.

Note what the constraints above are and aren't grounded in. They exist
because **this app has no auth** (README rule 3) — the tailnet is the
perimeter, so anything on it can press this button. They are *not* a
consequence of wanting a human in the loop; README rule 4 no longer asks
for one. The allowlist, `execFile`, and the timeout would all still be
required if every run were unattended, which is exactly the case the
scheduling section below now covers.

If a script needs to call Claude (summarizing, judgment calls, anything
an LLM does that a deterministic script can't), that is **not** a
`correr_script` action from a button — see `requiere_llm: true` below.
Manual-click direct execution is for deterministic code only.

## Scheduling

Updated 2026-08-15, when README rule 4 was reversed. This section
previously argued that unattended scheduled agents were a closed decision
and that a scheduled trick needing Claude must propose rather than apply.
Neither holds now: **scheduled unattended runs are a first-class feature**,
and what the run owes is a file trail, not an approval.

```yaml
programacion:
  cron: "0 7 * * *"
  accion: revisar_vencidos       # a named action the trick's SKILL.md defines
  requiere_llm: false            # true only if the action needs Claude
```

- **`requiere_llm: false`** — the action is pure data logic (e.g. "flag
  todos past their `vence` date"). Deterministic, fixed cost per run.
  **Prefer this whenever it's sufficient** — an agent run for something a
  script can do is slower, costlier and less predictable, and that
  preference is about engineering, not safety.
- **`requiere_llm: true`** — the action needs Claude (e.g. "summarize
  this week's completed todos"), so the run is `claude -p` in the vault.
  It may write vault notes directly. What it must do instead of asking
  permission is leave a trail: append a dated line with its exit code to
  the job's note under `.claude/jobs/`, and put its real output next to
  what it's about (roadmap §9).

A proposal/inbox flow is still a perfectly good *choice* for an action
whose output a human wants to skim before it lands (roadmap #7, plan
§5.5). It is a preference a trick's author can set, not a gate the
system imposes.

**Do not build a second scheduling mechanism here.** `programacion` is a
declaration; materializing it is the `schedule-job` skill's job
(`vault-template/.claude/skills/schedule-job/`), which writes a cron
entry and the vault-side registry note. That skill also documents why
cron rather than systemd timers. A trick with a `programacion` block
should be scheduled by running `schedule-job` against it, so a trick's
job and a hand-written one appear in exactly one registry.

## The trick-creator skill

Lives in the base package at `vault-template/.claude/skills/trick-creator/`
— every deployment gets it, same as the four existing skills. Its job:
turn a plain-language request into a valid `trick.yaml` + `SKILL.md`,
using only the primitives above. It does not write arbitrary UI code —
that constraint is what keeps every trick it produces inside the safe,
declarative system this spec defines.

## Open, not decided here

- Whether the panel should read a trick's `programacion` block at all, or
  only ever the `.claude/jobs/` registry `schedule-job` maintains — two
  places claiming to say when something runs is a drift risk
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
