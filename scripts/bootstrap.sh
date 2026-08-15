#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu Server install into a second-brain box.
#
# Installs base tooling, Tailscale, Node.js and Claude Code, then lays
# down a vault skeleton. Does NOT authenticate anything — Tailscale and
# Claude both need an interactive login, which each user does themselves
# with their own account.
#
# Safe to re-run. Every step checks before acting.
#
#   ./bootstrap.sh              base install
#   ./bootstrap.sh --with-caddy also install Caddy for serving the vault
#
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$HOME/vault}"
NODE_MAJOR=22
WITH_CADDY=false

[[ "${1:-}" == "--with-caddy" ]] && WITH_CADDY=true

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
skip() { printf '    \033[2m(already done: %s)\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$*"; }

# --- preflight -------------------------------------------------------

if [[ $EUID -eq 0 ]]; then
  echo "Run as your normal user, not root. It calls sudo where needed." >&2
  exit 1
fi

if ! command -v apt-get >/dev/null; then
  echo "This script targets Ubuntu/Debian." >&2
  exit 1
fi

say "Bootstrapping $(lsb_release -ds 2>/dev/null || echo unknown) as $USER"
sudo -v

# --- system updates --------------------------------------------------

say "Updating system packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# --- base tooling ----------------------------------------------------

say "Installing base tooling"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git curl wget ca-certificates gnupg \
  build-essential \
  tmux htop tree jq ripgrep \
  unattended-upgrades ufw

# --- automatic security updates --------------------------------------

say "Enabling unattended security upgrades"
if systemctl is-enabled unattended-upgrades >/dev/null 2>&1; then
  skip "unattended-upgrades enabled"
else
  sudo dpkg-reconfigure -f noninteractive -plow unattended-upgrades
  sudo systemctl enable --now unattended-upgrades
fi

# --- firewall --------------------------------------------------------
# OpenSSH is allowed BEFORE enabling, otherwise enabling drops the
# session you are running this from.

say "Configuring firewall"
sudo ufw allow OpenSSH >/dev/null
if sudo ufw status | grep -q "Status: active"; then
  skip "ufw active"
else
  sudo ufw --force enable
fi

# --- tailscale -------------------------------------------------------

say "Installing Tailscale"
if command -v tailscale >/dev/null; then
  skip "tailscale installed"
else
  curl -fsSL https://tailscale.com/install.sh | sh
fi

# --- node.js ---------------------------------------------------------

say "Installing Node.js ${NODE_MAJOR}.x"
if command -v node >/dev/null && [[ "$(node -v)" == v${NODE_MAJOR}* ]]; then
  skip "node $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi

# --- npm global prefix in $HOME --------------------------------------
# Keeps `npm -g` out of /usr, so global installs never need sudo. Without
# this, `npm i -g` as root leaves root-owned files in your home.

say "Pointing npm global installs at \$HOME"
NPM_PREFIX="$HOME/.npm-global"
mkdir -p "$NPM_PREFIX"
npm config set prefix "$NPM_PREFIX"

if ! grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport PATH="$HOME/.npm-global/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
export PATH="$NPM_PREFIX/bin:$PATH"

# --- claude code -----------------------------------------------------

say "Installing Claude Code"
if command -v claude >/dev/null; then
  skip "claude $(claude --version 2>/dev/null || echo installed)"
else
  npm install -g @anthropic-ai/claude-code
fi

# Ubuntu's stock .bashrc returns early for non-interactive shells, so the
# PATH line appended at its bottom never runs under `ssh host 'command'`.
# A symlink on the default system PATH makes claude reachable either way.
if [[ -x "$NPM_PREFIX/bin/claude" && ! -e /usr/local/bin/claude ]]; then
  sudo ln -s "$NPM_PREFIX/bin/claude" /usr/local/bin/claude
fi

# --- caddy (optional) ------------------------------------------------

if $WITH_CADDY; then
  say "Installing Caddy"
  if command -v caddy >/dev/null; then
    skip "caddy installed"
  else
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy
  fi
fi

# --- vault skeleton --------------------------------------------------

say "Creating vault skeleton at $VAULT_DIR"
if [[ -d "$VAULT_DIR/.git" ]]; then
  skip "vault exists at $VAULT_DIR"
else
  mkdir -p "$VAULT_DIR"/{daily,notes,projects,reference,_templates}
  SKEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../vault-template" && pwd)"
  cp -rn "$SKEL"/. "$VAULT_DIR"/ 2>/dev/null || true

  # AppleDouble droppings, if this repo was copied off a Mac with tar/scp.
  # Harmless but they end up committed and clutter every listing.
  find "$VAULT_DIR" -name '._*' -delete 2>/dev/null || true

  # cp does not reliably carry the executable bit across filesystems.
  chmod +x "$VAULT_DIR"/_tools/* 2>/dev/null || true

  # -b main: git's default is still 'master' on many installs, and every
  # doc and remote here assumes 'main'.
  git -C "$VAULT_DIR" init -q -b main
  git -C "$VAULT_DIR" add -A
  git -C "$VAULT_DIR" -c user.email="$USER@$(hostname)" \
      -c user.name="$USER" commit -q -m "Initial vault skeleton"
fi

# --- done ------------------------------------------------------------

cat <<EOF

$(say "Bootstrap complete")

Installed: $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null), \
claude $(claude --version 2>/dev/null || echo '?'), \
tailscale $(tailscale version 2>/dev/null | head -1 || echo '?')

Three things still need YOU, because they need a login:

  1. sudo tailscale up
     Opens a URL. Approve the machine in your browser.
     Then disable key expiry for this host in the Tailscale admin
     console, or it drops off the network in 180 days.

  2. claude
     Authenticates with your own Claude subscription.

  3. Point the vault at a git remote:
       git -C $VAULT_DIR remote add origin <YOUR_PRIVATE_REPO>
       git -C $VAULT_DIR push -u origin main
     Use a PRIVATE repo. A vault is personal notes.

Open a new shell (or 'source ~/.bashrc') so \$PATH picks up claude.
EOF
