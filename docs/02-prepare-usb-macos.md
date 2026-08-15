# 02 — Build the install USB on macOS

Done on the Mac. Verified environment: macOS 14.7.1 (Sonoma), Intel
(`x86_64`). The commands below are BSD/macOS variants and differ from the
Linux ones you'll find in most guides.

Time: about 20 minutes, most of it the 3 GB download.

You need a USB stick of 8 GB or more. **Everything on it is destroyed.**

## 0. Check what is already on the stick

Do this before anything else. A stick pulled from a drawer is not an
empty stick.

```sh
diskutil list external          # note the identifier, e.g. disk2
ls -lah /Volumes/<VOLUME_NAME>
du -sh /Volumes/<VOLUME_NAME>
```

If there is anything on it, copy it off and **verify the copy** before
continuing. Compare file counts between source and archive rather than
trusting that it worked:

```sh
# archive it
cd /Volumes/<VOLUME_NAME>
zip -r -q ~/Downloads/<NAME>-usb-backup-$(date +%F).zip <FOLDERS> \
    -x '*.DS_Store' '*/._*'

# verify: integrity, then count real files on both sides
unzip -t ~/Downloads/<NAME>-usb-backup-$(date +%F).zip | tail -1
find <FOLDERS> -type f ! -name '._*' ! -name '.DS_Store' | wc -l
unzip -l ~/Downloads/<NAME>-usb-backup-$(date +%F).zip | tail -1
```

`observed:` on the reference build, the stick pulled out of a drawer for
this turned out to hold 3.4 GB of irreplaceable research data under a
volume nobody remembered creating. It was archived and verified before
the stick was erased. This step exists because of that, and it is the
single most valuable thirty seconds in the whole guide.

Note when counting: `find` over the whole volume also picks up
`.Spotlight-V100`, `.fseventsd` and `System Volume Information`. Those are
OS metadata, not data — count only the real folders, or the numbers won't
match and you'll think files went missing.

## 1. Download the ISO and its checksums

```sh
mkdir -p ~/Downloads/ubuntu-iso && cd ~/Downloads/ubuntu-iso

curl -L -O https://releases.ubuntu.com/26.04/ubuntu-26.04-live-server-amd64.iso
curl -L -O https://releases.ubuntu.com/26.04/SHA256SUMS
curl -L -O https://releases.ubuntu.com/26.04/SHA256SUMS.gpg
```

## 2. Verify the download

A truncated or corrupted ISO produces an install that fails halfway
through with an unhelpful error. Checking takes 30 seconds.

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Expected output: `ubuntu-26.04-live-server-amd64.iso: OK`

Anything else — re-download. Do not continue.

`observed: 2026-08-11` — the published SHA256 for this ISO is
`dec49008a71f6098d0bcfc822021f4d042d5f2db279e4d75bdd981304f1ca5d9`, and
the file is 2,918,598,656 bytes. If a future download differs, Canonical
has issued a point release (26.04.1 and so on) — fetch the current
`SHA256SUMS` rather than assuming this repo's value still holds.

**Optional, stronger check.** The above confirms the ISO matches the
checksum file, but not that the checksum file itself is genuine. To also
verify Canonical signed it, install GnuPG (`brew install gnupg`), then:

```sh
gpg --keyid-format long --verify SHA256SUMS.gpg SHA256SUMS
```

The first run reports the key as not found; import it with
`gpg --keyserver keyserver.ubuntu.com --recv-keys <KEYID>` using the key
ID printed in the error, then re-run. Confirm the fingerprint it reports
matches the one published at
<https://ubuntu.com/tutorials/how-to-verify-ubuntu> before trusting it.
Skip this whole step if the machine is on your own network and you're
comfortable with the plain checksum.

## 3. Identify the USB stick

Plug it in, then:

```sh
diskutil list external
```

Output looks like:

```
/dev/disk4 (external, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:     FDisk_partition_scheme                        *31.0 GB    disk4
   1:                 DOS_FAT_32 UNTITLED                31.0 GB    disk4s1
```

Note the identifier — `disk4` here. **Confirm the size matches your USB
stick.** The next command erases whatever you name, without asking. Get
this wrong and you erase the wrong drive.

Record it as `<USB_DISK>` for the rest of this page.

## 4. Unmount (do not eject)

```sh
diskutil unmountDisk /dev/<USB_DISK>
```

Unmounting frees the filesystem while leaving the device present.
Ejecting would remove the device node and the write would fail.

## 5. Write the ISO

Ubuntu's ISOs are isohybrid images, so a raw block copy is all that's
needed — no special tool, no partitioning.

```sh
sudo dd if=/Users/<YOU>/Downloads/ubuntu-iso/ubuntu-26.04-live-server-amd64.iso \
        of=/dev/r<USB_DISK> bs=1m
```

Three things that bite here:

**Use an absolute path for `if=`.** `if=~/Downloads/...` fails with
`No such file or directory`. The shell only expands `~` at the start of a
word, and here it sits after `if=`. This is not a missing file — it is
the tilde arriving at `dd` as a literal character.

**Use `/dev/rdisk2`, not `/dev/disk2`.** The `r` prefix is the raw
device and writes roughly ten times faster on macOS.

**Run it in your own terminal, not through an agent or script.** `sudo`
prompts for a password on the TTY; a non-interactive shell hangs waiting
for input that can never arrive.

macOS `dd` prints nothing while it runs and has no `status=progress`
flag (that's GNU `dd`; macOS ships the BSD one). **Press `Ctrl-T` for a
progress line:**

```
load: 1.79  cmd: dd 89762 uninterruptible 0.01u 0.99s
1628+0 records in
1628+0 records out
1707081728 bytes transferred in 231.689381 secs (7367976 bytes/sec)
```

`records in` counts MB written, so divide by the ISO's size in MB for
percentage. The 26.04 server ISO is 2,918,598,656 bytes = **2783 MB**.

`observed: 2026-08-11` — a generic "Flash Disk" USB 2.0-class stick wrote
at **7.4 MB/s**, finishing in a little under 7 minutes. Faster USB 3.0
sticks manage 30–40 MB/s and finish in 90 seconds. Either is normal;
don't interrupt a slow one. A half-written stick boots into a broken
installer and has to be redone from scratch.

## 6. Dismiss the macOS warning

macOS pops up: *"The disk you inserted was not readable by this
computer."*

**Click Ignore.** Not Initialize — Initialize erases the USB you just
spent ten minutes writing.

The warning is expected and correct: the stick now holds a Linux
filesystem macOS cannot read. It does not mean anything went wrong.

## 7. Eject

```sh
sudo diskutil eject /dev/<USB_DISK>
```

## Verify

- `shasum -a 256 -c` reported `OK` in step 2
- `dd` reported a byte count matching the ISO size (`ls -l` the ISO)
- macOS showed the "not readable" dialog, and you clicked Ignore
- `diskutil eject` returned without error

The stick is now bootable. Next: `docs/03-bios-and-boot.md`.

## Gotchas

- **USB 2.0 ports are more reliable for booting than USB 3.0** on some
  mini PC firmware. If the machine won't boot the stick, try a different
  physical port before assuming the stick is bad.
- If `dd` fails with `Resource busy`, something remounted the disk. Re-run
  step 4 and try again immediately.
- Cheap or old USB sticks fail silently in ways that surface as install
  errors much later. If the install misbehaves in strange ways, suspect
  the stick and rewrite it before debugging anything else.
