# Reference build log

Append-only. Newest entries at the bottom.

This is the log of the **reference build** — the one machine every doc in
this repo was actually verified against. The numbered docs describe the
clean path; this file describes the real one, failures included. Names,
hostnames and addresses are redacted, since the point is the lessons, not
the machine.

Keep your own deployment's log in `deployments/`, which is gitignored.

## [2026-08-11] Project created

Checked for documentation of the previous Linux install on this hardware:
the knowledge vault, `~/workspace`, `~/Documents`, `~/Desktop`,
`~/Downloads`, and Claude Code transcripts under `~/.claude/projects/`.
Searched for `gmktec`, `ventoy`, `rufus`, `ubuntu`, `debian`, `obsidian`,
`homelab`. **No hits anywhere** — the prior install was never written
down. Starting from scratch.

Created this repo at `~/workspace/misc/obsidian-server`, alongside other
personal projects. Deliberately kept out of the knowledge vault: that
vault is MonoAI's and this is unrelated.

## [2026-08-11] Decisions fixed

Ubuntu Server 26.04 LTS, whole disk, Windows erased, no LUKS, LVM,
DHCP reservation. Reasoning in `01-decisions.md`.

Version confirmed against <https://releases.ubuntu.com/26.04/> rather
than assumed — 26.04 "Resolute Raccoon" is the current LTS as of today.

## [2026-08-11] ISO downloaded and verified

`ubuntu-26.04-live-server-amd64.iso`, 2,918,598,656 bytes.
`shasum -a 256 -c SHA256SUMS` → **OK**
SHA256 `dec49008a71f6098d0bcfc822021f4d042d5f2db279e4d75bdd981304f1ca5d9`

## [2026-08-11] USB stick held live data — near miss

The stick plugged in for the install (`/dev/disk2`, 15.9 GB) was **not
blank**. It carried a volume with 3.4 GB of physics
measurements from Nov–Dec 2023: Mach-Zehnder interference contrast,
photon statistics, dark-current sweeps, plus a PicoScope `.psdata` file.
139 real data files.

Caught by inspecting the volume before writing. `dd` would have destroyed
all of it with no recovery path.

Archived to a dated zip in `~/Downloads` — 493 MB
compressed, `unzip -t` clean, and file lists compared between source and
archive to confirm all 139 files present before erasing.

An initial count of "258 files" was wrong: `find` over the volume root
also counts `.Spotlight-V100`, `.fseventsd` and `System Volume
Information` entries. Real data was 139 files.

**Lesson, now step 0 of `02-prepare-usb-macos.md`:** inspect the stick
before erasing it, and verify the archive by comparing counts rather than
assuming the copy worked.

## [2026-08-11] Writing the ISO

Two failures worth recording:

1. `sudo dd` run through the agent's shell was not possible — `sudo`
   prompts for a password on a TTY and a non-interactive shell hangs.
   Run interactively.
2. `if=~/Downloads/...` failed with `No such file or directory`. The
   shell does not expand `~` after `if=`; `dd` received a literal tilde.
   Fixed with an absolute path.

Write speed on this stick: **7.4 MB/s**, roughly 7 minutes for 2783 MB.
Slow, but consistent with a USB 2.0-class generic flash drive.

## [2026-08-11] USB write verified

`dd` completed in about 6 minutes at 7.4 MB/s. Partition table on
`/dev/disk2` changed from `FDisk_partition_scheme` (the old FAT32
old FAT32 volume) to:

```
0: GUID_partition_scheme      *15.9 GB
1: Microsoft Basic Data        2.9 GB    <- installer image
2: EFI ESP                     5.3 MB    <- UEFI boot partition
3: Microsoft Basic Data      307.2 KB
```

The **EFI ESP partition is the thing to check** — its presence confirms
the stick boots in UEFI mode, which `03-bios-and-boot.md` requires.

## [2026-08-11] Remote access decided: Tailscale

Both machines join a Tailscale mesh instead of forwarding a port on the
router. Written up in `06-tailscale.md`; reasoning in `01-decisions.md`.
`06-obsidian-sync.md` renumbered to `07-` to make room.

Tailscale was already present on the Mac (`/Applications/Tailscale.app`)
but logged out. `observed:` the CLI shim at `/usr/local/bin/tailscale`
fails with `Fatal error: The current bundleIdentifier is unknown to the
registry`; the binary at
`/Applications/Tailscale.app/Contents/MacOS/Tailscale` works.

Server side is blocked until Ubuntu is installed — nothing to install
onto yet.

## [2026-08-11] Hardware identified

`msinfo32` on the running Windows install. **GMKtec NucBox G3 Pro**,
i3-10110U (2 cores / 4 threads, 2019 Comet Lake), 16 GB RAM,
Windows 11 Pro build 26200, BIOS `G3 Pro 1.01` dated 2026-03-17.

Two things already correct in firmware, so `03-bios-and-boot.md` has less
to change than expected: **BIOS Mode is already UEFI** and **Secure Boot
is already Off**.

Corrected `01-decisions.md`: the stated reason for preferring Ubuntu over
Debian (new N-series silicon needing a recent kernel) does not apply to
this hardware. A 2019 i3 is supported everywhere. Ubuntu stays, on
familiarity rather than driver support.

Still missing: disk size (`diskmgmt.msc`), video ports, free M.2 bay.

**Flag: the Windows user account was not the buyer's name.** Checked
before erasing — see next entry.

## [2026-08-11] Disk confirmed, wipe cleared

`diskmgmt.msc`. Internal Disk 0 is **476.92 GB**: 100 MB EFI +
`Windows (C:)` 474.87 GB NTFS + 1.95 GB Recovery. **434.20 GB free (91%)**
— only ~40 GB in use, which is a stock Windows 11 install with no
accumulated user data.

The account turned out to belong to the person the machine is being
**set up for**, not a previous owner. Combined with the 40 GB figure,
nothing to preserve. Wipe cleared to proceed.

The same screenshot showed Disk 1, removable, 14.84 GB, carrying a
2.71 GB RAW partition + 5 MB EFI + 12.13 GB unallocated — the Ubuntu
stick, already visible to the GMKtec. Confirms both that the write was
good and that the machine enumerates the USB.

Video: **1× HDMI, no USB-C**. Display and USB already connected.

## [2026-08-11] Ubuntu installed

Booted the USB from Windows via `Win+R` → `shutdown /r /o /t 0`, which
lands in Advanced startup → **Use a device**. This is the reliable route:
Shift+Restart requires holding Shift *while* clicking Restart and is easy
to fumble, and tapping `Del` at power-on depends on timing.

**No ethernet cable was available at the machine's location**, so the
install ran over Wi-Fi/offline rather than wired as `01-decisions.md`
assumed. Worth knowing: the installer and the installed system share a
kernel, so whether a `wl*` interface appears in the installer's network
screen predicts whether Wi-Fi will work afterwards. If none appears,
installing offline does not help — USB tethering from a phone is the
fallback.

Installed system:

| Field | Value |
|---|---|
| Hostname | `<hostname>` |
| Username | `<username>` |
| OpenSSH | installed during setup |

`hypothesis:` storage screen took the 476.92 GB internal disk with LVM
and no LUKS as planned — not directly confirmed, to be verified after
first boot with `df -h /` and `lsblk`.

## [2026-08-11] Wi-Fi working, scope settled

`wlp2s0` present and `wpa_supplicant` at `/usr/sbin/wpa_supplicant`, so
netplan Wi-Fi worked. Config in `/etc/netplan/99-wifi.yaml`, `chmod 600`
because it holds the passphrase in plaintext.

`observed:` cloud-init hung at boot with **`(1min 34s / no limit)`** —
no timeout, waiting on a network that did not exist yet. It did clear on
its own eventually. Fix is `sudo touch /etc/cloud/cloud-init.disabled`;
cloud-init provisions cloud VMs from metadata servers and does nothing
useful on a mini PC.

Also worth recording: after `Reboot Now`, leaving the USB in boots the
installer again. The GRUB menus are distinguishable — the installer's
says **"Try or Install Ubuntu Server"**, the installed system's says
just **"Ubuntu / Advanced options for Ubuntu"**. To escape, power off,
remove the stick, power on. Pulling a running live USB only hangs the
live system.

## [2026-08-11] Scope narrowed: infrastructure only

Decided: this project sets up **infrastructure**, not a running agent.
Each future user installs nothing extra and authenticates Claude Code
with their own subscription. No cron, no scheduled jobs, no unattended
agent — which removes the spend, permission and runaway-loop concerns
raised earlier.

Written up as `08-server-setup.md` plus `scripts/bootstrap.sh` and a
`vault-template/` skeleton carrying the vault rules (mandatory
`when-to-use:` frontmatter, per-folder `index.md`, unique kebab-case
basenames, dense linking, `observed:`/`assumed:`/`hypothesis:` labels).

`hypothesis:` bootstrap.sh is syntax-clean (`bash -n`) but has not been
executed yet. First real run is on the reference build.

## [2026-08-11] bootstrap.sh first run — clean

Ran end to end on the reference build with no failures. Installed:

| Component | Version |
|---|---|
| Node.js | v22.23.2 |
| npm | 10.9.8 |
| Claude Code | 2.1.228 |
| Tailscale | 1.102.2 |

`unattended-upgrades` enabled, vault skeleton created and committed, all
nine CLI tools present. Clears the `hypothesis:` logged when the script
was written but unexecuted.

Two defects found afterwards, both fixed in the script:

1. **Vault git repo initialised on `master`.** Every doc and remote here
   assumes `main`. Fixed with `git init -b main`.
2. **AppleDouble `._*` files throughout the vault**, committed into the
   initial commit. Artifacts of copying the repo off macOS with `tar` —
   macOS writes resource forks that Linux sees as real files. Script now
   deletes them after copying the skeleton. When transferring from a Mac,
   `COPYFILE_DISABLE=1 tar czf ...` avoids creating them at all.

Neither would have been caught by `bash -n`. Both are the kind of thing
only a real run surfaces.

## [2026-08-11] Disk reclaimed, Tailscale up, PATH gotcha

`lvextend` + `resize2fs` online, no unmount: `/` went from 98 GB to
**466 GB** with 438 GB free.

`sudo tailscale up` succeeded. The tailnet already contained the user's
laptop, so server-to-laptop reachability came free.

`observed:` **`ssh host 'source ~/.bashrc; claude'` fails with
`command not found`.** Ubuntu's stock `.bashrc` returns early for
non-interactive shells, and the npm `PATH` line is appended below that
guard. Sourcing it explicitly does not help — the early return fires
first. Interactive `ssh host` then typing `claude` works.

Fixed in the script by symlinking into `/usr/local/bin`, which is on the
default PATH for non-interactive shells. Anyone driving this box
remotely with `ssh host 'cmd'` needs that symlink or a full path.

## [2026-08-11] Vault tooling and skills seeded

Added to `vault-template/`:

| Path | Purpose |
|---|---|
| `_tools/vault-search` | Tiered search — `when-to-use` > alias > title > index > tag, body only with `-l` |
| `_tools/vault-lint` | Broken wiki-links, folders missing `index.md`, notes missing frontmatter |
| `.claude/skills/capture-note` | Write a note properly: frontmatter, unique name, index, links |
| `.claude/skills/daily-log` | Append a session entry to `daily/YYYY-MM-DD.md` |
| `.claude/skills/vault-health` | Run the linter and fix what it finds |
| `.claude/skills/migrate-notes` | Import an existing vault, cleaning as it goes |

Four skills, deliberately. Guidance is to stay under about a dozen —
every skill's description loads at startup whether it fires or not.

Both tools were tested against a deliberately broken vault (dangling
link, missing index, missing frontmatter) to confirm they detect
problems, not just report `none`. Three defects found and fixed during
that:

1. `vault-lint` printed `none` *after* listing real findings — the
   `found=true` flag was set inside a pipeline subshell and never
   propagated. Restructured so the report function reads findings on
   stdin.
2. It flagged `_templates/` placeholder links and `CLAUDE.md` as broken.
   Both are intentional; excluded.
3. It flagged `.claude/skills/*/SKILL.md` for missing `when-to-use:`.
   Skills use a different frontmatter schema (`name`/`description`);
   excluded.

`observed:` transferring from macOS with plain `tar` recreates the
AppleDouble problem every time. `COPYFILE_DISABLE=1 tar czf -` is the
fix, and the script also sweeps `._*` after copying.

## [2026-08-12] Panel backend built and tested on a real vault

New repo `second-brain-panel`: TypeScript, Fastify, indexes the vault in
memory and serves notes, backlinks and health checks. No database — the
index is rebuilt from files and a `chokidar` watcher keeps it current, so
edits from Obsidian, from an agent, and from the panel all converge.

Testing against the **real staged vault** (143 notes) rather than only the
clean template found three defects that a template never would:

1. **Relative wiki-links were reported as broken.** Obsidian accepts
   `[[note]]`, `[[folder/note]]` and `[[../sibling/note]]`; her vault
   mixes all three. Resolving only bare slugs marked most of the vault
   broken. Fixed with a three-strategy resolver.
2. **Escaped pipes inside tables.** `[[target\|alias]]` — the capture
   stops at the pipe but keeps the backslash, so the target arrived as
   `nutresa\`. 15 of 77 reported failures were this.
3. **`index` slug collisions.** One `index.md` per folder is the vault
   convention, so every vault reported a permanent false positive.
   Exempted; indexes are reached by navigating, never by bare wiki-link.

After fixes: **62 genuinely broken links** remain, which are real.

`observed:` running the service over SSH with `nohup`/`setsid` was
unreliable — processes did not survive the session and restarts silently
did not take. Replaced with a systemd user unit. Needs
`sudo loginctl enable-linger` once, or user services stop at logout.

## [2026-08-12] Migration findings from the staged vaults

Blocking or shaping the migration:

- **Case sensitivity.** A note links to `01-Comercial/competencia/...`
  but the folder is `01-Comercial/Competencia`. This worked on macOS
  (case-insensitive) and breaks on Linux (case-sensitive). Any vault
  authored on a Mac carries this risk, and it surfaces only after the
  move. Needs a normalisation pass during migration.
- **142 of 142 notes lack `when-to-use:`.** Expected — it is our
  convention, not hers. Writing those lines *is* the migration work, and
  it cannot be automated well: a generated line that restates the title
  passes the linter while being useless.
- **Relative links are fragile under reorganisation.** Moving files into
  `projects/<org>/` will break every `../` link unless they are rewritten
  in the same pass.
- Junk to triage: `Sin título 1.base`, `Sin título 1/2/3.canvas`.

## [2026-08-12] Vault structure and schema decided

**One vault, two companies.** ICPP and SIGRA are companies under one
holding, so they get one vault with a structure that keeps them separate
while allowing links between them:

```
companies/icpp/   companies/sigra/   holding/   panel/
```

Every note carries `company: icpp | sigra | holding`. The **field, not the
folder**, is what the panel filters on — that is what lets one dashboard
serve both companies. Skills are shared.

The evidence for merging: `juan-manuel-martinez-solarte.md` existed in
*both* staged vaults, each saying *"Ficha espejo … mantener ambas al
día"*, with a company-specific section in each. She was hand-maintaining
one person across two vaults. `holding/` removes that chore. A note
belongs there when updating it for one company would mean updating a
near-copy for the other.

**Schema stays Spanish.** Her 175 notes use `titulo`, `tipo`, `area`,
`estado`, `actualizado`, `relacion`. Converting them to the English
template would touch every note for no user benefit, and a
half-translated schema is worse than either language. Added the one field
the original lacked: **`cuando-usar`**, the retrieval key.

Converted to match: `_templates/`, all folder indexes, `vault-lint`,
`vault-search` tier patterns, the four skills, and the panel's health
check. `grep` confirms no English schema field names remain.

Note for productising this repo: the field names are defined in one place
per tool, so an English variant is a small change — but the abstraction
is deliberately not built yet.

## [2026-08-12] Triage executed

Deleted 10 genuinely empty files after approval: six `Sin título*`
canvas/base files (2–39 bytes of empty Obsidian scaffolding) and four
0-byte markdown files including `Pipeline.md`, which was flagged
separately because its name suggested intent. **179 → 175 notes.**

Still to merge: the two `juan-manuel-martinez-solarte.md` mirrors, and
two records for the same person under different filenames
(`angela-patricia-montenegro-escovar.md` and
`angela-montenegro-escovar.md` — same cédula, 2845 vs 1531 bytes, so a
real merge rather than picking one).

## [2026-08-12] Migration executed

`scripts/migrate-into-vault.py` built `~/vault-new` from both staged
vaults. Non-destructive — sources copied, never moved.

```
icpp       36 notes,  39 attachments
sigra     139 notes,  88 attachments
frontmatter: 172 tagged, 3 given frontmatter they lacked
```

Every note now carries `company: icpp | sigra`.

**Relative links survived the move**, as predicted: broken links went from
62 (sigra alone) to 82 (both companies), so the restructure added zero.
Moving an entire vault root into a subfolder preserves every path within
it.

Design note: the script edits frontmatter as **text**, inserting one line,
rather than parsing and re-serialising YAML. A round-trip through a YAML
library reformats quoting, key order and comments across every note,
producing a diff that hides the actual change and cannot be reviewed.

## [2026-08-12] The shell link checker was wrong by 9x

`vault-lint` reported **764** broken links where the truth was **82**. It
resolved only bare basenames, so every relative link counted as broken —
the same defect the panel had before it was fixed, never back-ported.

Split link checking into `_tools/linkcheck.py`, which handles all three
Obsidian forms (bare name, root-relative, note-relative with `../`),
optional extensions, aliases, headings, and backslash-escaped pipes.
`vault-lint` now delegates to it. Three independent implementations —
shell, Python, TypeScript — agree on 82.

**Process failure worth recording.** The first attempt at this fix
silently did nothing: the `python3` replace searched for a string the
Spanish conversion had already renamed, so it matched nothing and exited
0. It was then "verified" against the clean template vault, where both
the old and new implementations correctly report zero broken links. A
test run on input where right and wrong answers coincide cannot detect
failure. Verify on data where the bug is visible.

Remaining after migration:

| | |
|---|---|
| Broken links | 82 — pre-existing, includes case-mismatch and dead paths |
| Slug collisions | 2 — `juan-manuel-…` (deferred merge), `README` (harmless) |
| Missing `cuando-usar` | 178 — the real remaining work |

## [2026-08-14] Vault agent run: cuando-usar complete, folders deepened

Ran Claude Code headlessly on the server under the vault owner's own
account, inside `tmux`, via `claude -p "$(cat brief)"
--dangerously-skip-permissions`. This is better than a subagent from a
laptop session: it uses her subscription, runs where the vault lives, and
survives disconnects.

Result, verified independently rather than taken from the agent's report:

| | Before | After |
|---|---|---|
| Notes missing `cuando-usar` | 175 | **0** |
| Broken links | 82 | **78** |
| Folder moves | — | 15, links rewritten |
| New folder indexes | — | 8 |

It beat the "must not exceed 82" gate rather than merely holding it.

**Two instrumentation mistakes of mine, both caught by measurement:**

1. The agent brief was written as `.agent-task.md` *inside* the vault. It
   contains example wiki-links, so `linkcheck.py` counted them — 83
   instead of 82, making the gate impossible to satisfy. `linkcheck.py`
   now skips dotfiles so instrumentation cannot contaminate the metric.
2. `rsync` server→local without `--delete` left **17 orphaned files**
   locally: the agent used `git mv`, so old paths vanished on the server
   but survived in the copy. Surfaced as a one-link discrepancy between
   two counts that should have matched. **Always `--delete` when the
   remote is authoritative**, or diverging copies look like real findings.

`observed:` the agent flagged a genuine conflict rather than silently
choosing — `companies/sigra/CLAUDE.md` says *"No crear carpetas nuevas sin
proponerlas primero"*, while the brief asked it to deepen the structure.
It followed the brief as the direct instruction but stayed within
groupings the existing indexes implied. It also disclosed losing a file to
`git stash` and restoring it. That kind of reporting is worth more than a
clean summary.

## [2026-08-14] Charting stack prepared for the SIGRA skill port

The six SIGRA skills live on the owner's Mac, not on the server, so they
cannot be ported yet. What could be done was done.

`~/.venvs/skills/` built **without sudo** — Ubuntu 26.04 ships neither
`pip` nor `python3-venv`, so: `python3 -m venv --without-pip` followed by
`get-pip.py`.

| | |
|---|---|
| plotly 6.9.0, pandas 3.0.5, xlsxwriter | ✅ verified by running them |
| HTML export | ✅ 4.8 MB interactive file |
| Excel export with native charts | ✅ |
| **PNG export** | ❌ `kaleido` needs headless Chrome, which is missing seven system libraries |

```sh
sudo apt install -y libcups2t64 libgbm1 libpango-1.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2
```

Four of the six skills need PNG, so that one command unblocks most of
them.

Remaining work is written into the vault itself at `panel/pendientes.md`,
for whoever connects the local agent — including the exact `tar` command
to extract the skills from the Mac, the macOS paths that must change, and
where Desktop outputs should land on a headless box.

## [2026-08-15] PNG export unblocked

First `apt install` of 7 packages wasn't enough — `ldd` only reports the
first layer of missing shared libraries, so resolving those revealed 5
more (`libasound`, `libatk`, `libatk-bridge`, `libatspi`, `libcairo`).
Full working set, 18 packages, verified against the apt index before
installing:

```
libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64
libcairo2 libnss3 libxkbcommon0 libdrm2 libxshmfence1 libgtk-3-0t64
libpangocairo-1.0-0 libcups2t64 libgbm1 libxcomposite1 libxdamage1
libxfixes3 libxrandr2 libx11-xcb1
```

`libgtk-3-0t64` did most of the work — pulls in a large chunk of the GUI
stack transitively, which is why round one kept revealing more.

`observed:` `ldd` on the Chrome binary reports nothing `not found`, and a
real plotly+kaleido render produced a 139 KB PNG with no errors. All four
SIGRA skills that need PNG are now unblocked once ported. Updated in
`panel/pendientes.md` on the vault itself.

## [2026-08-15] 78 → 26 broken links, verified

Second background-agent run on the vault, this time scoped narrowly:
diagnose and fix the pre-existing broken links, categorized before
touching anything. 6 commits, all independently verified against
`linkcheck.py` output rather than taken on trust.

| Category | Fixed |
|---|---|
| Case-mismatch (macOS→Linux) | 2 |
| Stale path from the earlier reorg | 9 |
| Off-by-one relative depth, all 13 `Competencia/fichas/*.md` | 24 |
| Missing subfolder segment | 4 |
| Wrong/dead target, redirected to the real note | 2 |
| Stale cross-vault link (predates the icpp+sigra merge) | 1 |
| Root-relative path never matched | 5 |
| Folder link pointed at its index | 2 |
| Resolved once a missing index.md was created | 4 |
| **Total fixed** | **52** |

**Real bug found, not just link rot:** all 13 competitor fichas under
`Competencia/fichas/` had an identical off-by-one relative-path error —
strong signal they were generated from
`Plantillas/prompt-actualizar-servicio-tecnico-competidor.md`, written
assuming one less folder level than `fichas/` actually sits at. Worth
checking that prompt if new fichas get added.

**7 stub notes created**, all `_templates/`-based, all honestly labeled
empty. One is a stub for a live confidential topic — a possible SIGRA
sale — and the agent correctly applied SIGRA's own mandatory
`confidencialidad: critica` frontmatter rule to it, with an `observado:`
label stating no real content exists yet, no invented deal terms.

**26 left broken on purpose, all logged:**
- 18 in `Plantillas/` — placeholder links like `[[cliente-x]]`. The
  vault's own rule says templates are copied, never written into;
  creating a stub named `cliente-x.md` would have been the actual
  mistake here.
- 8 links to non-`.md` attachments (PDFs, a `.py`, images) — confirmed
  present on disk. `linkcheck.py` only resolves markdown targets by
  design, so these will always read as "broken" regardless of
  correctness.

**Verification, not trust:** every number in the agent's self-report was
independently reconfirmed — `linkcheck.py` run fresh (78→26 held), the
confidentiality stub read in full, the Plantillas rule checked against
`companies/sigra/CLAUDE.md` directly, one off-by-one commit inspected.
All matched. Synced server→local with `--delete` from the start this
time; both copies now identical at 207 notes, 26 broken links.

## [2026-08-15] Merged into one repo, renamed to Ben

`obsidian-server` and `second-brain-panel` were two repos coordinating
one project — infra docs/scripts/vault-template in one, the panel app in
the other. Folded the panel in as `panel/`, renamed the whole thing
**Ben**.

Every path that assumed the old two-repo layout was found and fixed, not
just the obvious ones:

- `panel/deploy/second-brain-panel.service` → `ben-panel.service`,
  `WorkingDirectory` updated to `%h/ben/panel/server`
- `panel/package.json` name → `ben-panel`
- `docs/08-server-setup.md`'s clone instructions pointed at
  `~/obsidian-server` — would have cloned to the wrong directory on a
  fresh deployment
- `scripts/migrate-into-vault.py`'s own usage example referenced
  `~/obsidian-server/vault-template`
- `docs/roadmap.md` referenced `second-brain-panel/README.md` and an
  implementation plan that didn't exist yet when it was written — updated
  to point at `panel/README.md` and to summarize what
  `panel/docs/frontend-implementation-plan.md` actually specified once it
  landed (the widget spec, §5)
- Root `README.md` rewritten — progress table was stale (claimed SSH/
  Tailscale/bootstrap as not-done when the reference build had completed
  all three), reframed as "reference build" status rather than implying
  it tracks any specific deployment

Verified rather than assumed clean: every shell and Python script's
syntax checked after the copy, and the panel server's TypeScript
typechecked clean with a real `npm install` — not just that the files
existed at the new paths.

`docs/log.md` itself keeps its old `second-brain-panel` mentions in
historical entries — it's an append-only log of what was true at the
time, not current-state documentation.

## [2026-08-15] Panel frontend Phase 1 built and verified

Background agent built `panel/web/`: note tree, client-side search,
rendered notes with resolved `[[wikilinks]]`, backlinks panel, `/health`
page. Scoped tightly to phase 1 per the plan — no editor, no dashboards,
no tricks, developed only against the generic `vault-template`, never
Angela's data.

**Verified independently, not taken on report:**
- Fresh `npm install` + `npm run build` from a clean worktree — succeeded,
  no reuse of the agent's own install.
- Read `Markdown.tsx` directly: the claimed `urlTransform` bug (react-markdown's
  default sanitizer strips the app's custom `wikilink:` URL scheme,
  silently rendering all links — resolved or broken — as inert `href=""`
  anchors) is real, and the fix is narrow and correct: bypasses
  sanitization only for `wikilink:`, defers to the real sanitizer for
  everything else. External links get `target=_blank` +
  `rel="noopener noreferrer"`.
- Built a fresh 3-note synthetic test vault (not reusing the agent's,
  which didn't survive the worktree) covering: a resolved bare-slug link,
  a root-relative link (`[[folder/note-b]]` — deliberately *not*
  resolved client-side, matching the documented phase-1 scope, not a
  bug), a genuinely missing target, an aliased link, and a note with no
  frontmatter. Ran the real backend and frontend dev servers against it,
  loaded it in an actual browser via `claude-in-chrome`, clicked through:
  - Tree matched the vault's real structure
  - Resolved links: solid blue. Root-relative and missing links: dashed
    red, alias text rendered correctly instead of the raw target
  - Backlinks panel correct in both directions
  - `/health` page numbers matched the backend's real
    `GET /api/health/vault` response exactly (1 broken link, 0
    collisions, 1 missing-frontmatter note), with a working link back to
    the source note

Merged clean (fast-forward, no conflicts) into `main` at `5943803`.
Rebuilt from the merged tree to confirm the merge itself didn't silently
change anything — byte-identical `dist/` output.

**Not yet done, needed before this reaches Angela's server:** wiring
`@fastify/static` into `server/index.ts` to actually serve `web/dist/` in
production (the dependency has been sitting unused since the backend was
first built). Until then this only runs via `vite dev`, not through the
systemd service.

## [2026-08-15] Phase 2a — editing built and verified

Ran across two agent sessions (a session-limit interruption mid-task,
resumed from transcript — no work lost, uncommitted `editor/` folder
survived in the worktree). Both independently verified before merge,
same standard as every prior pass.

**Built:** CM6 source-mode editor toggled with the existing read-only
viewer, save via Cmd/Ctrl+S or a button (`PUT /api/note`, full
overwrite, no autosave), wiki-link autocomplete on `[[` sourced from the
cached notes list, a `zustand` dirty-buffer store, a route-leave guard
(`useBlocker` for in-app nav, native `beforeunload` for tab close), and
a `Decoration.mark` on `[[wikilinks]]` in the editor (visual only — not
phase-2b live-preview hiding).

**Real bug found and fixed during the build:** toggling View→Edit→View→Edit
on the same note silently discarded the in-progress buffer —
`@uiw/react-codemirror`'s `value` only seeds the document at mount and
is never resynced, so remounting the editor always reloaded from the
server. Fixed by feeding the store's buffered content back in as
`initialContent` on re-entry.

**Structural change made along the way, flagged rather than hidden:**
`useBlocker` is a no-op under `<BrowserRouter>` — required migrating
`App.tsx` to `createBrowserRouter`/`RouterProvider`. Confined to `web/`.

**Verified independently, not taken on report** — a fresh synthetic
2-note vault, real backend + frontend, driven in an actual browser:
- Real CM6 editor with line numbers and syntax highlighting
- `[[ban` triggered a genuine autocomplete popup ("banana / Banana"),
  accepted cleanly to `[[banana]]`, no duplicate brackets
- **Zero PUT requests** in the backend log across an idle edit —
  confirmed no autosave
- Saved, then read the file **directly off disk** (not the UI) and
  confirmed the new content actually landed; also confirmed via the
  backend's own request log
- Triggered the dirty-guard for real: editing then clicking away caused
  a **genuine blocking native `confirm()`** — screenshot capture itself
  timed out because the page's JS thread was frozen by the dialog,
  exactly matching the agent's report. Recovered by closing the tab,
  same as the agent described. This is about as hard to fake as a claim
  gets — the tool timeout is independent evidence, not something either
  agent or verifier could stage.

Server (`panel/server/`) confirmed untouched — `git diff --stat` against
pre-change commit came back empty.

Merged fast-forward, no conflicts. Rebuilt from merged `main`:
byte-identical output to the pre-merge verification build.

**Not built, deliberately** (plan §9): phase 2b live-preview
syntax-hiding, conflict resolution/ETags, structured frontmatter form.

**Known, not yet addressed:** main and NoteEditor JS chunks are both
over Vite's 500kB warning threshold (560kB / 615kB). Builds and runs
fine; further code-splitting not pursued this pass.

## [2026-08-15] Tricks mechanism built: correr_script + trick renderer

The first trick request that needed more than a note write — a button
that regenerates a report — needed a new capability: a trick triggering
server-side code, not just a file write. Designed the trust boundary
(`panel/docs/tricks-spec.md`, "Running a script") before building
against it:

- Client selects **which** pre-declared `acciones[actionIndex]` to run —
  never supplies `ruta`/`args`. The server re-reads `trick.yaml` off disk
  itself for every run; nothing about *what* executes ever comes from
  the request.
- `execFile`, never a shell — arguments are a literal array, so there is
  no shell parsing for a crafted argument to escape.
- Script path must resolve under `.claude/tricks/` (any script there, not
  scoped to one trick's own folder — the chosen trade-off).
- Hard 5s timeout, `SIGKILL`, so a hung script can't hang the request.

**Independently re-verified, not taken on the build report** — this is
code execution, so the report's screenshots weren't treated as proof.
Built a second, adversarial test trick myself (`probe`), separate from
the agent's own test fixture, and attacked the live server directly:

- Shell-injection-shaped args (`; echo pwned`, `$(whoami)`, backticks,
  `&&`) arrived as literal strings — confirmed via raw HTTP response, not
  the UI's rendering of it.
- Relative traversal (`../../../../tmp/...`) and an absolute path
  (`/bin/echo`) both rejected with 400, confirmed no side effect occurred
  (checked for a marker file the traversal target would have created).
- **The load-bearing test**: POSTed `actionIndex: 0` together with a
  forged `ruta`/`args` in the body, aimed at overriding the real action.
  The server ran the exact same script with the exact same original args
  regardless — the forged fields were completely ignored. This is the
  actual security property; everything else follows from it.
- Timeout: a script sleeping 30s returned in 5s, `timedOut: true`,
  request never hung.
- Non-zero exit and stderr surfaced correctly, in the UI and the raw
  response.

**Found during verification, not disclosed in the build report:** a
single stray null byte in `index.ts`, inside the `/api/graph` endpoint's
edge-dedup key — `${note.path} ${resolved}` had its space replaced with
`\x00`. This made git treat the whole file as binary (silent diffs) and
made plain `grep` report false negatives against it, which is how a
review pass nearly missed that the trick routes existed at all. TypeScript
happily compiles a raw null byte inside a template literal, so the clean
build gave no signal either — a reminder that "it builds" doesn't cover
byte-level file integrity. Root byte restored; no other file in the
change carried the same corruption (checked all of them).

Frontend: real trick listing/detail routes, `lista` control reusing the
existing dashboard `applyFilter` (not a second parallel implementation),
`boton`+`correr_script` with loading/success/failure/timeout states,
stdout/stderr shown, everything behind the existing per-widget error
boundary. `texto`/`checkbox`/`fecha`/`select` render read-only this pass
— no single-note binding context yet; `set`/`crear_nota`/`archivar`
action verbs parse but don't execute yet. Both deferred deliberately, not
silently dropped.

## [2026-08-15] Backported a better fix from Angela's independent work

While redeploying the tricks build, found that Angela had been running her
own Claude Code session directly on the server, independent of this one —
and had ported all 10 SIGRA skills herself (task #1, previously tracked as
blocked on getting files off her Mac — she just did it via `rsync`).

That session found a real bug in this project's own tooling: `vault-lint`
and `vault-search` defaulted to `$HOME/vault` (later `$HOME/raymond-brain`
after today's rename pass) — a **hardcoded** default. A leftover `~/vault`
directory from an earlier bootstrap run (12 notes, pre-dating the
companies/ restructure) silently absorbed every lint/search call meant for
the real vault, so "search the vault before answering" was quietly
searching the wrong one, and `vault-lint` reported clean because it wasn't
running against real content at all.

The fix applied on the server is better than what this repo shipped:
resolve the vault as *wherever this tool itself lives*, not any fixed
name — `VAULT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)`. This
closes the bug class entirely rather than just renaming the hardcoded
value (which is what today's earlier "rename to raymond-brain" pass did —
a real fix, but not the right one). Backported into
`vault-template/_tools/vault-lint` and `vault-search`, and converted the
same hardcoded-path pattern out of `CLAUDE.md` and four skills
(`capture-note`, `daily-log`, `migrate-notes`, `vault-health`) to relative
paths, since a Claude Code session runs with the vault as its working
directory already.

Also verified independently, not just noted: Angela's session moved skill
credentials (`telegram-credentials.json`) to `~/.config/sigra/` outside
the vault before they could enter git, backed by a `.gitignore` rule as a
second line of defense — confirmed via `git log --all` that no
credential-shaped file was ever committed, at any point in history.

**Process note, stated plainly:** discovered this because my own
`git add -A && git commit` for a one-line `panel/home.md` addition
bundled in 59 files of Angela's independent, previously-uncommitted work
without me reviewing it first. It turned out to be careful, well-labeled
work — but committing unreviewed content because it happened to be sitting
in the working tree was not the right process, and got lucky rather than
being caught by discipline. Read everything before treating it as safe to
commit, regardless of who or what wrote it.

Task #1 (port SIGRA skills) closed — done, by Angela, independently. Two
follow-ups remain, both documented in her vault's own `panel/pendientes.md`:
`/dashboard-competidores` needs its data directory synced from the Mac,
`/deck-sigra` needs Angela to decide where decks should live without
iCloud.

**Not yet resolved:** the orphaned `~/vault` directory itself is still
sitting on the server. Not touched — deleting or archiving another git
repo isn't a call to make unilaterally.

## [2026-08-15] Rule 4 reversed: scheduled unattended runs are a feature

The owner's call, in their words: *"4 is false. We should allow unattended
scheduled runs. In fact I believe that in the base skills we should
include a 'schedule job/skill/prompt' that creates cron jobs inside the
machine that invoke either skills or scripts. That should be a basic
thing."*

So README rule 4 — "an agent proposes; a human approves… no unattended
scheduled agent runs without a human in the loop" — is gone. It now
reads: **scheduled unattended runs are expected; what they must leave
behind is a file trail.** A job is a markdown file in `.claude/jobs/`,
every run appends a dated line with its exit code to that job's note, and
output lands as files next to whatever it's about. That is rule 1 applied
to time — if files are the only state, a run that left no file didn't
happen, and one that did is auditable with `git log`.

Worth being plain about what the old rule was: it was written on
2026-08-11 as *"no cron, no scheduled jobs, no unattended agent — which
removes the spend, permission and runaway-loop concerns."* Those concerns
were real; the mistake was answering them with a prohibition instead of
with controls. An always-on appliance that only acts while someone
watches it is a chatbot with extra steps. The controls that replace the
prohibition are per-run: `--max-budget-usd`, `timeout`, an explicit tool
allowlist, `flock`.

**Where the old rule was cited but the design still stands, the reasoning
was re-anchored rather than the design deleted.** `correr_script`'s trust
boundary in `panel/docs/tricks-spec.md` is the case that matters: the
allowlist, `execFile`-not-a-shell, and the hard timeout exist because
**this app has no auth** (rule 3), not because a human was supposed to be
approving things. Every one of them would still be required if every run
were unattended. That section now says so explicitly.

Files changed to remove the contradiction: `README.md` (rule 4, the skill
list, status), `docs/01-decisions.md` (new decision section recording the
reversal), `docs/08-server-setup.md` ("scheduled agents are out of scope"
→ they're a feature, just not a machine-level one), `panel/docs/tricks-spec.md`
(the scheduling section, and the `correr_script` re-anchor above),
`vault-template/CLAUDE.md`, `vault-template/index.md`, and
`vault-template/.claude/skills/trick-creator/SKILL.md` (`requiere_llm:
true` no longer has to propose). The 2026-08-11 log entry stating the
opposite is left alone — this file is append-only and records what was
true at the time.

### The `schedule-job` skill

New sixth base skill,
`vault-template/.claude/skills/schedule-job/SKILL.md`, plus a shipped
empty registry at `vault-template/.claude/jobs/index.md`. It creates
three things per job: a runner script, a registry note with a run table
the runner appends to, and one marked cron block.

**cron, not systemd timers.** A crontab is one text file you can read,
diff and regenerate in a single command, with the vault registry as the
source of truth and the crontab as a derived artifact. A timer is two
unit files per job, a `daemon-reload`, and `loginctl enable-linger` for
user units — which this project already got bitten by (2026-08-12,
panel service). The one thing that flips it: `Persistent=true` runs a job
missed during downtime and cron has no equivalent, so a job that must
catch up wants a timer. Written down in the skill rather than left as
folklore.

`.claude/jobs/` is the home for job files specifically because
`vault-lint` and `linkcheck.py` both skip `.claude/` — the 2026-08-14
lesson, where an agent brief left inside the vault got its example
wiki-links counted as broken links and made the run's own gate
impossible to satisfy.

### Verified, on macOS, by running it

Not the Ubuntu target, so everything below is macOS `cron` (vixie-derived,
same family as Debian's) and a macOS `claude` build:

- **Cron's PATH really does lose the tools.** With `PATH=/usr/bin:/bin`,
  both `claude` (at `/usr/local/bin`) and `node` (nvm) resolve to *not
  found*. With the skill's `export PATH=…` line prepended, `claude
  --version` runs. This is the pitfall and the fix, both observed.
- **A real cron run fired** and wrote its log. It confirmed three things
  at once: the `PATH=` crontab line is honored, `$HOME` expands in the
  command, and **`PWD` is the home directory, not the vault** — which is
  why the runner must `cd` before invoking `claude`, or `CLAUDE.md` never
  loads. `$(date +\%F)` with the escaped `%` came through as `2026-08-15`
  in both an argument and a redirect filename.
- **The marked-block crontab edit is safe.** Installed a crontab with two
  job blocks plus an unrelated entry, removed one job with the skill's
  `awk` filter, read it back: the other job and the unrelated entry
  survived untouched, and the `\%` escape survived the
  `crontab -l` → `crontab -` round trip. The machine's crontab was empty
  before this and was restored to empty after.
- **`claude -p` terminates non-interactively** with stdin closed:
  `claude -p … --output-format text --tools "" --permission-mode
  bypassPermissions --max-budget-usd 0.20 </dev/null` printed its answer
  and exited 0 from a stripped environment.
- **The permission flag is load-bearing, not decorative.** The same
  `-p` run asked to write a file, in the *default* permission mode with
  `--tools "Read,Write,Edit"`: no file was created, and the run kept
  going until `--max-budget-usd` cut it off — `Error: Exceeded USD
  budget`, exit 1. Re-run with `--permission-mode acceptEdits`: file
  written, exit 0. That's the concrete evidence for both "nobody is there
  to answer a prompt" and "the budget ceiling is what ends a wedged run."
- CLI flags in the skill were read out of `claude --help` on 2.1.220, not
  recalled: `-p/--print`, `--output-format`, `--permission-mode`
  (`acceptEdits` / `bypassPermissions` / …), `--allowedTools`,
  `--max-budget-usd` (print mode only), `--add-dir`, `--tools`, and the
  `claude setup-token` subcommand.

### Not verified — do this on the box

- **Nothing was run on Ubuntu.** `CRON_TZ` is honored by macOS cron;
  `assumed:` for Debian/Ubuntu's cron, which supports it but wasn't
  tested here. `journalctl -u cron` as the place to look when a job never
  fires is `assumed:` too.
- **`claude` under cron on the server is untested end to end** — in
  particular whether a cron-spawned process picks up the interactive
  login's credentials from `~/.claude`. That is the first thing to check
  with a two-minutes-out test schedule, and `claude setup-token` is the
  fallback if it doesn't.
- `assumed:` `--dangerously-skip-permissions` refuses to run as root, so
  the skill says not to schedule agent jobs from the root crontab.
- The runner template passes `bash -n` but was never *executed* end to
  end: `flock` doesn't exist on macOS at all, so the locking path is
  untested here. `assumed:` present on Ubuntu — it ships in `util-linux`,
  which is an essential package. `date -Iseconds` was checked and works
  on both.
- No job has actually been created on the reference build. The skill is
  written and its mechanics are verified in pieces; the first real job is
  still the first real job.

## [2026-08-15] Attachments backend: upload, download, index (roadmap #9)

Built the backend half of roadmap #9 — non-markdown files indexed,
downloadable, and uploadable. Three endpoints, taking the panel from nine
to twelve:

```
GET  /api/attachments        every non-.md file: path, size, mtime, isSystem
GET  /api/attachment?path=   raw bytes
POST /api/attachment         multipart upload: folder + one file part
```

The frontend half was being built concurrently, from a separate worktree,
against a contract fixed in advance. Shipped exactly as specified — no
deviations, so nothing for that agent to discover at integration time.

Shape decisions, all following from what roadmap #9 already decided:

- `Attachment { path, size, mtime }` as its own type and its own map on
  `VaultIndex`, not a `Note` with three empty fields. Everything that
  iterates `index.notes` — link resolution, backlinks, slug collisions,
  the health check — would have needed an `isAttachment` exception, and
  each of those is a place to forget one.
- `walk()` extended rather than duplicated: one traversal, two buckets.
  A parallel walk would double the IO to answer the same question and
  give the two indexes room to disagree about what `ignore` means.
- `isSystem` on the listing is the existing `isNote()` predicate, exactly
  as `/api/notes` does it. One set of path rules.
- 25 MB ceiling, `RAYMOND_MAX_UPLOAD_BYTES` to change it. Decided up
  front, per the roadmap's "don't discover it via an accidental large
  upload." A non-numeric or zero value makes the server refuse to start
  rather than silently disabling the ceiling — `Number("lots")` is `NaN`
  and `NaN` compares false against every limit check there is.
- `.md` uploads rejected with 400. `PUT /api/note` stays the one write
  path for notes; an uploaded `.md` would skip frontmatter parsing and
  note reindexing entirely and sit in the vault invisible to links, the
  graph, and the health check.

`refresh()` in `index.ts` used to early-return on anything that wasn't
`.md`. Left alone, an uploaded PDF would have been invisible until the
process restarted, and a deleted one would have stayed listed and 404'd
on download. Now it routes to the attachment map instead. Verified both
directions against a running server: a file written by a plain shell
redirect (not the API) was downloadable two seconds later; a file deleted
with `rm` 404'd two seconds later.

### The security pass, in detail

Roadmap #9 asked for the same treatment `correr_script` got — an actual
adversarial pass, not a happy-path test — because an upload endpoint with
no authentication in front of it is a new way for anything on the tailnet
to place a file on that disk. Ran every case below against a real server
on a scratch vault, with `curl`, reading raw responses.

**Held on the first try:**

- Path traversal via `folder`: `../`, `../outside`, `a/../../..`,
  `..\\..\\outside`, `../vault-evil` — all 400. Traversal via the
  download `path`: same set, plus URL-encoded (`%2e%2e%2f`),
  double-encoded, null-byte (`q1.pdf%00.png`), and absolute paths — all
  400 or 404, none served a byte from outside.
- The `/vault-evil` case specifically: a sibling directory whose name
  starts with the vault's own name. The boundary check compares against
  `vaultDir + sep`, not the bare prefix, so it does not match. Tested
  with a real `vault-evil/neighbour.txt` sitting next to the scratch
  vault; never reachable.
- Symlinks, both shapes. A symlink inside the vault pointing at an
  outside directory, used as `folder`: 400 ("path resolves outside the
  vault"). Used as a download `path`: 404 — and 404 rather than 400
  because `walk()` never indexed it in the first place. `isFile()` and
  `isDirectory()` are both false for a symlink, so symlinks are neither
  indexed nor descended into. That was already true before this change;
  it is now load-bearing and commented as such. `overwrite=true` aimed at
  an existing symlink is also refused outright — writing *through* a
  symlink is an escape no location check catches.
- Size limit, enforced by the parser while streaming. A 26 MB body
  against the 25 MB default returned 413 in 0.08s — it aborted mid-upload
  rather than reading the body and objecting afterwards, which is the
  denial-of-service the limit exists to prevent, not a defence against
  it. No partial file landed in the vault. 24 MB succeeded. Temp files
  are in `os.tmpdir()`, never near the destination, and the plugin's
  `onResponse` hook removes them on both paths — checked, nothing left
  behind.
- Field ordering is not part of the contract: the body is fully drained
  before anything is validated, so `folder` is found whether it is sent
  before or after the file part. Tested both orders.
- Malformed bodies: no file part, not multipart at all, two file parts —
  400 each, nothing written.

**Did not hold — two escalations, both found by attacking it, neither
by designing it.** Both share a shape worth naming: the file lands
squarely inside the vault and every location check passes and is right to
pass. "Did it escape the vault?" and "did it gain privilege?" are
different questions, and the first one being answered well says nothing
about the second.

**One: `.claude/` — an uploaded `trick.yaml` defeats `correr_script`
outright.** This is the serious one and it was found last, while trying
to *verify* a claim I had already written down as safe.

The chain, run end to end against a live server: upload a `trick.yaml`
into `.claude/tricks/hijack/` naming an already-executable script
belonging to a *different* trick, with `args` chosen by the attacker;
then `POST /api/tricks/hijack/run`. It ran. The script executed with the
supplied arguments and wrote a file outside the vault. No authentication
anywhere in that sequence.

Nothing in `tricks.ts` is wrong. Its security property is exactly as
documented — "the client can only select *which* pre-declared script
runs, never *what* runs" — and it held: `ruta` and `args` came from the
server's own fresh read of `trick.yaml`, never from the run request. The
property was load-bearing on an assumption nobody had written down, that
*declaring* a script meant writing a file to disk, which meant a human or
an agent with filesystem access. An unauthenticated upload endpoint makes
declaring one an HTTP call, and a trust boundary that was carefully
designed six commits ago evaporates without a line of it changing.
`PUT /api/note` never opened this door because it only writes `.md`;
this endpoint writes everything else — precisely the set `trick.yaml` is
in.

The near-miss is the part worth remembering. I had already written in
this entry that uploading a trick was harmless because `execFile` needs
the executable bit and `copyFile` produces 0644 — and labelled it as
reasoning rather than a test, per this repo's conventions. Going back to
actually run it found that the 0644 claim was true and *irrelevant*: the
attack does not need to upload a script at all, only a manifest pointing
at one that is already there. The labelling convention is what saved
this. An unlabelled "this is fine" would have shipped.

Fixed by refusing every upload under `.claude/`. Nothing legitimate
needs it: roadmap #9's driver is skill output filed next to the notes it
is about, which lives in the note tree, and tricks are authored by
`trick-creator` working in the vault. Re-tested after the fix — both the
upload-a-script path and the upload-only-a-manifest path are 400, the
trick never appears in `/api/tricks`, running it 404s, and no side-effect
file is created.

**Two: ignored directories.** `folder=.git/hooks` was accepted, and the
file landed in `<vault>/.git/hooks/pre-commit`. `.git/config` can set
`core.pager` or `core.fsmonitor` to a command git then runs;
`.obsidian/plugins/` is JavaScript Obsidian executes on the owner's
machine. Either one turns "anything on the tailnet can upload a file"
into "anything on the tailnet can run code."

Worse in a quiet way: the POST handler indexes the new file directly
instead of waiting for the watcher, and that direct call bypassed
chokidar's ignore filter, so the `.git` file *appeared in
`/api/attachments`* — a path the index is supposed to never show.

Fixed by rejecting any upload whose path contains a segment in the same
`cfg.ignore` list `walk()` uses, so the two cannot drift. Re-tested:
`.git`, `.git/hooks`, `notes/.git`, `.obsidian/plugins/x`,
`node_modules/evil`, `.trash`, and a *file* literally named `.git` are
all 400, and nothing lands. The rule is also just coherent — the index
ignores those paths, so an upload there is invisible by construction. An
endpoint whose only honest outcomes are "does nothing useful" and
"compromises the machine" shouldn't exist.

**Got wrong on the first try, in the other direction:** the filename
check rejects any name containing `/` or `\` rather than quietly
basenaming it, on the reasoning that silently rewriting
`../../etc/passwd` to `passwd` writes a file the caller never asked for.
Testing showed the rejection never fires: `@fastify/busboy` runs its own
`basename()` over the Content-Disposition filename first, so
`../escaped.bin` arrives as `escaped.bin` and is accepted as a normal
upload to the named folder. Nothing escapes, but the check is currently
unreachable rather than load-bearing, and the comment said otherwise.
Comment corrected to say so. The check stays: it is two lines, and "the
parser happens to do it for us" is not a property to depend on silently.

**Accepted, not fixed, deliberately:** `folder=/tmp` writes to
`<vault>/tmp/`, and an absolute path writes a deep junk directory tree
inside the vault. That is `safeRelPath` stripping leading slashes, the
same behaviour `PUT /api/note` has had all along. Ugly, contained, and
consistent; diverging from the shared helper for one endpoint seemed
worse than the junk directory.

### Stored XSS — the finding that isn't traversal

The easy one to miss here, and the one that actually matters most: an
uploaded `.html`, `.svg` or `.xhtml` served inline with its natural
Content-Type executes JavaScript **on the panel's own origin** — the
origin that can rewrite every note through `PUT /api/note` and fire
`correr_script`. Traversal gets you a file; this gets you the whole app.

The download endpoint therefore serves a conservative allowlist with
real types and `inline` (raster images, PDF, plain text — **not** SVG,
which is an XML document that can carry `<script>`) and everything else
as `application/octet-stream` with `Content-Disposition: attachment`,
plus `X-Content-Type-Options: nosniff` on every response and a
`default-src 'none'; sandbox` CSP on the non-inline branch.

Verified in a real browser, not from the headers:

- Control first, so the test could fail: the same probe file served with
  `text/html` by a plain `python3 -m http.server` executed and set
  `document.title` to `XSS-EXECUTED-HTML`. The detection method works.
- Sitting on the panel's own origin with a marker variable set,
  navigating to `/api/attachment?path=probe.html` left the document
  untouched — same URL, marker intact, title unchanged, probe's variable
  never defined. The file downloaded; no document was ever created on
  that origin. Same for `probe.svg`.
- Same result through an `<iframe>`, which is the shape a frontend
  preview would reach for: both frames came back empty, parent origin
  untouched. Controlled again with a same-origin `srcdoc` iframe running
  the identical script, which did execute — so the empty frames are a
  real negative, not a broken harness.

Probes set `document.title` rather than calling `alert()` on purpose: a
modal would have frozen the browser session mid-test.

### Left undone

- `@fastify/multipart@9.4.0` is declared in `panel/server/package.json`
  but was installed into the main checkout's `panel/node_modules` with
  `--no-save --no-package-lock` (this worktree symlinks to it). The
  workspace `package-lock.json` does **not** have it yet — whoever merges
  this needs a plain `npm install` in `panel/` to lock it.
- No `Range` support on the download endpoint. Fine for the PDFs and
  spreadsheets driving this; video seeking would need it.
- `tricks-spec.md`'s trust-boundary section still describes three
  constraints on `correr_script` and does not mention that *who can
  declare a script* is a fourth, now that an upload endpoint exists. The
  code enforces it; the spec doesn't say it. Not edited this pass —
  `panel/docs/` was outside this task's scope and a parallel agent is
  working nearby — but it should be, and the omission is the exact shape
  of the assumption that caused the bug.
- Attachments are absent from `/api/health/vault`. Broken links, slug
  collisions and frontmatter are all note concepts; "an attachment
  nothing links to" is a plausible future check, not one designed here.

## [2026-08-15] Tricks v2 designed: a trick is a mini app, not a widget list

`panel/docs/tricks-spec.md` rewritten in place. The fixed v1 vocabulary
(`lista`, `boton`, `texto`, `checkbox`, `fecha`, `select`, `formulario`) is
retired as an authoring target; a trick is now **arbitrary files under
`.claude/tricks/<name>/app/`** — any HTML, CSS and JavaScript the author
wants — rendered in a sandboxed opaque-origin iframe with a
capability-scoped `postMessage` bridge as its only route to the vault.

The v1 spec's own reasoning is what changed, and it is worth naming: it
argued that rendering arbitrary JavaScript was a materially bigger risk
than rendering arbitrary markdown, because "code can call `fetch()`, read
every note, and send it anywhere." True — **of code running on the panel's
origin.** Arbitrary JavaScript is only dangerous where it runs. The hard
requirement was never "no arbitrary code," it was "no arbitrary code on the
panel's origin," and v1 paid for the stronger constraint by making a whole
class of requests unanswerable.

Rewritten in place rather than added alongside: README, `vault-template/CLAUDE.md`,
`trick-creator`, `tricks.ts` and several entries in this file all point at
that path.

### The asset-loading decision, which is the whole design

Serving `app/index.html` from a normal endpoint puts it on the panel's
origin — the exact thing being prevented. Three alternatives were measured,
not reasoned about:

- **`srcdoc`** gives an opaque origin but resolves relative URLs against
  the *parent's* base. `<script src="altprobe.js">` in a `srcdoc` frame
  requested `/altprobe.js` and 404'd. An absolute path did run. So it only
  works with a server-side HTML rewriter that catches every URL form
  including ones a script builds at runtime — which is not possible, and is
  the opposite of "no constraints."
- **`blob:` URLs** were worse: the frame loaded opaque-origin, but a
  `blob:` URL has an opaque path, so **nothing** resolves against it. Zero
  subresource requests — the absolute path that worked under `srcdoc`
  didn't even reach the server.
- **A second port/origin** does not actually protect the API. See below.

**Chosen:** serve the real files from a real hierarchical URL on the
panel's own port, and make the *response* opaque-origin with
`Content-Security-Policy: sandbox allow-scripts`, embedded in an
`<iframe sandbox="allow-scripts">`. Two independent mechanisms, either
sufficient; forgetting one is survivable, and forgetting both is the kind
of silent catastrophe worth paying for twice. Everything works: relative
paths, subfolders, images, stylesheets, classic scripts, ES modules,
dynamic `import()`, blob Workers, canvas.

### Verified in Chrome 151/macOS against a throwaway prototype

- **The frame cannot reach the panel's origin.** `parent.document`,
  `top.document`, `localStorage`, `sessionStorage`, `indexedDB`,
  `document.cookie` and `caches` all throw `SecurityError`.
  `window.frameElement` is `null`, so the frame cannot reach its own
  `sandbox` attribute to remove it — the reason
  `allow-scripts` + `allow-same-origin` is not a sandbox, checked from the
  other side.
- **`allow-top-navigation` is not granted, confirmed by attacking it:**
  `top.location.href = "http://example.com/…"` →
  `SecurityError: The current window does not have permission to navigate
  the target`. `window.open` returned `null`.
- **A CORS "simple request" write goes through, and this decided the
  design.** With `connect-src` permitted, an opaque-origin frame's
  `fetch("/api/note", {method:"POST", mode:"no-cors"})` **reached the
  server with `Origin: null` and wrote to the fake vault.** CORS protects
  the *response*, not the *request*. So `connect-src 'none'` is mandatory,
  and "put tricks on a second port" was rejected on evidence rather than
  taste. Corollary written into the spec, and `assumed:` because it was not
  tested against the real server: Fastify's `text/plain` parser is probably
  the only reason `PUT /api/note` isn't vulnerable to the same shape.
  That's an accident, not a rule — mutating endpoints should require
  `application/json` explicitly, and the attachment upload route deserves a
  direct look, since `multipart/form-data` is also a CORS-simple content
  type.
- **CSP `'self'` does work inside an opaque origin**, which was predicted
  wrong before it was tested. It matches the document's *URL* origin, not
  its opaque origin: the app's own script ran, an identical script from a
  different origin on the same server did not.
- **The bridge holds.** Undeclared `vault.write`, `vault.read` and
  `script.run` all came back `capability_denied`; a `../../` path escape
  was denied; a message with `trick: "pinta"` forged into the body was
  still evaluated as the sending trick, because **identity is the
  MessagePort, not a field**. `event.origin` is the literal string
  `"null"` for every opaque-origin document, so it authenticates nothing —
  written into the spec explicitly because it looks like a check.
- **Every exfiltration route was silent:** `sendBeacon` returned `true`
  with no request, remote `<img>`, `WebSocket` and `EventSource` all
  produced nothing on the wire, and a `form.submit()` to `/api/note` never
  fired because `allow-forms` is not granted.

### Two things the prototype found that the design would not have

- **Opening an app URL top-level is not harmless.** Before the fix,
  browsing straight to `…/api/tricks/hostil/app/` loaded the hostile app as
  its own page — still opaque-origin, but it **redirected the tab to
  `example.com`**. `Content-Security-Policy: sandbox` does not stop a
  top-level document navigating itself. Fixed with a `Sec-Fetch-*` gate:
  the entry document is served only for `dest=iframe` **and**
  `site=same-origin`, which also blocks one trick frame navigating itself
  into another trick's app (that reports `site=cross-site`, because the
  initiator origin is opaque).
- **The obvious wrong version of that gate cost real time.** Checking
  `Sec-Fetch-Site` on *subresources* 403s every script, stylesheet and
  image the app loads — they report `cross-site` for the same reason — and
  because the 403 body is JSON served with `nosniff`, the symptom is
  "assets are fetched but never execute," with no CSP violation and nothing
  obviously wrong. Both the rule and the trap are in the spec.
- **A frame that navigates itself fires `load` again**, and a naive host
  hands a fresh capability port to a document it never mounted (observed
  twice for one iframe). Capabilities stayed bound to the mount, so it
  wasn't an escalation — but "this port belongs to the app I loaded" was
  broken, and a broken-but-currently-harmless invariant is exactly the
  shape of the escalation below. Rule: one port per mount, unmount on the
  second `load`.

### The fourth `correr_script` constraint, and the general lesson

Folded in from a real escalation found the same day while attacking the
attachment upload endpoint: upload a `trick.yaml` into
`.claude/tricks/<name>/` naming an already-executable script with chosen
`args`, then `POST /api/tricks/:name/run`. It ran. **No path traversal** —
the file lands inside the vault and passes every location check.

Nothing in `tricks.ts` was wrong. Its property — *the client selects which
script runs, never what runs* — rested on an unstated premise: that
**declaring** a script required filesystem access. A new write endpoint
removed the premise and the property evaporated without a line of the old
code changing. `.git/config` and `.obsidian/plugins/` are the same class.

So the spec now lists four constraints, not three, and states the general
rule once: **a security property that depends on an unstated premise about
who can write a file is not enforced, it is assumed.** Any endpoint that
can place a file invalidates every such premise until it is re-checked.
`.claude/` is executable configuration — manifests, skills, app code,
runners — and must never be writable through a network endpoint. v2 makes
this sharper, not looser: `app/**` is code the panel hands a browser and
tells it to run, so it lives under the same rule, and `vault.write` refuses
`.claude/` except a trick's own `data/`.

### Migration, and what is deliberately not built

`vault-template/` ships no tricks, so base-package migration cost is docs
and the skill. The panel keeps rendering v1 manifests for one release,
labelled legacy, then that renderer is deleted — two systems rendering
tricks is the drift this repo keeps logging as a bug. The one-step "just
give me a checklist" path survives as starter apps under
`.claude/tricks/_plantillas/` that `trick-creator` copies and edits, so the
fast path produces files an author can then change instead of waiting for a
new primitive.

Not verified: **anything outside Chrome 151 on macOS.** `assumed:` Firefox
and Safari behave the same; the `Sec-Fetch-*` gate is the piece most worth
re-checking per browser, since it fails closed and presents as "the trick
doesn't render." Nothing was implemented — `panel/server/src/**` and
`panel/web/src/**` are untouched; the spec's §13 lists the build order and
which seams are parallel.

## [2026-08-15] Tricks v2 server: app serving, the bridge, and the write-path audit

Seams 1, 3 and 5 of `panel/docs/tricks-spec.md` §13, server side only.
Two endpoints, taking the panel from twelve to fourteen:

```
GET  /api/tricks/:name/app/*    a trick's mini app, into an opaque origin
POST /api/tricks/:name/bridge   the one funnel for a trick's capabilities
```

plus the v2 manifest schema, `tipo: "app" | "legacy"` on the listing, the
panel's own CSP, and the cross-cutting refusal audit. `panel/web/**`
untouched — the host (seam 2) is somebody else's.

### What was built

**Manifest (§4.1).** `app:` and `capacidades:` validated at read time, on
every read, never cached. An unknown capability name invalidates the
manifest rather than being ignored, because a silently-dropped
`vault.wirte:` and a denied one are indistinguishable at runtime and the
author debugging it has no way to tell. `carpeta` refuses `""`, `"."` and
`"/"` — "the whole vault" is not a capability — and `vault.write.carpeta`
refuses anything under `.claude/` except that trick's own `data/`.

**Serving (§5.3).** Real files at a real hierarchical URL, with
`Content-Security-Policy: sandbox allow-scripts; …; connect-src 'none'`,
`Access-Control-Allow-Origin: *` (ES modules are always fetched in CORS
mode and an opaque origin has nothing to match), `nosniff`, `no-store`,
and a content type from an allowlist. Path resolution is `safeScriptPath`
one level deeper, plus a `realpath` check the string checks cannot do.

**Bridge (§6, §7).** One funnel. Scope enforced per capability from the
server's own fresh read of `trick.yaml`; `script.run` delegates to
`runTrickAction` **unchanged**, with one new gate in front of it — the
index must also be listed in `script.run.acciones`, so "declare an action"
and "expose it to browser code" are two separate decisions. `estado` is
one JSON file in the trick's own `data/`.

**Write-path audit (§13 seam 5).** The rule moved into one function,
`writepath.ts:assertNetworkWritable`, called by all three write paths.
`assertUploadAllowed` now delegates to it and keeps its own wording, so
the upload endpoint's fix and the two new callers cannot drift.

### The thing the audit actually found

`PUT /api/note` could write `.claude/`. It only writes `.md`, which is
why it was reasoned safe when the upload escalation was fixed — that
attack needed a `trick.yaml`. Too narrow: a skill's `SKILL.md` is
instructions the next Claude Code run in the vault reads and obeys, and a
job note under `.claude/jobs/` is what a scheduled run consults. Markdown
that something executes is executable configuration (§2.2), and a
network client rewriting one is code execution with a delay fuse. It also
accepted `.git/hooks/x.md` and `.obsidian/plugins/evil.md`, which the
upload endpoint has refused since this morning.

Refused now: `.claude/skills/demo/SKILL.md`, `.claude/tricks/x/SKILL.md`,
`.claude/jobs/nightly.md`, `.git/hooks/x.md`, `.obsidian/plugins/evil.md`,
`node_modules/x.md`, and the leading-slash spelling of each — 403, and
the target file verified unchanged. The cost, accepted deliberately and
stated in the spec: **the panel's editor can no longer save a file under
`.claude/`.** Editing a skill is a filesystem author's job, done on the
box.

### Attacked before trusted, per the `correr_script` standard

Real server, scratch vault, `curl`, plus Chrome 151 for the parts only a
browser can answer. Everything below was run.

**The gate.** No `Sec-Fetch-*` → 403. `dest=document` (top-level open) →
403, in curl *and* in a real tab, which is the concrete hole from §10.6.
`dest=iframe, site=cross-site` → 403. `dest=iframe, site=same-origin` →
200. Subresources (`script`/`style`/`image`) at `site=cross-site` → 200,
because gating those is the mistake the spec spends a paragraph on; it is
now also a test whose name says so.

**Path escape via the splat.** `..%2f..%2f..%2f..%2fnotas/secreto.md`,
plain `../`, `../trick.yaml`, `../../hostil/app/h.js`,
`sub/../../trick.yaml`, `//etc/passwd`, double-encoded `..%252f` — 400 or
404, nothing outside `app/` served. Note find-my-way *does* percent-decode
the wildcard, so `%2f` arrives as a real separator and the containment
check is what catches it, not the absence of decoding. A symlink inside
`app/` pointing outside the vault → 400 (`realpath`, the only check that
can see it).

**Capabilities.** Every op called on a trick that never declared it →
`capability_denied`, including `estado` on a v1 trick. Every scope check
attacked from outside its scope: `subcarpeta: "../../../../notas"`,
`path: "../../../../notas/secreto.md"`, `"gastos/../../secreto.md"`,
`"../trick.yaml"`, `"../app/index.html"`, `"evil.sh"`, `".hidden.md"`,
`frontmatter.tipo` overriding a manifest-pinned value, `limite: 99999`,
writing a field not in `campos`, replacing a body with `cuerpo: false` —
all denied, and `notas/secreto.md` and `trick.yaml` verified byte-intact
afterwards.

**Can a caller influence *what* runs?** No, and this was the test the
whole design is for. `script.run` with `{"indice":0, "ruta":
".claude/tricks/hostil/nasty.sh", "args":["injected"]}` ran
`resumen.sh uno` — the manifest's own values — and the side-effect file
`nasty.sh` writes outside the vault was never created. Index 1 of the same
manifest, which *does* name another trick's script, is `capability_denied`
because it is not in `script.run.acciones`; §11's "any script under
`.claude/tricks/`" still holds for `/run`, and the bridge is deliberately
narrower.

**Identity.** A `trick: "gastos"` field forged into the body of a `hostil`
call was ignored — the route's `:name` is the identity, as the port is
over `postMessage`. Prototype pollution: Fastify's JSON parser rejects
`__proto__` outright; `constructor` and `prototype` reach the handler and
are refused there.

**The cross-site guard and the bridge agree, and here is why.** The
question was what a sandboxed iframe sends for `Sec-Fetch-Site` on a
fetch to its own document's origin. Measured, in Chrome, with a rig whose
CSP permitted the fetch so it would actually reach the wire:

```
plain same-origin iframe      Origin: http://127.0.0.1:8795   site: same-origin
sandboxed (opaque) iframe     Origin: null                    site: cross-site
```

So an opaque-origin frame's request is **cross-site**, and the guard
refuses it. That is correct and intended, not something to work around:
**the frame is not supposed to call the bridge — the host is.** The host
is the panel's own page on the panel's real origin, so it sends
`site: same-origin` and a matching `Origin`, and it passes. Confirmed
both directions against the real server: same-origin + matching
`Origin` → 200; `cross-site` (with or without `Origin: null`) → 403;
`same-site` → 403; mismatched `Origin` with no `Sec-Fetch-Site` → 403.

The guard was not weakened. The one gap it leaves — `Origin: null` with
*no* `Sec-Fetch-Site` is allowed — is a client that is not a browser, or
a browser old enough to predate `Sec-Fetch-*`, and for the frame case
`connect-src 'none'` stops the request before it exists. Layered, not
duplicated.

**The frame, from inside, against the real server.** A hostile app mounted
in `<iframe sandbox="allow-scripts">` on the panel's origin:
`window.origin` is `"null"`; `frameElement` is `null`; `localStorage`,
`document.cookie` and `parent.document` all `SecurityError`;
`window.open` → `null`; `top.location.href = …` → `SecurityError`;
`sendBeacon` returned `true` and sent nothing; `form.submit()` returned
and sent nothing; every `fetch` — the bridge, `/api/note`, and even its
own `h.js` — `TypeError: Failed to fetch`; sync XHR `NetworkError`. The
server log confirms it: across the whole session, **zero** `/api/note` or
`/api/tricks/*/bridge` requests originated in a frame. The frame's
progress was traced with `<img>` beacons, which *do* arrive — `img-src
'self'` permits them, and they are the residual: a frame can make GETs it
cannot read.

**A frame navigating itself into another trick's app**, in a real browser:
the request reached the server as `dest=iframe, site=cross-site` and was
403'd, logged as such. Exactly the spec's prediction.

### Found next door, and fixed

The attachment preview tier (`servePolicy`, added this morning) served
HTML with `Content-Security-Policy: sandbox allow-scripts` and nothing
else. An opaque origin stops a document reading *this* origin; it does
nothing about the document reaching the network. Measured: an uploaded
`report.html` served by `/api/attachment` ran
`fetch("/api/note?path=notas/secreto.md")` and **the request arrived** —
unreadable (no CORS header on data routes) and unable to write (the
cross-site guard), but a live beacon channel to any host the viewer's
browser can reach. Added `connect-src 'none'; form-action 'none'` to that
tier and re-measured: `TypeError`, no request. Images and inline script
are untouched, so reports still render. Outside this task's three seams
and done anyway, because it is the same finding one module over: **an
opaque origin bounds what a document can read, never what it can send.**

### Six ambiguities the authoring agent hit, decided here

Written into the spec as §6.8 so seam 2 inherits them: the title key is
`title` (five call sites beat one example; §7.1's example corrected);
`vault.write` params are `{path, frontmatter?, cuerpo?}` with no `crear`
param, since `crear` is the author's standing decision and `created` in
the result answers what happened; a `null` frontmatter value deletes that
key; `estado.get` answers `{valor}`, `null` when unset; `vault.read`
returns `content` plus, for `.md`, the parsed `cuerpo` and `frontmatter`;
`sort` is `{field, order}`. Also settled: the HTTP transport carries the
§6.4 envelope verbatim, the trick's identity is the URL, and the HTTP
status mirrors the error code while the body always carries the envelope.

### v1 still works, which matters because main is deployed

The one real machine is running v1 tricks. Verified against a full v1
manifest — `datos`, `ui.campos` with `texto`/`checkbox`/`fecha`/`select`,
all four action verbs, `programacion`: it lists as `tipo: "legacy"`, the
detail route keeps every v1 field, and `correr_script` still runs through
`POST /api/tricks/:name/run`. Its bridge calls are `capability_denied`
(no `capacidades`) and its app URL 404s with "this trick declares no app".
A trick folder with no `trick.yaml` at all — the `_plantillas` case — is
skipped with a log line and does not break the listing.

### Left undone

- **`trabajo.estado` answers `unsupported_op`.** It is seam 6 and it must
  share the jobs-view parser rather than grow a second one.
- **`datos.cambiaron` polling and the `tema` event** are seam 6 too;
  nothing here pushes.
- **Only Chrome 151/macOS**, same gap the spec already records. The
  `Sec-Fetch-*` gate fails closed, so on an untested browser the symptom
  is "the trick doesn't render."
- **The YAML date reformatting** noted in the spec's §14 is real and
  unfixed; it wants one fix shared with dashboard row actions, not a
  second YAML path here.
- **No conflict detection on writes**, carried forward from v1 (§7.3).
- **The panel CSP has no script `'unsafe-inline'`.** Vite's default build
  is fine; a future inline bootstrap needs a nonce. Flagged in §5.4
  because it will present as a blank panel, not as an error.

---

## [2026-08-15] Tricks v2 host built, and v1 deleted rather than deprecated

Seam 2 of `panel/docs/tricks-spec.md` §13 — the frontend host that mounts
a trick's app and holds its capability port — plus the retirement the
spec's §9 had scheduled for "one release later". The owner's call:
*"We do need to remove that legacy trick. Let's not try to support the old
versions of the tricks, that is legacy stuff."* The one real v1 trick on
the one real deployment had already been deleted, so nothing in the world
depended on v1 and the compatibility window bought nothing but a second
renderer to maintain.

### The host

`panel/web/src/tricks/TrickHost.tsx`, with the decidable parts split into
`panel/web/src/tricks/protocol.ts` so they can be tested without a
browser. `<iframe sandbox="allow-scripts">`, never `allow-same-origin`;
`port1` kept, `port2` transferred on the **first** `load` event only; a
second `load` closes the port, removes the iframe and says so. The trick's
name is a closure variable and a URL segment — nothing reads `event.origin`
(it is the string `"null"` for every opaque-origin document) and nothing
reads a `trick` field in a message body. `POST /api/tricks/:name/bridge` is
issued from the panel's real origin because the frame cannot reach it at
all (`connect-src 'none'`, plus the server's cross-site guard); that is the
design, not a workaround.

Also built here rather than deferred to seam 6, because both are things the
host sends down a port it already owns: `datos.cambiaron` polling every 5 s
while the document is visible, and the `tema` event.

### What the deletion actually removed

`TrickRenderer`, `ListaControl`, `ReadOnlyField`, `ActionButton`; the
`datos:`/`ui:` manifest fields; the `set`/`crear_nota`/`archivar` action
verbs (never implemented — they existed so v1 manifests validated); the
`tipo: "app" | "legacy"` discriminator and the compatibility path in
`tricks.ts`; the v1 CSS; `useRunTrickAction`. `app:` is now **required**,
so a v1 manifest fails the way every other invalid manifest fails —
skipped from the listing with a logged reason, 404 on the detail route.
Verified against a full v1 manifest on the real server: one log line,
`expected object … path: ["app"]`.

Two things deliberately survived, and both were read before anything was
cut:

- **`correr_script` and its four constraints.** Older than the renderer,
  reached through the bridge now as `script.run`. `POST /api/tricks/:name/run`
  stays too — it is that boundary's HTTP face for a filesystem author or a
  cron script, and spec §2.1 already counts it in the no-auth baseline. It
  simply has no browser-side caller any more.
- **The dashboard widget system.** It shares vocabulary *words* with v1
  and nothing else. The dependency ran the other way: `ListaControl`
  imported `applyFilter`/`resolveField` from `dashboards/filter.ts`, never
  the reverse, and nothing under `dashboards/` imports anything under
  `tricks/`. Dashboards are reached from any note with a `widgets:` array,
  through their own registry and renderer. Deleting the trick controls
  left them untouched.

### Attacked, against the real server and the real host

A scratch vault with the four starter apps copied in, plus a hostile
trick declaring only `estado`, a self-navigating trick, its target, a
capability-less one and a v1 manifest. Full table in spec §10.10. The
short version: `parent.document`, `top.document`, `localStorage`,
`sessionStorage`, cookies, IndexedDB and Cache all `SecurityError`;
`frameElement` `null`; every network attempt — `fetch`, XHR, `sendBeacon`,
remote `<img>`, WebSocket, EventSource, a form POST, a `no-cors` POST to
its own bridge route — blocked before leaving the browser; top navigation
and `window.open` refused.

Three results worth naming:

**A message claiming another trick is evaluated as its actual sender.**
The hostile app sent `estado.set` with `trick: "lista"` in the body. It
landed in `.claude/tricks/hostil/data/estado.json`; `lista`'s data folder
was never touched. A window-level `postMessage` carrying an op was seen,
logged and discarded.

**A frame that navigates itself gets refused twice.** The host saw the
second `load`, handed over no port and unmounted the frame; the server's
`Sec-Fetch` gate had already 403'd the navigation (`dest=iframe
site=cross-site`), so the target document never loaded either. The target
declares `script.run`, which the navigator does not, and confirmed from
its own side that no hello arrived.

**`capability_denied` is legible, next to the trick.** Undeclared
`vault.write` and `script.run`, an op outside the vocabulary
(`unsupported_op`, not `capability_denied`), four malformed envelopes
dropped with reasons, and a rate-limit refusal with a running count — all
in the panel's chrome outside the iframe, with a line naming `trick.yaml`.

### One real bug found, in someone else's seam, deliberately not fixed here

**`vault.query`/`vault.read` return vault-relative paths;
`vault.read`/`vault.write` accept `carpeta`-relative ones.** Found by
pressing a checkbox in the shipped `lista` starter, which feeds a query
result's `path` straight into `vault.write` exactly as spec §6.8 decision 5
invites. The server joins it onto `carpeta` again:

```
vault.query          → notes[0].path = ".claude/tricks/lista/data/ejemplo.md"
vault.write {path: that}          → capability_denied "may not create new files"
vault.write {path: "ejemplo.md"}  → ok
formulario (crear:true), same mistake → CREATED
    .claude/tricks/formulario/data/.claude/tricks/formulario/data/nueva.md
```

Not a scope escape — the doubled path is still under `carpeta` — but it
silently breaks the write path of two of the four shipped starters, and
under `crear: true` it creates garbage instead of failing. Left for the
server/authoring seams because the fix belongs in one place and the host
is explicitly a courier: §6.8 says it relays the envelope rather than
translating it, and a path rewriter in the courier is the kind of second
opinion that makes a scope check unverifiable. Recorded in spec §14.

### Left undone, and what could not be verified

- **`trabajo.estado` still answers `unsupported_op`.** Unchanged; it wants
  the jobs-view parser.
- **`datos.cambiaron` and its pause were verified separately, not
  together.** Chrome under automation reports the tab as
  `visibilityState: "hidden"`, which is exactly when §8 says the poll must
  stop — confirmed by exactly one `/api/notes` request for a whole
  session. The event itself was then confirmed by temporarily removing
  that guard, watching a note written on disk appear in a mounted trick
  with no reload, and putting the guard back. `assumed:` the two compose.
- **Pointer clicks could not be delivered into the sandboxed frame** by
  the automation harness; every in-frame interaction was driven by
  keyboard focus. Same handlers, not the same input path.
- **Only Chrome, only automated.** No manual pass, no Firefox, no Safari.
- **The 256 KiB message limit and the 1 MiB `vault.read` ceiling
  disagree.** A legal read of a 900 KiB file produces an answer the host
  refuses with `bad_request` naming the limit. The server is the
  authority and its ceiling is the wider one; recorded rather than
  silently reconciled.
