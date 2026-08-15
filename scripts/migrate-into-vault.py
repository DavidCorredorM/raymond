#!/usr/bin/env python3
"""
Migrate one or more source vaults into a single vault under companies/.

    ./migrate-into-vault.py --target ~/vault-new \
        --source ~/staging/vault-icpp:icpp \
        --source ~/staging/vault-sigra:sigra \
        --skeleton ~/raymond/vault-template

Non-destructive: sources are copied, never moved. Re-runnable — the target
is rebuilt from scratch each time unless it contains unexpected content.

Why relative links survive this: moving an entire vault root into a
subfolder preserves every path *within* it, so `../../01-Comercial/x`
resolves the same before and after. Links that break were already broken.

Frontmatter is edited as text, one line inserted, rather than parsed and
re-serialised. Round-tripping through a YAML library would reformat every
note — quoting, key order, comments — producing a huge diff that hides
the actual change and is impossible to review.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

IGNORE = shutil.ignore_patterns(".obsidian", ".git", ".DS_Store", "._*", ".trash")


def parse_source(spec: str) -> tuple[Path, str]:
    if ":" not in spec:
        sys.exit(f"--source must be PATH:COMPANY, got: {spec}")
    raw, company = spec.rsplit(":", 1)
    path = Path(raw).expanduser().resolve()
    if not path.is_dir():
        sys.exit(f"No such source vault: {path}")
    if not company.isidentifier():
        sys.exit(f"Company must be a simple identifier, got: {company}")
    return path, company


def add_company_field(md: Path, company: str) -> str:
    """Insert `company: <name>` into frontmatter. Returns what it did."""
    text = md.read_text(encoding="utf-8")
    lines = text.split("\n")

    if not lines or lines[0].strip() != "---":
        # No frontmatter. Add a minimal block rather than skipping — a note
        # without frontmatter is invisible to every retrieval path we have.
        header = ["---", f"company: {company}", "estado: activo", "---", ""]
        md.write_text("\n".join(header) + text, encoding="utf-8")
        return "added-frontmatter"

    try:
        close = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    except StopIteration:
        return "malformed-frontmatter"

    for line in lines[1:close]:
        if line.startswith("company:"):
            return "already-tagged"

    lines.insert(close, f"company: {company}")
    md.write_text("\n".join(lines), encoding="utf-8")
    return "tagged"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--source", action="append", required=True,
                    help="PATH:COMPANY, repeatable")
    ap.add_argument("--skeleton", help="vault-template to seed rules and tools from")
    ap.add_argument("--force", action="store_true",
                    help="replace the target if it already exists")
    args = ap.parse_args()

    target = Path(args.target).expanduser().resolve()
    sources = [parse_source(s) for s in args.source]

    if target.exists():
        if not args.force:
            sys.exit(f"Target exists: {target}\nUse --force to rebuild it.")
        shutil.rmtree(target)

    target.mkdir(parents=True)

    if args.skeleton:
        skel = Path(args.skeleton).expanduser().resolve()
        for item in skel.iterdir():
            dest = target / item.name
            if item.is_dir():
                shutil.copytree(item, dest, ignore=IGNORE)
            else:
                shutil.copy2(item, dest)
        print(f"seeded skeleton from {skel}")

    # Folders the structure requires that the skeleton may not carry.
    for d in ("companies", "holding", "panel", "attachments"):
        (target / d).mkdir(exist_ok=True)

    stats: dict[str, int] = {}
    for src, company in sources:
        dest = target / "companies" / company
        shutil.copytree(src, dest, ignore=IGNORE)
        md_files = sorted(dest.rglob("*.md"))
        for md in md_files:
            result = add_company_field(md, company)
            stats[result] = stats.get(result, 0) + 1
        others = [p for p in dest.rglob("*") if p.is_file() and p.suffix != ".md"]
        print(f"{company:8} {len(md_files):4} notes, {len(others):4} attachments")

    print("\nfrontmatter:")
    for k, v in sorted(stats.items()):
        print(f"  {k:22} {v}")

    total = len(list((target / "companies").rglob("*.md")))
    print(f"\ntarget: {target}  ({total} notes under companies/)")


if __name__ == "__main__":
    main()
