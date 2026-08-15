# 06 — Tailscale on both machines

Puts the Mac and the server on a private mesh network. After this, the
server is reachable by name from anywhere — home, a café, another
country — without port forwarding, without a static public IP, and
without exposing SSH to the internet.

**Prerequisite:** Ubuntu installed and reachable over SSH on the LAN
(`docs/05-first-boot.md`). Tailscale cannot be installed before the OS
exists.

Time: 15 minutes.

## Why this, rather than opening a port

The alternative is forwarding port 22 on the router to the server. That
publishes an SSH endpoint to the whole internet, where it will be found
by scanners within hours and subjected to continuous login attempts.

Tailscale is a WireGuard mesh. Devices authenticate to your account and
address each other over encrypted links. Nothing is exposed publicly, so
there is no attack surface to harden. For a personal server this is
strictly less work and strictly safer.

It also removes the need for the DHCP reservation to be correct: the
server keeps a stable Tailscale name and address regardless of what the
router hands it on the LAN.

## 1. Log the Mac in

Tailscale is already installed at `/Applications/Tailscale.app`. It is
logged out.

Click the Tailscale icon in the menu bar → **Log in**, and complete the
sign-in in the browser. Use whichever identity provider you want the
tailnet tied to — this account becomes the owner of the network, so pick
one you will keep.

The CLI shim at `/usr/local/bin/tailscale` fails with
`Fatal error: The current bundleIdentifier is unknown to the registry`.
That's a known quirk of the App Store build. Use the binary inside the
bundle instead:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale status
```

Worth an alias in `~/.zshrc`:

```sh
alias ts='/Applications/Tailscale.app/Contents/MacOS/Tailscale'
```

Confirm it reports an address rather than `Logged out`:

```sh
/Applications/Tailscale.app/Contents/MacOS/Tailscale ip -4
```

## 2. Install on the server

SSH to the server on its LAN address, then:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
```

This is Canonical-of-Tailscale's official installer — it detects the
distro, adds the signed apt repository, and installs the package. If
piping a script to a shell bothers you, download it first, read it, then
run it:

```sh
curl -fsSL https://tailscale.com/install.sh -o ts-install.sh
less ts-install.sh
sh ts-install.sh
```

## 3. Bring it up

```sh
sudo tailscale up --ssh
```

It prints a URL. Open that URL in the Mac's browser and approve the
machine. The `--ssh` flag is optional and explained below.

Confirm:

```sh
tailscale status
tailscale ip -4
```

Both machines should now list each other.

## 4. Turn off key expiry for the server

**Do not skip this.** By default a Tailscale machine's key expires after
180 days and the device drops off the network until someone re-authenticates
it interactively. On a headless server that means it silently disappears
half a year from now, and you will have forgotten why.

In the admin console at <https://login.tailscale.com/admin/machines>,
find the server, open the `...` menu, and choose **Disable key expiry**.

Leave the Mac's expiry as it is — you're sitting in front of it and can
log back in.

## 5. Connect by name

Enable MagicDNS in the admin console (**DNS** → Enable MagicDNS) if it
isn't already. Then from the Mac:

```sh
ssh <USERNAME>@<HOSTNAME>
```

No IP address needed, from any network.

Update `~/.ssh/config` on the Mac to replace the LAN address set in
`docs/05-first-boot.md`:

```
Host obsidian
    HostName <HOSTNAME>
    User <USERNAME>
```

## About `--ssh`

`tailscale up --ssh` lets Tailscale terminate SSH connections itself,
authenticating by tailnet identity rather than by SSH key. Convenient —
no keys to distribute — and access is governed by the tailnet ACL policy
rather than `authorized_keys`.

The trade-off is that access now depends on Tailscale's control plane
being reachable. Regular `sshd` on the LAN stays as the fallback, which
is exactly why `docs/05-first-boot.md` sets up key-based SSH first. Keep
both.

## Firewall

`ufw` from `docs/05-first-boot.md` does not need changes for Tailscale to
work — it dials out, it does not accept inbound connections on the LAN
interface.

If you later run services you want reachable *only* over the tailnet,
allow them on the Tailscale interface rather than globally:

```sh
sudo ufw allow in on tailscale0 to any port <PORT>
```

## Verify

From the Mac, on a **different network** — phone hotspot is the easy
test:

```sh
ssh <USERNAME>@<HOSTNAME> 'hostname; uptime'
```

If that works off your home Wi-Fi, remote access is done.

## Gotchas

- **`tailscale status` on the Mac errors about bundleIdentifier.** Use the
  in-bundle binary path from step 1.
- **Server drops off the tailnet months later.** Key expiry — step 4.
- **MagicDNS names don't resolve.** Not enabled in the admin console, or
  the client needs `sudo tailscale up --accept-dns=true`.
- **Tailscale and the LAN both work, but you can't tell which you're
  using.** `tailscale status` marks the active path; `direct` means a
  peer-to-peer link, `relay` means traffic is going through a DERP relay
  and will be slower.
