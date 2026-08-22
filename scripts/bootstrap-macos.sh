#!/usr/bin/env bash
#
# Bootstrap a Mac — one you already use, not a dedicated box — into a
# Raymond host. The macOS counterpart to bootstrap.sh: same end state
# (Node, Claude Code, Tailscale installed; a vault skeleton at
# $VAULT_DIR), different tools underneath (brew instead of apt, launchd
# instead of systemd). Does NOT authenticate anything — Tailscale and
# Claude both need an interactive login, done by hand afterward, same as
# the Linux path.
#
# Safe to re-run. Every step checks before acting.
#
#   ./bootstrap-macos.sh
#
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$HOME/raymond-brain}"
NODE_MAJOR=22

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[2m(already done: %s)\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$*"; }

# --- preflight -------------------------------------------------------

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root. It calls sudo where needed." >&2
  exit 1
fi

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script targets macOS. On Ubuntu/Debian use ./bootstrap.sh; on Windows see docs/09-windows-wsl2.md." >&2
  exit 1
fi

if ! command -v brew >/dev/null; then
  cat >&2 <<'EOF'
Homebrew isn't installed. Install it yourself first — its own installer
wants an interactive terminal and may prompt for the Xcode Command Line
Tools, which is a GUI dialog this script can't click through:

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

Then re-run this script.
EOF
  exit 1
fi

say "Bootstrapping macOS $(sw_vers -productVersion) as $USER"

# --- base tooling ----------------------------------------------------

say "Installing base tooling"
brew install -q git curl wget jq ripgrep tmux htop tree flock 2>&1 | grep -v "already installed" || true

# flock isn't a macOS builtin (it's util-linux, Linux-only) but the
# schedule-job skill's runner scripts assume it for single-instance
# locking — this is the one package this script installs purely so an
# unmodified vault-template skill keeps working unchanged on a Mac.

# --- automatic security updates --------------------------------------

say "Enabling automatic macOS updates"
if [[ "$(sudo defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled 2>/dev/null)" == "1" ]]; then
  skip "automatic update checks enabled"
else
  sudo softwareupdate --schedule on
fi

# --- tailscale -------------------------------------------------------
# The GUI app (menu bar icon), not the bare open-source `tailscaled`
# daemon: Tailscale's own docs mark the CLI-only daemon variant as
# "for experienced administrators running unattended installs" — the
# opposite of the audience for a Mac someone already uses day to day.
# If this Mac genuinely is a dedicated, always-on, headless appliance,
# `brew install tailscale && sudo tailscaled install-system-daemon` is
# the documented alternative — do that by hand instead, deliberately,
# not as this script's default.

say "Installing Tailscale"
if [[ -d "/Applications/Tailscale.app" ]] || command -v tailscale >/dev/null; then
  skip "tailscale installed"
else
  brew install -q --cask tailscale-app
fi

# --- node.js ---------------------------------------------------------

say "Installing Node.js ${NODE_MAJOR}.x"
if command -v node >/dev/null && [[ "$(node -v)" == v${NODE_MAJOR}* ]]; then
  skip "node $(node -v)"
else
  brew install -q "node@${NODE_MAJOR}"
  brew link --overwrite --force "node@${NODE_MAJOR}"
fi

# --- npm global prefix in $HOME --------------------------------------
# Same reasoning as the Linux script: keeps `npm -g` out of Homebrew's
# own Cellar so global installs never need sudo or touch a brew-managed
# path.

say "Pointing npm global installs at \$HOME"
NPM_PREFIX="$HOME/.npm-global"
mkdir -p "$NPM_PREFIX"
npm config set prefix "$NPM_PREFIX"

SHELL_RC="$HOME/.zshrc"
[[ "$SHELL" == */bash ]] && SHELL_RC="$HOME/.bash_profile"
if ! grep -q '.npm-global/bin' "$SHELL_RC" 2>/dev/null; then
  printf '\nexport PATH="$HOME/.npm-global/bin:$PATH"\n' >> "$SHELL_RC"
fi
export PATH="$NPM_PREFIX/bin:$PATH"

# --- claude code -----------------------------------------------------

say "Installing Claude Code"
if command -v claude >/dev/null; then
  skip "claude $(claude --version 2>/dev/null || echo installed)"
else
  npm install -g @anthropic-ai/claude-code
fi

# --- vault skeleton --------------------------------------------------
# Identical to bootstrap.sh's — the vault, its skills and the panel are
# not OS-specific. Kept in sync by hand rather than sourcing a shared
# file, since it is eleven lines and drift here is easy to spot in
# review; revisit if it grows.

say "Creating vault skeleton at $VAULT_DIR"
if [[ -d "$VAULT_DIR/.git" ]]; then
  skip "vault exists at $VAULT_DIR"
else
  mkdir -p "$VAULT_DIR"/{daily,notes,projects,reference,_templates}
  SKEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../vault-template" && pwd)"
  cp -rn "$SKEL"/. "$VAULT_DIR"/ 2>/dev/null || true
  rm -f "$VAULT_DIR/UPDATE-MANIFEST.md"
  find "$VAULT_DIR" -name '._*' -delete 2>/dev/null || true
  chmod +x "$VAULT_DIR"/_tools/* 2>/dev/null || true
  git -C "$VAULT_DIR" init -q -b main
  git -C "$VAULT_DIR" add -A
  git -C "$VAULT_DIR" -c user.email="$USER@$(hostname)" \
      -c user.name="$USER" commit -q -m "Initial vault skeleton"
fi

# --- done ------------------------------------------------------------

cat <<EOF

$(say "Bootstrap complete")

Installed: $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null), \
claude $(claude --version 2>/dev/null || echo '?')

Three things still need YOU, because they need a login:

  1. Open Tailscale.app (menu bar icon) and sign in.
     Then disable key expiry for this device in the Tailscale admin
     console, or it drops off the network in 180 days.

  2. claude
     Authenticates with your own Claude subscription.

  3. Point the vault at a git remote:
       git -C $VAULT_DIR remote add origin <YOUR_PRIVATE_REPO>
       git -C $VAULT_DIR push -u origin main
     Use a PRIVATE repo. A vault is personal notes.

Open a new terminal (or 'source $SHELL_RC') so \$PATH picks up claude.

This Mac keeps doing whatever else you use it for. Raymond runs
alongside, not instead of.
EOF
