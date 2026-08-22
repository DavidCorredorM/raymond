# Deploying Raymond

The single top-to-bottom path from nothing to a running, personal
Raymond instance, on whatever machine it's actually going on.

**Read step 0 first, every time — including if you're an agent picking
this up mid-conversation.** Most of the rest of this repo (`docs/00`
through `08`, and older prose elsewhere) was written against one
reference deployment: a dedicated Ubuntu Server box. That history makes
it easy to drift into assuming Ubuntu-server is the only supported
target a few turns into a conversation. It isn't. The vault
(`vault-template/`), its skills, and the panel are identical on every
platform — only the bootstrap mechanics differ.

---

## 0. What machine is this?

Ask, don't assume — from nothing else in this repo, and don't infer it
from what language or OS the *person* you're talking to seems to be
using, since that's not necessarily the target machine.

| This machine is | Go to |
|---|---|
| A dedicated box: a spare mini PC, a home server, a cloud VM, or a Linux desktop you're setting up specifically for this | **Path A**, below |
| A Mac you already use every day | **Path B**, below |
| A Windows machine you already use every day | **Path C**, below |

All three converge at step 6 ("Finish the vault").

---

## Path A: a dedicated box (Ubuntu/Debian)

### A1. Get a machine

Any always-on box reachable over SSH. `docs/00-hardware-inventory.md`
and `docs/01-decisions.md` record the choices made for the reference
deployment (a GMKtec mini PC, Ubuntu Server 26.04 LTS) with the
reasoning — worth reading for the *reasoning*, not because you need the
same hardware.

### A2. Install the OS

If you're doing this on bare hardware the way the reference deployment
did: `docs/02-prepare-usb-macos.md` (build the install USB, from a Mac),
`docs/03-bios-and-boot.md` (boot it), `docs/04-ubuntu-install.md` (the
actual install). Skip these three entirely if the machine already has
Ubuntu on it, or you're using a cloud VM that boots straight to a login.

### A3. First boot

`docs/05-first-boot.md` — SSH in, set a fixed address, run updates. From
here on everything is done remotely.

### A4. Run the bootstrap script

```sh
git clone https://github.com/DavidCorredorM/raymond.git ~/raymond
cd ~/raymond
./scripts/bootstrap.sh --with-caddy
```

Idempotent — safe to re-run. Details, and the gotchas (PATH under
cron/SSH being the recurring one): `docs/08-server-setup.md`.

### A5. Three logins the script can't do for you

1. **`sudo tailscale up`** — approve the machine in the browser, then
   disable key expiry at
   [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines),
   or it drops off the network in 180 days. Detail: `docs/06-tailscale.md`.
2. **`claude`** — authenticate with your own Claude subscription.
3. **Point the vault at a private git remote:**
   ```sh
   git -C ~/raymond-brain remote add origin <YOUR_PRIVATE_REPO>
   git -C ~/raymond-brain push -u origin main
   ```
   Must be **private** — a vault is personal notes.

**→ Continue at step 6.**

---

## Path B: your own Mac

### B1. Run the macOS bootstrap script

```sh
git clone https://github.com/DavidCorredorM/raymond.git ~/raymond
cd ~/raymond
./scripts/bootstrap-macos.sh
```

Homebrew-based counterpart to `bootstrap.sh` — installs Node, Claude
Code, and Tailscale, and creates the same vault skeleton at
`~/raymond-brain`. Requires Homebrew already installed (the script
checks and tells you if not — its own installer needs an interactive
terminal this script can't safely drive). Idempotent.

### B2. Three logins the script can't do for you

Same three as Path A, adapted: open Tailscale.app and sign in (then
disable key expiry, same URL); `claude` to authenticate; point
`~/raymond-brain` at a private git remote. Printed at the end of the
script.

**→ Continue at step 6.** (When step 6 gets to "run the panel as a
service," it uses launchd, not systemd — `panel/deploy/README.md`
covers both.)

---

## Path C: your own Windows machine

Raymond's runtime is Linux tooling; on Windows that means WSL2, not a
native path. Full detail, including the one genuinely non-obvious part
(how Tailscale and network reachability work when the machine is a VM
inside Windows): **`docs/09-windows-wsl2.md`** — read it before running
anything. Short version: install WSL2 + Ubuntu, enable systemd inside
it, run `./scripts/bootstrap.sh` (unmodified — it's Ubuntu underneath)
inside the WSL2 shell, but install and sign into Tailscale on the
**Windows host**, not inside WSL2.

**→ Continue at step 6** once `docs/09-windows-wsl2.md`'s steps are
done.

---

## 6. Finish the vault: run the setup skill

Open Claude Code in the fresh vault (`cd ~/raymond-brain && claude`) and
ask it to run the **`setup-raymond`** skill —
`vault-template/.claude/skills/setup-raymond/SKILL.md`, seeded into
every new vault regardless of which path got you here. It's the
interactive half of this guide: it asks what shape the vault should have
(personal vs. one-or-more companies), sets the UI language, and offers
to bring the web panel up as a standing service — using whichever
service manager this OS actually has. A fresh vault's `index.md` still
says "Nothing here yet" — that's the cue it's waiting for this step.

## 7. Verify

```sh
node -v                    # v22.x
claude --version
tailscale status            # lists this machine and any others
```

Linux only: `sudo ufw status | head -1` should read `Status: active`,
and `systemctl --user status raymond-panel` if the setup skill deployed
the service. macOS: `launchctl print gui/$(id -u)/com.raymond.panel`.
Windows/WSL2: run the systemd checks *inside* the WSL2 shell.

Then open the panel from any other device on the tailnet:
`http://<machine-name>:<PORT>` (default port and how to change it:
`panel/deploy/README.md`).

---

## What's deliberately out of scope here

- **Obsidian mobile/desktop sync onto the vault git repo** —
  `docs/07-obsidian-sync.md` is a stub; not decided yet.
- **Scheduling anything** — the `schedule-job` skill handles that once
  the vault exists; it's personal to what you want automated, not part
  of bringing the machine up.
- **Exposing the panel beyond the tailnet.** Don't. It has no
  authentication — see `panel/deploy/README.md` and README rule 3.
