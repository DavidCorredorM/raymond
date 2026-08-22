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

## On macOS: launchd instead of systemd

`com.raymond.panel.plist` is the launchd equivalent. launchd doesn't
expand `~`/`$HOME` in plist values, so substitute the real path before
installing it — as a per-user **LaunchAgent**, which runs while you're
logged in (the right model for a Mac you use daily; there's no SSH
session whose end should take the panel down, unlike the headless-server
case `raymond-panel.service` is written for):

```sh
mkdir -p ~/Library/Logs
sed "s|__HOME__|$HOME|g" deploy/com.raymond.panel.plist \
  > ~/Library/LaunchAgents/com.raymond.panel.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.raymond.panel.plist
launchctl print gui/$(id -u)/com.raymond.panel   # status
tail -f ~/Library/Logs/raymond-panel.log         # logs
```

Restart after a config or code change:

```sh
launchctl kickstart -k gui/$(id -u)/com.raymond.panel
```

**If this Mac is instead a dedicated, always-on box nobody logs out
of** (the personal-machine equivalent of the headless-server case),
install the same plist as a system-level **LaunchDaemon** in
`/Library/LaunchDaemons/` with `sudo launchctl bootstrap system ...`
instead — it then runs even at the login screen, matching what
`loginctl enable-linger` buys on Linux. Most Raymond deployments on a
Mac won't need this; it trades "simple, runs with your user session" for
"survives being logged out," and few people log out of a Mac they use
daily.

## Do not expose this publicly

The panel has **no authentication**. The tailnet is the security
perimeter. Putting it behind Tailscale Funnel or a public reverse proxy
publishes read *and write* access to the entire vault. If public access
is ever needed, an auth layer has to come first.
