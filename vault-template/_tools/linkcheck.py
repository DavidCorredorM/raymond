#!/usr/bin/env python3
"""
Report wiki-links that resolve to nothing.

Split out of vault-lint because correct resolution is not a one-liner and
a wrong link checker is worse than none: it reported 764 broken links on a
vault that actually had 82, which trains you to ignore it.

Obsidian accepts three link forms and real vaults mix all of them:

    [[note]]                  bare name, matched against every basename
    [[folder/note]]           path from the vault root
    [[../sibling/note]]       path relative to the linking note

Extensions are optional in all three. Aliases and headings are stripped:
`[[target|alias]]`, `[[target#heading]]`. Inside markdown tables the pipe
is escaped, so `[[target\\|alias]]` leaves a trailing backslash that must
come off or the link never resolves.

Usage:  linkcheck.py <vault-dir>
Exits 1 if anything is broken, so it can gate a commit.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")

# Machinery that happens to be markdown. Judged by different rules, or
# by none. Mirrors isNote() in the panel — keep the two in step.
SKIP_PREFIXES = (".claude/", "_templates/", "_tools/", ".git/")
SKIP_NAMES = ("CLAUDE.md",)


def is_note(rel: str) -> bool:
    if any(rel.startswith(p) for p in SKIP_PREFIXES):
        return False
    return Path(rel).name not in SKIP_NAMES


def normalise(path: str) -> str:
    out: list[str] = []
    for seg in path.split("/"):
        if not seg or seg == ".":
            continue
        if seg == "..":
            if out:
                out.pop()
        else:
            out.append(seg)
    return "/".join(out)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: linkcheck.py <vault-dir>", file=sys.stderr)
        return 2
    vault = Path(sys.argv[1]).expanduser().resolve()

    # Dotfiles are tooling, not notes. Scratch files like an agent task
    # brief live alongside the vault and contain example links that would
    # otherwise count as broken and skew the gate.
    rels = [
        str(p.relative_to(vault))
        for p in vault.rglob("*.md")
        if not any(part.startswith(".") for part in p.relative_to(vault).parts)
    ]
    by_path = {r[:-3] for r in rels}          # without .md
    by_name: dict[str, int] = {}
    for r in rels:
        by_name[Path(r).stem] = by_name.get(Path(r).stem, 0) + 1

    broken: list[tuple[str, str]] = []
    for rel in sorted(rels):
        if not is_note(rel):
            continue
        text = (vault / rel).read_text(encoding="utf-8", errors="replace")
        seen: set[str] = set()
        for m in WIKILINK.finditer(text):
            target = m.group(1).strip().rstrip("\\").strip()
            if not target or target in seen:
                continue
            seen.add(target)
            clean = target[:-3] if target.lower().endswith(".md") else target

            if clean in by_name:                       # bare name
                continue
            if clean in by_path:                       # vault-root relative
                continue
            parent = str(Path(rel).parent)
            base = "" if parent == "." else parent
            if normalise(f"{base}/{clean}" if base else clean) in by_path:
                continue                               # note-relative
            broken.append((rel, target))

    for rel, target in broken:
        print(f"  {rel:60.60} -> [[{target}]]")
    if not broken:
        print("  none")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
