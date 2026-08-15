# Raymond

A personal Claude Code appliance. Bare hardware → Ubuntu → a private,
Obsidian-compatible vault → Claude Code with a seeded skill set → a web
panel to see, edit, dashboard, and script it all, reachable from any
device on your Tailscale network. Meant to be deployed by different
people on their own machines, each with their own vault, their own
skills, their own life in it.

Named for Rain Man's Raymond — a quiet, always-on savant living in the
background, not a chatbot you summon. Was `Ben` until 2026-08-15, and
before that two separate repos (`obsidian-server`, `second-brain-panel`)
until the same day.

**If you're a new session picking this up:** read this file fully before
touching code. Then `docs/log.md` (what actually happened, including
every mistake) and `docs/roadmap.md` (what's deliberately unfinished) —
in that order. Everything else is detail underneath those three.

---

## The vision

The pitch that matters: **your notes should outlive every app that ever
touches them, and an agent working in them should never be the single
point of failure for your own trust in what they say.**

Five rules follow from that, and every design choice in this repo is one
of them applied to a specific problem:

1. **Files are the only state.** No database, anywhere. A note is a
   `.md` file. A dashboard is a `.md` file with a `widgets:` list in its
   frontmatter. A todo, a habit tracker, a button that runs a script — a
   "trick" — is a folder with a manifest. Delete the panel app entirely
   and you lose a UI, not your second brain. This is why the panel
   (`panel/server`) holds no state of its own beyond an in-memory index
   rebuilt from disk on every start.
2. **An agent integrates by writing files, never by calling a private
   API.** There is no "agent endpoint." Claude Code, working in the
   vault, creates a dashboard the same way a human would: writing a file
   with the right frontmatter. This is what makes the system extensible
   by anyone who can write markdown, agent or not.
3. **No authentication — the tailnet is the perimeter, and that fact
   constrains everything above it.** This app is not safe on the open
   internet and never will be without a real auth layer first (see
   `panel/deploy/README.md`). Because of this, anything that runs code —
   not just writes a file — needs a materially stronger trust boundary
   than "logged-in users can do this." See `correr_script` in
   `panel/docs/tricks-spec.md` for what that looks like in practice: the
   client can only select *which* pre-declared script runs, never *what*
   runs — enforced server-side, independent of what the client claims.
4. **Scheduled unattended runs are expected; what they must leave behind
   is a file trail.** A box that only acts while someone watches it is a
   chatbot with extra steps — the point of an always-on appliance is that
   it does work overnight. The non-negotiable part is that nothing it did
   is invisible the next morning: a scheduled job is a markdown file in
   the vault (`.claude/jobs/`), every run appends a dated line with its
   exit code to that job's own note, and the work itself lands as files
   next to whatever they're about, never in a dump folder
   (`docs/roadmap.md` §9). This is rule 1 carrying the weight — if files
   are the only state, a run that left no file didn't happen, and a run
   that did is auditable with `git log`. The mechanism lives in the
   `schedule-job` skill (`vault-template/.claude/skills/schedule-job/`).
   **Reversed 2026-08-15**; this rule previously read "an agent proposes,
   a human approves." See `docs/log.md` for why.
5. **The base package and any one deployment are different things, and
   mixing them is a bug every time it's happened.** `vault-template/` is
   what every new install starts from — generic, no company names, no
   assumed language. A real vault (a deployment) is a copy of that,
   customized. This distinction got violated twice during this project's
   own build (a deployment's company structure and its Spanish schema
   both leaked into the generic template) — both are logged in
   `docs/log.md` as real bugs, not hypotheticals, because it's an easy
   mistake to make again.

---

## What's actually here, concretely

Three layers, stacked:

### 1. The machine (`docs/00`–`08`, `scripts/bootstrap.sh`)

Numbered install docs taking a bare mini PC to a running Ubuntu Server
with SSH, a firewall, Tailscale, and Claude Code installed. Every doc
ends with a verify step. `docs/log.md` is the parallel, honest account of
what happened on the one real attempt — read it when a doc's clean path
doesn't match reality, because it usually won't be the doc that's wrong.

### 2. The vault (`vault-template/`)

The actual second brain: markdown notes with YAML frontmatter, a
`CLAUDE.md` that any Claude Code session in the vault loads automatically
and must follow, six seeded skills, and the tooling (`_tools/`) to keep
it healthy.

- **`capture-note`** — write something learned as a proper note
- **`daily-log`** — append to today's session log
- **`vault-health`** — find and fix broken links, missing indexes, missing frontmatter
- **`migrate-notes`** — bring an existing Obsidian vault in, cleaning as it goes
- **`trick-creator`** — turn a plain-language request into a trick (below)
- **`schedule-job`** — turn "every Monday at 8am, do X" into a real cron
  job on the machine, plus the vault files that make its runs visible
  (rule 4)

`_tools/vault-lint` and `_tools/vault-search` resolve the vault as
*wherever they themselves live*, not a hardcoded path — this was a real
bug (a stale second vault silently absorbed every search call on one real
deployment; see `docs/log.md`, 2026-08-15) and is now closed structurally,
not by picking a better default string.

### 3. The panel (`panel/`)

A Fastify backend (`panel/server`) plus a React/CodeMirror frontend
(`panel/web`), served as one process on one port, reachable over
Tailscale. Three destinations:

- **Home** — a dashboard. Whatever `panel/home.md` (or any note with a
  `widgets:` array) says to render. Ships with a default so a fresh
  vault is never a blank page.
- **Vault** — a folder tree (system files hidden by default), a
  read/write markdown editor (CodeMirror 6, wiki-link autocomplete, a
  dirty-buffer guard that blocks navigating away from unsaved changes),
  a force-directed link graph, a health report.
- **Tricks** — skill-plus-UI plugins living in `.claude/tricks/`. A
  trick composes a fixed, safe vocabulary of primitives (`lista`,
  `boton`, plus read-only field display) — never arbitrary rendered
  code, for the same no-auth reason above. `trick-creator` builds them
  from a plain-language request; a `boton` can run a real, allowlisted
  server-side script via `correr_script`.

Twelve API endpoints total, all documented at the top of
`panel/server/src/index.ts`: notes (list/read/write), attachments
(list/download/upload), the link graph, vault health, and tricks
(list/read/run). No endpoint exists that a
human couldn't also achieve by editing a file directly — the API is a
faster path to the same filesystem operations, not a separate
capability.

---

## Status — what's real, checked 2026-08-15

Verified by actually running it, not by reading the code and assuming:

- [x] Ubuntu 26.04 LTS, Tailscale, Claude Code, firewall — one real
      deployment, end to end
- [x] Vault migration from an existing Obsidian setup — restructuring,
      frontmatter backfill, broken-link cleanup, all with a written
      before/after
- [x] Panel backend + frontend, one process, SPA routing works on a
      hard reload (a real bug, found and fixed — see `docs/log.md`)
- [x] Dashboards: `query`, `count`, `vault-health` widget kinds
- [x] Vault graph, note tree with fold/collapse, markdown editor with
      autocomplete and a save-guard
- [x] Tricks: listing, detail rendering, `lista` control, and
      `correr_script` — independently attacked (shell injection, path
      traversal, request forgery) before being trusted, not just tested
      for the happy path
- [ ] Dashboard/trick write actions (`set`, `crear_nota`, `archivar`) —
      parse correctly, don't execute yet
- [ ] Live-preview editing (hide markdown syntax except on the cursor's
      line) — deferred, a genuinely separate chunk of work from the
      plain syntax-highlighted editor that *is* built
- [ ] Scheduled jobs — the `schedule-job` skill ships (rule 4), but no
      job has run on the reference build yet, and the panel has no view
      of what's scheduled or whether it last failed (`docs/roadmap.md`
      §10)
- [ ] Vault sync between devices (Syncthing vs. Obsidian LiveSync,
      undecided), a real off-box backup, a git remote for the vault

`docs/roadmap.md` has the fuller list with reasoning per item. None of
it is forgotten — it's written down specifically so it doesn't need to
be re-discovered.

---

## Layout

| Path | What |
|---|---|
| `docs/` | Install steps, decisions and why, the build log, the roadmap |
| `scripts/` | `bootstrap.sh` (server setup), `migrate-into-vault.py` (bring a vault in) |
| `vault-template/` | The generic skeleton — `CLAUDE.md`, `_tools/`, `.claude/skills/`, note templates. **Never put deployment-specific content here.** |
| `panel/server/` | Fastify backend — vault index, API, `correr_script` execution |
| `panel/web/` | React/CodeMirror frontend |
| `panel/docs/` | `frontend-implementation-plan.md` (researched, cited), `tricks-spec.md` (the trust-boundary design) |
| `panel/deploy/` | systemd unit, deploy instructions, the "don't expose this publicly" warning |
| `deployments/` | Gitignored except its own README — per-deployment notes never belong in this repo |
| `assets/` | Photos from the one real hardware install |

## Getting a deployment running

```sh
git clone <PRIVATE_REPO_URL> ~/raymond
cd ~/raymond
./scripts/bootstrap.sh          # Node, Claude Code, base tooling, vault skeleton
cd panel/server && npm install && npx tsc -p tsconfig.json
cd ../web && npm install && npm run build
```

Then the systemd unit in `panel/deploy/`, and `sudo ufw allow in on
tailscale0 to any port 8710` — never opened to the raw LAN, only the
tailnet. Full walkthrough: `docs/08-server-setup.md` and
`panel/deploy/README.md`.

## Conventions

- Every command in the docs is copy-pasteable, no unmarked placeholders.
  Machine-specific values are `<ANGLE_BRACKETS>`, defined once in
  `docs/00-hardware-inventory.md`.
- Claims are labelled when not independently verified: `assumed:` /
  `observed:` / `hypothesis:`. Unlabelled means it was actually run and
  confirmed — hold every doc in this repo to that, including this one.
- No secrets in this repo, ever. Credentials live outside the vault
  entirely (see `panel/docs/tricks-spec.md`'s note on skill credentials
  for the concrete pattern) and are referenced by name, never by value.
- A trick or dashboard that's incomplete says so, in its own output, in
  plain language — `panel/pendientes.md`-style honesty, not a silently
  broken button.
