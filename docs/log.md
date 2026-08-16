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

## [2026-08-15] vault-steward: a self-organizing pass over the vault, every three days

A default trick plus a skill plus a script, all in `vault-template/`. The
ask was "fix broken links, misplaced notes, contradictions and stale
facts, flag them as cards with an input box, and propose folder
refactors" — with the priority stated explicitly: **organisation and
naming first, contradictions second.**

### The conventions document is the actual deliverable

`vault-template/conventions.md`. "Keep the vault organized" cannot be
enforced against anything, so nothing here checks a rule that is not
written there: folder depth (1–3, ceiling 4), fan-out before a folder
needs subfolders (20), the filename regex and length, the required
frontmatter fields and their allowed values, where indexes live, the link
minimums, and a "The numbers" table collecting every constant a checker
reads. `CLAUDE.md` says how to work; `conventions.md` says what the
result must look like, and is what a human argues with when the steward
flags their file. Changing the rule is a stated legitimate outcome —
otherwise the document is just the tool's source code in prose.

Generic throughout (rule 5): no company names, no deployment paths,
English prose with this vault's Spanish field names, and a section saying
which they are and how to rename them all at once if a deployment's
language differs (roadmap §8).

### Deterministic and judgment, split on purpose

`_tools/steward.py` (stdlib only — it runs from cron on a box where
nobody has pip-installed anything) owns everything with one right answer:
broken links, filenames, duplicate basenames, frontmatter, missing
indexes and index rows, orphans, empty folders, fan-out, depth, notes
loose at the root. The `vault-steward` skill owns contradictions,
staleness, misplacement, and *what the subfolders of an overgrown folder
should be*. The script prints its half of the work under a heading the
skill reads.

It **imports `_tools/linkcheck.py`** rather than resolving wiki-links a
second way, including copying its treatment of an ambiguous bare name as
resolved. Two link checkers that disagree is how both get ignored.

`vault-health` was deliberately **not** absorbed. It stays the fast
three-check thing a person reaches for after an import; the steward is
the unattended, wider one. Both were pointed at each other in their own
text.

### Findings are files, and moving one is atomic with its links

One file per finding in `steward/`, `tipo: hallazgo`, with the answer as
five top-level frontmatter fields — `estado`, `respuesta`, `decision`,
`respondido`, `actualizado`. Top-level and flat specifically so
`vault.write.campos` can name them exactly; a nested answer block would
have needed a `campos` shape the spec does not pin down. The machine
detail sits in a nested `finding:` block with English keys, the same
split `job:` and `widgets:` already use.

`steward.py move A B` is the only sanctioned way to move or rename a
note, and `CLAUDE.md` now says so next to a ban on `mv` and `git mv`. It
refuses on a destination that exists, on a basename used anywhere else,
and on a destination outside the vault; rewrites all three link forms;
carries the note's index row across, description intact; and rolls
everything back if any rewrite fails. Verified on a note with 46 inbound
links moved across folders — `vault-lint` afterwards reported only the
two broken links that were already there.

### The boundary, written three times

> Anything that can lose information is a proposal, never an automatic
> action, however confident the analysis is.

In `conventions.md` §5, at the top of `steward.py`, and in the skill.
Three copies because a future author will be tempted in at least one
place. Repointing a link is automatic (it was already broken, the old
text is in git, and it needs exactly one candidate after normalization);
deleting a "duplicate" note never is.

### Four bugs the messy test vault found, all of them mine

A scratch vault was generated with genuinely broken input — a link to a
renamed note, an ambiguous link, two notes contradicting each other,
`Untitled 3.md`, `Final Report (v2).md`, a bare date outside `daily/`,
duplicate basenames, no-frontmatter notes, a note five folders deep, an
empty folder, an orphan, and `reference/` with 43 flat files.

1. **The steward found its own output and carded it.** Second run: cards
   quoting broken link targets inside `[[ ]]` were scanned as notes,
   producing `broken-link-broken-link-…` five deep. Two fixes, both
   needed — every check runs against subjects excluding `steward/`, and a
   card never renders a broken target inside brackets. Same shape as the
   agent brief that contaminated the health counts on 2026-08-14, which
   is why `.claude/` is skipped; a finding folder that Obsidian can open
   cannot be, so the escaping is the mechanism instead.
2. **Card spam.** `notes.md` in two folders was a duplicate basename, a
   bad filename and an orphan: three cards asking three versions of the
   same question. Now one card per note per run, most navigation-breaking
   kind first, with multi-note findings always surviving because they
   subsume the single-note ones. 19 cards became 11 on the same input.
3. **A card's own links made its subjects look linked.** The fan-out card
   lists 40 notes, so every one of them gained an inbound link and
   stopped being reported as under-linked. Steward paths are now excluded
   from inbound counts, alongside index files.
4. **The auto-created index was itself carded** for being too deep — the
   tool generating a file and then complaining about it. Indexes are
   exempt from the depth rule; the folder is what is too deep, and the
   notes inside already say so.

Also: `conventions.md` initially failed its own link check, because a
document explaining wiki-link syntax contains examples the checker cannot
distinguish from mistakes. Fixed by naming targets in prose, and written
down in §4 as a rule, since it is the same trap `_templates/` is skipped
for.

### Verified, and against what

Against a **stub** of the v2 runtime in the scratchpad (Node, no deps)
reproducing §5 serving, the `Sec-Fetch-*` gate, the exact headers, the
§6 one-port-per-mount handshake and server-side capability enforcement
read fresh from `trick.yaml` — because the real runtime's seams 2 and 3
are being built right now:

- the app renders in `sandbox="allow-scripts"` and takes its port
- `vault.read` on expand, frontmatter stripped, evidence shown
- an answer written to disk containing exactly the five declared fields
- `vault.write` of an undeclared field (`titulo`) refused with
  `capability_denied`, visible in the app, and the file unchanged
- `datos.cambiaron` re-queries; `tema: oscuro`; 360 px wide with no
  horizontal overflow
- the entry gate: 403 with no `Sec-Fetch-*`, 403 top-level, 403
  cross-site iframe, 200 same-origin iframe, 200 for a cross-site
  *subresource* (the check that must not be applied there), 400 on a
  path escape
- called directly with curl, bypassing the frame: `vault.read` outside
  `steward/` and `script.run` both denied

Against the real thing: **nothing.** The panel cannot mount this yet.

`observed:` synthetic mouse events from the browser-automation tool do
**not** reach a document on an opaque origin inside
`sandbox="allow-scripts"` — clicks were dispatched at correct
coordinates, the host page's own capture-phase listener confirmed the
coordinate mapping, and the frame never saw them. `read_page` also
returns nothing for such a frame. The app was therefore driven by a
`_driver.js` added to a **scratch copy** of `index.html` that dispatches
`.click()` on the real buttons; `app.js` was diffed byte-for-byte against
the shipped file. Anyone testing a trick in a browser will hit this.

### Left undone

- **No real panel run**, so `vault.read`'s and `vault.write`'s result
  shapes stay `assumed:` in the app, as they are in `trick-creator`.
- **The job is not installed.** `trick.yaml` declares `0 6 */3 * *` and
  the skill hands off to `schedule-job`; the base package ships the brief
  at `.claude/skills/vault-steward/brief.md` and no crontab. Until then
  the app's header says so instead of implying the queue is fresh.
- **`*/3` is not every 72 hours** — it resets at each month boundary,
  giving a one- or two-day gap. Accepted and documented rather than
  solved with a runner that tracks its own last-run date.
- **`vault-template/` now ships one trick**, which `tricks-spec.md` §9
  said it would not. Corrected there in one sentence: the steward is
  default machinery whose queue needs a UI, not an example.
- **Card ordering is by kind, not by cost of being wrong.** A
  contradiction about a date somebody is about to act on and one about a
  finished project sort the same.
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

## [2026-08-15] Panel UI overhaul: palette, resizable panels, rename, live preview — and deployed

The owner's list, in order: no emojis, resizable panels, a real colour
palette, safe rename, a live-preview editor, a floating link into Claude
Code on the web. All six shipped, plus the deferred graph-sizing question
finally got a real-browser answer. Ten focused commits on `main`, then
deployed to the one real machine. Full reasoning lives in each commit
message; this entry is what happened, not a duplicate of them.

### The palette, checked rather than eyeballed

No published frame-by-frame colour analysis of the film exists (the
cinema-palette sites covering roughly 250 films don't include it) — so the
anchors are named colours from a published Southwest/desert palette set
(Big Ox Printing's "Red Rock Canyon", "Cactus & Sage", "Turquoise & Clay",
"Sunbaked Adobe", "Mesa Dusk"), cited by name in `styles.css` next to the
token each one feeds. `panel/web/src/lib/contrast.ts` implements WCAG
relative luminance and contrast ratio from scratch and
`contrast.test.ts` parses the real stylesheet (not a copy of the values)
and asserts every foreground/background pair at AA — it caught a real
miss: Muted Olive as published (`#7D805F`) is 4.22:1 on the deepest
surface, short of 4.5:1, which is why the shipped file-badge olive is
darker than the source swatch. Lowest pair in the whole shipped set:
4.82:1.

The graph canvas painted six colours restated in JavaScript at module
scope, keyed off `prefers-color-scheme` evaluated once at import — a
second copy of the palette that this redesign would have silently left
painting the old blue. Fixed by reading the same CSS custom properties
back out of the document via `getComputedStyle` (`lib/graphPalette.ts`),
updating on a `matchMedia` `change` listener.

### Emoji, replaced with one inline SVG set

Grep found three shapes: the Tricks list's fallback icon and every
`trick.yaml`'s `icono:` field (rendered as literal text), the note
tree's fold caret (a Unicode glyph standing in for an icon), nothing
else. `icons/Icon.tsx` — one SVG per glyph, 20×20 viewBox, 1.6px stroke,
round joins. The load-bearing part isn't the SVGs, it's
`icons/TrickIcon.tsx`: `icono` is vault content the server validates only
as `z.string().optional()`, so it's untrusted the moment it reaches the
browser — an unrecognised value (including an emoji left over from before
this change, or one a future agent writes without reading the updated
skill) falls back to a generic icon rather than ever being rendered as
literal text. There is no code path left in this app that echoes a
vault-supplied string as an icon.

### Resizable panels, and a real bug the browser found

Sidebar and backlinks panel both get a draggable divider: continuous
follow-the-pointer down to 0, a release below an 80px threshold snaps
fully collapsed, double-click or Enter toggles against the last width the
panel actually had, width and collapsed state persist in `localStorage`.
`lib/resizable.ts` holds the arithmetic as plain functions (20 tests, no
DOM).

**Verified in a real Chrome session, and it caught something reading the
code never would have:** clicking the divider never focused it —
`document.activeElement` stayed `<body>` after a real click — so
click-then-Enter (the documented fold/restore gesture) silently did
nothing, while dragging and Tab-then-key both worked fine. Root cause:
`onPointerDown` calls `preventDefault()` to stop the browser's own
drag/text-selection gesture, which as a side effect also suppresses the
browser's default click-to-focus behaviour. Fixed by focusing the
divider explicitly in the handler, and re-verified in the same session:
click, Enter restores from collapsed; click, ArrowRight resizes. Own
commit (`web: fix resizable divider not receiving focus on click`),
separate from the feature commit, since it was found and fixed after the
feature had already landed and been committed.

### Rename: made to agree with `steward.py move`, not invent a second mover

Read `_tools/steward.py`'s `cmd_move` before writing anything — the task
was explicit that two components each thinking they own "how a move
works" is the failure shape this project keeps finding.
`panel/server/src/rename.ts` ports it line for line: same validation
order (not-a-note, destination-exists → 409, basename-uniqueness scoped
to exactly the dot-path exclusion `steward.py`'s own `self.md` filter
uses), same link-rewrite mechanics (every note whose raw link target
resolves to the moved path gets `[[target]]`/`[[target|alias]]`/
`[[target#heading]]` rewritten to the new bare slug, alias/heading suffix
preserved), same index-row transplant including its known limit (only
finds the row on a folder-only move — ported faithfully, not fixed, since
the CLI tool and this endpoint have to keep agreeing), same rollback
shape (every edit computed and every original held before the rename
happens; a write failure after the rename restores everything and moves
the file back).

`assertNetworkWritable` is checked on **both** `from` and `to` — a
move-specific point the note-write and upload endpoints didn't need to
make: renaming a file *out of* `.claude/` still modifies `.claude/`
(removes an entry) even though the destination alone would pass, so
checking only `to` would let an unauthenticated caller disable a skill or
a trick by relocating its file.

`POST /api/note/move` and `POST /api/attachment/move`, both behind the
existing cross-site guard, both requiring `application/json` (same
preflight-forcing reasoning as `PUT /api/note`). 16 new server tests:
all three link forms, alias/heading preservation, a same-basename false-
positive guard (two similarly-named targets not cross-contaminating), the
basename-clash refusal and its dot-path exemption, the index-row
transplant, a destination-appeared-after-indexing race, and both
`.claude/` refusal directions.

Frontend: `RenameDialog` shows the consequence before the confirm
button — "This note is linked from N other notes; they will be updated
automatically," using `note.backlinks.length`, already on hand from the
existing `GET /api/note` response. Renames in place only (same folder);
moving between folders isn't exposed in this dialog — the owner isn't a
coder and doesn't think in vault paths, `.md` is never shown, and a
folder-picker is real additional UI for a need that wasn't asked for. The
API already supports arbitrary `from`/`to` if that changes.

**Verified end to end against a real scratch vault in a real browser**:
renamed a note linked from two others (bare slug and a `#heading`-
anchored form); both rewrote to the new bare slug on disk, confirmed by
opening each linking note in the editor. Vault health after both renames:
0 broken links. Tried renaming an attachment onto an existing filename:
got the 409, in plain language, in the dialog.

### Live preview: the highest-value item, not cut

`editor/livePreview.ts` — pure, no CodeMirror import — takes one line's
text, its document offset, and whether the cursor touches it, and
returns which spans to visually collapse (`**`/`*`/`` ` ``/`#`/`[[`/`]]`)
and which to style (bold, italic, code, heading size, the wikilink
colour). 25 tests, covering all six heading levels, the two CommonMark
edge cases (no space after `#`, a 7th `#`), adjacent bold/italic runs not
cross-contaminating, and all three wiki-link forms. Formatting is not
gated on the active line, only the delimiters are — bold stays visually
bold while the cursor sits on that line, only the `**` reappears — which
is the detail that makes it "live" rather than a mode switch, and it's
what every piece of prior art the frontend plan cited converges on.

Fenced code blocks are excluded (`computeFenceLines`, one forward pass
over the whole document per rebuild, separate from the viewport-scoped
decoration pass) — this vault's own `CLAUDE.md` and skill files are full
of code samples containing literal `**` and `#`, and reading those as
formatting would have been a real, visible bug on day one, not a
hypothetical.

**Verified in the real browser session, not just by the test suite**:
opened a note with a heading, bold, italic, a wikilink, and a fenced
`yaml` block containing literal `**nope**` inside it. Read mode and edit
mode matched. Clicked into the heading line — the `#` reappeared, the
line stayed bold. Clicked into the paragraph below — `**dark roast**`
and the full raw `[[projects/rocket/plan|the rocket project]]` showed
their real syntax; the heading line above, no longer active, re-hid its
`#`. The fenced block's `**nope**` never bolded, on any line, active or
not. Typed a sentence, saved, reloaded — persisted correctly as plain
markdown.

### The graph-sizing question, answered

Roadmap carried this as unconfirmed: the callback-ref fix for the
graph's `ResizeObserver` was believed correct by reading the code, but
never confirmed in a foreground tab — a prior automated session could
only reproduce the *symptom* (stuck at 600×400) by way of a backgrounded
tab, where `requestAnimationFrame` never fires and no `ResizeObserver`
callback is ever delivered.

This session's automation tab reported `visibilityState: "hidden"`
persistently at first — the same trap — but changed to `"visible"` with
`document.hasFocus() === true` after enough interaction, and at that
point the answer is unambiguous: canvas `width`/`height` attributes
matched the container exactly (1424×929 against a 1424×929 container,
not 600×400). **The bug is fixed**, confirmed in a genuinely foreground
tab, not just reasoned about.

### Deploy — and a second real bug found only by testing on the actual machine

`git archive main | gzip`, verified clean (no `node_modules`, no `.git`,
no `deployments/`-gitignored file) before copying. Backup taken first,
distinctly named from the same-day backup already on the machine.
Service stopped, tarball extracted over the existing checkout, `npm
install`, then the server build — clean — then the web build, which
**failed**: `tsc` errors in `src/tricks/TrickRenderer.tsx`,
`ActionButton.tsx`, `ListaControl.tsx`, `ReadOnlyField.tsx` — the v1
trick renderer, referencing API types deleted when v1 was retired
(2026-08-15, "Tricks v2 host built, and v1 deleted rather than
deprecated").

Those files were never in the archive — `tar` extraction only ever adds
or overwrites, it never deletes, so a file removed from git since the
last deployment stays on disk forever unless something removes it. This
had been silently true since the v1 deletion; nothing surfaced it until
this session's web build ran on the actual machine, because every local
build in every session since started from a real git checkout (where
`git` itself removes files a commit deleted) rather than the tar-and-
extract path production actually uses.

Confirmed the scope precisely rather than guessing: diffed the tarball's
file list against the machine's actual `panel/web/src` and
`panel/server/src` trees. Five orphans, all under `web/src` (the four
v1 files above, plus `wikilinkDecoration.ts` — deleted *this session*,
superseded by live preview — already stale from the same class of gap
one redeploy later). Zero orphans anywhere else, checked across the
whole tree excluding `node_modules`/`dist`/`deployments`. Removed the
five, rebuilt clean, started the service.

**Left as a real gap, not fixed here:** the deploy procedure in every doc
and in this session's own instructions says "extract over `~/raymond`"
with no step that removes files a commit deleted. `git archive` cannot
express deletions relative to a previous state — it produces a snapshot,
not a diff — so the fix isn't a tar flag; it's either switching the
deploy transport to something that can express deletions (an actual `git
pull` against a now-real remote, which exists as of this session's
`dd46c1e`, or `rsync --delete` scoped to exclude `node_modules`/`dist`)
or adding an explicit clean step (`git -C <checkout-mirror> clean` logic,
or the diff-and-remove done by hand here) to the documented procedure.
Recorded here rather than in the deploy doc directly because fixing the
procedure needs a decision about which transport, and tar-via-scp is
still what the task specified for this pass.

### Verified in a real browser vs. reasoned about

Real, this session, foreground Chrome, against a scratch vault with real
linked content: the palette (light only — dark theme's contrast is
computed and asserted by 83 running tests, not separately screenshotted,
since no tool here can force `prefers-color-scheme` on the actual OS/
browser); every emoji replacement, including the trick-icon fallback;
sidebar and backlinks resize, drag and keyboard both, including the
focus bug and its fix; rename for both a note (link rewrite, 0 broken
links after) and an attachment (success and the 409 conflict path); the
live-preview editor's hide/reveal behaviour and a real save round-trip;
the Claude Code launcher's presence and label; the graph's real size.
Not independently verified: touch/iPad behaviour (no touch-emulation
tool available here), Firefox/Safari (Chrome only, same gap prior
sessions already carry for the tricks work).

### Left undone

- **Rename UI has no folder-move**, by design for this pass (see above)
  — the server supports it, the dialog doesn't expose it.
- **No conflict detection on rename** beyond the destination-exists
  check — same plain-overwrite model every write path in this app
  already has (frontend-implementation-plan.md §9).
- **Blockquotes, tables, and interactive checkbox widgets** aren't part
  of live preview — documented in `livePreview.ts` itself, not silently
  missing. A clickable `- [ ]` needs a `WidgetType` that mutates the
  document on click, real additional scope.
- **The tar-deploy orphaned-file gap above** — worked around by hand
  this time, not fixed in the documented procedure.

## [2026-08-15] Update distribution: a manifest, a puller, and a sync that runs inside the vault's own repo

`docs/roadmap.md` §13, written earlier today when the base repo went
public, was the spec. Two problems that only look similar: pulling
`~/raymond` forward is a normal git fast-forward; syncing
`vault-template/` into `~/raymond-brain` is not, because the vault has
no git ancestry to the base package and holds a mix of files nobody
should ever customize and files that are a deployment's own the moment
they're copied in. Getting that distinction wrong is exactly how a
future update silently overwrites someone's edited `CLAUDE.md` — which
is why the manifest comes before the script that reads it.

### The manifest names every path, including today's new ones

`vault-template/UPDATE-MANIFEST.md`. Roadmap §13 named the obvious
examples (`_tools/*`, the base skills, `vault-steward` as machinery;
`CLAUDE.md`, `index.md`, folder indexes, `panel/home.md`, `_templates/*`
as seed) but the tree has grown since those examples were written —
`conventions.md`, `.claude/tricks/_plantillas/`,
`.claude/tricks/vault-steward/`, `.claude/jobs/index.md` and
`.claude/tricks/index.md` all needed a first classification, not just a
pattern match against the existing examples. The test used throughout:
**edited in place, per-deployment, is seed; copied-from-and-then-edited
is machinery** — it's why `_templates/*` (edited in place, per
`conventions.md` §3's field-rename instructions) and
`.claude/tricks/_plantillas/` (copied out, never edited in place, per
its own `index.md`) land on opposite sides despite looking similar.

Two things came up that the manifest says plainly rather than solving
silently, because guessing either one is exactly the failure mode
roadmap §13 warned about:

- **`conventions.md` is seed, but its "The numbers" table is duplicated
  data with `_tools/steward.py`'s header constants** (the document says
  so itself: "change them there and… together"). `steward.py` is
  machinery and can be silently updated; `conventions.md` never is. If
  the base package ever changes a default and a deployment never
  touched either file, the sync closes the machinery half and leaves
  the seed half describing the old number — flagged in the manifest as
  a real gap the seed-diff report is the only way to close.
- **`steward/index.md` and `steward/historial/index.md` are neither
  machinery nor seed.** Both are shipped as install-time stubs and then
  regenerated wholesale by `_tools/steward.py check` on every real run
  — comparing them to the base package would either erase live findings
  (as machinery) or report meaningless noise every single run (as
  seed). A third "excluded" bucket in the manifest, checked once nobody
  had built anything into that gap yet.

### Conflict detection: a stored hash, not git archaeology

The part the brief called out by name as the one most likely to be
gotten wrong. `.claude/template-sync.md` — a note under `.claude/`,
following the same shape `.claude/jobs/*.md` already established
(frontmatter matching this vault's schema plus an English `sync:`
block, an append-only `## Runs` table) — records a content hash per
machinery path at the moment it was last synced. Every run computes
three hashes (baseline, this vault's copy now, the base package's copy
now) and only one of six combinations is genuinely ambiguous: both
changed since the baseline. Everything else resolves without a human —
full table in `scripts/sync-vault-template.py`'s module docstring.

Git history was the other option on the table (roadmap §13 raises both)
and was rejected for this vault specifically: `steward.py move` rewrites
files outside a plain edit, and "does this content match some commit
this vault ever synced from" needs a full history walk per path, per
run, forever. A stored hash is one `sha1()` call and doesn't care how
the local copy came to be what it is.

When both sides changed, the conflict becomes a card in `steward/`,
`tipo: hallazgo`, in exactly the shape `_tools/steward.py`'s `Finding`
class already writes — same five answer fields
(`estado`/`respuesta`/`decision`/`respondido`/`actualizado`), because
those are literally what the `vault-steward` trick's
`vault.write.campos` already permits. A template-sync conflict card
therefore renders in the existing steward panel UI with zero changes to
that trick — not planned, just fell out of matching the existing shape
instead of inventing a new one.

### Two real bugs, both caught by the scratch verification, neither by reading the code

1. **A timestamp-only rewrite made every run commit something, forever.**
   `.claude/template-sync.md`'s frontmatter always stamped the current
   time into `last_synced`, so even a run that changed nothing produced
   a one-line diff and a commit — silently failing the exact
   requirement the brief asked to verify ("run twice in a row with no
   upstream changes — the second run should be a clean no-op"). Fixed by
   only rewriting the marker when the baseline table itself changed or a
   conflict card's answer was carried out; a run with nothing to do now
   leaves the file untouched.
2. **A failed panel build was never retried**, because a successful
   `git merge --ff-only` already leaves `HEAD` fast-forwarded — so the
   *next* run's "anything new to pull?" check says no, and the old
   script exited early without ever looking at the build again. Fixed
   with a small marker (`~/.raymond/last-build-commit`, deliberately
   outside `~/raymond` itself so nothing untracked ever sits in that
   clone) recording the last commit panel/ was *successfully* built at;
   the rebuild check now compares against that, not against "did
   anything get pulled this run." Caught the first fix attempt too: the
   marker has to be written to disk the moment it's first assumed, not
   just held in a shell variable, or a failure on the very first run
   loses the one reference point that made the retry possible at all.

Neither bug would have been obvious from reading either script in
isolation — both are two-runs-apart failures, which is exactly why the
brief's "run the full loop twice in a row" step existed rather than
being optional.

### Verified against a scratch setup; not against a real deployment

A bare repo standing in for the public remote, a scratch `~/raymond`
cloned from it, a scratch `~/raymond-brain` seeded from a copy of
`vault-template/` as if from an earlier version, its own git repo. No
real deployment was available to risk (Angela's `~/raymond` is still
tar-deployed with no git ancestry to pull against at all — see
`deployments/angela.md`, and roadmap §13's own last bullet, which this
work does not attempt).

Observed, by actually running it:

- A machinery change in the "upstream" bare repo lands in the scratch
  vault as a real, reviewable commit.
- A seed change upstream leaves the deployment's copy byte-identical
  (checked directly, not just "the script didn't complain") and is
  reported, not written.
- A machinery file edited locally, then changed upstream too: the local
  edit survives untouched, a card appears in `steward/` with both diffs
  quoted, and answering it with `decision: aplicar` / `respuesta: "take
  theirs"` overwrites correctly on the next run — `descartar` and "keep
  mine" both correctly leave the file alone and re-baseline so the same
  difference doesn't get carded again.
- A real `git fetch` + `git merge --ff-only` against the scratch bare
  repo; rebuild skipped when nothing under `panel/` changed; rebuild +
  restart triggered when it did; a build failure leaves the *old* build
  serving and does not restart into it, and — after the fix above — a
  retry on the next run (even with nothing new to pull) actually
  retries.
- `~/raymond` with a local commit the remote doesn't have: the script
  stops loudly (exit 2), names the exact `git log` command to inspect
  it, and touches nothing. `HEAD` unchanged, confirmed.
- Both scripts run twice in a row with nothing changed between runs:
  the second run is a clean no-op — `nothing to commit` from the vault
  sync, `already up to date… nothing owed to the build` from the
  app-code puller — not an error, not a spurious diff.
- `--dry-run` on both scripts: correct report, `git status` and `HEAD`
  unchanged, no marker files written.

`assumed:`, not observed — no Linux box was available in this pass:

- `flock` and `systemctl --user` behave as `schedule-job`'s own runner
  skeleton documents. macOS (this pass's only environment) has neither;
  both were shimmed for the scratch run to exercise everything else,
  and the real lock/restart calls were reviewed against
  `schedule-job`'s own documented pattern rather than executed for
  real. First real install should verify §6 of the `schedule-job` skill
  itself (`env -i`, watch it fire once) the way that skill already asks
  for.
- `npm install` / `npx tsc` / `npm run build` succeeding against the
  real `panel/server` and `panel/web` — stubbed for the scratch run
  (no network, no real dependency tree) specifically so the *branching
  logic* (rebuild-or-not, restart-or-not, retry-or-not) could be tested
  fast and repeatably. The commands themselves are copied verbatim from
  README's already-verified "Getting a deployment running" section, not
  invented here.

### What the skill adds on top of the two scripts

`vault-template/.claude/skills/update-raymond/`. Modeled on `daily-log`
for shape and `schedule-job`/`vault-steward` for how a script-backed
skill hands its unattended half to `schedule-job` rather than
scheduling itself. A `--dry-run` preview on both scripts, offered
explicitly to a non-coder audience before committing to a real run —
the same instinct as the tricks work earlier in the session that put
`Nothing here yet` and honest incomplete-state language directly in
front of a user rather than a raw error. Cadence picked as daily,
`kind: script` (both underlying scripts are fully deterministic, so
there's no judgment step that would justify paying for an agent run) —
reasoning for daily specifically, rather than assuming it, is written
in the skill itself.

### Left undone

- **`.claude/jobs/vault-steward.prompt.md`-style copies of machinery
  briefs go stale silently.** `.claude/skills/vault-steward/brief.md` is
  machinery and syncs; the copy `schedule-job` writes into
  `.claude/jobs/` at install time does not, because that path is
  deployment state the moment it's written and this manifest doesn't
  enumerate job names. Written down in `UPDATE-MANIFEST.md`'s own "Out
  of scope" section rather than solved — closing it means the sync
  reasoning about job-specific paths it was never meant to touch.
- **`.claude/tricks/index.md` won't gain a row for a second default
  trick automatically**, if the base package ever ships one — it's seed
  (a deployment's own trick list), so the sync never writes it, even
  for the one row that would document base-package machinery. Flagged
  in the manifest; the seed-diff report is the only mechanism that
  surfaces it.
- **No cap on conflict cards.** `_tools/steward.py` caps itself at 25
  open cards; the sync script doesn't, on the assumption that machinery
  conflicts should be rare in real use (a deployment editing `_tools/*`
  in place is already an edge case). Worth revisiting if a real
  deployment proves that assumption wrong.
- **`bootstrap.sh` no longer blind-copies `UPDATE-MANIFEST.md` into a
  fresh vault** — caught while seeding the very first scratch vault for
  this pass (its own `cp -rn` would otherwise have shipped a file the
  manifest's own header says should never leave the base checkout).
  One-line fix, `scripts/bootstrap.sh`; not re-verified against a real
  bootstrap run, only against the scratch vault seed step this pass
  already needed.
- **Angela's `~/raymond` is still untouched** — tar-deployed, no git
  ancestry, exactly as roadmap §13's last bullet described before this
  work started. Converting her specifically is out of scope here, same
  split as her SIGRA skills (roadmap §9): tracked in her own
  `deployments/angela.md`, not the base package.

## [2026-08-15] Trick apps: a fallback for browsers that send no Sec-Fetch-* at all

Found live, on Angela's deployment: `vault-steward` refused to open with
`appRequestGate`'s own message, `dest:null, site:null`, over a real
Tailscale MagicDNS address — a genuine device on her tailnet (consistent
with an older Safari, an iOS WebView, or a locked-down corporate
browser), not curl and not a dev artifact. `panel/docs/tricks-spec.md`
§5.3's `dest absent → 403` was correct for the signal it had; the gap was
that it had no fallback, so a browser like this one could not use tricks
at all.

### What was built

`panel/docs/tricks-spec.md` §5.5 has the full design and threat-model
reasoning; short version: `POST /api/tricks/:name/mount` mints a
single-use, per-trick token, guarded by nothing new — the cross-site
guard already in `index.ts` covers it, and its `Origin` check (which
predates Fetch Metadata by a decade) is what actually carries the weight
for exactly the browsers this exists for, since their `Sec-Fetch-Site` is
also absent. The panel now mints one before every mount, for every
browser, because page script cannot read `Sec-Fetch-*` and so cannot know
in advance which path a given browser needs.

The token authenticates the entrada exactly once; success opens a short,
per-trick-name window that subsequent subresource requests are checked
against instead, since a relative `<link href>`/`<script src>` cannot
carry the token itself. The window only ever serves an allowlist of
ordinary subresource extensions — `.html`, `.svg` and `.xml` are excluded
even while the window is open, because each can carry and run its own
script when navigated to directly, which is the exact redirector
`appRequestGate` exists to prevent. Confirmed live (§10.11): planting an
`other.html` next to a real trick's `index.html` and requesting it during
a genuinely open fallback window still gets refused.

### Why not the obvious shape

A cookie looked like the obvious transport. Measured against a real
sandboxed iframe in real Chrome before writing any server code:
`SameSite=Lax`/`Strict` cookies never reached a request made from inside
`sandbox="allow-scripts"` (no `allow-same-origin`) for a same-origin
resource — the opaque origin breaks the ancestor-chain same-site check a
browser uses to decide whether to attach one, regardless of the *URL*
being same-origin. Only `SameSite=None` partially got through, and that
variant requires `Secure`, which requires HTTPS, which this deployment
doesn't have. Full writeup and the measurement table are in §5.5 — this
is the kind of finding that belongs in the spec, not just a commit
message, because the next person who reaches for a cookie here needs to
see why it doesn't work before trying it again.

### Verification

§10.11 in the spec has the full attack log: the existing strict path
unchanged for a real, unmodified Chrome (confirmed via the actual
`Sec-Fetch-Dest`/`Sec-Fetch-Site` values on the wire, not assumed); the
full fallback flow working end-to-end through `curl` — which reproduces
the live bug's own header shape exactly, `dest`/`site` both absent — from
base case through mint, single use, window, and expiry; the mint
endpoint refused cross-origin both via `curl` and via a real second-origin
browser page issuing the exact `fetch(..., {mode:"no-cors"})` attack
`§10.3` established for other endpoints; and a valid, unused token
embedded in a real top-level Chrome navigation still refused by the
strict gate, unconsumed. `npm test` (57 server cases, 8 new; 232 web
cases, unchanged) and `npm run build` clean in both `panel/server` and
`panel/web`.

**Not verified**: an actual pre-16.4 Safari (or equivalent) rendering
engine. Two different attempts to make a real Chrome request genuinely
omit `Sec-Fetch-*` — Playwright route interception, then a raw CDP
`Fetch.continueRequest` — both left the header on the wire unchanged;
Chrome recomputes it after either interception point. `assumed:` a real
old-Safari engine renders the fallback-authorized bytes the same way
Chrome already renders the strict-authorized ones, since the fallback
changes only whether a response is sent, never what's in it — carried in
§14 as the same class of gap the original `Sec-Fetch` gate work already
had for Firefox and Safari.

## [2026-08-16] vault-steward renamed to Mender, and the trick handshake grew language + theme

`vault-steward` — the trick, the skill, and `_tools/steward.py` — is now
`mender`, `_tools/mender.py` throughout `vault-template/`, this repo's
docs, and the panel's own comments (`rename.ts`, `tricks.ts`, `bridge.ts`,
`sync-vault-template.py` all cite `mender.py move`/`mender.py`'s internals
by name and had to move with it). "Mender" reads as a short, healing-
adjacent name for a tool whose whole job is mending a vault's contradictions
and stale facts, without reaching for clinical language a knowledge-vault
maintenance tool has no business using; it is left untranslated in the
Spanish trick title, the same way `Bridge`, `Raymond` and other proper
nouns already are in this codebase. Checked first against
`vault-template/CLAUDE.md` and the existing skill/trick names
(`capture-note`, `daily-log`, `vault-health`, `migrate-notes`,
`trick-creator`, `schedule-job`, `update-raymond`) — no collision.

The `steward/` vault folder itself, its frontmatter vocabulary
(`tipo: hallazgo`, `finding:`), and the `etiquetas: [steward, …]` tag were
deliberately **not** renamed: that is data-model surface, a generic name
for a review queue, not the actor's own name — renaming it would be a
real data migration for a live deployment (folder contents, `carpeta:` in
`trick.yaml`, every card's frontmatter) for no benefit this ask asked for.
Historical entries above this one still say `vault-steward` and
`steward.py`, on purpose — this is a log of what happened, not a document
this rename gets to rewrite backward.

### Owner's actual ask, and the gap underneath it

"Change the name of the steward… and make sure it honors the language of
the setting and also the color palette. It is currently speaking in
English and with white ugly colors." The gap: the panel-wide language
setting (English/Spanish, `Config.language`) and the theme both landed
scoped to the panel's own chrome — reasonable for a trick, since a trick
is a deployment's *own* content (the same boundary `docs/roadmap.md` §8
draws for vault content generally) — but wrong for `mender`, which ships
in the base package to every deployment, same as the rest of the UI. It
had its own separate, English-only strings and its own separate,
light-only, hardcoded-hex stylesheet that never read the panel's palette
at all. That is what "white ugly colors" meant: not a bad color choice,
a trick with no palette of its own reading anything from the host.

### What was built

**1. A documented, repeatable i18n pattern for `trick.yaml`.**
`titulo`/`descripcion` now optionally accept `{ en, es }` in place of a
plain string (`localizedStringSchema` in `panel/server/src/tricks.ts`),
validated `.strict()` so an unknown language key or an empty object
invalidates the manifest the same way a mistyped `capacidades` key
already does — silent-wrong is worse than loud-invalid here, same as
everywhere else in this schema. `resolveLocalized(value, language)`
picks the right string with a graceful chain (requested language → `en`
→ whichever is set), and is the *only* place that chain lives — both
`listTricks` and `GET /api/tricks/:name` call it, so the wire shape
callers already depend on (`titulo: string`) never changes; a client has
no reason to know the manifest can hold two languages at all. Every
other trick's plain-string `titulo` validates exactly as before —
`localizedStringSchema`'s first arm is untouched. `panel/docs/tricks-spec.md`
§4.2 and `trick-creator/SKILL.md` §4 both document the pattern now, not
as a one-off for this trick.

**2. Two new read-only fields in the trick handshake**
(`panel/docs/tricks-spec.md` §6.2, `TrickHost.tsx`): `locale` — the
deployment's *configured* language (`"en"`/`"es"`, read from the same
`useI18nStore` the panel's own chrome reads via `useT`), replacing what
used to be `navigator.language` and was never actually consumed by any
starter; and `tokens` — the panel's live CSS custom properties (`--bg`,
`--bg-raised`, `--fg`, `--fg-muted`, `--border`, `--accent`,
`--accent-hover`, `--accent-contrast`, `--broken`, read straight off
`styles.css`'s `:root` via `getComputedStyle`), resent whenever the panel's
own `prefers-color-scheme` flips. `locale` also gets a live update: a new
`ev: "locale"` event, fired from a direct `useI18nStore.subscribe` (not a
hook — the mount effect must not re-run and remount the frame just
because the language changed) whenever the owner changes it in Settings.

**3. `bridge.js` — the file every trick starter copies byte-for-byte —
now applies both automatically.** It writes `tokens` onto the trick's own
`:root` as `--host-<kebab-name>` and sets `data-tema` to match, on the
hello and on every `tema` event. A trick's `style.css` never touches
`--host-*` directly: it maps its own variable names onto them once —
`--fondo: var(--host-bg, #fallback)` — with the fallback only used
standalone, outside the panel, where no hello ever arrives.
`.claude/skills/trick-creator/SKILL.md` §6 writes the pattern up. Applied
to all five apps that ship in the base package: `mender` and all four
`_plantillas/` starters (`lista`, `boton`, `tablero`, `formulario` —
the last has no `bridge.js` of its own, being a one-file trick by design,
so it got the same twelve lines inlined). Every hardcoded button
`color: #fff` became `var(--acento-contraste, #fff)`, fed by the new
`tokens.accentContrast`.

**4. `mender`'s own UI content is now bilingual**, English default,
Spanish second — a plain lookup table in `app.js` (`STRINGS.en`/`STRINGS.es`),
keyed by `hello.locale`, the same shape `panel/web/src/i18n/messages.ts`
already uses for the panel's own chrome, sized down to what one trick
needs. No library; a handful of strings does not need one.

### Why this doesn't weaken the bridge's trust boundary

Stated explicitly because the spec's own rigor for this boundary demands
it (`bridge.ts`'s `capability_denied` discipline, `tricks.ts`'s
re-derive-everything-server-side rule): `locale` and `tokens` are
**strictly outbound, host → frame**, sent once at mount and resent on a
theme or language change the host itself observed. The frame never sends
either back, and nothing server-side (`bridge.ts`, `tricks.ts`) has a
field named `tokens` or `locale` in any request path — there is no
authority check anywhere that a hostile trick could feed a forged value
to, because nothing ever asks. It is exactly the same trust shape `tema`
already had before this change: a display hint the frame is free to
ignore or paint over inside its own rectangle (spec §2.4), never a new
way to influence what the host does.

### The Angela's-deployment migration question

Worked through, not solved: `scripts/sync-vault-template.py`'s
`classify()` only ever iterates the *base checkout's* current file list
against `UPDATE-MANIFEST.md`'s patterns. Since that manifest now says
`.claude/tricks/mender/**` where it used to say
`.claude/tricks/vault-steward/**`, a deployment that already has the old
folder on disk (Angela's does) will never have it re-classified by any
future sync — it is not "machinery the base package no longer ships"
(that path only fires for a name a pattern still recognizes whose file
vanished upstream), it is simply invisible to `classify()` from now on.
The next sync on a vault like that adds the new `mender` trick and skill
as ordinary new machinery and leaves the orphaned `vault-steward` folders
sitting untouched beside them, with no conflict card and no signal
anything is stale — the panel's Tricks list would show both "Vault
steward" and "Mender" until a human notices and deletes the old folders
by hand. If a cron job named `vault-steward` is already installed
(`schedule-job`), the new trick's `trabajo.estado.job: "mender"` won't
match it either, so its "last run" status reads "no scheduled run
installed" until the job is renamed. Full writeup, including why this
needs a `renamed-from:`-style mechanism the manifest doesn't have today
rather than a one-off fix: `vault-template/UPDATE-MANIFEST.md`, under the
`.claude/tricks/mender/**` bullet.

### Verification

`npm run build` and `npm test` clean in both `panel/server` (69 cases, 5
new for the `{en, es}` schema and its resolution) and `panel/web` (232
cases, unchanged — `TrickHost.tsx`'s protocol-adjacent logic stays
covered through `protocol.test.ts`'s pure functions, matching this file's
existing test split; no new test file was added for the component
itself).

Ran the real server (`node dist/index.js`) against a scratch vault
holding the renamed `mender` trick plus an unmodified copy of
`_plantillas/formulario` registered as a second trick. `GET /api/tricks`
and `GET /api/tricks/:name` in English, then again after
`POST /api/settings {"language":"es"}`: `mender`'s `titulo`/`descripcion`
switched to the Spanish half of its manifest; `formulario`'s plain-string
`titulo`/`descripcion` were byte-identical in both languages, confirming
the backward-compatible arm untouched by an author who never opts in.
Minted a mount token, fetched the entrada and a subresource, and called
`POST /api/tricks/mender/bridge` with `vault.query` directly — all real
HTTP against the real server, all succeeded.

**No real browser was available in this session** (the Chrome extension
bridge this environment normally uses to drive one wasn't connected), so
the in-frame JavaScript — `bridge.js`'s token/theme application, `app.js`'s
language table — was verified a different way: loaded the exact shipped
`bridge.js` and `app.js` into a Node `vm` context wired up with a real
`node:worker_threads` `MessageChannel` (not a mock — an actual
`MessagePort` pair) and a minimal hand-rolled DOM (`getElementById`,
`setAttribute`, `style.setProperty`), then dispatched a hello carrying
`tema`, `locale` and `tokens` exactly as `TrickHost.tsx` builds it.
Observed directly: `data-tema` set on the root element; every
`tokens.*` field landed on `:root` as the matching `--host-<kebab-name>`
custom property; the "Show answered" button, the footer and the empty-state
paragraph rendered in Spanish for `locale: "es"` and English for
`locale: "en"`. Then posted a second message shaped like the host's live
`tema` event (`{ev:"tema", valor:"claro", tokens:{...}}`) over the already-
open port and confirmed both `data-tema` and every `--host-*` value updated
again — the theme-flip path, not just the initial mount. One real gotcha
hit and worth recording for the next person who reaches for `vm` this way:
`vm.createContext(sandbox)` does **not** make the vm's internal global
object strictly `===` to the `sandbox` reference held outside — a naive
`ev.source === window.parent` check (exactly what `bridge.js` itself uses
to authenticate the host) silently failed until the *true* internal
global was fetched with `vm.runInContext("window", sandbox)` and used for
`ev.source` instead of the outer `sandbox` object. Not independently
re-verified: real CSSOM/layout rendering, and Safari/Firefox — the same
class of gap `panel/docs/tricks-spec.md` §14 already carries for the rest
of the trick sandbox.

Reproduced the Angela's-deployment migration gap directly rather than
only reasoning about it: built a second scratch vault with
`.claude/tricks/vault-steward/` and `.claude/skills/vault-steward/` (a
plain directory rename of a pre-2026-08-16 install, simulating a
deployment that synced before this change), then ran
`sync-vault-template.py sync` against the real `vault-template/` checkout.
Confirmed exactly the predicted shape: the sync added
`.claude/tricks/mender/**` and `.claude/skills/mender/**` as ordinary new
machinery, raised no conflict card, and left `.claude/tricks/vault-steward/`
sitting untouched on disk — `ls .claude/tricks` after the sync shows both
`mender` and `vault-steward` side by side. `sync-vault-template.py sync
--dry-run` against a vault that already had the new paths (a fresh copy of
`vault-template/`) reported 56 classified paths, 0 unclassified, and
nothing to commit. `vault-lint` reported no broken links and no missing
indexes on the same fresh scratch vault. `mender.py check` (not dry-run)
regenerated `steward/index.md` with the new "Mender findings" title and
wrote a real card, which the running server's live index picked up and
served correctly through `vault.query` on the bridge — confirming the
rename didn't disturb the Mender's own read/write path into `steward/`.
