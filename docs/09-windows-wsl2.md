# 09 — Windows, via WSL2

Raymond's actual runtime (Node, Claude Code, cron-based scheduling,
systemd for the panel service) is Linux tooling. On Windows that means
WSL2 — not a native-Windows path. Once inside a WSL2 Ubuntu instance,
`scripts/bootstrap.sh` runs exactly as it does on real Ubuntu; nothing
in it is WSL-aware or needs to be. This doc covers only what's different
about the *container* around that: enabling WSL2 itself, and — the part
that actually needs care — how Tailscale and network reachability work
when the machine is a VM inside Windows rather than the machine itself.

## 1. Install WSL2 and Ubuntu

From an elevated PowerShell:

```powershell
wsl --install -d Ubuntu
```

Reboots if this is the first WSL install on this machine. Verify you
got WSL2, not the older WSL1:

```powershell
wsl -l -v
```

The `VERSION` column must read `2`.

## 2. Enable systemd inside the WSL2 instance

Off by default; `schedule-job` and the panel's systemd unit both need
it. Inside the Ubuntu shell:

```sh
echo -e "[boot]\nsystemd=true" | sudo tee /etc/wsl.conf
```

Then, from PowerShell (not inside WSL): `wsl --shutdown`, and reopen the
Ubuntu terminal. Confirm with `systemctl status` inside WSL — it should
show a real running init system, not "System has not been booted with
systemd."

## 3. Run bootstrap.sh, same as Linux

```sh
git clone https://github.com/DavidCorredorM/raymond.git ~/raymond
cd ~/raymond
./scripts/bootstrap.sh
```

Skip `--with-caddy` unless you specifically need it — see reachability
below before deciding.

## 4. Tailscale: install on Windows, not inside WSL2

This is the one place WSL2 genuinely isn't "just Ubuntu." **Install and
run Tailscale on the Windows host**, not inside the WSL2 instance.
Verified against Tailscale's own docs (`tailscale.com/docs/install/windows/wsl2`,
last validated 2025-11-03): running Tailscale on both the Windows host
and inside WSL2 at the same time breaks encrypted traffic between them
— WSL2's default network interface has an MTU of 1280, too small for a
second layer of Tailscale encapsulation on top. `tailscaled` has a
built-in workaround that raises it to 1340 when it detects it's running
inside WSL2, but the simpler, officially recommended setup for a normal
install is host-only: **Tailscale lives on Windows, WSL2 does not run
it at all.**

Install the normal Windows Tailscale client, sign in, and — same as
every other platform — disable key expiry for this device at
[login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines).

## 5. Make the panel reachable from the rest of your tailnet

The panel binds `0.0.0.0` inside the WSL2 VM. Because Tailscale is on
the Windows host, something has to bridge "a tailnet peer reaches this
Windows machine's tailnet IP" to "that connection lands on the service
running inside the WSL2 VM." Two ways, in order of preference:

**Mirrored networking mode (Windows 11 22H2+, recommended).** Makes
WSL2 share the host's network interfaces directly instead of sitting
behind NAT — a WSL2 service bound to `0.0.0.0` becomes reachable from
other machines on the LAN/tailnet with no port-forwarding step. In
`%UserProfile%\.wslconfig` on the **Windows** side:

```ini
[wsl2]
networkingMode=mirrored
```

Then `wsl --shutdown` and reopen. Also required — an elevated
PowerShell command to allow inbound connections through the Hyper-V
firewall, which mirrored mode routes through:

```powershell
Set-NetFirewallHyperVVMSetting -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -DefaultInboundAction Allow
```

(Source: `learn.microsoft.com/windows/wsl/networking`. That GUID is
fixed — it identifies the WSL virtual machine to Hyper-V's firewall, not
this specific install.) With mirrored mode on, verify from another
tailnet device: `http://<windows-machine-tailscale-name>:8710`.

**`netsh portproxy` (older Windows, or if mirrored mode isn't
available).** Forwards a Windows port to the WSL2 VM's internal IP,
which changes on every `wsl --shutdown`/restart — brittle, but works
today on any WSL2 setup:

```powershell
netsh interface portproxy add v4tov4 listenport=8710 listenaddress=0.0.0.0 connectport=8710 connectaddress=(wsl hostname -I)
```

Re-run this after every WSL2 restart, or wire it into a Windows startup
task if this is a machine that reboots on its own. Mirrored mode doesn't
have this problem, which is the real reason to prefer it when available.

## 6. Everything past this point is the normal path

Vault skeleton, `setup-raymond`, the panel service itself
(`panel/deploy/README.md`'s systemd instructions, run inside WSL2
exactly as on real Ubuntu) — none of it is Windows-specific.
`docs/DEPLOYMENT.md` picks back up at "finish the vault."

## Gotchas

- **`claude: command not found` after WSL restarts.** Same PATH-under-
  non-interactive-shell issue `docs/08-server-setup.md` documents for
  Ubuntu — WSL2 is Ubuntu underneath, so the same fix applies.
- **Windows suspending/sleeping stops WSL2 entirely**, panel included —
  a laptop that sleeps on lid-close is a worse fit for "always-on" than
  a desktop or a plugged-in machine with sleep disabled.
- **Don't run `tailscale up` inside the WSL2 shell "just to check."**
  Per step 4, having it running there at all — even briefly, even
  alongside the Windows client — is the specific thing that breaks.
