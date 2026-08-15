# 05 — First boot: SSH, fixed address, updates

From here on everything is done from the Mac over SSH. The monitor and
keyboard can be disconnected once step 2 is confirmed working.

Time: 20 minutes.

## 1. Give the server a permanent address

Do this on the router, not on the server (`docs/01-decisions.md`).

Find the server's MAC address:

```sh
ip link show
```

Read the `link/ether` value of the wired interface — twelve hex digits,
like `a1:b2:c3:d4:e5:f6`.

In the router's admin page, find DHCP → Address Reservation (the name
varies: "Static Lease", "DHCP Reservation", "Bind IP to MAC"). Add an
entry mapping that MAC to `<SERVER_IP>`.

Reboot the server (`sudo reboot`) and confirm it comes back on the same
address with `ip -4 addr show`.

## 2. SSH in from the Mac

If you imported GitHub keys during the install, this already works:

```sh
ssh <USERNAME>@<SERVER_IP>
```

If not, create a key on the Mac (skip if `~/.ssh/id_ed25519` exists) and
copy it across:

```sh
ssh-keygen -t ed25519 -C "ben"
ssh-copy-id <USERNAME>@<SERVER_IP>
```

`ssh-copy-id` asks for the server password once. After that:

```sh
ssh <USERNAME>@<SERVER_IP>
```

must log in **without** prompting for a password. Confirm this before
step 5 — that step removes password login, and doing it while key auth
is broken locks you out of the machine.

Optionally add to `~/.ssh/config` on the Mac so `ssh obsidian` is enough:

```
Host obsidian
    HostName <SERVER_IP>
    User <USERNAME>
```

## 3. Update everything

```sh
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

The first upgrade after an install is usually large. Reboot afterwards to
pick up a new kernel.

## 4. Automatic security updates

A machine that sits unattended needs to patch itself.

```sh
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes
```

Confirm it's armed:

```sh
systemctl status unattended-upgrades --no-pager
```

## 5. Lock down SSH

**Only after step 2 logs in without a password.**

```sh
sudo nano /etc/ssh/sshd_config.d/99-hardening.conf
```

Contents:

```
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
```

Using a drop-in file under `sshd_config.d/` rather than editing
`sshd_config` directly keeps the change separate from the packaged file,
so distribution upgrades don't silently revert or conflict with it.

Check the config parses before applying it — `sshd -t` catches typos that
would otherwise take the SSH daemon down while you're connected through
it:

```sh
sudo sshd -t && sudo systemctl restart ssh
```

**Keep your current SSH session open.** In a second terminal, confirm you
can still log in. If you can, the change is safe. If you can't, the open
session is how you undo it.

## 6. Firewall

```sh
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status verbose
```

`ufw allow OpenSSH` before `ufw enable`, in that order — enabling first
drops your own connection.

Ports for whatever sync mechanism gets chosen are opened later, in
`docs/06-*`.

## Verify

```sh
ssh <USERNAME>@<SERVER_IP> 'lsb_release -ds; uptime; sudo ufw status | head -1'
```

- logs in with no password prompt
- `ufw` reports `Status: active`
- `sudo apt update` reports no held-back packages

## Record

Add to `docs/00-hardware-inventory.md`:

- `<SERVER_IP>` and the MAC it's reserved against
- `<HOSTNAME>` and `<USERNAME>`
- where the server password is stored (name of the password manager
  entry — **never the password itself**)

Next: `docs/06-obsidian-sync.md`.
