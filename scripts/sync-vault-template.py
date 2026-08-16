#!/usr/bin/env python3
"""
Sync vault-template/ machinery into a live deployment's vault, and report
what changed in the seed paths so a human can hand-merge.

    sync-vault-template.py sync --vault ~/raymond-brain --base ~/raymond/vault-template
    sync-vault-template.py sync --dry-run   # report only, writes and commits nothing

Defaults: --vault is $HOME/raymond-brain, --base is the vault-template/
sibling of this script's own repo (i.e. this script assumes it is being
run from a checkout of the base package, same as `_tools/steward.py`
assumes it lives inside the vault it checks — see that file's own
`--vault` comment).

docs/roadmap.md §13 is the spec. `UPDATE-MANIFEST.md`, next to the
`vault-template/` this reads from, is the classification this script
reads rather than guessing per-file — see that file for *why* each path
is machinery, seed, or excluded; this file is only the *how*.

THE CONFLICT-DETECTION PROBLEM, stated once, here, because it is the
part most likely to be got wrong (docs/roadmap.md §13's own words):

    "Different from upstream" and "customized by the deployment" are
    NOT the same question, and a sync that conflates them will silently
    destroy someone's edit the first time both happen at once.

The fix is a stored hash, not git archaeology. `.claude/template-sync.md`
in the vault records, for every machinery path, the content hash it had
the last time this script touched it — the "baseline". Every run
computes three hashes per machinery path — the baseline, the deployment's
current copy, and the base package's current copy — and only one of the
eight combinations is genuinely ambiguous:

    baseline  local  base    action
    --------  -----  ----    ------
       -       -      X      seed it — nothing local to lose
       X       X      X      already identical everywhere — no-op
       X      =base   !=X    base moved, local didn't — SAFE: overwrite
       X      !=base  =base  local moved, base didn't — a deployment
                              customization with nothing new to apply;
                              not a conflict, not reported
       X      !=base !=base  BOTH moved since the baseline — conflict,
                              a card, nothing written
       -      !=base   X     never synced before and they already
                              differ — cannot tell customization from
                              ordinary pre-feature drift — conflict,
                              a card, nothing written

Git history was considered instead of a stored hash (docs/roadmap.md §13
raises both) and rejected for this vault specifically: `steward.py move`
rewrites files outside a plain edit, a squash or an Obsidian sync tool
can flatten history, and "does this content match some commit this vault
ever synced from" needs a full walk of that history on every machinery
path, every run. A content hash is one `sha1()` call, is exact, and does
not care how the local copy came to be what it is.

Findings that need a human are written as cards in `steward/`, in the
same shape `_tools/steward.py` already uses (read that file's `Finding`
class before touching this one) — same frontmatter fields, same
`estado`/`decision`/`respondido` answer flow, same "never put a broken
target inside `[[ ]]`" rule. This script also *reads* answered cards of
its own kind at the top of every run, before diffing anything, so
answering a conflict is picked up by the very next scheduled run with no
second command to remember.

Runs inside the vault's own git repo and commits what it writes — the
vault has no ancestry relationship to the base package
(docs/roadmap.md §13), so the vault's own history is the only place a
"what did the sync do and can I revert it" question can be answered
(README rule 1). A run with nothing to do commits nothing: the vault's
git log is a record of real changes, not a heartbeat.

Stdlib only — same reason `_tools/steward.py` is: this runs from cron on
a box where nobody has pip-installed anything.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

STEWARD_DIR = "steward"
MARKER_PATH = ".claude/template-sync.md"
MANIFEST_NAME = "UPDATE-MANIFEST.md"
CONFLICT_KIND = "template-sync-conflict"


# ---------------------------------------------------------------------------
# The manifest — three fenced code blocks in UPDATE-MANIFEST.md, in the
# base checkout, never copied into any vault (see that file's own header).
# ---------------------------------------------------------------------------


def read_manifest(base: Path) -> tuple[list[str], list[str], list[str]]:
    """-> (machinery_patterns, seed_patterns, excluded_patterns).

    Parses the three ``` fenced blocks under "## Machinery", "## Seed"
    and "## Excluded" — not the whole document, so prose explaining an
    ambiguous case can say anything without confusing the parser. A
    manifest that fails to parse is a bug in the manifest or this
    function, not something to silently work around with a guess — that
    guess is exactly what roadmap §13 says not to do.
    """
    path = base / MANIFEST_NAME
    if not path.is_file():
        sys.exit(f"error: no {MANIFEST_NAME} at {path} — is --base a "
                  f"vault-template/ checkout?")
    text = path.read_text(encoding="utf-8")
    sections = {"Machinery": [], "Seed": [], "Excluded": []}
    current = None
    in_block = False
    for line in text.split("\n"):
        h = re.match(r"^##\s+(Machinery|Seed|Excluded)\b", line)
        if h:
            current = h.group(1)
            in_block = False
            continue
        if current and line.strip() == "```":
            in_block = not in_block
            continue
        if current and in_block and line.strip():
            sections[current].append(line.strip())
    for name, patterns in sections.items():
        if not patterns:
            sys.exit(f"error: {MANIFEST_NAME}'s \"{name}\" section has no "
                      f"patterns — parsing bug, or the file's shape changed "
                      f"and this script didn't")
    return sections["Machinery"], sections["Seed"], sections["Excluded"]


def expand(root: Path, pattern: str) -> list[str]:
    """Pattern -> sorted relative paths (files only) that exist under root.

    `**` at the end means "everything below this directory, any depth".
    Anything else goes straight to `Path.glob`, which already understands
    a single `*` as one path segment — exactly what `_tools/*` and
    `.claude/skills/*/SKILL.md` need and no more.
    """
    if pattern.endswith("/**"):
        base_dir = root / pattern[:-3]
        if not base_dir.is_dir():
            return []
        return sorted(
            str(p.relative_to(root)) for p in base_dir.rglob("*") if p.is_file()
        )
    return sorted(
        str(p.relative_to(root)) for p in root.glob(pattern) if p.is_file()
    )


def classify(base: Path) -> tuple[dict[str, str], list[str]]:
    """-> ({relpath: "machinery" | "seed" | "excluded"}, unclassified_paths)

    Every file physically present under `base` that isn't matched by any
    pattern is unclassified — treated as seed (report, never write) per
    the manifest's own stated fallback, and returned separately so the
    caller can print one loud warning per path rather than pretend
    nothing is missing from the manifest.
    """
    machinery_pat, seed_pat, excluded_pat = read_manifest(base)
    result: dict[str, str] = {}
    for pat in machinery_pat:
        for p in expand(base, pat):
            result[p] = "machinery"
    for pat in seed_pat:
        for p in expand(base, pat):
            result.setdefault(p, "seed")
    for pat in excluded_pat:
        for p in expand(base, pat):
            result[p] = "excluded"

    all_files = {
        str(p.relative_to(base)) for p in base.rglob("*")
        if p.is_file()
        # Dotted directories other than .claude are tooling (.git, .obsidian,
        # …), same exclusion linkcheck.py and steward.py both make.
        and not any(part.startswith(".") and part != ".claude"
                    for part in p.relative_to(base).parts[:-1])
        and p.name != MANIFEST_NAME
    }
    unclassified = sorted(all_files - set(result))
    for p in unclassified:
        result[p] = "seed"  # the safe direction — see the manifest's own fallback section
    return result, unclassified


# ---------------------------------------------------------------------------
# Hashing and git plumbing
# ---------------------------------------------------------------------------


def sha1(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha1(path.read_bytes()).hexdigest()


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def git_head(repo: Path) -> str | None:
    r = run(["git", "rev-parse", "HEAD"], repo)
    return r.stdout.strip() if r.returncode == 0 else None


def git_commit(vault: Path, message: str, dry: bool) -> bool:
    """Stage everything and commit only if something is actually staged —
    `git commit` with nothing to commit is an error, and treating that as
    a failure would make a genuine no-op run look broken."""
    if dry:
        return False
    run(["git", "add", "-A"], vault)
    diff = run(["git", "diff", "--cached", "--quiet"], vault)
    if diff.returncode == 0:
        return False  # nothing staged
    r = run(["git", "commit", "-q", "-m", message], vault)
    if r.returncode != 0:
        print(f"error: git commit failed in {vault}: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return True


# ---------------------------------------------------------------------------
# The version marker — .claude/template-sync.md
# ---------------------------------------------------------------------------
#
# Regenerated in full every run that changes something, the same way
# `_tools/steward.py` owns and wholesale-rewrites `steward/index.md` —
# this file is machine state, not a note a human hand-edits, and trying
# to surgically patch YAML with regexes (steward.py does that for real
# notes, carefully, because it must never reflow someone's frontmatter)
# would be solving a problem this file doesn't have.


def load_marker(vault: Path) -> tuple[dict[str, str], list[str]]:
    """-> ({relpath: baseline_hash}, [old "## Runs" table row strings])

    Missing file (first run ever) is not an error: every machinery path
    is then treated as baseline-less, which is exactly right (see the
    module docstring's table).
    """
    p = vault / MARKER_PATH
    if not p.is_file():
        return {}, []
    text = p.read_text(encoding="utf-8")
    baseline: dict[str, str] = {}
    m = re.search(r"```text\n(.*?)\n```", text, re.S)
    if m:
        for line in m.group(1).split("\n"):
            parts = line.split()
            if len(parts) == 2:
                baseline[parts[0]] = parts[1]
    runs_m = re.search(r"## Runs\n\n\|.*?\|\n\|[-| ]+\|\n(.*?)(?:\n\n|\Z)", text, re.S)
    old_rows = [l for l in (runs_m.group(1).split("\n") if runs_m else []) if l.strip()]
    return baseline, old_rows


def write_marker(vault: Path, base_repo: str, base_commit: str | None,
                  new_baseline: dict[str, str], old_rows: list[str],
                  run_summary: dict, dry: bool) -> None:
    today = str(date.today())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    baseline_lines = "\n".join(f"{k}  {v}" for k, v in sorted(new_baseline.items()))
    new_row = (f"| {now} | {base_commit or 'unknown'} | "
               f"{run_summary['machinery_updated']} | {run_summary['conflicts']} | "
               f"{run_summary['seed_changed']} |")
    rows = (old_rows + [new_row])[-50:]  # cap like a job note's log rotation would, informally

    text = f"""---
titulo: Template sync state
tipo: referencia
area: meta
estado: activo
actualizado: {today}
etiquetas: [meta, sync]
cuando-usar: "Read before debugging or re-running scripts/sync-vault-template.py. Machine state, not a note to hand-edit — see its own header comment for why."
sync:
  base_repo: "{base_repo}"
  last_base_commit: "{base_commit or ''}"
  last_synced: "{now}"
---

# Template sync state

Which base-package commit this vault's **machinery** paths (see
`UPDATE-MANIFEST.md` in the base checkout — `_tools/*`, the base skills,
the `vault-steward` trick) were last synced from, and the per-path
content hash recorded at that moment. That hash is what lets the next
run tell "the base package changed this" apart from "this vault edited
it" — see `scripts/sync-vault-template.py`'s own header comment for the
full three-way logic. **Owned by that script; hand-editing this file can
make its conflict detection wrong in either direction.**

## Baseline hashes

Regenerated in full every run that changes anything — same discipline
`_tools/steward.py` uses for `steward/index.md`, and for the same
reason: a file a script owns entirely is safe to rewrite wholesale, and
trying to patch it surgically only invites the two copies drifting.

```text
{baseline_lines}
```

## Runs

One row per run that changed something. A run with nothing to do does
not add a row here — this table is a record of real changes, not a
heartbeat; see `.claude/jobs/` if you want the latter.

| When (UTC) | Base commit | Machinery updated | Conflicts raised | Seed diffs reported |
|---|---|---|---|---|
{chr(10).join(rows)}
"""
    if not dry:
        p = vault / MARKER_PATH
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Conflict cards — steward/, same shape _tools/steward.py's Finding writes
# ---------------------------------------------------------------------------


def _emit(value: str) -> str:
    s = "" if value is None else str(value)
    if s == "":
        return '""'
    if s[0] in "\"'[{&*!|>%@`#-?" or s[-1] == " " or ": " in s or s.endswith(":"):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def conflict_fingerprint(path: str, local_hash: str, base_hash: str) -> str:
    raw = f"{CONFLICT_KIND}|{path}|{local_hash}|{base_hash}"
    return hashlib.sha1(raw.encode()).hexdigest()[:10]


def existing_conflict_fingerprints(vault: Path) -> dict[str, Path]:
    out = {}
    d = vault / STEWARD_DIR
    if not d.is_dir():
        return out
    for p in d.glob("*.md"):
        text = p.read_text(encoding="utf-8", errors="replace")
        if f"kind: {CONFLICT_KIND}" not in text:
            continue
        m = re.search(r"fingerprint:\s*(\S+)", text)
        if m:
            out[m.group(1)] = p
    return out


def write_conflict_card(vault: Path, path: str, local_hash: str, base_hash: str,
                         baseline_hash: str | None, dry: bool) -> str | None:
    fp = conflict_fingerprint(path, local_hash, base_hash)
    if fp in existing_conflict_fingerprints(vault):
        return None  # already carded, same fingerprint — same rule steward.py's sync_findings uses

    today = str(date.today())
    slug = re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")
    name = f"template-sync-{slug}"[:56].rstrip("-") + ".md"
    dest = vault / STEWARD_DIR / name
    i = 2
    while dest.exists():
        dest = vault / STEWARD_DIR / f"{name[:-3]}-{i}.md"
        i += 1

    if baseline_hash is None:
        origin = ("This vault has never been through a template sync before, or this "
                   "specific machinery path hasn't. There is no recorded baseline to "
                   "compare against, so there's no way to tell whether this vault's "
                   "copy was deliberately edited or has simply never matched the base "
                   "package exactly.")
    else:
        origin = (f"Both this vault's copy and the base package's copy have changed "
                   f"since the last sync (baseline hash `{baseline_hash[:10]}…`).")

    titulo = f"`{path}` can't be synced automatically — it and the base package both changed"
    pregunta = "Keep this vault's version, or take the base package's newer one?"
    body = f"""# {titulo}

**{pregunta}**

`{path}` is machinery (`UPDATE-MANIFEST.md`, in the base checkout,
classifies it as a path nobody customizes per-deployment — normally the
sync overwrites it automatically when the base package changes it).
{origin} Picking one side automatically would either lose whatever
changed here or ignore what the base package now ships, so neither
happened — this card is instead of a guess.

## Answering

Type into `respuesta:` in the frontmatter above — in the panel, or any
editor:

- **"take theirs"** (or "upstream" / "base package") — the next sync run
  overwrites this vault's copy with the base package's current version
  and re-baselines, so this stops being flagged.
- anything else, including leaving it blank — read as **"keep mine"**:
  the next sync run leaves the file exactly as it is here and
  re-baselines to *this vault's current content*, so this specific
  difference from the base package also stops being flagged. If the
  base package changes this file again later, a fresh card appears.

Then set `decision:` to `aplicar` and `estado:` to `respondido`. Set
`decision:` to `descartar` instead to close this without changing
anything or re-baselining — it will be raised again next run if the
underlying difference is still there.

Nothing else touches `{path}` until this is answered.
"""
    fm = "\n".join([
        "---",
        f"titulo: {_emit(titulo)}",
        "tipo: hallazgo",
        "area: meta",
        "estado: abierto",
        f"actualizado: {today}",
        f"etiquetas: [steward, {CONFLICT_KIND}]",
        f"cuando-usar: {_emit('Answer this to resolve: ' + pregunta)}",
        f"pregunta: {_emit(pregunta)}",
        'respuesta: ""',
        'decision: ""',
        'respondido: ""',
        "finding:",
        f"  kind: {CONFLICT_KIND}",
        "  source: deterministic",
        "  confidence: high",
        f"  fingerprint: {fp}",
        f"  detected: {today}",
        f"  path: {path}",
        "  proposal:",
        "    action: template-sync-resolve",
        f"    path: {path}",
        "---",
        "",
    ])
    if not dry:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(fm + body, encoding="utf-8")
    return str(dest.relative_to(vault))


# ---------------------------------------------------------------------------
# Resolving answered conflict cards — read before diffing anything new,
# so the very next scheduled run picks up an answer with no second command.
# ---------------------------------------------------------------------------


def resolve_answered(vault: Path, base: Path, baseline: dict[str, str], dry: bool) -> list[str]:
    """-> list of report lines. Mutates `baseline` in place for anything resolved."""
    lines = []
    d = vault / STEWARD_DIR
    if not d.is_dir():
        return lines
    for p in sorted(d.glob("*.md")):
        text = p.read_text(encoding="utf-8", errors="replace")
        if f"kind: {CONFLICT_KIND}" not in text or "estado: respondido" not in text:
            continue
        path_m = re.search(r"^\s*path:\s*(\S+)", text, re.M)
        decision_m = re.search(r"^decision:\s*\"?([a-z]*)\"?", text, re.M)
        respuesta_m = re.search(r'^respuesta:\s*"?(.*?)"?\s*$', text, re.M)
        if not path_m:
            continue
        rel = path_m.group(1)
        decision = (decision_m.group(1) if decision_m else "").strip()
        respuesta = (respuesta_m.group(1) if respuesta_m else "").strip().lower()

        if decision == "descartar":
            lines.append(f"conflict card {p.relative_to(vault)}: discarded, {rel} untouched")
            new_state, new_estado = None, "descartado"
        elif decision == "aplicar":
            take_upstream = any(w in respuesta for w in ("theirs", "upstream", "base package", "base"))
            local_path, base_path = vault / rel, base / rel
            if take_upstream and base_path.is_file():
                if not dry:
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    local_path.write_bytes(base_path.read_bytes())
                baseline[rel] = sha1(base_path)
                lines.append(f"conflict card {p.relative_to(vault)}: took upstream, {rel} overwritten")
            else:
                baseline[rel] = sha1(local_path)
                lines.append(f"conflict card {p.relative_to(vault)}: kept local, {rel} re-baselined")
            new_estado = "aplicado"
        else:
            lines.append(f"conflict card {p.relative_to(vault)}: estado is respondido but "
                          f"decision is '{decision or 'empty'}', expected aplicar or descartar — left open")
            continue

        if not dry:
            new_text = re.sub(r"^estado:.*$", f"estado: {new_estado}", text, count=1, flags=re.M)
            new_text = re.sub(r"^actualizado:.*$", f"actualizado: {date.today()}", new_text, count=1, flags=re.M)
            p.write_text(new_text, encoding="utf-8")
    return lines


# ---------------------------------------------------------------------------
# The sync itself
# ---------------------------------------------------------------------------


def cmd_sync(vault: Path, base: Path, dry: bool) -> int:
    if not (vault / ".git").is_dir():
        print(f"error: {vault} is not a git repo — the sync must run inside "
              f"the vault's own git repo so every change is a commit (rule 1)", file=sys.stderr)
        return 1
    if not base.is_dir():
        print(f"error: no base checkout at {base}", file=sys.stderr)
        return 1

    classified, unclassified = classify(base)
    if unclassified:
        print(f"WARNING: {len(unclassified)} path(s) in the base checkout match no "
              f"pattern in {MANIFEST_NAME} — treated as seed (never written), but this "
              f"means the manifest is out of date:")
        for p in unclassified:
            print(f"  {p}")

    baseline, old_rows = load_marker(vault)
    base_commit = git_head(base)
    base_repo = "https://github.com/DavidCorredorM/raymond"

    resolved_lines = resolve_answered(vault, base, baseline, dry)

    updated: list[str] = []
    conflicts: list[str] = []
    removed_upstream: list[str] = []
    seed_diffs: list[tuple[str, str]] = []
    new_baseline = dict(baseline)

    for rel, kind in sorted(classified.items()):
        base_file = base / rel
        local_file = vault / rel

        if kind == "excluded":
            continue

        if kind == "machinery":
            bh = sha1(base_file)
            lh = sha1(local_file)
            lb = baseline.get(rel)

            if bh is None:
                removed_upstream.append(rel)
                continue
            if lh is None:
                if not dry:
                    local_file.parent.mkdir(parents=True, exist_ok=True)
                    local_file.write_bytes(base_file.read_bytes())
                updated.append(rel)
                new_baseline[rel] = bh
                continue
            if lh == bh:
                new_baseline[rel] = bh
                continue
            if lb is not None and lh == lb:
                # unmodified since last sync, base moved — safe
                if not dry:
                    local_file.write_bytes(base_file.read_bytes())
                updated.append(rel)
                new_baseline[rel] = bh
                continue
            if lb is not None and bh == lb:
                # base unmodified since last sync, local moved — a
                # deployment customization with nothing new to apply
                new_baseline[rel] = lb
                continue
            # both moved since baseline (or there never was one) — conflict
            card = write_conflict_card(vault, rel, lh, bh, lb, dry)
            if card:
                conflicts.append(card)
            if lb is not None:
                new_baseline[rel] = lb  # leave untouched until answered
            continue

        # seed — and the unclassified fallback, which the manifest's own
        # "Unclassified paths" section promises is "reported if
        # different, never written". That promise only holds if this
        # branch actually treats the two differently: a *known* seed
        # path missing locally is filled in once, the same gap-filling
        # bootstrap.sh's own copy would have closed if the path had
        # existed at install time (a deployment installed before the
        # base package added it). An *unclassified* path is new to the
        # base package and has not been through a human decision about
        # what it even is yet — writing it into every vault before that
        # decision is made is the "guessing per-file" roadmap §13 warns
        # against, just guessed by omission instead of by cleverness.
        bh, lh = sha1(base_file), sha1(local_file)
        if lh is None and bh is not None:
            if rel in unclassified:
                seed_diffs.append((rel, kind))  # reported below as "new upstream, not yet classified"
            else:
                if not dry:
                    local_file.parent.mkdir(parents=True, exist_ok=True)
                    local_file.write_bytes(base_file.read_bytes())
            continue
        if bh is not None and lh != bh:
            seed_diffs.append((rel, kind))

    # Only rewrite the marker — and only add a "Runs" row — when the
    # baseline table actually changed, or a conflict card's answer was
    # just carried out. `write_marker` always stamps the current time
    # into `last_synced`, so calling it unconditionally would make every
    # run's marker differ from the last one by that timestamp alone —
    # a spurious commit on a run that did nothing, which is exactly the
    # "clean no-op, not... spurious diffs" requirement this script is
    # verified against (see the scratch-setup walkthrough this shipped
    # with). A conflict raised but left unanswered does not change
    # `new_baseline` (see the loop above) and correctly does not, on its
    # own, cause a rewrite either — the card it already wrote is enough
    # of a trail, and it will keep reappearing in the report every run
    # until it's answered.
    marker_dirty = (new_baseline != baseline) or bool(resolved_lines) \
        or not (vault / MARKER_PATH).is_file()
    if marker_dirty:
        write_marker(vault, base_repo, base_commit, new_baseline, old_rows, {
            "machinery_updated": len(updated),
            "conflicts": len(conflicts),
            "seed_changed": len(seed_diffs),
        }, dry)

    committed = False
    if not dry:
        msg_lines = [f"template sync: from base {(base_commit or 'unknown')[:12]}", ""]
        if updated:
            msg_lines.append(f"Machinery updated ({len(updated)}):")
            msg_lines += [f"  {p}" for p in updated]
        if conflicts:
            msg_lines.append(f"Conflicts raised ({len(conflicts)}), left untouched:")
            msg_lines += [f"  {p}" for p in conflicts]
        if resolved_lines:
            msg_lines.append("Resolved from a previous run's answers:")
            msg_lines += [f"  {l}" for l in resolved_lines]
        msg_lines.append("")
        msg_lines.append("Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>")
        committed = git_commit(vault, "\n".join(msg_lines), dry)

    # --- report ---
    tag = " (--dry-run, nothing written)" if dry else ""
    print(f"template sync{tag} — base {base_commit or 'unknown'}")
    print(f"  {len(classified) - len(unclassified)} classified path(s), "
          f"{len(unclassified)} unclassified (treated as seed)\n")
    for l in resolved_lines:
        print(f"  {l}")
    print("Machinery updated" if updated else "Machinery updated: none")
    for p in updated:
        print(f"  {p}")
    print("Conflicts (cards written to steward/)" if conflicts else "Conflicts: none")
    for p in conflicts:
        print(f"  {p}")
    if removed_upstream:
        print("Machinery the base package no longer ships (left as-is):")
        for p in removed_upstream:
            print(f"  {p}")
    print("Seed diffs (report only, nothing written)" if seed_diffs else "Seed diffs: none")
    for p, kind in seed_diffs:
        mark = " [unclassified — see WARNING above]" if kind != "seed" or p in unclassified else ""
        print(f"  {p}{mark}")
    print(f"\n{'would commit' if dry and (updated or conflicts or resolved_lines) else 'committed' if committed else 'nothing to commit'}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sync", help="sync machinery, report seed diffs, resolve answered conflicts")
    s.add_argument("--vault", default=str(Path.home() / "raymond-brain"))
    s.add_argument("--base", default=str(Path(__file__).resolve().parent.parent / "vault-template"))
    s.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    base = Path(args.base).expanduser().resolve()
    if not vault.is_dir():
        print(f"error: no vault at {vault}", file=sys.stderr)
        return 2
    return cmd_sync(vault, base, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
