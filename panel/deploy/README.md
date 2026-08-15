# Deploying

## Build first

The unit runs compiled JavaScript, not TypeScript through `tsx`.

```sh
cd server && npm install && npx tsc -p tsconfig.json
```

## As a systemd user service

```sh
mkdir -p ~/.config/systemd/user
cp deploy/raymond-panel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now raymond-panel
systemctl --user status raymond-panel
journalctl --user -u raymond-panel -f
```

**One sudo step, once:** user services stop when the user logs out unless
lingering is enabled.

```sh
sudo loginctl enable-linger $USER
```

Without it the panel dies with your SSH session, which is exactly the
failure that motivated using systemd instead of `nohup` in the first
place.

## Configuration

`VAULT_DIR` and `PORT` are set in the unit file. Override without editing
the shipped file:

```sh
systemctl --user edit raymond-panel
```

## Do not expose this publicly

The panel has **no authentication**. The tailnet is the security
perimeter. Putting it behind Tailscale Funnel or a public reverse proxy
publishes read *and write* access to the entire vault. If public access
is ever needed, an auth layer has to come first.
