# Ben

A personal Claude Code appliance: bare hardware → Ubuntu → a private
Obsidian-compatible vault → Claude Code with a seeded set of skills → a
web panel to see and edit it all over Tailscale. Meant to be deployed by
different people on their own machines, each with their own vault.

Was two repos (`obsidian-server`, `second-brain-panel`) until 2026-08-15
— merged because it's one project, not two.

## Layout

| Path              | What |
|-------------------|------|
| `docs/`           | Numbered install steps, decisions, the build log, the roadmap |
| `scripts/`        | `bootstrap.sh` (install tooling on the server), `migrate-into-vault.py` (bring an existing vault in) |
| `vault-template/` | The skeleton every deployment starts from: `CLAUDE.md` rules, `_tools/` (search, lint), `.claude/skills/`, note templates |
| `panel/`          | The web app — Fastify backend + React/CodeMirror frontend, reads and writes the vault, runs as a systemd service |
| `assets/`         | Photos of BIOS screens, wiring, labels |

## Steps — bare machine to running server

Do them in order. Each doc ends with a "verify" section. Don't skip the
verifies — they put a failure next to its cause instead of three steps
later.

| Doc | Step | Where | Time |
|---|---|---|---|
| `docs/00-hardware-inventory.md` | Record what the machine is | at the machine | 10 min |
| `docs/01-decisions.md` | Choices made, and why | — | read only |
| `docs/02-prepare-usb-macos.md` | Build the install USB | Mac | 20 min |
| `docs/03-bios-and-boot.md` | BIOS settings, boot the USB | at the machine | 15 min |
| `docs/04-ubuntu-install.md` | Install Ubuntu, erase Windows | at the machine | 30 min |
| `docs/05-first-boot.md` | SSH, fixed IP, updates, firewall | Mac, over SSH | 20 min |
| `docs/06-tailscale.md` | Mesh VPN, reach the server from anywhere | both | 15 min |
| `docs/07-obsidian-sync.md` | Vault sync — not started | — | — |
| `docs/08-server-setup.md` | Bootstrap script, vault skeleton | server | 15 min |

Then `panel/README.md` and `panel/deploy/README.md` for the web UI.

`docs/log.md` records what actually happened on every attempt, failures
included — not just the clean path the numbered docs describe. Read it
when something doesn't match what a doc says should happen.

`docs/roadmap.md` is deferred base-package work — not urgent, not
forgotten.

## Progress — reference build

The GMKtec described in `docs/00-hardware-inventory.md`'s reference-build
table. Not any one deployment's status — see that deployment's own
`deployments/<name>.md` for its checklist.

- [x] Ubuntu 26.04 LTS installed, disk reclaimed to full size
- [x] SSH key auth from the Mac, firewall, auto-updates
- [x] Tailscale on the server and both Macs
- [x] `bootstrap.sh` run clean: Node 22, Claude Code, vault skeleton
- [x] Vault migrated from an existing Obsidian setup, restructured,
      100% `cuando-usar` coverage, broken links down to only-intentional
- [x] Panel backend running as a systemd service, correct Obsidian
      link resolution
- [x] Panel frontend implementation plan written and researched
- [ ] Panel frontend built
- [ ] Vault sync (Syncthing vs LiveSync) chosen and running
- [ ] Vault git remote + real off-box backup (`docs/roadmap.md` #5, #6)

## Conventions

- Every command is copy-pasteable, no placeholders left unmarked.
  Machine-specific values are `<ANGLE_BRACKETS>`, defined in
  `docs/00-hardware-inventory.md`.
- Claims are labelled when not verified: `assumed:` / `observed:` /
  `hypothesis:`. Unlabelled means it was actually run and confirmed.
- No secrets in this repo. Passwords, keys, tokens go in a password
  manager; docs reference them by name only.
