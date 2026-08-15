# Frontend implementation plan

Status: proposal. Scope: `web/` only. Nothing here changes `server/src/*`
— where a capability is missing from the current API, it is called out
explicitly as a **recommended backend addition** requiring separate
sign-off, not something this plan assumes exists.

## 1. What the backend already gives us

Read from `server/src/vault.ts` and `server/src/index.ts` directly (not
assumed):

- `GET /api/notes` → every note's `path`, `slug`, `title`,
  `frontmatter: Record<string, unknown>`, `mtime`, `size`. No body. This
  is enough to build a file tree, a search index, and every dashboard
  query — all client-side, no new endpoint needed.
- `GET /api/note?path=` → the above plus `content` (raw file, frontmatter
  block included) and `backlinks: string[]` (already resolved paths, not
  raw link text).
- `PUT /api/note` → `{ path, content }`, full-file overwrite. There is no
  partial/frontmatter-only write endpoint.
- `GET /api/health/vault` → `brokenLinks`, `slugCollisions`,
  `missingFrontmatter` — real, already-computed data, not something the
  frontend derives.
- The server watches the filesystem (`chokidar`) and reindexes on
  change, but does not push anything to clients. Today the only way a
  browser tab learns about an external edit (Obsidian, an agent, another
  tab) is to refetch.
- `frontmatter` is untyped (`Record<string, unknown>`) and the *field
  names in it are not fixed* — the reference vault in this org uses
  Spanish (`tipo`, `estado`, `cuando-usar`), and this package is
  explicitly meant to be schema-agnostic across other users' vaults.
  Anything the frontend keys off frontmatter must not assume a
  particular language or field set.
- `server/package.json` already lists `@fastify/static` as a dependency,
  but `index.ts` never registers it. That's a strong signal the intended
  production topology is **one process, one port**: the built `web/dist`
  served by the same Fastify instance that serves the API, behind
  Tailscale. Wiring that up is a `server/` change and out of scope here,
  but the frontend build must produce a static `dist/` that would drop
  into that shape without rework (relative asset paths, no assumption of
  a dev-server proxy in production).

## 2. Research

### 2.1 CodeMirror 6 embedding — SilverBullet and Obsidian

SilverBullet's client is built on CM6 directly: [SilverBullet
Architecture](https://silverbullet.md/Architecture) describes a
browser-tab client that owns "90%+ of the logic" (editor, scripting,
datastore) talking to a thin server over an HTTP file API — the same
shape as this project (thin Fastify file server, fat browser client).
Per the [DeepWiki
writeup](https://deepwiki.com/silverbulletmd/silverbullet) and package
inspection, SilverBullet assembles its editor state from CM6's modular
extensions and uses `Compartment` objects so parts of the config (vim
mode, indent unit, undo history) can be swapped at runtime without
recreating the whole `EditorState` — the standard CM6 pattern for
"settings that change after the editor already exists."

Both SilverBullet's [Live Preview](https://silverbullet.md/Live%20Preview)
doc and Obsidian's live-preview mode do the same trick, independently
converged on: **decorations, not a second renderer.** The document stays
plain markdown text the whole time; a `ViewPlugin` scans the *visible*
ranges (not the whole document — that's the perf-critical detail) and
applies CM6 `Decoration`s:

- `Decoration.mark` — style a range in place (e.g. color `[[wikilink]]`
  text, without touching it).
- `Decoration.replace` with a `WidgetType` — swap a range for a rendered
  DOM node (checkbox for `- [ ]`, rendered image for `![[img]]`).
  `Decoration.replace` deals with position mapping, that's the primary
  reason to use decorations at all rather than swapping out text under the cursor.
- Formatting characters (`**`, `#`, `[[`/`]]`) are hidden with a
  zero-width replace decoration *except on the line the cursor is
  currently on*, which is what makes it "live" rather than a rendered
  read-only view. This is the expensive part: it means every cursor move
  can force a decoration recompute, and getting the "which range counts
  as the cursor's line" logic right (multi-line constructs, tables) is
  where most of the engineering time goes.

Confirmed by two independent third-party writeups building the same
thing from scratch: [blueberrycongee/codemirror-live-markdown design
doc](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/CODEMIRROR_LIVE_PREVIEW_DESIGN.md)
and [kenforthewin/atomic-editor](https://github.com/kenforthewin/atomic-editor)
both describe this as a `WidgetType`-based reimplementation of Obsidian's
approach, and both frame it as a substantial, standalone piece of work —
not a config flag on top of `@codemirror/lang-markdown`. A related
Obsidian-plugin writeup on the decoration mechanism itself: [Show text
selection across embeds in Obsidian
(CM6)](https://designdebt.club/show-text-selection-across-embeds-in-obsidian-codemirror-6/).

**Implication for this plan:** full hide-syntax-until-cursor live preview
is treated as a distinct, optional phase (2b, see §4), not a prerequisite
for shipping editing. A plain `@codemirror/lang-markdown` setup with
syntax *highlighting* (colors, not hiding) is a config flag, ships in
days, and is already a large usability jump over a `<textarea>`.

### 2.2 Declarative dashboards — SilverBullet Lua, Obsidian Bases, Dataview

Three real designs for "a page that queries notes and renders results,"
same problem this project's dashboards solve, three different points on
the power/safety tradeoff:

| System | Query surface | Tradeoff |
|---|---|---|
| **Dataview** (Obsidian community plugin) | DQL (SQL-like) or full DataviewJS | Most expressive. Also the most dangerous — DataviewJS is arbitrary JS executed against the vault, and even DQL requires learning a query language before writing the first dashboard. |
| **Obsidian Bases** (core, 2025+) | Declarative YAML: `filters` (boolean expressions over properties), `views` (table/cards/list/map), `formulas` (computed columns) | No query language to learn for the common case, but the filter *expressions* are still a small language (`file.inFolder(...)`, `status != "Done"`) that needs a parser and an eval sandbox. See [got.md's Bases guide](https://got.md/obsidian-bases/) and [Obsibrain's guide](https://www.obsibrain.com/blog/obsidian-bases-guide) for the schema. |
| **SilverBullet Space Lua / SLIQ** | Full Lua scripting language, with a SQL-flavored query sub-language (SLIQ) for the common case | Most powerful of the three — "build dashboards, task lists, project trackers" per [silverbullet.md](https://silverbullet.md/Live%20Queries) — but it ships a Lua interpreter into the client and every dashboard file becomes a place arbitrary logic can live. |

The common thread: **whoever writes the query is the same person (or
agent) who writes vault notes, over an unauthenticated app with
filesystem write access.** DataviewJS-in-a-note-frontmatter or a Lua
interpreter is a lot of power to hand to something that already runs
with no auth in front of it. This project's data is a JSON object
(`frontmatter`), not a graph of files-as-values SilverBullet queries —
so it does not need a query language at all for the common case: **an
object of equality/comparison filters is sufficient**, and is trivial
for an agent to generate correctly (it's JSON, not a grammar). §5 below
adopts the Bases shape (declarative `filters`, not a query string) but
flattens it further, dropping the formula-expression language in favor
of a fixed set of comparison keys. If a real dashboard later needs
something the flat filter object can't express, that is the signal to
add a narrow escape hatch (§8), not to adopt a general query language
up front.

### 2.3 React + CodeMirror 6 integration

[`@uiw/react-codemirror`](https://github.com/uiwjs/react-codemirror)
(current: **4.25.11**, requires React ≥16.8, works fine under React 19)
is the de-facto standard wrapper — it wraps `EditorView` creation,
teardown, and extension-array diffing so the app doesn't reimplement
CM6's React lifecycle glue. It exposes both a `<CodeMirror>` component
(`value`, `onChange`, `extensions`, `theme`, `basicSetup`,
`editable`/`readOnly`) and a lower-level `useCodeMirror()` hook for
direct `EditorView` access when a component needs to call CM6 commands
imperatively (e.g. "insert `[[` at cursor" from a toolbar button).

The two pitfalls that show up repeatedly in the wrapper's own docs and
in third-party writeups
([thetrevorharmon.com](https://thetrevorharmon.com/blog/codemirror-and-react/)):

1. **Extensions array identity.** Passing a new `extensions={[...]}`
   array literal on every render forces the wrapper to tear down and
   rebuild the CM6 config on every keystroke. Fix: extensions must be
   `useMemo`'d (or defined at module scope when they don't depend on
   props) — dependency array keyed on the actual inputs (e.g. the note's
   list of known slugs for autocomplete), not on unrelated re-renders.
2. **Controlled-value feedback loop.** Feeding `value` from the same
   state that `onChange` writes to, on every keystroke, is the textbook
   controlled-`<input>` mistake replayed against a much heavier editor —
   CM6 has to reconcile the incoming `value` against its own internal
   `EditorState` on every render even though nothing external changed.
   **This plan avoids the problem structurally rather than fighting it**:
   the editor is keyed by note path (`<CodeMirror key={note.path} .../>`)
   so React fully remounts it on note switch instead of diffing;
   `value` is only ever set from server data (initial load, or an
   external file-watch change arriving via poll/SSE — §7), never
   round-tripped through the same state `onChange` populates. `onChange`
   writes to a separate "dirty buffer" that only that component and the
   save action touch.

### 2.4 Wiki-link autocomplete and backlinks UI

CM6's own [autocompletion
example](https://codemirror.net/examples/autocompletion/) and the
[`@codemirror/autocomplete`](https://github.com/codemirror/autocomplete)
docs (current: **6.20.3**) show the shape every implementation uses: a
completion *source* is a plain function `(context: CompletionContext) =>
CompletionResult | null`, registered either globally via
`autocompletion({ override: [source] })` or per-language via
`languageData.of({ autocomplete: source })`. The source uses
`context.matchBefore(regex)` to detect it's inside a trigger — for wiki
links that's a pattern like `/\[\[[^\]]*/` — and returns `{ from,
options }` where `from` is the position the match started, so accepting
a completion replaces exactly the partial link text.

Prior art on the wiki-link-autocomplete-plus-backlinks-panel pattern
specifically: [Foam's wiki-links
doc](https://docs.swo.moe/foam-1/wiki-links.html) confirms the standard
UX — typing `[[` opens completion against known note titles, and a
separate always-visible panel lists notes that link *back* to the
current one, each with a text preview of the linking context. That
matches this project's data shape closely: the backend already returns
`backlinks: string[]` (paths) per note — the frontend only needs to
resolve those paths to titles (already has them from `GET /api/notes`)
and render the panel; no snippet/context preview is available from the
API today (would require re-reading each linking note's body), so phase
1's backlinks panel is a flat list of titles/paths, not context-preview
cards — noted as a gap, not silently upgraded.

For the completion **source data**: `GET /api/notes` already returns
every note's `slug`, `title`, and `path` in one request. The client
loads it once (TanStack Query, cached), and the wiki-link completion
source filters that in-memory list — no new endpoint, no per-keystroke
network round trip.

---

## 3. Phasing — validated, with one change

The project's stated order: **read-only viewer → editing → dashboards →
agent surfaces → scheduled jobs.**

**Read-only viewer first: correct, keep as-is.** It's the lowest-risk
slice, it's useful standalone (browse + backlinks + vault health, today,
with zero write risk against someone's real vault), and it forces the
one piece of shared infrastructure every later phase depends on: link
resolution and rendering. Get that right once, reuse it in the editor,
in dashboards, and in backlink panels.

**Editing second: correct, but split it.** The research in §2.1 shows
"editing" is really two very different-sized pieces of work wearing one
name:

- **2a — plain CM6 editor + save.** Syntax-highlighted source mode
  (`@codemirror/lang-markdown`, no decoration trickery), a save action
  (`Cmd/Ctrl+S` → `PUT /api/note`), dirty-state indicator, wiki-link
  autocomplete (§2.4 — cheap, high value, not related to live-preview
  complexity at all). This is days of work and should ship as "phase 2."
- **2b — Obsidian-style live preview** (hide markdown syntax except on
  the active line). This is weeks of work per the prior-art comparisons
  in §2.1, and it is a **pure editing-experience upgrade** — it changes
  nothing about what dashboards, agent surfaces, or scheduled jobs need.
  Recommendation: **ship 2a, then move to dashboards, and revisit 2b
  as a later polish pass** once it's clear the app has real users who'd
  benefit from it. Sequencing full live-preview ahead of dashboards
  would burn weeks on editor polish while the "dashboards are just
  files" promise — the one differentiator this app can't get from
  Obsidian-plus-a-plugin — stays unshipped.

**Dashboards third: correct, and here's why it's not just next-in-line —
it's a prerequisite for phase 4, not a peer.** An agent inbox ("show me
pending proposals, let me approve or reject") is structurally a
dashboard: a `kind: query` widget filtering notes by
`frontmatter.status == "pending"`, plus one new capability dashboards
don't have yet — a row-level **action** that writes a frontmatter field
back (`status: approved`) without the user hand-editing YAML. So phase 4
isn't "build an inbox UI"; it's "add an `actions` option to the existing
`query` widget kind" (§5.5). Building dashboards first, generically,
means phase 4 is small.

**Agent surfaces fourth: correct**, contingent on the above — once
`query` widgets support row actions, "inbox" and "proposal review" are
dashboard *files*, not new frontend code.

**Scheduled jobs fifth: correct, and the frontend piece of it is close
to zero.** Nothing about triggering or running scheduled jobs is a
frontend concern (that's a cron entry writing files, same as any other
agent). The only frontend surface is observability — "did the job run,
what did it do" — which is a `kind: log-tail` or `kind: query` widget
reading whatever log file the job already writes. That widget kind could
even be built earlier opportunistically since it's not coupled to
scheduling infrastructure; it just has nothing to point at until jobs
exist.

**Net change to the stated order:** split phase 2 into 2a (ships before
dashboards) and 2b (ships after, as polish) — everything else confirmed.

---

## 4. Phase plan (concrete)

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | Read-only viewer: note tree/search, rendered markdown with resolved `[[links]]`, backlinks panel, vault-health page | Existing API only |
| 2a | CM6 source-mode editor, save, wiki-link autocomplete, dirty-state guard | Phase 1's link resolution + note list |
| 3 | Dashboard files: `query`, `stale`, `count`, `vault-health`, `backlinks` widget kinds | Phase 1 |
| 4 | `actions` on `query` widgets (frontmatter-field writes) → inbox/proposal dashboards | Phase 3 |
| 2b | Live-preview decorations (optional, revisit after 3–4 ship) | Phase 2a |
| 5 | `log-tail` widget for scheduled-job observability | Phase 3 (widget infra), whenever jobs exist |

---

## 5. The widget spec

### 5.1 Design decision: how a note becomes a dashboard

The reference vault's schema uses `tipo: decision | nota | ...`
(Spanish); other vaults using this package will have their own
taxonomy, or none. **Dashboard detection must not depend on any
`type`/`tipo`-style field or its values** — that couples the frontend to
one vault's language and taxonomy, which the whole project is designed
to avoid (README principle 4).

Instead: **a note is a dashboard if its frontmatter contains a
`widgets` array.** Purely structural, zero dependency on any other
frontmatter convention, and self-evidently true — you can't render a
dashboard without something to render. Everything else in frontmatter
(title field, tags, whatever taxonomy a given vault uses) is untouched
and irrelevant to detection.

### 5.2 Schema

```yaml
---
# Any other frontmatter fields this vault's schema uses are untouched —
# dashboard detection only looks for `widgets`.
widgets:
  - kind: <string>       # required — selects the renderer, see registry below
    title: <string>      # required — heading rendered above the widget
    params: <object>     # kind-specific, see below
---

Optional free-text markdown body — rendered above the widget grid,
same as any other note. This is where a dashboard's own explanation
lives; it does not need a `kind: markdown` widget to say "here's what
this page is for."
```

### 5.3 Widget kinds — phase 3

**`query`** — filter notes by frontmatter, render a table.

```yaml
- kind: query
  title: "Open decisions"
  params:
    frontmatter:
      tipo: decision        # equality match
      estado: activo
    frontmatter_exists: []  # optional: field must be present, any value
    folder: "org/"          # optional: path prefix filter
    sort: { field: actualizado, order: desc }
    limit: 20
    columns: [title, frontmatter.area, frontmatter.actualizado]
```

Filter semantics: every key in `frontmatter` is an equality match,
ANDed together; `frontmatter_exists` ANDs a presence check for fields
whose *value* doesn't matter (e.g. "has a `cuando-usar` at all"). No
OR, no comparison operators, no expression strings — see §2.2 for why
that's deliberate for phase 3. `columns` addresses either top-level note
fields (`title`, `path`, `mtime`) or `frontmatter.<key>` via dot path;
missing values render blank, not an error.

**`stale`** — notes whose tracked date is older than N days, or whose
`mtime` is (fallback when a vault has no date field convention).

```yaml
- kind: stale
  title: "Not touched in 90+ days"
  params:
    days: 90
    date_field: actualizado   # optional; omit to use file mtime instead
    folder: "org/2.Producto-y-Tecnologia/projects/"
```

**`count`** — a single-number stat tile. Same filter shape as `query`,
no columns.

```yaml
- kind: count
  title: "Open proposals"
  params:
    frontmatter: { tipo: proposal, estado: pendiente }
```

**`vault-health`** — thin passthrough over `GET /api/health/vault`.
No query filters; this widget's entire job is to surface data the
backend already computes, per the task brief's instruction that this
must be real data, not a mockup.

```yaml
- kind: vault-health
  title: "Link integrity"
  params:
    show: [brokenLinks, slugCollisions, missingFrontmatter]  # omit to show all three
```

**`backlinks`** — embed a specific note's backlink list inside a
dashboard (distinct from the always-on backlinks panel on note pages —
useful for e.g. "everything linking into this project's index").

```yaml
- kind: backlinks
  title: "What links to the roadmap"
  params:
    path: "org/2.Producto-y-Tecnologia/product/roadmap.md"
```

### 5.4 Worked example — a full dashboard file

```yaml
---
titulo: "Engineering health"
cuando-usar: "Open weekly to see stale docs and link rot before they compound."
widgets:
  - kind: vault-health
    title: "Link integrity"
    params: {}
  - kind: stale
    title: "Project notes untouched 90+ days"
    params:
      days: 90
      date_field: actualizado
      folder: "org/2.Producto-y-Tecnologia/projects/"
  - kind: count
    title: "Notes missing cuando-usar"
    params:
      frontmatter_exists: []
      # deliberately left generic in this example — a real dashboard
      # would reuse the same list health/vault already returns rather
      # than re-deriving it via a query filter
---

Reviewed every Monday. If `brokenLinks` isn't empty, fix it same-day —
link rot compounds fast once a vault crosses a few hundred notes.
```

### 5.5 Phase 4 addition — row actions

```yaml
- kind: query
  title: "Pending proposals"
  params:
    frontmatter: { tipo: proposal, estado: pendiente }
    columns: [title, frontmatter.area, frontmatter.actualizado]
    actions:
      - label: "Approve"
        set: { estado: aprobado }
      - label: "Reject"
        set: { estado: rechazado }
```

An action button does a targeted write: fetch the note's current
`content` (already have it via `GET /api/note`), patch the YAML
frontmatter block only (via `js-yaml`, §6), leave the body untouched,
`PUT` the whole file back. This is a *client-side* frontmatter patch
against the existing full-overwrite `PUT /api/note` — no new backend
endpoint required, because the frontend already has to read-then-write
the whole file for the editor in phase 2a and can reuse that path.
Flag: **this is a plain overwrite, not a diff/merge** — if the file
changed on disk between the GET and the PUT (another tab, an agent,
Obsidian), the action silently clobbers that change. Same race the
editor's save button has (§7) and worth solving once, not twice.

---

## 6. Component architecture

### 6.1 Stack

Vite + React + TypeScript, matching the stated team preference (boring,
hireable). No server-side rendering — this is a local/tailnet control
panel with one active reader at a time in the common case, SSR buys
nothing and adds a second runtime to reason about.

### 6.2 State management

Two different kinds of state, two different tools, deliberately not
one framework doing both (this split — TanStack Query for server state,
a small client-state layer for the rest — is the current mainstream
recommendation for exactly this reason; server state has caching,
staleness, and refetch concerns that client-state libraries don't
model, and modeling them by hand in `useState`/`useReducer` reinvents a
worse version of what TanStack Query already does):

- **Server state — TanStack Query** (`@tanstack/react-query`,
  **5.101.4**). `GET /api/notes` is one query, cached and shared across
  every component that needs the note list (tree, search, dashboard
  widgets, autocomplete source) — fetched once, not once per consumer.
  `GET /api/note?path=` is a query keyed on path. `PUT /api/note` is a
  mutation that invalidates both the specific note query and the list
  query on success.
- **Client/UI state — plain React state first, Zustand only where
  prop-drilling actually hurts.** Sidebar collapse, active theme: local
  `useState`/context, no library needed. The one piece of state that
  earns a small store is the **editor dirty buffer** (phase 2a) — it
  needs to be read by the save button, the route-leave guard, and the
  editor itself, none of which are in a parent/child relationship with
  each other. `zustand` (**5.0.15**) for that single store; resist
  adding more stores unless a second genuine cross-tree state need
  shows up.

### 6.3 Page structure

```
App
└── VaultShell                       (persistent layout)
    ├── NoteTree                     (from notes query, grouped by folder)
    ├── SearchBox                    (client-side filter over notes query)
    └── <Outlet />
        ├── /note/*path  → NoteRoute
        │     ├── NoteViewer          (phase 1, read mode — rendered markdown)
        │     ├── NoteEditor          (phase 2a, edit mode — CM6, toggled)
        │     └── BacklinksPanel      (phase 1 — from note.backlinks)
        ├── /dashboard/*path → DashboardRoute
        │     └── DashboardRenderer
        │           └── Widget[kind]  (phase 3 — registry lookup, §8)
        └── /health → redirects to the shipped default vault-health
              dashboard file (§8.2) — not a bespoke page; proves the
              dashboard mechanism covers even the app's own "built-in"
              page
```

Routing: `react-router-dom` (**7.18.2**). Any note path can be either a
regular note or a dashboard — the route component checks for a
`widgets` array (§5.1) after loading and renders `NoteViewer` or
`DashboardRenderer` accordingly; there's no separate URL namespace to
keep in sync with what's actually a dashboard.

### 6.4 Markdown rendering (phase 1, read-only)

`react-markdown` (**10.1.3**) + `remark-gfm` (**4.0.1**) for tables/task
lists/strikethrough, plus a small custom remark plugin (not the
`remark-wiki-link` package — see below) that turns `[[target|alias]]`
text nodes into link nodes.

**Why not `remark-wiki-link` (2.0.1, exists on npm):** it implements its
own resolution (permalink generation from a page list), which would
duplicate — and likely diverge from — the server's `resolveLink` in
`vault.ts` (bare slug, root-relative, note-relative `../`, escaped-pipe
handling — all real, all already tested server-side). A ~30-line custom
remark plugin that only *parses* `[[...]]` into a link-shaped AST node,
leaving resolution to data the client already has (§6.5), is less code
than correctly configuring a third-party plugin to defer resolution the
way this project needs.

### 6.5 Link resolution in the frontend — and the one recommended backend addition

The client needs to turn `[[target]]` into a real `href` and know
whether it's broken (render distinctly, matching `vault-health`
semantics). Two options:

1. **Client-side bare-slug resolution only.** Build a `slug → path` map
   from the already-fetched `GET /api/notes` list (every note carries
   `slug`). Per the comment in `vault.ts`, bare slug is "the common
   case" — this covers most real links with no backend change and no
   duplicated logic, because bare-slug matching is a one-line lookup,
   not an algorithm. **This is what phase 1 ships with.**
2. **Recommended (not required) addition:** since `resolveLink` is
   already called once per link when the server builds the backlink map
   (`deriveMaps` in `vault.ts`), the marginal cost of also returning
   the resolved form is one extra field, computed from a function that
   already exists and is already exercised by existing tests — not new
   logic. Proposal for whoever owns `server/`: add
   `resolvedLinks: Array<{ target: string; path: string | null }>` to
   the `GET /api/note?path=` response, additive only, no change to
   `Note`, `VaultIndex`, or any existing field. This closes the gap for
   `../`-relative and root-relative links (uncommon per the code
   comment, but real) without the frontend re-implementing a resolver
   that already has documented edge cases (escaped pipes) living
   server-side. **Flagging, not doing** — this plan does not touch
   `server/`.

### 6.6 CM6 editor integration (phase 2a)

```tsx
<CodeMirror
  key={note.path}                 // full remount on note switch — §2.3
  value={initialContent}          // only ever server-sourced, never onChange-sourced
  extensions={editorExtensions}   // module-scope or useMemo'd, never inline
  onChange={(v) => setDirtyBuffer(v)}
  basicSetup={{ foldGutter: false /* ... */ }}
/>
```

`editorExtensions` = `[markdown({ base: markdownLanguage }),
wikilinkDecorationPlugin, autocompletion({ override: [wikilinkSource] })]`.

- `@codemirror/lang-markdown` (**6.5.2**) — base language support.
- `wikilinkDecorationPlugin` — a `ViewPlugin` that marks `[[...]]` ranges
  with a CSS class for visual distinction (color, underline on hover).
  This is *not* phase-2b live preview — it doesn't hide or replace
  anything, purely a `Decoration.mark`, cheap, ships in phase 2a.
- `wikilinkSource` — completion source per §2.4, backed by the
  already-cached notes query, no network call per keystroke.
- `@codemirror/autocomplete` (**6.20.3**), `@codemirror/state`
  (**6.7.1**), `@codemirror/view` (**6.43.8**) as direct deps for
  writing the plugin/source above (the wrapper re-exports some of this,
  but pinning direct deps avoids being stuck on whatever subset `@uiw/react-codemirror`
  happens to re-export).

### 6.7 Frontmatter round-tripping

`js-yaml` (**5.3.0**) `dump`/`load` for the phase-4 row-action patch
(§5.5) and for any future "edit frontmatter as a form, not raw YAML"
UI (explicitly out of scope for phase 1–4, noted for completeness).
Widget `params` validation uses `zod` (**4.4.3**) — each widget kind
owns a small schema; a malformed `params` object (bad YAML, wrong
type) fails that one widget with an inline error box (per-widget
`ErrorBoundary`), not the whole dashboard page. This matters because
dashboard files are hand- or agent-authored YAML with no schema
enforcement at write time — the render path is the only validation
layer that exists, so it must degrade to "one broken tile," not "blank
page."

---

## 7. Live updates — polling now, SSE flagged for later

The server watches the filesystem but pushes nothing (§1). Options:

- **Phase 1–4: poll.** TanStack Query's `refetchInterval` (e.g. 15–30s
  on the notes list, shorter or on-focus for the currently open note)
  is enough for a single-user tailnet app where "another process edited
  a file" is an occasional event, not a stream. Zero backend change,
  zero new infra.
- **Later, if it's felt:** the server already runs `chokidar`; wiring
  its `add`/`change`/`unlink` events to a `GET /api/events` SSE stream
  (e.g. [`@fastify/sse`](https://github.com/fastify/sse) or a
  hand-rolled `reply.raw.write(...)` loop, both well-documented
  patterns) would let the frontend invalidate TanStack Query caches on
  real file changes instead of polling. This is a `server/` change and
  explicitly not part of this plan; noted so the poll-based phase 1–4
  design doesn't read as an oversight.

Editor saves (§6.6) do **not** autosave-on-keystroke — explicitly
rejected, not just "not built yet." The server's `chokidar` config
already debounces writes with `awaitWriteFinish` for external editors,
but a keystroke-triggered `PUT` from the browser would hammer both the
disk and the reindex path, and — combined with polling — creates an
easy self-inflicted edit-conflict loop (tab A's autosave overwrites a
change tab B's poll hasn't picked up yet). Save is explicit
(`Cmd/Ctrl+S` or a button) for phase 2a. A debounced autosave (2–3s
idle) is a reasonable phase-2b-adjacent stretch once there's a real
multi-writer conflict story (see §9), not before.

---

## 8. Extensibility

Two distinct operations, deliberately different in cost, and that
difference is the point of the whole widget-spec design:

### 8.1 New dashboard **arrangement** — no code

Anyone who can write a markdown file can make a new dashboard: create
`<anything>.md` anywhere in the vault, add a `widgets:` array to its
frontmatter using kinds that already exist (§5.3), pick `params`. Save
it. The existing filesystem watcher indexes it like any other note; the
frontend's dashboard detection (§5.1) is structural, so it renders
immediately — no restart, no deploy, no PR. This is true whether a human
or an agent writes the file — an agent that can write markdown files
(the project's only integration mechanism, per README principle 2) can
create dashboards.

### 8.2 New widget **kind** — code, by design

A new kind of visualization (say, a calendar view, or a graph
visualization of backlinks) is a rendering primitive the frontend
doesn't have yet — that's inherently code, and pretending otherwise
(e.g. a generic-enough templating language to express a calendar layout
declaratively) is exactly the SilverBullet-Lua/DataviewJS trap §2.2
argues against. The path, concretely, for someone who has never seen
this codebase:

1. Add the new kind's param shape to the discriminated union in
   `web/src/dashboards/widgets/schema.ts` (a `zod` schema, §6.7).
2. Implement `web/src/dashboards/widgets/<kind>.tsx` — a component
   taking `{ params, notes }` (the already-fetched note list is passed
   down, not refetched per widget) and rendering its slice of UI.
3. Register it: one line in the `WIDGET_REGISTRY` map in
   `web/src/dashboards/widgets/index.ts` (`{ "my-kind": MyKindWidget }`).
4. `npm run build --workspace=web`, redeploy the static bundle.

Steps 1–3 are additive-only — no existing widget kind's code is touched,
so shipping a new kind can't regress an existing dashboard. The registry
pattern (a flat `Record<string, Component>` keyed by the same string
`kind:` uses in frontmatter) is the whole mechanism; there's no plugin
loader, no dynamic import, no manifest file, because a single-package
deploy with one build step doesn't need one — that would be solving a
problem (third-party plugin distribution) this project doesn't have.

### 8.3 What this buys a future non-single-user deployment

Nothing here assumes one vault owner's identity (§9 expands on
no-auth). Widget `params` reference frontmatter fields and folder
paths, never a user id. A second deployment for a different person with
a different vault and a different frontmatter taxonomy (English
`type:` instead of Spanish `tipo:`) needs zero frontend code changes —
every `query`/`stale`/`count` widget's field names are supplied in the
dashboard file's `params`, not hardcoded in the widget implementation.
The only place a taxonomy assumption could leak in is if a widget
kind's *implementation* hardcodes a field name instead of reading it
from `params` — worth a one-line lint/review rule when reviewing new
widget kinds (§8.2 step 2).

---

## 9. Explicitly out of scope for phase 1 (and where relevant, later phases)

- **Authentication of any kind.** The deploy doc is explicit: Tailscale
  is the perimeter, there is no auth layer, and adding one is scoped
  as a prerequisite *if* public exposure is ever needed — not a
  frontend decision. The frontend must not silently assume a "current
  user" identity anywhere (no user object in state, no per-user
  preferences persisted server-side) — the closest thing to
  personalization is browser-local UI state (sidebar collapse, theme),
  which is fine precisely because it never leaves the browser and
  implies nothing about who's allowed to do what.
- **Conflict resolution / concurrent-edit merging.** Both the editor
  save (§6.6) and dashboard row actions (§5.5) are full-file overwrites
  of whatever the client last read. No ETag/If-Match, no CRDT, no diff3.
  Acceptable today because the API doesn't support conditional writes
  and adding that is a `server/` change; flagged so it isn't discovered
  the hard way in a multi-writer session (a human editing in Obsidian
  while an agent also writes the same file).
- **Full Obsidian-style live preview (phase 2b).** Deliberately deferred
  past dashboards per §3 — real engineering cost, doesn't block anything
  else.
- **Snippet/context preview in the backlinks panel.** The API returns
  backlink *paths*, not the linking text's surrounding context (§2.4).
  A flat list ships in phase 1; context previews would need either a
  backend change (return an excerpt per backlink) or the frontend
  fetching and re-scanning every linking note's full body client-side —
  neither is worth it for phase 1.
- **A query expression language for dashboards** (§2.2) — the flat
  filter object is deliberately the ceiling for phase 3. If a real
  dashboard need outgrows it, that's the trigger to design a narrow
  escape hatch, not to front-load Dataview-DQL-equivalent power nobody
  has asked for yet.
- **Command palette, full-text search, graph view, mobile layout.**
  None are called for by the phase order in the README and each is a
  separate, non-trivial scope of its own; not designed here to keep
  this plan buildable as written rather than aspirational.
- **Multi-vault / multi-tenant single instance.** One deployed instance
  serves one `VAULT_DIR` (existing `config.ts` behavior, unchanged).
  "Multi-user" per the task brief means multiple *deployments*, each
  with a different config — not one app serving multiple vaults behind
  a login. Building the latter now would be speculative; the former
  already works today via existing config (§1) and needs nothing new
  from this plan.
- **Server-sent live updates (§7).** Poll-based for phase 1–4, flagged
  as a `server/`-side follow-up, not built here.
- **Testing infrastructure detail.** Recommend `vitest` +
  `@testing-library/react` for component/widget tests (same Vite
  toolchain, no separate test runner config) and treat Playwright/e2e
  as a phase-3+ addition once there's a dashboard-rendering pipeline
  worth testing end-to-end — not specified further here since the task
  brief scopes this document to the implementation plan, not a test
  plan.

---

## 10. Package list (phase 1–4 total)

```jsonc
// web/package.json — dependencies, versions as of writing (pin, don't ^-range blindly on install)
{
  "react": "19.2.8",
  "react-dom": "19.2.8",
  "react-router-dom": "7.18.2",
  "@tanstack/react-query": "5.101.4",
  "zustand": "5.0.15",
  "@uiw/react-codemirror": "4.25.11",
  "@codemirror/lang-markdown": "6.5.2",
  "@codemirror/autocomplete": "6.20.3",
  "@codemirror/state": "6.7.1",
  "@codemirror/view": "6.43.8",
  "@codemirror/commands": "6.10.4",
  "react-markdown": "10.1.3",
  "remark-gfm": "4.0.1",
  "js-yaml": "5.3.0",
  "zod": "4.4.3"
}
```

```jsonc
// devDependencies
{
  "vite": "8.2.1",
  "@vitejs/plugin-react": "<latest matching vite 8>",
  "typescript": "7.0.2",
  "vitest": "<latest>",
  "@testing-library/react": "<latest>",
  "@types/js-yaml": "<latest>"
}
```

Note on TypeScript: `server/tsconfig.json` currently targets a `^5.6.0`
line; `typescript@7.0.2` is a major-version jump from that. Pin `web/`
to whatever major the team is comfortable moving `server/` to as well
— don't let the two workspaces drift onto incompatible majors
silently, since `tsc` behavior (especially strictness defaults) has
shifted across major versions. Not resolved in this plan; flagging for
whoever sets up `web/tsconfig.json`.

Not included: `remark-wiki-link` (rejected, §6.4), `cmdk`/command
palette (out of scope, §9), `@fastify/sse` (server-side, §7,
listed here only for cross-reference).

---

## Sources

- [SilverBullet Architecture](https://silverbullet.md/Architecture)
- [SilverBullet Live Preview](https://silverbullet.md/Live%20Preview)
- [SilverBullet Live Queries](https://silverbullet.md/Live%20Queries)
- [SilverBullet — DeepWiki overview](https://deepwiki.com/silverbulletmd/silverbullet)
- [blueberrycongee/codemirror-live-markdown — design doc](https://github.com/blueberrycongee/codemirror-live-markdown/blob/main/CODEMIRROR_LIVE_PREVIEW_DESIGN.md)
- [kenforthewin/atomic-editor](https://github.com/kenforthewin/atomic-editor)
- [Show text selection across embeds in Obsidian (CodeMirror 6)](https://designdebt.club/show-text-selection-across-embeds-in-obsidian-codemirror-6/)
- [Obsidian Bases: The Complete Guide (got.md)](https://got.md/obsidian-bases/)
- [Obsidian Bases guide (Obsibrain)](https://www.obsibrain.com/blog/obsidian-bases-guide)
- [Obsidian Bases: Native Database Views Without Dataview](https://danholloran.me/posts/obsidian-bases-native-database-views-without-dataview)
- [@uiw/react-codemirror (GitHub)](https://github.com/uiwjs/react-codemirror)
- [CodeMirror and React — pitfalls writeup](https://thetrevorharmon.com/blog/codemirror-and-react/)
- [CodeMirror 6 autocompletion example](https://codemirror.net/examples/autocompletion/)
- [@codemirror/autocomplete (GitHub)](https://github.com/codemirror/autocomplete)
- [Foam — Wiki Links](https://docs.swo.moe/foam-1/wiki-links.html)
- [Fastify SSE plugin](https://github.com/fastify/sse)
- Package versions: fetched directly from `registry.npmjs.org/<pkg>/latest` at time of writing.
