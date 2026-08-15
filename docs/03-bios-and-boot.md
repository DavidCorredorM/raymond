# 03 — BIOS setup and booting the USB

Done at the machine, with a monitor and USB keyboard attached. This is
the step most likely to need improvisation, because BIOS menus differ
between GMKtec models and firmware revisions.

**Photograph each BIOS screen you change into `assets/`.** Next time this
turns a 20-minute hunt into a 2-minute confirmation.

## Before you start

- Monitor connected via HDMI (or DisplayPort — use whichever port the
  unit has; if it has both, HDMI is the safer default for BIOS output)
- USB keyboard in a USB 2.0 port if the machine has one
- Ethernet cable connected to the router
- Install USB from `docs/02-*` plugged in **before** powering on
- Power adapter connected

## 1. Enter the BIOS

Power on and immediately tap the BIOS key repeatedly — once every half
second, starting the instant you press power. Waiting for a prompt to
appear is usually too late.

`assumed:` GMKtec units generally use **`Del`**, with `F2` and `F7` as
the other candidates. Try `Del` first. If the machine boots into Windows,
shut down fully and try the next key.

Record which key worked in `docs/00-hardware-inventory.md`.

If none work: in Windows, hold `Shift` while clicking Restart, then
choose Troubleshoot → Advanced options → UEFI Firmware Settings. That
reboots directly into the BIOS regardless of key.

## 2. Settings to change

Names vary; the concepts don't. Find and set:

| Setting | Value | Why |
|---|---|---|
| Boot Mode / CSM | **UEFI only**, CSM disabled | Ubuntu 26.04 installs UEFI. Legacy/CSM boot produces a system that installs but won't boot. |
| Fast Boot | **Disabled** | Skips USB enumeration at power-on, which is the usual reason a correctly-written stick doesn't appear in the boot menu. |
| Secure Boot | Leave **enabled** | Ubuntu's bootloader is Microsoft-signed and boots fine with it on. Only disable if the USB refuses to boot and everything else has been ruled out. |
| Boot order | USB device first | Or skip this and use the one-time boot menu, below. |
| SATA Mode | **AHCI** (if the option exists) | RAID/Intel RST mode hides the disk from the Linux installer. Rarely present on mini PCs, but check. |

Save and exit — usually `F10`.

## 3. Boot the USB

Either the boot order from step 2 takes effect, or use the one-time boot
menu: power on and tap the boot menu key.

`assumed:` **`F7`** on GMKtec, with `F11` and `F12` as alternates.

Pick the entry naming your USB stick. Prefer an entry prefixed `UEFI:`
if the list shows the same stick twice — the non-UEFI entry is the
legacy path and will produce a non-booting install.

## 4. GRUB menu

You should land on a purple GRUB screen:

```
*Try or Install Ubuntu Server
 Ubuntu Server with the HWE kernel
 Test memory
```

Press Enter on the first entry. Text scrolls for 30–90 seconds, then the
installer starts.

## Verify

- The installer's first screen ("Willkommen! / Welcome!" language
  selection) appears
- Model and BIOS entry key recorded in `docs/00-hardware-inventory.md`
- BIOS screens photographed into `assets/`

Next: `docs/04-ubuntu-install.md`.

## Troubleshooting

**USB doesn't appear in the boot menu.** In order: confirm Fast Boot is
disabled; move the stick to a different physical port, preferring USB
2.0; rewrite the stick (`docs/02-*`) on the suspicion it's faulty; as a
last resort, disable Secure Boot.

**Machine boots straight to Windows every time.** The BIOS key isn't
registering. Use the Windows Shift+Restart route in step 1.

**Blank screen after selecting the USB.** Some Intel integrated graphics
need a kernel parameter. At the GRUB menu press `e` to edit the entry,
find the line starting `linux`, append ` nomodeset` at its end, then
press `F10` to boot. If that works, note it — the same parameter has to
be made permanent after install.

**Installer starts but sees no disk.** Check SATA Mode is AHCI, not RAID
or Intel RST.
