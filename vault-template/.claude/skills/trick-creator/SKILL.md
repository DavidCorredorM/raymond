---
name: trick-creator
description: Build a "trick" — a small web app that the panel renders over this vault. Arbitrary HTML, CSS and JavaScript in a sandboxed frame, reaching the vault only through capabilities its manifest declares. Use when the user wants a UI for something they track, manage or look at regularly, or wants a button that runs something. Triggers on "make me a [thing] tracker", "I want a UI for X", "build a trick for Y", "turn this into an app", "a chart of", "a form for", "a board for", "a button that runs".
---

# Trick creator

A trick is a folder under `.claude/tricks/<name>/` holding a real web app
and a manifest saying what that app may touch. The app is arbitrary
files — any HTML, CSS and JavaScript, canvas, SVG, drag and drop, a chart
you draw yourself, a game, a calculator. **There is no widget vocabulary
to stay inside and nothing to say "tricks can't do that" about.** If you
remember a fixed set of controls (`lista`, `boton`, `texto`, `checkbox`,
`fecha`, `select`, `formulario`), that was v1 and it is retired.

What replaced the vocabulary is a boundary. The app runs in an iframe on
an opaque origin, with **no network of its own**, and reaches the vault
only through a `postMessage` bridge scoped to the capabilities in
`trick.yaml`. Arbitrary JavaScript is only dangerous where it runs; run
there, with no vault handle and no way out, it is as harmless as
arbitrary markdown and as expressive as you like.

This file is enough to ship a working trick. `panel/docs/tricks-spec.md`
is the source of truth if the two disagree, and the place to go for *why*
any of it is shaped this way.

---

## 1. Ask what you need, don't guess

Still the step that saves the most rework. At minimum:

- **What does one item look like** — its fields, in the user's words.
- **What can they do to it** — tick, edit, add, only look?
- **Does anything happen on its own** — a schedule, or only when someone
  is looking at it?
- **Where does this data belong** — see §2; this one is usually decided
  by you and confirmed by them, not asked cold.

A trick built on a guessed data shape is expensive to redo once real
data exists in it.

## 2. Design the data as files first

The app is a **view over files**, not a store. Decide the files before
you write a line of the app.

**Where they live is a real decision, not a default.** Two homes:

| Put it in | When |
|---|---|
| A normal vault folder, next to what it is about | The items are things the user thinks of as *their notes*. Search, the graph, the link checker and Obsidian all see them. This is the usual answer. (`docs/roadmap.md` §9 — output belongs next to its subject, never in a dump folder.) |
| `.claude/tricks/<name>/data/` | The app's own bookkeeping: an `estado.json`, a scratch list nobody would go looking for by hand. `vault-lint` and the link checker skip `.claude/`, so this data never shows up in the vault's health counts either. |

Then the fields. Follow this vault's existing schema — read the root
`CLAUDE.md` for the field names and the language it uses, and do not
introduce a second schema for trick data. Ship a `data/_item.md` showing
the shape, and give it a `tipo` the app's filter does *not* match, so the
template stays out of its own list.

## 3. Copy a starter

Four are in `.claude/tricks/_plantillas/`, each complete and working.
Read `_plantillas/index.md` — it says what each one teaches and lists the
things to change after copying. In short:

| Starter | Declares | Closest to |
|---|---|---|
| `lista/` | `vault.query`, `vault.write` | a checklist, a reading list, anything "list of notes, tick or edit one field" |
| `tablero/` | `vault.query` | a read-only summary, counts, a chart |
| `formulario/` | `vault.write` | "give me a box to type into"; also the smallest possible trick, one file |
| `boton/` | `script.run`, `estado` | "a button that regenerates X" |

```sh
cp -r .claude/tricks/_plantillas/lista .claude/tricks/<new-name>
```

Use one when it fits and write from scratch when it doesn't — a kanban
board, a drawing pad and a calculator are all fine tricks and none of
them starts from a starter. Copy `app/bridge.js` regardless; it is the
same file in every trick and there is nothing in it to tune.

## 4. `trick.yaml`

```yaml
titulo: "Monthly spend"          # required
descripcion: "Log a spend, see the month's chart."
icono: "chart"                   # optional — one of the fixed set below;
                                  # anything else (including an emoji)
                                  # falls back to a generic icon in the
                                  # panel. There is no emoji rendering
                                  # path in the UI at all (owner's rule).

app:
  entrada: "index.html"          # optional, default "index.html"
  alto: 520                      # optional, iframe height in CSS px,
                                 # default 480, allowed 120–2000.
                                 # Width is always the panel's column.

capacidades:                     # §5. Absent or empty = no bridge at all,
  vault.query:                   # which is right for a purely visual trick
    carpeta: "projects/spend"
    limite: 500

acciones:                        # only if something runs a script — §9
programacion:                    # only if something runs on a clock — §10
```

`icono` picks one of the panel's own SVG icons — `checklist`, `play`,
`form`, `chart`, `health`, or `tricks` (the generic default, also what's
used when the field is missing or unrecognised). This is a fixed set on
purpose: the panel draws every icon itself, one weight, so it never
renders an emoji character coming from vault content — the owner's
explicit rule for this app, not a style preference. Pick whichever name
reads closest to what the trick does; there is no "add a new icon"
option short of editing `panel/web/src/icons/Icon.tsx`.

**Validation is unforgiving on purpose, and the failure is invisibility.**
A manifest that breaks any rule below is skipped in the panel's trick
list and 404s on its detail route — the trick does not appear at all. The
reason is in the server log, so look there when a trick vanishes.

- `titulo` is required.
- `app.entrada` must be a single relative path with no `..`, resolving
  under `app/`, ending in `.html`.
- Every key under `capacidades` must be one of the six names in §5.
  **A typo invalidates the whole manifest** rather than being ignored,
  because silently ignoring it is how a typo becomes an afternoon of
  "why doesn't my app work".
- Every `vault.*` capability needs a `carpeta`. It is vault-relative,
  with no `..` and no leading `/`. **`""`, `"."` and `"/"` are refused** —
  "the whole vault" is not a capability. A trick that genuinely wants to
  read across the vault should be a dashboard widget instead.
- `vault.write.carpeta` may not be under `.claude/` **unless** it is
  exactly this trick's own `.claude/tricks/<name>/data` or below it.

The manifest is read fresh from disk on every request that depends on it.
Nothing is cached, and nothing is ever taken from a request body.

## 5. Capabilities — the narrowest set that works

`capacidades` is a map, and **anything with no entry is denied**. There is
no ambient authority and no default grant. Six keys exist:

| Key | Ops it grants | Scope you must declare |
|---|---|---|
| `vault.query` | `vault.query` | `carpeta`, plus an optional `frontmatter` filter that is *always* applied, `campos`, `limite` (default 200, max 2000) |
| `vault.read` | `vault.read` | `carpeta`, optional `extensiones` (default `[".md"]`) |
| `vault.write` | `vault.write` | `carpeta`, `crear` (default false), `campos` — the exact frontmatter fields it may set — `cuerpo` (default false), `max_bytes` |
| `estado` | `estado.get` **and** `estado.set` | optional `max_bytes` (default 64 KiB) |
| `script.run` | `script.run` | `acciones: [0, 2]` — indices into this manifest's own `acciones` |
| `trabajo.estado` | `trabajo.estado` | `job:` — one named job, no globbing |

How to choose:

- **Start from what the app does, not from what it might need.** A view
  that only lists needs `vault.query` and nothing else.
- **`campos` under `vault.write` is the important one.** List the exact
  frontmatter fields the app changes. "Write any note" is not a
  capability; neither is "write any field". A write touching a field not
  in `campos` is refused whole, not applied in part.
- **Leave `crear` and `cuerpo` off** unless the app really creates notes
  or really replaces bodies.
- **Under-declaring is the intended development loop.** A missing
  declaration comes back as `capability_denied`, with a message naming
  what was refused, and the panel shows it next to the trick. It fails
  loudly. Over-declaring fails silently, forever.
- **Deletion is not a capability and will not be added.** A trick
  archives by setting a field or moving a file inside its own scope.
  Nothing a trick's browser code does should be unrecoverable with
  `git checkout`.

**`capacidades` constrains the browser, not the machine.** A scheduled
job that feeds the same trick runs on the box with full filesystem
access and does not go through the bridge at all. Say this out loud when
you explain a trick, because the natural misreading is that the manifest
describes everything the trick can do.

## 6. The bridge, as the app actually calls it

The panel mounts the app, then posts **one** hello message carrying a
`MessagePort`. Every request and response after that travels on the port.
The port *is* the app's identity — the host knows which trick is calling
from which port the message arrived on, so there is no token to keep, and
a `trick:` field in a message body is ignored.

The handshake, complete:

```js
let port = null;
addEventListener("message", (ev) => {
  if (ev.source !== window.parent) return;              // a sibling frame is not the host
  if (!ev.data || ev.data.raymond !== "trick-bridge") return;
  if (port) return;                                     // one port per mount
  port = ev.ports[0];
  port.onmessage = (e) => { /* responses and events */ };
  // ev.data also carries: trick, capacidades (manifest keys), tema, locale
});
```

Request and response:

```jsonc
// app → panel
{ "v": 1, "id": "r7", "op": "vault.query", "params": { "limite": 50 } }
// panel → app
{ "v": 1, "id": "r7", "ok": true,  "result": { "notes": [ /* … */ ] } }
{ "v": 1, "id": "r7", "ok": false, "error": { "code": "capability_denied",
                                              "message": "…" } }
// panel → app, unsolicited, no id
{ "v": 1, "ev": "datos.cambiaron", "paths": ["projects/spend/cafe.md"] }
{ "v": 1, "ev": "tema", "valor": "claro" }
```

`id` is yours and comes back verbatim. Every well-formed request gets
exactly one response; a malformed one gets **none** (an answer to a
malformed message would be a probing oracle), so time out on your own —
`bridge.js` does, at 15 s, matching the host.

### The ops

| Op | Params | Result |
|---|---|---|
| `vault.query` | `subcarpeta?`, `frontmatter?`, `sort?`, `limite?` — all of them **narrow, never widen**: `subcarpeta` must sit under the manifest's `carpeta`, `frontmatter` is ANDed with the manifest's filter, `limite` is clamped to it | `{ notes: [ … ] }`, each entry a note summary, restricted to `campos` if the manifest gave one |
| `vault.read` | `path` — vault-relative, under `carpeta`, matching `extensiones` | the file's contents. `assumed:` the exact result shape; the spec does not pin it down |
| `vault.write` | `path` — vault-relative, under `carpeta` — plus the fields to change. `assumed:` `{ path, frontmatter: {…}, cuerpo?: "…" }`; the spec pins the server's *checks*, not the params' names | `assumed:` an acknowledgement; the starters ignore the body and use `ok` |
| `estado.get` | none | the stored value, or `null`. `assumed:` whether it arrives bare or as `{ valor }` — the `boton` starter reads either in one line |
| `estado.set` | `valor` — any JSON | written to `.claude/tricks/<name>/data/estado.json`, pretty-printed |
| `script.run` | `indice` — an index listed in `script.run.acciones` | `{ stdout, stderr, exitCode, timedOut }` |
| `trabajo.estado` | none | `{ timestamp, exitCode, duration, enabled }` — the last row of `.claude/jobs/<job>.md` |

The rows marked `assumed:` are the ones the spec leaves as server-side
checks rather than a written params schema. The starters use the shapes
above. If a call comes back `bad_request` and the params look right,
that is the thing to check against the panel's bridge route before
assuming the app is wrong.

Errors: `capability_denied`, `bad_request`, `not_found`, `conflict`,
`too_many_requests`, `unsupported_op`, `internal`. Show them. An error a
trick swallows is an author debugging blind.

Limits, per mounted frame: **32** requests in flight, **20 ops/second**
(burst 40), **256 KiB** per message, pending requests expire at **15 s**.
An app that calls the bridge on every keystroke will hit
`too_many_requests` — debounce.

Feature-detect with `hello.capacidades`, which lists **manifest keys**,
not ops: check for `"estado"`, not `"estado.get"`.

**Re-render on `datos.cambiaron`.** A scheduled job, another device or
the user's editor can change the same files while the app is open, and
after an overnight run "nobody was watching" is the normal case, not an
edge case. Never write from a render path, though — that is the one way
to turn the event into a loop.

## 7. The environment — it is not a normal page

| Works | Does not, and how it fails |
|---|---|
| Relative URLs, subfolders, images, stylesheets, classic scripts | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` — blocked. Some throw, some return success and send nothing |
| `<script type="module">` as-is; dynamic `import()` **if the entry `<script>` has `crossorigin`** | Any remote URL: a CDN, Google Fonts, a remote image, a CSS `@import` from a URL. There is no network. Ship the file under `app/`, or inline it as a `data:` URI |
| Canvas, SVG, Web Animations, pointer events, drag and drop, blob Workers, `eval`, `new Function` | `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `document.cookie` — every one throws `SecurityError`, and an unguarded one at the top of a script kills the whole file. Persist through `estado` |
| `prefers-color-scheme`, plus the `tema` value in the hello and a `tema` event | `window.open`, form submission, navigating the top window — all refused. There is no `allow-forms`, so use a button and the bridge, not a `<form>` |
| Inline `<style>` and inline `<script>` — a one-file trick is a first-class shape | Navigating the frame itself: the panel treats a second `load` as "this trick navigated away", unmounts it and says so |

The frame does not resize itself. Set `app.alto` to what the app needs
and let content scroll inside it.

## 8. Failure modes you will actually hit

| Symptom | Cause | Fix |
|---|---|---|
| The trick is not in the list at all | The manifest failed validation — usually a mistyped capability name, or a `carpeta` of `""`, `"."` or `"/"` | The server log says which rule. §4 |
| "This trick navigated away from its app" | Something navigated the frame: a `location.reload()`, an `<a href>` that isn't handled, a stray `location.href =`. The panel unmounts on the second `load` event on purpose — the first port belongs to the document it was handed to, and a self-navigated frame is a different document | Render in place. Handle link clicks with `preventDefault()` |
| The scripts are fetched — visible in the network panel — but never execute, no CSP error, no clue | A server-side `Sec-Fetch-Site` check applied to *subresources*, which 403s every asset; the 403 body is JSON served with `nosniff`, so nothing runs and nothing complains | Not an app bug. The entry gate checks `Sec-Fetch-Site` only for the entry document, never for subresources. If you are in the panel's server code, the comment saying so is there for this reason — leave it |
| An ES module doesn't run, silently | App files are missing `Access-Control-Allow-Origin: *`. Module scripts are always fetched in CORS mode and the frame's origin is opaque, so there is nothing to match | Server side. Until it is fixed, a classic `<script src>` works |
| `TypeError: Failed to resolve module specifier './x.js'. The base URL is about:blank because import() is called from a CORS-cross-origin script.` | Dynamic `import()` from a classic script | Add `crossorigin` to the entry `<script>` tag. Fixes both relative and absolute forms |
| The whole app is blank and nothing ran | An unguarded `localStorage` or `document.cookie` at the top of a script threw | Use `estado`. Do not try/catch around storage and carry on — there is no storage to fall back to |
| `capability_denied` on a call that looks right | The manifest doesn't declare it, or `params.path` resolves outside `carpeta` | §5. `capability_denied` rather than `not_found` even for a path that doesn't exist, so an out-of-scope probe can't learn anything |
| `curl` of the app URL returns 403 | The entry gate, working. A request with no `Sec-Fetch-*` headers, or opened top-level in a tab, is refused — a sandboxed document opened top-level can redirect the tab, which is what the gate exists to prevent | Nothing. Test inside the panel |
| Calls start failing under `too_many_requests` | 20 ops/second, 32 in flight | Debounce; batch a render's reads into one query |

Two rules with no symptom, because their failure is silent and total:

- **`allow-same-origin` must never appear next to `allow-scripts`.** A
  frame with both can reach `window.frameElement`, strip its own sandbox
  and reload itself on the panel's origin. If an app seems to need
  `window.frameElement`, the app is wrong.
- **Never put a secret in a trick's files.** Anything on the tailnet can
  read a trick's app source, and the vault is a git repo. A script that
  needs a credential reads it from a file outside the vault.

## 9. `correr_script` — the highest boundary in the app

Some requests aren't "edit a note": "regenerate this report", "pull the
latest numbers". That is a script, declared in the manifest and reached
through `script.run`:

```yaml
capacidades:
  script.run:
    acciones: [0]

acciones:
  - etiqueta: "Rebuild the summary"
    control: boton
    accion:
      correr_script:
        ruta: ".claude/tricks/<name>/resumen.sh"
        args: []
```

The app sends `{ "op": "script.run", "params": { "indice": 0 } }` — an
index, nothing else. `ruta` and `args` come from the server's own fresh
read of `trick.yaml`. Four constraints, none optional, all enforced
server-side:

1. `ruta` resolves under `.claude/tricks/`. Any script there, not only
   this trick's — a trick may reuse another's.
2. `execFile`, never a shell. `args` is a fixed array written at author
   time, so there is nothing for a crafted argument to break out of.
   **Never build a shell command from a variable.**
3. A hard 5 s timeout. Longer work is a scheduled job, not a button.
4. Only a filesystem author may declare what runs. Everything under
   `.claude/` is executable configuration; no network endpoint may create
   or modify any of it.

These exist because this app has no authentication — the tailnet is the
perimeter, so anything on it can press the button. They are not about
keeping a human in the loop, and all four would still be required if
every run were unattended.

**If the real logic isn't available yet, write a script that says so and
exits cleanly** — `_plantillas/boton/ejemplo.sh` is exactly that. Never
fake output, and never leave a button that appears to work. Tell the user
what it is stubbed on.

A script that needs Claude to decide something is not a button. That is
`requiere_llm: true` and a scheduled job.

## 10. Scheduling — declare it here, install it with `schedule-job`

Ask first: **does this need Claude to decide something, or is it a fixed
rule a script can check?** A fixed rule ("flag anything past its due
date") is `requiere_llm: false` — cheaper, deterministic, same answer
every time. Prefer it whenever it genuinely suffices; that is an
engineering argument, not a safety one.

```yaml
programacion:
  cron: "0 7 * * *"
  accion: revisar_vencidos
  requiere_llm: false
```

This block is a **declaration, not an installation**. Nothing runs until
the job exists on the machine. Hand off to the `schedule-job` skill,
which writes the runner, the registry note under `.claude/jobs/` and the
cron entry — so a trick's job lives in the same registry as every other
job instead of a second, parallel one. Do not write a crontab here.

Then make the app honest about it: declare `trabajo.estado` with the job's
name and show "last run 07:04, exit 0" somewhere in the header. An app
fed by a job that quietly died otherwise shows stale numbers with total
confidence. `_plantillas/tablero/` has the pattern.

## 11. The chat side, if it earns its keep

A trick may carry its own `SKILL.md` next to `trick.yaml`, so the same
thing is usable in conversation as well as in the panel — the same notes
back both, and "add three items and mark the first one done" is faster
said than clicked. Write one only when there is something to say beyond
"open the panel": the folder, the fields, and what the app expects to
stay true.

`observed:` Claude Code discovers skills under `.claude/skills/` only —
that is the list a session in this vault loads. A `SKILL.md` inside a
trick folder is documentation an agent reads when pointed at it, not
something that fires on its own. If it should fire on its own, it belongs
in `.claude/skills/`, and the vault has a budget of about a dozen skills
before they start costing more context than they save.

## 12. Check it before handing it over

The panel is the only place a trick really runs, so mount it and click
it. Before that, the cheap checks that catch most of it:

```sh
# The manifest parses, and says what you think it says.
python3 -c 'import yaml,sys; print(yaml.safe_load(open(sys.argv[1])))' \
  .claude/tricks/<name>/trick.yaml

# Every app script is at least syntactically valid.
find .claude/tricks/<name>/app -name '*.js' -exec node --check {} \;

# No remote references sneaked in. Every hit here is a dead resource.
grep -rnE 'https?://|//cdn|fonts\.googleapis' .claude/tricks/<name>/app || echo "clean"

# No storage API a sandboxed frame will throw on.
grep -rnE 'localStorage|sessionStorage|indexedDB|document\.cookie' \
  .claude/tricks/<name>/app || echo "clean"

# Paths in the manifest actually exist.
grep -nE 'carpeta:|ruta:|entrada:' .claude/tricks/<name>/trick.yaml
```

Then in the panel: does it render, does a write land on disk (`git
status`), does an undeclared call show `capability_denied` rather than
failing quietly, and does it still look right at phone width?

## 13. Tell the user what you built

Plain language, no YAML. Someone non-technical should be able to follow
it and to turn the thing off:

- what it tracks, and **where the files are** — they own those, not the app
- what they can do in the panel
- what it is allowed to change, in words: "it can tick items off in that
  one folder; it can't create or delete anything"
- if a button runs a script: what the script does, and where its output
  lands (next to what it is about, never a dump folder)
- if anything runs on a schedule: when, in their timezone, what it
  changes on its own, and the exact way to stop it
- anything that is stubbed, said plainly rather than left to be
  discovered
