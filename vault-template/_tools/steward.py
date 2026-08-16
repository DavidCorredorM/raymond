#!/usr/bin/env python3
"""
The deterministic half of the vault steward.

Everything here is a rule with one right answer: a link that used to
resolve and no longer does, a filename that does not match the pattern,
a folder with no index, a note nothing points at. No judgment, no model,
no cost per run. The judgment half — contradictions, staleness, "these
two notes disagree", what the subfolders of a flat folder should
actually be — lives in `.claude/skills/vault-steward/SKILL.md` and needs
an agent. Keep the line where it is: an agent run for something a script
can decide is slower, costlier and gives a different answer every time.

The rules are not invented here. They are `conventions.md`, and the
constants below are its "The numbers" table transcribed. When the two
disagree, `conventions.md` is right and this file has a bug.

    steward.py check              scan, heal what is safe, write findings
    steward.py check --dry-run    scan and report, write nothing
    steward.py move A B           move/rename, rewriting every inbound link
    steward.py apply              carry out answered proposals

The one boundary that must not move, stated here as well as in the skill
and in conventions.md §5:

    ANYTHING THAT CAN LOSE INFORMATION IS A PROPOSAL, NEVER AN AUTOMATIC
    ACTION.

Repointing a broken link is safe: the old target is in git and the link
was already broken. Creating an index is safe. Deleting a "duplicate"
note, merging two notes, rewriting a `titulo` — none of those are, at
any confidence. They become a card in `steward/` and wait for a person.

Stdlib only, on purpose: this runs from cron on a box where nobody has
pip-installed anything, and a health checker that fails to start is
worse than no health checker.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

# linkcheck.py already resolves all three wiki-link forms correctly, and
# getting that wrong once produced 764 broken links on a vault with 82.
# Import it rather than writing a second resolver that drifts from it.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import linkcheck  # noqa: E402

# ---------------------------------------------------------------------------
# conventions.md, "The numbers". Change both together.
# ---------------------------------------------------------------------------

MAX_DEPTH = 4                      # folders below the root a note may sit at
MAX_FLAT = 20                      # notes in a subfolder-less folder
FILENAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*\.md$")
NAME_MIN, NAME_MAX = 3, 60
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REQUIRED_FM = ("titulo", "tipo", "estado", "actualizado", "cuando-usar")
TIPOS = ("nota", "decision", "gotcha", "referencia", "log", "persona", "hallazgo")
ESTADOS_NOTA = ("activo", "reemplazado")
MIN_OUT, MIN_IN = 2, 1
CARD_CAP = 25

ROOT_FILES = ("index.md", "CLAUDE.md", "conventions.md")
FANOUT_EXEMPT = ("daily", "steward")
STEWARD_DIR = "steward"
HISTORY_DIR = "steward/historial"

# A filename that says nothing. Cheap to list, and every one of these has
# turned up in a real import.
GENERIC_STEMS = {
    "note", "notes", "nota", "notas", "untitled", "sin-titulo", "new",
    "nuevo", "nueva", "doc", "document", "documento", "temp", "tmp",
    "draft", "borrador", "misc", "varios", "test", "copy", "copia",
    "final", "readme",
}

# Severity order for the card cap: the ones that break navigation first.
KIND_ORDER = [
    "broken-link", "duplicate-basename", "filename", "folder-shape",
    "orphan", "frontmatter", "misplaced",
]

WIKILINK = re.compile(r"\[\[([^\]|#]+)((?:[|#][^\]]*)?)\]\]")


# ---------------------------------------------------------------------------
# Frontmatter: read a useful subset, write one key at a time.
# ---------------------------------------------------------------------------
#
# No PyYAML (see the module docstring), and no reserialization ever. A
# tool that edits somebody's notes must not reflow their frontmatter,
# drop their comments or requote their strings as a side effect of
# setting one field. Every write below replaces or inserts a single line.


def split_fm(text: str):
    """-> (frontmatter_lines | None, body). None means no frontmatter."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return lines[1:i], "\n".join(lines[i + 1:])
    return None, text


def _scalar(v: str):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        return [_scalar(x) for x in inner.split(",")] if inner else []
    if v.startswith("{") and v.endswith("}"):
        out = {}
        inner = v[1:-1].strip()
        for part in inner.split(","):
            if ":" in part:
                k, _, val = part.partition(":")
                out[k.strip()] = _scalar(val)
        return out
    return v


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def parse_fm(fm_lines):
    """A small YAML subset: nested maps, block and inline lists, scalars.

    Enough for this vault's schema plus the `finding:` block this tool
    writes itself. Anything it cannot parse comes back as a string, which
    is the right failure: a check silently skips it rather than crashing
    on somebody's note.
    """
    if fm_lines is None:
        return {}
    rows = [
        (_indent(l), l.strip())
        for l in fm_lines
        if l.strip() and not l.strip().startswith("#")
    ]

    def block(i, indent):
        if i < len(rows) and rows[i][1].startswith("- "):
            out, j = [], i
            while j < len(rows) and rows[j][0] >= indent and rows[j][1].startswith("- "):
                out.append(_scalar(rows[j][1][2:]))
                j += 1
            return out, j
        out, j = {}, i
        while j < len(rows) and rows[j][0] >= indent:
            if rows[j][0] > indent:          # stray over-indent; skip it
                j += 1
                continue
            key, _, val = rows[j][1].partition(":")
            key, val = key.strip(), val.strip()
            j += 1
            if val:
                out[key] = _scalar(val)
            elif j < len(rows) and rows[j][0] > indent:
                out[key], j = block(j, rows[j][0])
            else:
                out[key] = ""
        return out, j

    parsed, _ = block(0, 0) if rows else ({}, 0)
    return parsed if isinstance(parsed, dict) else {}


def _emit(value: str) -> str:
    """Quote only when a bare scalar would not survive a round trip."""
    s = "" if value is None else str(value)
    if s == "":
        return '""'
    if s[0] in "\"'[{&*!|>%@`#-?" or s[-1] == " " or ": " in s or s.endswith(":"):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def fm_set(fm_lines, key: str, value: str):
    """Replace or insert one top-level scalar. Everything else untouched."""
    lines = list(fm_lines)
    pat = re.compile(r"^" + re.escape(key) + r"\s*:")
    for i, line in enumerate(lines):
        if _indent(line) == 0 and pat.match(line):
            _, _, existing = line.partition(":")
            if not existing.strip() and i + 1 < len(lines) and _indent(lines[i + 1]) > 0:
                raise ValueError(f"{key} is a block, not a scalar; refusing to overwrite")
            lines[i] = f"{key}: {_emit(value)}"
            return lines
    # Insert before the first top-level block key, so scalars stay together.
    for i, line in enumerate(lines):
        if _indent(line) == 0 and line.rstrip().endswith(":"):
            return lines[:i] + [f"{key}: {_emit(value)}"] + lines[i:]
    return lines + [f"{key}: {_emit(value)}"]


def compose(fm_lines, body: str) -> str:
    return "---\n" + "\n".join(fm_lines) + "\n---\n\n" + body.lstrip("\n")


# ---------------------------------------------------------------------------
# The vault, read once.
# ---------------------------------------------------------------------------


def slug(text: str) -> str:
    """Accent-stripped kebab-case. Also the normal form used to decide
    whether a broken link has exactly one plausible target."""
    t = unicodedata.normalize("NFKD", str(text))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t


class Vault:
    def __init__(self, root: Path):
        self.root = root
        # Dotted paths are tooling, not notes — same exclusion linkcheck
        # makes, so "broken" here means exactly what it means there.
        self.md = sorted(
            str(p.relative_to(root))
            for p in root.rglob("*.md")
            if not any(part.startswith(".") for part in p.relative_to(root).parts)
        )
        self.notes = [r for r in self.md if linkcheck.is_note(r)]
        self.by_path = {r[:-3] for r in self.md}
        self.by_name: dict[str, list[str]] = {}
        for r in self.md:
            self.by_name.setdefault(Path(r).stem, []).append(r)

        self.text: dict[str, str] = {}
        self.fm: dict[str, dict] = {}
        for r in self.md:
            self.text[r] = (root / r).read_text(encoding="utf-8", errors="replace")
            self.fm[r] = parse_fm(split_fm(self.text[r])[0])

        self.outbound: dict[str, list[tuple[str, str | None]]] = {}
        self.inbound: dict[str, set[str]] = {r: set() for r in self.md}
        for r in self.notes:
            found = []
            for m in WIKILINK.finditer(self.text[r]):
                target = m.group(1).strip().rstrip("\\").strip()
                if not target:
                    continue
                hit = self.resolve(r, target)
                found.append((target, hit))
                if hit:
                    self.inbound[hit].add(r)
            self.outbound[r] = found

    def resolve(self, source_rel: str, target: str) -> str | None:
        """The three link forms, in linkcheck's order and with linkcheck's
        answers — "broken" here must mean exactly what `vault-lint --links`
        means, or the two tools argue with each other in front of the user.

        An ambiguous bare name therefore resolves, arbitrarily, to the
        first match, exactly as linkcheck counts it resolved. The ambiguity
        itself is not lost: it comes out of the duplicate-basename check,
        which is where a person can actually act on it.
        """
        clean = target[:-3] if target.lower().endswith(".md") else target
        hits = self.by_name.get(clean)
        if hits:
            return hits[0]
        if clean in self.by_path:
            return clean + ".md"
        parent = str(Path(source_rel).parent)
        base = "" if parent == "." else parent
        cand = linkcheck.normalise(f"{base}/{clean}" if base else clean)
        return cand + ".md" if cand in self.by_path else None

    def folders(self):
        """Folders that hold notes, with their direct note children."""
        out: dict[str, list[str]] = {}
        for r in self.notes:
            out.setdefault(str(Path(r).parent), []).append(r)
        return out

    def write(self, rel: str, text: str):
        (self.root / rel).write_text(text, encoding="utf-8")
        self.text[rel] = text


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


class Finding:
    def __init__(self, kind, titulo, pregunta, notes, detalle,
                 proposal=None, identity=None):
        self.kind = kind
        self.titulo = titulo
        self.pregunta = pregunta
        self.notes = notes
        self.detalle = detalle
        self.proposal = proposal or {"action": "none"}
        self.identity = identity or sorted(notes)
        raw = kind + "|" + "|".join(self.identity)
        self.fingerprint = hashlib.sha1(raw.encode()).hexdigest()[:10]

    def basename(self) -> str:
        """A card is a note and obeys conventions.md §2 like any other:
        kebab-case, descriptive, inside the length limit."""
        seed = slug(Path(self.identity[0]).stem) if self.identity else self.fingerprint
        return (f"{self.kind}-{seed}"[:NAME_MAX].rstrip("-") or self.fingerprint) + ".md"

    def body(self) -> str:
        lines = [f"# {self.titulo}", "", f"**{self.pregunta}**", "", self.detalle.strip(), ""]
        if self.notes:
            lines += ["## Notes involved", ""]
            # Capped. A flat-folder card names forty notes; forty wiki-links
            # in one card is a hairball in the graph view and a wall of text
            # on a phone. The full list stays in `finding.notes` above.
            for n in self.notes[:10]:
                lines.append(f"- [[{Path(n).stem}]] — `{n}`")
            if len(self.notes) > 10:
                lines.append(f"- …and {len(self.notes) - 10} more, listed in "
                             "`finding.notes` in the frontmatter above")
            lines.append("")
        p = self.proposal
        if p.get("action") in ("move", "rename"):
            lines += [
                "## Proposal",
                "",
                f"Move `{p['from']}` → `{p['to']}`, rewriting the "
                f"{p.get('inbound', 0)} link(s) that point at it in the same operation.",
                "",
            ]
        lines += [
            "## Answering",
            "",
            "Type what is true into `respuesta:` in the frontmatter above —",
            "in the panel's steward card, or in any editor. Then set",
            "`decision:` to `aplicar` or `descartar` and `estado:` to",
            "`respondido`. The next steward run reads it.",
            "",
        ]
        return "\n".join(lines)

    def frontmatter(self, today: str) -> list[str]:
        fm = [
            f"titulo: {_emit(self.titulo)}",
            "tipo: hallazgo",
            "area: meta",
            "estado: abierto",
            f"actualizado: {today}",
            f"etiquetas: [steward, {self.kind}]",
            f"cuando-usar: {_emit('Answer this to resolve: ' + self.pregunta)}",
            f"pregunta: {_emit(self.pregunta)}",
            'respuesta: ""',
            'decision: ""',
            'respondido: ""',
            "finding:",
            f"  kind: {self.kind}",
            "  source: deterministic",
            "  confidence: high",
            f"  fingerprint: {self.fingerprint}",
            f"  detected: {today}",
        ]
        if self.notes:
            fm.append("  notes:")
            fm += [f"    - {n}" for n in self.notes]
        fm.append("  proposal:")
        for k, v in self.proposal.items():
            fm.append(f"    {k}: {_emit(v) if isinstance(v, str) else v}")
        return fm


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------


def check_all(v: Vault):
    """-> (findings, fixes, reports)

    findings  need a human decision      → a card in steward/
    fixes     safe and unambiguous       → applied, listed in the report
    reports   need the agent, not a card → the run report, for the skill
    """
    findings: list[Finding] = []
    fixes: list[tuple] = []
    reports: list[str] = []

    # The steward's own cards are machinery, not content, and every check
    # below runs against `subjects` rather than every note in the vault.
    # Skipping this is not cosmetic: a card names the notes it is about, so
    # scanning cards makes the steward find its own output, card that, and
    # card the card. Observed, on the second run of the first version. The
    # same shape as the agent brief that once contaminated the vault's
    # health counts (docs/log.md, 2026-08-14).
    subjects = [r for r in v.notes if not r.startswith(STEWARD_DIR + "/")]

    # -- broken links ------------------------------------------------------
    #
    # A link to a note that never existed is a deliberate placeholder
    # (conventions.md §4) and is left alone. What is reported is a link
    # whose target *looks like* something in the vault: exactly one note
    # whose name normalizes to the same slug is an unambiguous repoint and
    # gets fixed; more than one, or none, is a card or a placeholder.
    by_slug: dict[str, list[str]] = {}
    for r in v.md:
        by_slug.setdefault(slug(Path(r).stem), []).append(r)

    for src in subjects:
        edits = []
        for target, hit in v.outbound[src]:
            if hit:
                continue
            cands = by_slug.get(slug(target.split("/")[-1]), [])
            if len(cands) == 1:
                edits.append((target, Path(cands[0]).stem))
            elif not cands:
                # Nothing in the vault is plausibly this. Either a
                # deliberate placeholder for a note worth writing
                # (conventions.md §4, and fine) or a target that was
                # deleted rather than renamed. A script cannot tell those
                # apart without history, so this goes to the agent half
                # rather than becoming a card that is wrong half the time.
                reports.append(f"{src}: link target `{target}` resolves to nothing and "
                               "nothing resembles it — placeholder, or deleted?")
            else:
                # The broken target is quoted as bare text, never inside
                # `[[ ]]`. A card that reproduces the bracket syntax is
                # itself a note containing a broken wiki-link, so the next
                # `vault-lint --links` reports the steward's own output as
                # damage. Do not "fix" this by adding the brackets back.
                findings.append(Finding(
                    "broken-link",
                    f"The link to `{target}` in {Path(src).stem} could mean "
                    f"{len(cands)} different notes",
                    f"Which note should the link to `{target}` point at?",
                    [src] + cands,
                    f"`{src}` has a wiki-link whose target is `{target}`. It does not\n"
                    "resolve, and more than one note normalizes to the same name, so\n"
                    "repointing it would be a guess between:\n\n"
                    + "\n".join(f"- `{c}`" for c in cands),
                    identity=[src, target],
                ))
        if edits:
            fixes.append(("link", src, edits))

    # -- duplicate basenames ----------------------------------------------
    for stem, paths in sorted(v.by_name.items()):
        if len(paths) < 2 or stem == "index":
            continue
        findings.append(Finding(
            "duplicate-basename",
            f"{len(paths)} notes are called `{stem}.md`",
            f"Which of these should keep the name `{stem}`, and what should the others be called?",
            list(paths),
            "Basenames must be unique across the vault (conventions.md §2). While they\n"
            "are not, every `[[" + stem + "]]` link is ambiguous and resolves\n"
            "differently in different tools.\n\n"
            + "\n".join(f"- `{p}`" for p in paths),
            identity=sorted(paths),
        ))

    # -- filenames ---------------------------------------------------------
    for r in subjects:
        name = Path(r).name
        stem = Path(r).stem
        folder = str(Path(r).parent)
        if name == "index.md":
            continue
        if folder == "daily" and DATE_RE.match(stem):
            continue

        reason = None
        if not FILENAME_RE.match(name):
            reason = "does not match `^[a-z0-9]+(-[a-z0-9]+)*\\.md$`"
        elif stem in GENERIC_STEMS:
            reason = "is a generic name that says nothing about the content"
        elif DATE_RE.match(stem):
            reason = "is a bare date outside `daily/`, which records when, not what"
        elif not (NAME_MIN <= len(stem) <= NAME_MAX):
            reason = f"is {len(stem)} characters; the range is {NAME_MIN}–{NAME_MAX}"
        if not reason:
            continue

        titulo = v.fm[r].get("titulo") or ""
        suggested = slug(titulo)[:NAME_MAX] if titulo else slug(stem)[:NAME_MAX]
        proposal = {"action": "none"}
        if suggested and suggested != stem and suggested not in v.by_name:
            proposal = {
                "action": "rename",
                "from": r,
                "to": f"{folder}/{suggested}.md" if folder != "." else f"{suggested}.md",
                "inbound": len(v.inbound[r]),
            }
        findings.append(Finding(
            "filename", f"`{name}` {reason}",
            f"Rename `{name}` to `{suggested}.md`?" if proposal["action"] == "rename"
            else f"What should `{name}` be called?",
            [r],
            f"`{r}` {reason}.\n\nIts `titulo` is "
            + (f"“{titulo}”." if titulo else "not set, so there is nothing to derive a name from.")
            + "\n\nA rename goes through `_tools/steward.py move`, which rewrites every\n"
              f"inbound link in the same operation — {len(v.inbound[r])} point here today.",
            proposal=proposal, identity=[r],
        ))

    # -- frontmatter -------------------------------------------------------
    #
    # Reported, not carded. Every one of these is fixable in place by the
    # agent half or by `vault-health`, and one card per missing field
    # would bury the findings that actually need a decision.
    for r in subjects:
        fm = v.fm[r]
        if not fm:
            reports.append(f"{r}: no frontmatter at all")
            continue
        missing = [k for k in REQUIRED_FM if not str(fm.get(k, "")).strip()]
        if missing:
            reports.append(f"{r}: missing {', '.join(missing)}")
        tipo = str(fm.get("tipo", "")).strip()
        if tipo and tipo not in TIPOS and "|" not in tipo:
            reports.append(f"{r}: tipo `{tipo}` is not one of {', '.join(TIPOS)}")
        est = str(fm.get("estado", "")).strip()
        if est and tipo != "hallazgo" and est not in ESTADOS_NOTA:
            reports.append(f"{r}: estado `{est}` is not activo or reemplazado")
        act = str(fm.get("actualizado", "")).strip()
        if act and not DATE_RE.match(act):
            reports.append(f"{r}: actualizado `{act}` is not YYYY-MM-DD")

    # -- indexes -----------------------------------------------------------
    for folder, notes_in in sorted(v.folders().items()):
        if folder == "." or folder.startswith(STEWARD_DIR):
            continue
        idx = f"{folder}/index.md"
        if idx not in v.text:
            fixes.append(("index-create", folder, list(notes_in)))
            continue
        listed = {m.group(1).strip() for m in WIKILINK.finditer(v.text[idx])}
        missing = [
            n for n in notes_in
            if Path(n).name != "index.md"
            and Path(n).stem not in listed
            and n[:-3] not in listed
        ]
        if missing:
            fixes.append(("index-rows", idx, missing))

    # -- orphans -----------------------------------------------------------
    underlinked: list[str] = []
    for r in subjects:
        # An index is navigation, a dashboard is a rendered view, and the
        # root files are the vault's own rulebook. None of them is a note
        # making a claim, so none owes the link minimums. `conventions.md`
        # in particular is linked only from `index.md`, which is correct
        # and would otherwise be reported forever.
        if (Path(r).name in ("index.md",) + ROOT_FILES
                or v.fm[r].get("widgets") is not None):
            continue
        out = [t for t, _ in v.outbound[r]]
        # Index rows are navigation, not meaning, and a steward card is
        # machinery. Neither counts as somebody linking to this note —
        # otherwise carding a note as an orphan is what stops it being one.
        inb = {s for s in v.inbound[r]
               if Path(s).name != "index.md" and not s.startswith(STEWARD_DIR + "/")}
        if not out and not inb:
            findings.append(Finding(
                "orphan", f"Nothing links to `{Path(r).stem}` and it links to nothing",
                f"Where does `{Path(r).stem}` belong — what should it link to, and what should link to it?",
                [r],
                "A note with no links in either direction is invisible to a person\n"
                "browsing the graph and to an agent walking it. conventions.md §4 asks\n"
                f"for at least {MIN_OUT} outbound and {MIN_IN} inbound.\n\n"
                f"`{r}` has none of either.",
                identity=[r],
            ))
        elif len(out) < MIN_OUT or len(inb) < MIN_IN:
            underlinked.append(r)

    # One line, not one line per note. On a freshly imported vault this is
    # most of the vault, and a report nobody can read is a report nobody
    # reads — the same failure the old shell link checker had.
    if underlinked:
        shown = ", ".join(f"`{p}`" for p in underlinked[:5])
        more = f" (+{len(underlinked) - 5} more)" if len(underlinked) > 5 else ""
        reports.append(
            f"{len(underlinked)} note(s) under-linked, want {MIN_OUT} out / {MIN_IN} in: "
            f"{shown}{more}")

    # -- folder shape ------------------------------------------------------
    all_dirs = {str(p.relative_to(v.root)) for p in v.root.rglob("*") if p.is_dir()}
    all_dirs = {d for d in all_dirs
                if not any(s.startswith(("_", ".")) for s in d.split("/"))
                and d.split("/")[0] != STEWARD_DIR}
    folders = v.folders()

    for d in sorted(all_dirs):
        top = d.split("/")[0]
        notes_in = [n for n in folders.get(d, []) if Path(n).name != "index.md"]
        children = [x for x in all_dirs if x.startswith(d + "/")]
        has_any = bool(notes_in) or any(
            p.is_file() for p in (v.root / d).rglob("*") if p.is_file())

        # A top-level base folder is allowed to be empty — a fresh vault
        # ships `attachments/` and `projects/` with nothing in them yet.
        # A nested empty folder is a leftover from a move.
        if not has_any and not children and "/" in d:
            findings.append(Finding(
                "folder-shape", f"`{d}/` is empty",
                f"Should `{d}/` be removed, or is something meant to go in it?",
                [], f"`{d}/` contains no files and no subfolders. An empty folder is either\n"
                    "a leftover from a move or a plan nobody wrote down.\n\n"
                    "Removing a folder is not something this tool does on its own.",
                identity=[d],
            ))
            continue

        if top not in FANOUT_EXEMPT and len(notes_in) > MAX_FLAT and not children:
            sample = ", ".join(f"`{Path(n).name}`" for n in sorted(notes_in)[:6])
            findings.append(Finding(
                "folder-shape",
                f"`{d}/` holds {len(notes_in)} notes flat, with no subfolders",
                f"What are the two to five groups `{d}/` should be split into?",
                sorted(notes_in),
                f"conventions.md §1 puts the limit at {MAX_FLAT}. Past that a folder "
                "listing\nstops being something you scan.\n\n"
                f"First few: {sample}…\n\n"
                "**Deciding the groups is a judgment call and this tool does not make it.**\n"
                "Answer with the grouping you want, or ask the `vault-steward` skill to\n"
                "propose one; each resulting move then goes through "
                "`steward.py move`, which\nrewrites inbound links as it goes.",
                identity=[d],
            ))

    for r in subjects:
        depth = len(Path(r).parts) - 1
        # An index sits wherever its folder sits. Carding it for being too
        # deep asks the user about a file the steward itself created, and
        # the real finding — the folder is too deep — is already raised
        # against the notes inside it.
        if Path(r).name == "index.md":
            continue
        if depth > MAX_DEPTH:
            findings.append(Finding(
                "folder-shape", f"`{r}` sits {depth} folders deep",
                f"Which of the folders above `{Path(r).name}` are actually carrying meaning?",
                [r],
                f"The ceiling is {MAX_DEPTH} (conventions.md §1). Past three levels the "
                "path is\nusually encoding facts that belong in frontmatter or in a link.",
                identity=[r],
            ))
        if depth == 0 and Path(r).name not in ROOT_FILES:
            findings.append(Finding(
                "misplaced", f"`{Path(r).name}` is loose at the vault root",
                f"Which folder does `{Path(r).name}` belong in?",
                [r],
                "The root holds `index.md`, `CLAUDE.md`, `conventions.md` and folders.\n"
                "A note at the root is a note nobody filed (conventions.md §1).",
                identity=[r],
            ))

    findings.sort(key=lambda f: (KIND_ORDER.index(f.kind)
                                 if f.kind in KIND_ORDER else 99, f.titulo))

    # One card per note per run, most navigation-breaking kind first.
    # `notes.md` in two folders is a duplicate basename, a bad filename and
    # an orphan all at once; three cards asking three versions of "what
    # should this be called" is how a review queue becomes something the
    # user closes without reading. Findings covering several notes at once
    # (a duplicate pair, a flat folder) always survive — they are the ones
    # that subsume the rest.
    claimed: set[str] = set()
    deduped = []
    for f in findings:
        if len(f.notes) == 1 and f.notes[0] in claimed:
            continue
        deduped.append(f)
        claimed.update(f.notes)
    return deduped, fixes, reports


# ---------------------------------------------------------------------------
# The safe fixes
# ---------------------------------------------------------------------------


def index_template(v: Vault, folder: str) -> str:
    """The deployment's own template, so a translated template produces a
    translated index. Falls back only if it has been deleted."""
    tpl = v.root / "_templates" / "index-template.md"
    if tpl.exists():
        text = tpl.read_text(encoding="utf-8")
        text = text.replace("<carpeta>", folder).replace("YYYY-MM-DD", str(date.today()))
        # Drop the template's own example row; keep the header and rule.
        return "\n".join(
            l for l in text.split("\n")
            if not (l.startswith("|") and "[[nombre-de-la-nota]]" in l)
        )
    return (
        f"---\ntitulo: {folder}\ntipo: referencia\narea: meta\nestado: activo\n"
        f"actualizado: {date.today()}\netiquetas: [meta]\n"
        f'cuando-usar: "Read before opening any note in {folder}/."\n---\n\n'
        f"# {folder}\n\n| Nota | Cuándo leerla |\n|---|---|\n"
    )


def add_rows(text: str, rows: list[str]) -> str:
    """Append rows after the last line of the first markdown table."""
    lines = text.rstrip("\n").split("\n")
    sep = next((i for i, l in enumerate(lines) if re.match(r"^\|[\s:-]+\|", l)), None)
    if sep is None:
        return text.rstrip("\n") + "\n\n| Nota | Cuándo leerla |\n|---|---|\n" + "\n".join(rows) + "\n"
    end = sep + 1
    while end < len(lines) and lines[end].startswith("|"):
        end += 1
    return "\n".join(lines[:end] + rows + lines[end:]) + "\n"


def row_for(v: Vault, rel: str) -> str:
    """A row whose description is the note's own `cuando-usar` — copied,
    never invented. A placeholder in an index is a lie with a table around
    it; if the note has no `cuando-usar`, say so and let the agent fill it."""
    cu = str(v.fm.get(rel, {}).get("cuando-usar", "")).strip()
    desc = cu.replace("|", "\\|") if cu else "**sin `cuando-usar`** — describe when to read this"
    return f"| [[{Path(rel).stem}]] | {desc} |"


def apply_fixes(v: Vault, fixes, dry: bool):
    done = []
    for kind, subject, payload in fixes:
        if kind == "link":
            text = v.text[subject]
            for target, new in payload:
                text = WIKILINK.sub(
                    lambda m, t=target, n=new: (
                        f"[[{n}{m.group(2)}]]"
                        if m.group(1).strip().rstrip("\\").strip() == t else m.group(0)),
                    text)
            if not dry:
                v.write(subject, text)
            done += [f"link {subject}: [[{t}]] -> [[{n}]]" for t, n in payload]

        elif kind == "index-create":
            idx = f"{subject}/index.md"
            rows = [row_for(v, n) for n in sorted(payload) if Path(n).name != "index.md"]
            text = add_rows(index_template(v, subject), rows)
            if not dry:
                v.write(idx, text)
            done.append(f"index created {idx} ({len(rows)} rows)")

        elif kind == "index-rows":
            rows = [row_for(v, n) for n in sorted(payload)]
            if not dry:
                v.write(subject, add_rows(v.text[subject], rows))
            done.append(f"index rows {subject}: +{len(rows)}")
    return done


# ---------------------------------------------------------------------------
# move — the only way a file changes place
# ---------------------------------------------------------------------------


def cmd_move(v: Vault, src: str, dst: str, dry: bool) -> int:
    """Move or rename, rewriting every inbound link in the same operation.

    A move that leaves the links behind is not a fix, it is a second
    problem stacked on the first — which is why nothing else in this tool
    calls `os.rename` and why the panel's approve-a-card path routes here.
    """
    src_p, dst_p = v.root / src, v.root / dst
    if src not in v.md:
        print(f"error: {src} is not a note in this vault", file=sys.stderr)
        return 1
    if dst_p.exists():
        print(f"error: {dst} already exists", file=sys.stderr)
        return 1
    if not str(dst_p.resolve().parent).startswith(str(v.root.resolve())):
        print(f"error: {dst} is outside the vault", file=sys.stderr)
        return 1
    new_stem = Path(dst).stem
    clash = [p for p in v.by_name.get(new_stem, []) if p != src]
    if clash:
        print(f"error: basename `{new_stem}` is already used by {clash[0]}; "
              "basenames must be unique (conventions.md §2)", file=sys.stderr)
        return 1

    # Every edit computed before anything is written.
    edits: dict[str, str] = {}
    for r in v.notes:
        if r == src:
            continue
        hits = [t for t, hit in v.outbound[r] if hit == src]
        if not hits:
            continue
        text = v.text[r]
        text = WIKILINK.sub(
            lambda m: (f"[[{new_stem}{m.group(2)}]]"
                       if m.group(1).strip().rstrip("\\").strip() in hits else m.group(0)),
            text)
        edits[r] = text

    old_idx, new_idx = f"{Path(src).parent}/index.md", f"{Path(dst).parent}/index.md"
    moved_row = None
    if old_idx in v.md and old_idx != new_idx:
        keep, base = [], edits.get(old_idx, v.text[old_idx])
        for line in base.split("\n"):
            if line.startswith("|") and f"[[{new_stem}" in line:
                moved_row = line
            else:
                keep.append(line)
        if moved_row:
            edits[old_idx] = "\n".join(keep)

    print(f"move  {src}\n  ->  {dst}")
    print(f"      {len(edits)} file(s) with inbound links or index rows to rewrite")
    for r in sorted(edits):
        print(f"      rewrite {r}")
    if dry:
        print("      --dry-run: nothing written")
        return 0

    originals = {r: v.text[r] for r in edits}
    dst_p.parent.mkdir(parents=True, exist_ok=True)
    src_p.rename(dst_p)
    try:
        for r, text in edits.items():
            v.write(r, text)
        if moved_row:
            if (v.root / new_idx).exists():
                v.write(new_idx, add_rows((v.root / new_idx).read_text(encoding="utf-8"),
                                          [moved_row]))
            else:
                (v.root / new_idx).write_text(
                    add_rows(index_template(v, str(Path(dst).parent)), [moved_row]),
                    encoding="utf-8")
            print(f"      index row moved to {new_idx}")
    except Exception:
        for r, text in originals.items():
            (v.root / r).write_text(text, encoding="utf-8")
        dst_p.rename(src_p)
        print("error: rewrite failed; the move was rolled back", file=sys.stderr)
        raise
    return 0


# ---------------------------------------------------------------------------
# Writing, refreshing and retiring the cards
# ---------------------------------------------------------------------------


def existing_findings(v: Vault):
    """-> {fingerprint: (rel, frontmatter)} across steward/ and its history."""
    out = {}
    for r in v.md:
        if not r.startswith(STEWARD_DIR + "/") or Path(r).name == "index.md":
            continue
        fm = v.fm[r]
        fp = (fm.get("finding") or {}).get("fingerprint")
        if fp:
            out[fp] = (r, fm)
    return out


def sync_findings(v: Vault, findings, dry: bool, today: str):
    have = existing_findings(v)
    created, closed, kept = [], [], 0
    open_now = sum(1 for _, fm in have.values() if fm.get("estado") == "abierto")

    live = {f.fingerprint for f in findings}
    for fp, (rel, fm) in sorted(have.items()):
        # Only deterministic findings can be auto-closed: the script that
        # raised them is the same one re-deriving them. A judgment finding
        # is not re-derivable here, so it stays until a person or the agent
        # closes it.
        if (fm.get("estado") == "abierto"
                and (fm.get("finding") or {}).get("source") == "deterministic"
                and fp not in live):
            if not dry:
                fl, body = split_fm(v.text[rel])
                fl = fm_set(fm_set(fl, "estado", "resuelto"), "actualizado", today)
                v.write(rel, compose(fl, body))
            closed.append(rel)

    taken = {Path(r).name for r in v.md}
    for f in findings:
        if f.fingerprint in have:
            kept += 1
            continue
        if open_now + len(created) >= CARD_CAP:
            break
        # Basenames are unique vault-wide (conventions.md §2) and a card is
        # a note like any other. Checking a set rather than the filesystem
        # also keeps --dry-run's output honest about what it would write.
        name, i = f.basename(), 2
        while name in taken:
            name = f"{f.basename()[:-3]}-{i}.md"
            i += 1
        taken.add(name)
        rel = f"{STEWARD_DIR}/{name}"
        if not dry:
            (v.root / STEWARD_DIR).mkdir(parents=True, exist_ok=True)
            v.write(rel, compose(f.frontmatter(today), f.body()))
        created.append(rel)

    return created, closed, kept, max(0, len(findings) - kept - len(created))


def retire_closed(v: Vault, dry: bool):
    """Sweep finished cards into steward/historial/. Their basenames do not
    change, so bare links keep resolving and no rewrite is needed; the two
    steward indexes are regenerated wholesale afterwards anyway."""
    moved = []
    for r in list(v.md):
        if Path(r).parent.as_posix() != STEWARD_DIR or Path(r).name == "index.md":
            continue
        if v.fm[r].get("estado") in ("aplicado", "descartado", "resuelto"):
            dest = f"{HISTORY_DIR}/{Path(r).name}"
            if not dry:
                (v.root / HISTORY_DIR).mkdir(parents=True, exist_ok=True)
                (v.root / r).rename(v.root / dest)
            moved.append((r, dest))
    return moved


def write_steward_indexes(v: Vault, dry: bool, today: str, summary: list[str]):
    """Regenerated in full every run. The steward owns these two files, so
    they are the one place in the vault where wholesale rewriting is right
    — and it means the steward's own folder can never go stale."""
    if dry:
        return
    for folder, titulo, cuando in (
        (STEWARD_DIR, "Steward findings",
         "Read to see what the vault steward flagged and has not been answered yet."),
        (HISTORY_DIR, "Steward findings, answered",
         "Read for the record of what the steward flagged and how it was resolved."),
    ):
        d = v.root / folder
        if not d.exists():
            continue
        rows = []
        for p in sorted(d.glob("*.md")):
            if p.name == "index.md":
                continue
            fm = parse_fm(split_fm(p.read_text(encoding="utf-8"))[0])
            rows.append("| [[{}]] | {} | {} |".format(
                p.stem,
                (fm.get("finding") or {}).get("kind", "?"),
                fm.get("estado", "?")))
        head = (
            f"---\ntitulo: {titulo}\ntipo: referencia\narea: meta\nestado: activo\n"
            f"actualizado: {today}\netiquetas: [meta, steward]\n"
            f'cuando-usar: "{cuando}"\n---\n\n'
            f"# {titulo}\n\n"
            "One file per finding. Answer one by filling `respuesta:` and `decision:`\n"
            "in its frontmatter — in the panel's steward card, in Obsidian, or in any\n"
            "editor. Regenerated by `_tools/steward.py`; edits to this file are lost.\n\n"
            "| Hallazgo | Clase | Estado |\n|---|---|---|\n"
        )
        body = "\n".join(rows) if rows else "| — | — | nothing open |"
        extra = ""
        if folder == STEWARD_DIR and summary:
            extra = "\n\n## Last run\n\n" + "\n".join(f"- {s}" for s in summary) + "\n"
        (d / "index.md").write_text(head + body + "\n" + extra, encoding="utf-8")


# ---------------------------------------------------------------------------
# apply — carry out what was answered
# ---------------------------------------------------------------------------


def cmd_apply(v: Vault, dry: bool) -> int:
    acted = 0
    for r in sorted(v.md):
        if not r.startswith(STEWARD_DIR + "/") or Path(r).name == "index.md":
            continue
        fm = v.fm[r]
        if fm.get("estado") != "respondido":
            continue
        decision = str(fm.get("decision", "")).strip()
        prop = (fm.get("finding") or {}).get("proposal") or {}
        action = str(prop.get("action", "none"))

        if decision == "descartar":
            print(f"discard {r}")
            if not dry:
                fl, body = split_fm(v.text[r])
                fl = fm_set(fm_set(fl, "estado", "descartado"),
                            "actualizado", str(date.today()))
                v.write(r, compose(fl, body))
            acted += 1
            continue

        if decision != "aplicar":
            print(f"skip    {r}: decision is `{decision or 'empty'}`, expected "
                  "`aplicar` or `descartar`")
            continue

        if action in ("move", "rename"):
            print(f"apply   {r}")
            rc = cmd_move(v, str(prop["from"]), str(prop["to"]), dry)
            if rc != 0:
                print(f"        move refused; {r} left as `respondido`")
                continue
            if not dry:
                fl, body = split_fm(v.text[r])
                fl = fm_set(fm_set(fl, "estado", "aplicado"),
                            "actualizado", str(date.today()))
                v.write(r, compose(fl, body))
            acted += 1
        else:
            # No mechanical action exists: the answer is prose about what is
            # true. That is the agent's half of the job, deliberately not
            # attempted here.
            print(f"agent   {r}: answered, but resolving it means editing notes — "
                  "run the vault-steward skill")
    print(f"\n{acted} finding(s) carried out" + (" (--dry-run)" if dry else ""))
    return 0


# ---------------------------------------------------------------------------


def cmd_check(v: Vault, dry: bool, cap: int) -> int:
    global CARD_CAP
    CARD_CAP = cap
    today = str(date.today())

    findings, fixes, reports = check_all(v)
    healed = apply_fixes(v, fixes, dry)
    if healed and not dry:
        # The fixes changed the link graph and the index files. Re-derive
        # rather than card a broken link this run just repaired.
        v = Vault(v.root)
        findings, _, reports = check_all(v)

    created, closed, kept, over = sync_findings(v, findings, dry, today)
    moved = retire_closed(v, dry)

    summary = [
        f"{len(healed)} fixed automatically",
        f"{len(created)} new finding(s)",
        f"{kept} still open from before",
        f"{len(closed)} closed because the problem is gone",
        f"{len(reports)} thing(s) for the agent half",
    ]
    if over:
        summary.append(f"{over} finding(s) held back — the cap is {cap} open cards")

    write_steward_indexes(Vault(v.root) if not dry else v, dry, today, summary)

    subjects = [r for r in v.notes if not r.startswith(STEWARD_DIR + "/")]
    print(f"vault steward — {today}" + ("  (--dry-run)" if dry else ""))
    print(f"  {len(subjects)} notes, "
          f"{len({str(Path(r).parent) for r in subjects})} folders with notes\n")
    print("Fixed automatically (lossless only)")
    for h in healed or ["  none"]:
        print(f"  {h}" if h != "  none" else h)
    print("\nCards written to steward/")
    for c in created or ["  none"]:
        print(f"  {c}" if c != "  none" else c)
    if closed:
        print("\nClosed — the problem is gone")
        for c in closed:
            print(f"  {c}")
    if moved:
        print("\nRetired to steward/historial/")
        for a, b in moved:
            print(f"  {a} -> {b}")
    print("\nFor the agent half (not carded — fix these in place)")
    for line in reports or ["  none"]:
        print(f"  {line}" if line != "  none" else line)
    if over:
        print(f"\n  {over} further finding(s) held back; the cap is {cap} open cards.")
    print()
    return 0


def main() -> int:
    tools = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(prog="steward.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    # The vault is the one containing this tool, not a fixed path — the
    # same rule as vault-lint and vault-search, and for the same reason: a
    # hardcoded default silently pointed every call at a stale second vault
    # once already (docs/log.md, 2026-08-15).
    ap.add_argument("--vault", default=str(tools.parent))
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="scan, heal what is safe, write findings")
    c.add_argument("--dry-run", action="store_true")
    c.add_argument("--max-cards", type=int, default=CARD_CAP)

    m = sub.add_parser("move", help="move or rename, rewriting inbound links")
    m.add_argument("src")
    m.add_argument("dst")
    m.add_argument("--dry-run", action="store_true")

    a = sub.add_parser("apply", help="carry out answered proposals")
    a.add_argument("--dry-run", action="store_true")

    args = ap.parse_args()
    root = Path(args.vault).expanduser().resolve()
    if not root.is_dir():
        print(f"no vault at {root}", file=sys.stderr)
        return 2
    v = Vault(root)

    if args.cmd == "check":
        return cmd_check(v, args.dry_run, args.max_cards)
    if args.cmd == "move":
        return cmd_move(v, args.src, args.dst, args.dry_run)
    return cmd_apply(v, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
