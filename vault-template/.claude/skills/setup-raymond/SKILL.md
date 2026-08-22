---
name: setup-raymond
description: First-run onboarding for a brand-new vault — asks how the vault should be shaped (personal vs. one-or-more companies), sets the UI language, and offers to bring the web panel up as a standing service. Use when index.md still says "Nothing here yet", when the user asks to finish setting up Raymond, or right after scripts/bootstrap.sh has created this vault.
---

# Set up a fresh Raymond vault

Whichever bootstrap script got this vault here — `scripts/bootstrap.sh`
on Linux, `scripts/bootstrap-macos.sh` on a Mac, or `bootstrap.sh` again
inside a WSL2 shell on Windows (`docs/DEPLOYMENT.md` covers all three)
— already did the machine-level work: Node, Claude Code, Tailscale
installed, this vault skeleton created. What it deliberately left undone
is everything that's a *choice*, not a default: what the vault is
organized around, what language the panel speaks, and whether the panel
runs as a standing service. That's this skill. **Don't assume the
machine is Ubuntu** — check `uname` (`Linux` vs `Darwin`) before step 3
below, which differs by OS.

Run this once, interactively, the first time Claude Code opens in a
fresh vault. Recognize "fresh" by `index.md` still holding its "Nothing
here yet" placeholder. If it doesn't, the vault has already been shaped
— don't re-run this unprompted, the user asked for it explicitly instead.

Do the three things below in order. Each is a real question — don't
guess an answer to save a round trip, and don't do all three silently
and report at the end. A wrong guess here is expensive: it's the shape
of every note this person writes from now on.

## 1. Ask what the vault is for

Two shapes cover the cases seen so far:

**Personal** (the default this template already ships as): `daily/`,
`notes/`, `projects/`, `reference/`. One person, one body of notes. If
this is what they want, there's nothing to restructure — skip to step 2.

**One or more companies.** Ask for the company name(s). Restructure:

```
companies/<company-slug>/
```

one folder per company, each getting its own `index.md` (copy
`_templates/index-template.md`). If there's more than one company **and**
they share people, projects, or facts across them, also create
`holding/` for the shared material — but only if the user actually
describes that overlap; don't create it speculatively for a single
company or for companies with nothing in common.

The load-bearing detail, from the one real deployment built this way:
**the filter is a frontmatter field, not the folder.** Add `company:
<slug>` (or `company: holding`) to the required frontmatter — every
note carries it, `_templates/note-template.md` and
`_templates/index-template.md` get it added, and it's what lets one
panel dashboard serve every company at once instead of needing a
dashboard each. Update `conventions.md`'s frontmatter table and
`_tools/vault-lint` to check for the field. Leave `daily/` and
`reference/` as they are — a daily log and reference material aren't
usually company-specific; ask if this user's case is the exception
before folding them into `companies/`.

Whichever shape is chosen, update the root `index.md` to describe the
real structure (replace the "Nothing here yet" placeholder) and update
`CLAUDE.md` if it names folders explicitly.

Don't touch the frontmatter schema's language (`titulo`/`tipo`/`estado`/
`cuando-usar` etc.) as part of this — that's a separate, known,
already-tracked concern (`docs/roadmap.md`), not something to improvise
mid-onboarding.

## 2. Ask what language the panel should speak

English is the shipped default; Spanish is the other supported option
today (`panel/web/src/i18n/messages.ts`). Ask, don't assume from the
user's own language in conversation — the panel's audience may not be
the person setting it up.

Set it either by pointing them at the panel's own Settings screen once
it's running (step 3), or immediately via `config.json` so it's right
from the first launch. That file lives next to wherever the server
process runs (`~/raymond/panel/server/config.json` by default, or
wherever `$SBP_CONFIG` points — see `panel/server/src/config.ts`), not
in the vault:

```sh
echo '{"language":"es"}' > ~/raymond/panel/server/config.json  # or "en"
```

If a `config.json` already exists there (e.g. `vaultDir` already set),
merge the `language` key in rather than overwriting the file — don't
blow away an existing setting to add this one.

## 3. Offer to bring the panel up as a standing service

This is the part of `panel/deploy/README.md` that needs a decision, not
just commands — ask before doing it, since it changes what's running on
the machine persistently. If yes, build first either way:

```sh
cd ~/raymond/panel/server && npm install && npx tsc -p tsconfig.json
```

Then the service step, and it genuinely differs by OS — check `uname`
rather than guessing from context:

**Linux (`uname` says `Linux`) — systemd:**

```sh
mkdir -p ~/.config/systemd/user
cp ~/raymond/panel/deploy/raymond-panel.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now raymond-panel
sudo loginctl enable-linger $USER
```

The `enable-linger` step needs `sudo` and is easy to skip by accident —
without it the panel dies the moment the SSH session that started it
ends. Confirm it actually took (`loginctl show-user $USER -p Linger`)
rather than assuming the command succeeded. Verify with `systemctl
--user status raymond-panel`.

**macOS (`uname` says `Darwin`) — launchd:** full steps in
`panel/deploy/README.md`'s "On macOS" section (`com.raymond.panel.plist`
needs `$HOME` substituted in before it's installed — launchd doesn't
expand it). Verify with `launchctl print gui/$(id -u)/com.raymond.panel`.

Either way, confirm the panel is actually reachable from another device
on the tailnet before calling this done, not just that the service
reports running — `docs/DEPLOYMENT.md` step 7 has the full verify
checklist, including the extra WSL2/Windows-specific reachability check
if that's the platform (`docs/09-windows-wsl2.md`).

## When you're done

Report back in the vault, not just in chat: update `index.md` (already
required by step 1) and, if this is a company-shaped vault, mention in
`daily/` today's entry that onboarding ran and what was decided — this
is the same "a run that left no file didn't happen" rule every other
skill here follows (README rule 4).
