# 01 — Decisions

Choices made up front, with the reasoning, so a future reader knows what
was deliberate and what was arbitrary.

## OS: Ubuntu Server 26.04 LTS

Verified 2026-08-11 against <https://releases.ubuntu.com/26.04/> — 26.04
"Resolute Raccoon" is the current LTS. Five years of standard security
support (to 2031), ten with ESM.

Chosen over Ubuntu Desktop because this box runs headless once installed.
Chosen over Proxmox because there is exactly one workload.

Chosen over Debian for newer kernels and firmware out of the box. **This
reasoning turned out to be weaker than assumed:** the original argument
was that GMKtec units use recent Intel N-series silicon needing a new
kernel. The actual hardware is an i3-10110U from 2019 (see
`00-hardware-inventory.md`), which every current distro supports
completely. Debian would have worked just as well. Ubuntu stands, but on
familiarity rather than hardware support.

ISO: `ubuntu-26.04-live-server-amd64.iso`

## Windows: wiped entirely

Whole disk goes to Linux. No dual-boot, no recovery partition kept.

The GMKtec's Windows license is OEM and embedded in the board firmware
(ACPI MSDM table), so Windows can be reinstalled later from Microsoft's
own media and will self-activate without a key. Nothing is being
permanently lost by erasing the drive.

## Disk encryption: no

Full-disk encryption (LUKS) requires typing a passphrase at every boot.
On a headless machine that means no unattended reboots — a power cut
leaves the server down until someone attaches a monitor and keyboard.

The threat being traded away is physical theft of the device. For a
personal vault on a machine at home, that is the smaller risk.

Revisit if the vault ever holds anything genuinely sensitive.

## Partitioning: LVM, single disk

The installer's "use an entire disk, set up LVM" option. LVM adds a layer
of indirection but makes it possible to grow the filesystem later if a
second drive is added to the free M.2 bay, without reinstalling.

## Networking: Ethernet, DHCP reservation

Wired for the install and for normal running. Wi-Fi on mini PCs is the
single most common source of install-time driver trouble, and this
machine will sit next to the router anyway.

Fixed address handled by a DHCP reservation on the router rather than a
static IP configured on the server. Both work; the reservation keeps all
address assignment in one place and cannot strand the machine off the
network through a typo in a config file.

## SSH: key-only, password login disabled

Passwords are enabled during the install (the installer requires a user
password) and disabled in `docs/05-*` once key login is confirmed
working. Order matters — disabling password auth before a key works
locks you out.

## Remote access: Tailscale

Decided 2026-08-11. Both the Mac and the server join a Tailscale mesh
(`docs/06-tailscale.md`).

Chosen over forwarding port 22 on the router, which would publish an SSH
endpoint to the internet and attract continuous automated login attempts
within hours. Tailscale exposes nothing publicly.

Chosen over hand-rolled WireGuard because the key exchange, NAT
traversal and DNS are handled for you, and the free tier covers far more
devices than this will ever need.

Side effect: the DHCP reservation from `docs/05-first-boot.md` stops
being load-bearing, since the server keeps a stable Tailscale name
whatever the router assigns. Keep the reservation anyway — it's the
fallback path when Tailscale itself is the thing that's broken.

Tailscale was already installed on the Mac before this project started;
it just needed logging in.

## Open questions

Deferred until the OS is up, since neither changes the install:

- How the vault syncs between the Mac and the server (Syncthing, Git,
  the Obsidian LiveSync CouchDB plugin, or a Samba share) —
  `docs/07-obsidian-sync.md`
- Backup target and schedule. Note that a sync mechanism is **not** a
  backup: it propagates deletions and corruption just as faithfully as
  it propagates edits.
