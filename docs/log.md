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
