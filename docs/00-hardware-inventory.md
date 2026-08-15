# 00 — Hardware inventory

Fill this in before starting. Everything machine-specific referenced
elsewhere in the docs is defined here, so the rest of the steps depend on
it being accurate.

Keep your filled-in copy **out of this repo** — put it in
`deployments/<name>.md`, which is gitignored. This file stays blank so
the next person starts clean.

**Fastest way to collect most of this:** on the Windows machine, press
`Win`, type `msinfo32`, Enter. One window, everything except disk size.
For disk size, `Win` → `diskmgmt.msc`.

## The mini PC

| Field                | Value | Where it comes from |
|----------------------|-------|---------------------|
| Brand / model        | `<MODEL>` | `msinfo32` → System Model |
| CPU                  | `<CPU>` | `msinfo32` → Processor |
| RAM                  | `<RAM_GB>` GB | `msinfo32` → Installed Physical Memory |
| Storage              | `<DISK_SIZE>` | `diskmgmt.msc` → the non-removable disk |
| Disk space in use    | `<USED>` of `<TOTAL>` | `diskmgmt.msc` → C: capacity vs free |
| Second drive slot?   | `<YES/NO>` | open the bottom panel and look |
| Video ports          | `<PORTS>` | look at the back panel |
| Ethernet             | `<YES/NO>` | physical RJ45 port |
| Windows edition      | `<EDITION>` | `msinfo32` → OS Name |
| Windows user account | `<ACCOUNT>` | `msinfo32` → User Name |

**Check the disk-space figure before erasing.** A stock Windows 11
install is roughly 40 GB. Substantially more than that means someone has
been using the machine, and you need to find out what is on it before it
goes. See `02-prepare-usb-macos.md` step 0 for why this matters.

## BIOS

| Field              | Value | Where it comes from |
|--------------------|-------|---------------------|
| BIOS version/date  | `<VER>` | `msinfo32` → BIOS Version/Date |
| BIOS mode          | `<UEFI/LEGACY>` | `msinfo32` → BIOS Mode |
| Secure Boot state  | `<ON/OFF>` | `msinfo32` → Secure Boot State |
| BIOS entry key     | `<KEY>` | try `Del`, then `F2`, then `F7` |
| Boot menu key      | `<KEY>` | try `F7`, then `F11`, then `F12` |

If BIOS Mode already reads UEFI and Secure Boot is already off, the two
settings most likely to need changing in `03-bios-and-boot.md` are
already correct.

## Identifying the right disk during the install

The installer shows every disk including the USB stick you booted from.
**Pick by size**, never by device name:

| Disk | Size | Role |
|---|---|---|
| internal | `<DISK_SIZE>` | the install target |
| removable | `<USB_SIZE>` | the install USB — **never select this** |

Write both numbers down before you reach the storage screen. They differ
by an order of magnitude, which is exactly why size is the safe
discriminator.

## The Mac used to build the install USB

| Field         | Value | Where it comes from |
|---------------|-------|---------------------|
| macOS version | `<MACOS_VER>` | `sw_vers -productVersion` |
| Architecture  | `<ARCH>` | `uname -m` |
| USB stick     | `<SIZE>` GB, appears as `<USB_DISK>` | `diskutil list external` |
| Prior contents| `<WHAT_WAS_ON_IT>` | check before erasing |

Device identifiers like `disk2` are **not stable** across reboots or
between machines. Re-run `diskutil list external` and confirm the size
every time. Never reuse a number from a previous session.

## The installed system

Chosen during the install.

| Field    | Value |
|----------|-------|
| Hostname | `<HOSTNAME>` — lowercase, no spaces |
| Username | `<USERNAME>` |
| Password | store in a password manager — **never written here** |
| SSH      | OpenSSH installed during setup |

## Network

| Field              | Value |
|--------------------|-------|
| Connection         | `<ETHERNET/WIFI>` |
| Wireless interface | `<WL_INTERFACE>` — from `ip link show`, starts with `wl` |
| Router make/model  | `<ROUTER>` |
| DHCP reservation?  | `<YES/NO>` |
| Server IP          | `<SERVER_IP>` |

Ethernet is preferred for the install. If no cable is available, see the
Wi-Fi path in `05-first-boot.md`.

## Peripherals needed

The install is not headless. Until SSH works you need:

- Monitor, on whichever port the unit actually has
- USB keyboard — the installer ignores the mouse entirely
- USB stick, 8 GB or larger
- Ethernet cable if at all possible

## Reference build

The docs in this repo were written and verified against this machine. Not
a requirement — anything x86-64 with 8 GB of RAM will do — but it is the
configuration every step here was actually run on.

| Field | Value |
|---|---|
| Model | GMKtec NucBox G3 Pro (SKU `G3 Pro-001`) |
| CPU | Intel Core i3-10110U, 2 cores / 4 threads (Comet Lake, 2019) |
| RAM | 16 GB |
| Disk | 476.92 GB NVMe |
| Video | 1× HDMI, no USB-C |
| Shipped with | Windows 11 Pro, BIOS already UEFI, Secure Boot already off |
| Built from | macOS 14.7.1, Intel |
