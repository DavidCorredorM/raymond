# 04 — Ubuntu Server 26.04 install

The installer is Subiquity, a text UI. Navigate with arrow keys, Tab, and
Enter; the mouse does nothing. Screens are listed in the order they
appear.

**This step erases the disk, and with it Windows.** That is the intended
outcome (`docs/01-decisions.md`), but it is the point of no return.

Time: 15–30 minutes.

## Screen by screen

**Language.** English.

**Installer update.** If it offers "Update to the new installer", take
it. Bug fixes since the ISO was built.

**Keyboard layout.** Match your physical keyboard. If it's a Spanish
layout, choose Spanish — otherwise punctuation lands on the wrong keys
and password entry gets confusing, since passwords are masked and you
can't see what went wrong.

**Type of install.** **Ubuntu Server**, not "Ubuntu Server (minimized)".
Minimized strips documentation and common tools to save a few hundred
MB, and you will spend that saving back the first time you need to debug
something.

Leave third-party drivers unchecked unless the network doesn't work.

**Network.** The wired interface should show an IP from DHCP, something
like `192.168.1.x`.

If it shows nothing: check the cable and the router. Getting networking
right here matters — the installer downloads updates and the SSH server
over it.

Note the IP shown. Record it as `<SERVER_IP>` in
`docs/00-hardware-inventory.md`, and convert it to a permanent DHCP
reservation on the router afterwards (`docs/05-*`).

**Proxy.** Leave blank.

**Mirror.** Accept the default. It geolocates.

**Storage — the important screen.**

Choose **"Use an entire disk"**.

Check **"Set up this disk as an LVM group"** (reasoning in
`docs/01-decisions.md`).

Leave **"Encrypt the LVM group with LUKS" unchecked** — full-disk
encryption means no unattended reboots on a headless box.

Confirm the disk shown is the internal drive and its size matches
`<DISK_SIZE>` from the inventory. If a USB stick appears in the list,
make sure it is not the one selected.

*A note on LVM sizing:* the installer allocates only part of the volume
group to the root filesystem by default, leaving the rest unused. On the
summary screen, select the root logical volume, choose Edit, and set its
size to the maximum. Otherwise you end up with a fraction of your disk
usable and wonder later where it went. Space left unallocated can be
added later without reinstalling, but it's easier to just take it now.

**Confirm destructive action.** The installer lists what it will erase
and asks you to type or select Continue. This wipes Windows. Read the
summary, confirm the disk is right, continue.

**Profile.**

| Field | Value |
|---|---|
| Your name | your real name, cosmetic only |
| Your server's name | `<HOSTNAME>` — lowercase, no spaces, e.g. `obsidian` |
| Pick a username | `<USERNAME>` — this is your login |
| Password | generate one, store it in the password manager |

The hostname becomes the machine's network name. Choose something you
won't mind typing.

**Ubuntu Pro.** Skip for now. It's free for personal use and extends
security patching, and can be enabled later with `pro attach`.

**SSH.** Check **"Install OpenSSH server"**. Without it the machine is
unreachable once you unplug the monitor, and you'll be carrying a
keyboard back to it.

If you have SSH keys on GitHub, use "Import SSH identity → from GitHub"
and enter your username — it fetches your public keys and you can log in
without a password from first boot. Otherwise leave it and we'll copy a
key across in `docs/05-*`.

**Featured server snaps.** Select none. Enter to continue.

**Install progress.** Logs scroll. When it finishes, the button changes
to **Reboot Now**.

## Reboot

Select Reboot Now. When the screen prompts to remove the installation
medium, **unplug the USB stick**, then press Enter. Leaving it in boots
the installer again.

## Verify

At the console, log in with `<USERNAME>` and the password you set, then:

```sh
lsb_release -a          # Ubuntu 26.04 LTS
ip -4 addr show         # an address on your LAN
sudo systemctl is-active ssh    # active
df -h /                 # root filesystem sized as expected
```

If all four look right, the install is done. Everything after this can
be done over the network — the monitor and keyboard can come off.

Next: `docs/05-first-boot.md`.

## Gotchas

- **The disk stays "in use" and the installer refuses it.** Almost always
  the USB stick was selected instead of the internal drive. Re-check.
- **Root filesystem is much smaller than the disk.** The LVM default
  described above. Fix without reinstalling:
  `sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv` then
  `sudo resize2fs /dev/ubuntu-vg/ubuntu-lv`.
- **Install finishes but the machine boots to a black screen or back to
  the BIOS.** The install went down the legacy/CSM path. Confirm UEFI-only
  boot in the BIOS (`docs/03-*`) and reinstall.
