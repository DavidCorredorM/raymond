# 08 — Server setup

Turns a bare Ubuntu install into a working second-brain box. One script does
the machine-level work; three things need a human because they need a
login.

**Prerequisite:** Ubuntu installed, on the network, reachable over SSH
(`docs/05-first-boot.md`).

Time: 10 minutes of script, 5 minutes of logins.

## Scope

This sets up **infrastructure only**. Each person who uses the box
installs nothing extra — Claude Code is already there — but authenticates
with their own subscription and brings their own vault remote.

Deliberately not included:

- **Scheduled or unattended agents.** An agent running 24/7 without
  someone watching introduces spend, permission and runaway-loop
  problems that are a project of their own. Out of scope here.
- **Anything needing an account.** The script installs Tailscale and
  Claude Code but authenticates neither.

## What the script installs

| Group | Contents |
|---|---|
| Base | `git`, `curl`, `build-essential`, `tmux`, `htop`, `tree`, `jq`, `ripgrep` |
| Safety | `ufw` (SSH allowed, then enabled), `unattended-upgrades` |
| Network | Tailscale |
| Agent | Node.js 22, Claude Code |
| Serving | Caddy — optional, `--with-caddy` |
| Vault | Skeleton at `~/vault`, git-initialised |

## Run it

```sh
git clone <PRIVATE_REPO_URL> ~/raymond
cd ~/raymond
./scripts/bootstrap.sh
```

With the web server for rendering the vault later:

```sh
./scripts/bootstrap.sh --with-caddy
```

**Safe to re-run.** Every step checks before acting, so running it again
after adding a package, or on a half-finished machine, does the right
thing rather than duplicating work.

## Then, by hand

The script ends by printing these. They need a browser and an account,
so they cannot be scripted.

**1. Tailscale**

```sh
sudo tailscale up
```

Approve the machine at the URL it prints. Then **disable key expiry** for
this host at <https://login.tailscale.com/admin/machines> — otherwise it
drops off the network in 180 days and you will have forgotten why. See
`docs/06-tailscale.md`.

**2. Claude Code**

```sh
claude
```

Authenticates against your own subscription.

**3. Vault remote**

```sh
git -C ~/vault remote add origin <YOUR_PRIVATE_REPO>
git -C ~/vault push -u origin main
```

**Private repo.** A vault is personal notes.

## The vault skeleton

```
~/vault/
├── CLAUDE.md      rules Claude Code loads in every session here
├── index.md       map of the vault
├── daily/         dated append-only logs
├── notes/         atomic evergreen notes — the main body
├── projects/      one folder per project
├── reference/     external material
└── _templates/    note and index starting points
```

`CLAUDE.md` carries the rules that make the vault searchable by an
agent rather than just a pile of markdown: mandatory `when-to-use:`
frontmatter, an `index.md` per folder kept current in the same change,
globally unique kebab-case filenames, dense linking, and explicit
`observed:` / `assumed:` / `hypothesis:` labels on anything unverified.

Those rules are the difference between a vault that speeds you up and a
folder of files nobody can find anything in. They are trimmed from a
larger team vault to what earns its keep for one person.

## Two things the script deliberately does not do

**`npm -g` is redirected to `$HOME/.npm-global`.** Global npm installs
would otherwise need `sudo` and scatter root-owned files through your
home directory. The script sets the prefix and appends the `PATH` line
to `.bashrc`. Open a new shell after running it, or `source ~/.bashrc`,
or `claude` will not be found.

**`ufw allow OpenSSH` runs before `ufw enable`.** In that order. Enabling
the firewall first drops the SSH session you are running the script
through, and the machine is then unreachable.

## Verify

```sh
node -v                       # v22.x
claude --version
tailscale status              # lists this machine and your others
sudo ufw status | head -1     # Status: active
ls ~/vault                    # skeleton present
systemctl is-enabled unattended-upgrades
```

## Gotchas

- **`claude: command not found` over SSH.** Ubuntu's stock `.bashrc`
  returns early for non-interactive shells:

  ```bash
  case $- in
      *i*) ;;
        *) return;;
  esac
  ```

  The `PATH` line is appended below that, so `ssh host 'claude'` never
  sees it — while an interactive `ssh host` then typing `claude` works
  fine. The script now also symlinks into `/usr/local/bin`, which is on
  the default non-interactive `PATH`. `source ~/.bashrc` does **not**
  fix this in a non-interactive shell, for the same reason.
- **Script re-run does nothing visible.** Correct — it's idempotent and
  prints `(already done: ...)` for steps it skips.
- **`npm install -g` fails on permissions.** The prefix step didn't
  apply. Check `npm config get prefix` returns a path under `$HOME`.
