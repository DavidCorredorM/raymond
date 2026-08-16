---
name: vault-steward
description: Keep the vault organized and internally consistent — check it against conventions.md, fix what is safe, and raise a card for everything that needs a human decision. Finds contradictions between notes, facts that have gone stale, misplaced notes, and folders that have outgrown their shape, and proposes folder refactors with the link rewriting included. Use when the user asks whether the vault is drifting, wants a tidy-up or a reorganization, says two notes disagree, asks what the steward found, or answers a card. This is also what the every-three-days scheduled run invokes.
---

# Vault steward

Two jobs, in this order, because the second is worthless without the first:

1. **Keep the vault organized** — a clear, human-readable structure, with
   folder and naming conventions that hold everywhere, not just in the
   folders someone was paying attention to.
2. **Keep it honest** — no two notes quietly claiming different things, no
   fact that stopped being true a year ago sitting there unmarked.

The rules being enforced are in **`conventions.md`** at the vault root.
Read it before doing anything here. If you find yourself enforcing a rule
that is not written there, either write it there first or stop enforcing
it — an unwritten convention is a preference, and a preference the user
cannot read is one they cannot disagree with.

---

## 1. Two halves, and which is which

**Prefer the script wherever a script suffices.** An agent run for
something deterministic is slower, costs money every time, and gives a
different answer on Tuesday than it gave on Monday. That is an
engineering argument, not a safety one, and it is the same one
`schedule-job` §1 makes.

| Half | What it decides | Who does it |
|---|---|---|
| **Deterministic** | Broken wiki-links · filenames against the pattern · duplicate basenames · missing or incomplete frontmatter · missing folder indexes · index rows that are missing · orphaned notes · empty folders · folders past the fan-out limit · notes past the depth limit · notes loose at the root | `_tools/steward.py check` — a plain Python script, stdlib only, no model, no cost |
| **Judgment** | Contradictions between notes · facts that have probably gone stale · a note filed in the wrong folder · *what the subfolders of an overgrown folder should actually be* · writing a real `cuando-usar` · reading a user's free-text answer and acting on it | You, in this skill |

The script hands you its half of the work in its run report. Do not
re-derive it by reading files yourself; you will be slower and less
complete.

```sh
_tools/steward.py check              # scan, heal what is safe, write cards
_tools/steward.py check --dry-run    # report only, writes nothing
_tools/steward.py apply              # carry out answered proposals
_tools/steward.py move A B           # move/rename + rewrite every inbound link
```

## 2. Its relationship to `vault-health` — extend and call, do not absorb

`vault-health` and `_tools/vault-lint` **stay exactly as they are**, and
this skill does not replace either. The split is by *when*, not by *what*:

- **`vault-health`** is the thing a person reaches for: "is my vault okay
  right now?", usually right after an import or a bulk rename. Three
  checks, a short report, fix them in the same session, done.
- **`vault-steward`** is the unattended one. It runs on a schedule, it
  checks against a much wider set of rules, and instead of fixing
  everything it can, it deliberately leaves a queue of questions for a
  human, because nobody was there to ask.

`steward.py` **imports `_tools/linkcheck.py`** rather than resolving
wiki-links a second way, so "broken" means the same thing in both tools.
That was deliberate: a link checker that disagrees with the other link
checker is how both get ignored. If you touch link resolution, touch it
in `linkcheck.py`.

The overlap that remains is intentional and cheap: `vault-lint` is three
checks in a second, and `steward.py check` is the full sweep. Running
either is never wrong.

## 3. The run, in order

**Step 1 — the script.**

```sh
_tools/steward.py check
```

It heals what is provably safe (below), writes one card per finding into
`steward/`, closes cards whose problem has gone away, retires answered
cards into `steward/historial/`, and prints a report ending in a section
headed *"For the agent half"*. That section is your input.

**Step 2 — the reported items.** Fix these in place. They are not cards
because each has one right answer that just needs a sentence written:

- Notes with no frontmatter, or missing a required field. Copy
  `_templates/note-template.md`. **`cuando-usar` is a real sentence about
  when to open the file**, never "About X".
- A `tipo` or `estado` outside the allowed set, a malformed date.
- A link target that resolves to nothing and resembles nothing. Decide
  which it is: a deliberate placeholder for a note worth writing
  (`conventions.md` §4 — leave it), or a target that was deleted (repoint
  it or remove the link, and say which in your summary).
- Under-linked notes. Add real links, meaning links that say something.
  Do not link two notes together to satisfy a counter.

**Step 3 — the judgment sweep.** §4.

**Step 4 — answers from last time.** §6.

**Step 5 — re-run and leave it clean.**

```sh
_tools/steward.py check --dry-run && _tools/vault-lint
```

## 4. The judgment half — writing a card

A card is a note in `steward/` with `tipo: hallazgo`. The script writes
its cards in exactly this shape and yours must match it, because the same
script reads them back and the same trick renders them.

```markdown
---
titulo: Two notes disagree on when the migration finished
tipo: hallazgo
area: meta
estado: abierto                 # abierto | respondido | aplicado | descartado | resuelto
actualizado: 2026-08-15
etiquetas: [steward, contradiction]
cuando-usar: "Answer this to settle whether the migration finished in March or June."
pregunta: Which is right — March or June?
respuesta: ""                   # the user's own words. You never write here.
decision: ""                    # aplicar | descartar. You never write here either.
respondido: ""
finding:
  kind: contradiction           # contradiction | stale | misplaced
  source: judgment              # never `deterministic` — the script owns that word
  confidence: high              # high | medium | low
  fingerprint: a1b2c3d4e5       # 10 hex chars, stable across runs for the same finding
  detected: 2026-08-15
  notes:
    - notes/the-migration-finished-in-march.md
    - notes/the-migration-slipped-to-june.md
  proposal:
    action: none                # none | move | rename
---

# Two notes disagree on when the migration finished

**Which is right — March or June?**

> `the-migration-finished-in-march.md` (actualizado 2026-01-20)
> "Signed off at the January review. Finished 2026-03-31, no slippage."

> `the-migration-slipped-to-june.md` (actualizado 2026-05-02)
> "The March date is dead. New date 2026-06-30."

Neither is marked `reemplazado` and neither links to the other, so a
reader arriving from search gets whichever they happen to open. The later
note reads like a supersession, but nothing in the vault says so — and a
note can be edited after it is wrong, so dates are not proof.

## Notes involved

- [[the-migration-finished-in-march]] — `notes/the-migration-finished-in-march.md`
- [[the-migration-slipped-to-june]] — `notes/the-migration-slipped-to-june.md`

## Answering

Type what is true into `respuesta:` in the frontmatter above — in the
panel's steward card, or in any editor. Then set `decision:` to `aplicar`
or `descartar` and `estado:` to `respondido`. The next steward run reads it.
```

Six rules for writing one, each of which has a failure mode behind it:

1. **Quote both sides, verbatim, with the note's own `actualizado`.** A
   card that says "these two notes disagree" and makes the user open both
   is a card they will skip. The whole value is that the conflict is
   already assembled.
2. **Ask one answerable question in `pregunta`.** "Which is right — March
   or June?" is answerable. "Please review these notes" is not.
3. **Say what you do *not* know.** Later `actualizado` is evidence, not
   proof. Write that down rather than quietly assuming it.
4. **`confidence: low` is a good card, not a bad one** — as long as the
   card says why it is low. "A claim about a number with nothing to check
   it against" is worth flagging. "I have a feeling" is not; do not write
   that card at all.
5. **Never put a broken target inside `[[ ]]`.** A card is a note, and the
   next `vault-lint --links` will report the steward's own output as
   damage. Write the target as `` `like-this` ``. Real `[[links]]` are for
   notes that actually exist — those you *want*, because they put the card
   next to its subject in the graph.
6. **`fingerprint` must be stable.** Same finding, same fingerprint, or
   every run writes the card again. Derive it from the kind plus the sorted
   paths involved: `printf '%s' "contradiction|a.md|b.md" | shasum | cut -c1-10`.

**Cap yourself at about ten judgment cards per run**, worst first. The
script caps its own at 25 open (`conventions.md`, The numbers). A queue
nobody can face is a queue nobody opens, and the findings are still true
next run.

### What to actually look for

- **Contradictions.** Two notes asserting different values for the same
  thing: a date, an amount, an owner, a decision, a status. Search by
  subject, not by keyword — `_tools/vault-search` ranks `cuando-usar`
  first for exactly this.
- **Superseded but unmarked.** The specific and very common shape: the
  newer note is right, the older one is still `estado: activo` and does
  not link to it. That is a card, and its proposal is prose — "mark the
  March note `reemplazado` and link it to the June one" — not a move.
- **Stale.** A note whose claim was time-bound and whose `actualizado` is
  long past: "the contract renews in March", "we are currently trialling
  X". Not merely old — an evergreen note can be five years old and
  perfectly true. The test is whether the *claim* has an expiry.
- **Misplaced.** A note about one project sitting in `notes/` when that
  project has a folder. Propose a `move`; the script will do the link
  rewriting.
- **The shape of an overgrown folder.** The script tells you a folder has
  outgrown flat. **You decide the groups** — two to five of them, named
  the way the user talks about the work, each with an `index.md`. Emit one
  `move` card per note, or one card describing the whole grouping and let
  the user answer it in prose; the first is more clickable, the second is
  less noise. Judge by how many notes are involved.

## 5. The boundary that must not move

> **Anything that can lose information is a proposal, never an automatic
> action — regardless of how confident the analysis is.**

This is the whole safety story of a thing that edits somebody's notes
while they are asleep. It is stated identically in `conventions.md` §5 and
at the top of `_tools/steward.py`, and it is written in three places
because a future author will be tempted in at least one of them.

| Safe, done automatically | Never automatic, always a card |
|---|---|
| Create a missing `index.md` | Delete a note, a folder or a line |
| Add a missing row to an index | Merge two notes, however duplicated |
| Repoint a broken link whose target resolves unambiguously to exactly one existing note | Repoint a link with more than one plausible target |
| | Rename or move a file |
| | Rewrite a `titulo`, a `cuando-usar` or any body text |
| | Decide which side of a contradiction is true |

Why repointing a link is on the left: the link was **already broken**, the
old text is in git, and the check requires exactly one candidate after
normalization. Nothing is lost even when it is wrong. Compare deleting a
"duplicate" note, where being wrong is unrecoverable without git — and
where "I checked git" is not something a user should have to do because
of a tidy-up.

**Never move a file with `mv`, `git mv`, `Bash`, or by writing a new file
and deleting the old one.** Use `_tools/steward.py move`, always:

```sh
_tools/steward.py move "notes/Untitled 3.md" notes/wifi-needs-wpa-supplicant.md
```

It refuses if the destination exists, if the new basename is used
anywhere else in the vault, or if the destination is outside the vault;
it rewrites every inbound wiki-link in all three link forms; it carries
the note's row from the old folder's index to the new one, keeping the
description; and if any rewrite fails it rolls the whole thing back. A
move that leaves the links behind is not a fix, it is a second problem
stacked on the first.

## 6. Reading answers

```sh
_tools/steward.py apply
```

For each card the user marked `estado: respondido`:

| `decision` | `finding.proposal.action` | What happens |
|---|---|---|
| `descartar` | anything | card → `descartado`. Nothing else. Do not argue; if the user says it is fine, it is fine. |
| `aplicar` | `move` / `rename` | the script does the move and the link rewrite, card → `aplicado` |
| `aplicar` | `none` | the script prints `agent …` and stops — **this one is yours** |

The `agent …` lines are contradictions and stale facts, where the answer
is prose about what is true. For each:

1. Read `respuesta:`. It is the user's own words and it is the authority
   here — above the notes, above your earlier analysis, above what the
   dates suggest.
2. Edit the notes so the vault says that. Usually: correct the wrong note,
   mark the superseded one `estado: reemplazado`, link it to the one that
   replaced it, and bump `actualizado` on both. **Supersede, do not
   delete** (`CLAUDE.md`).
3. Set the card to `estado: aplicado` and add a line under a
   `## Resolved` heading saying what you changed. The next run retires it
   into `steward/historial/`, which is the record of how the vault came to
   say what it says.
4. If the answer does not actually settle it, leave the card `abierto`,
   keep the `respuesta`, and add what is still missing to the body. Do not
   guess to close a card.

## 7. Running it every three days

The trick declares the schedule; it does not install it. Hand off to
**`schedule-job`**, which writes the runner, the registry note in
`.claude/jobs/` and the cron block:

- **Name:** `vault-steward` — it must match `trabajo.estado.job` in
  `.claude/tricks/vault-steward/trick.yaml`, or the panel's header shows
  "no scheduled run installed" forever.
- **Schedule:** `0 6 */3 * *`, in the user's timezone. `*/3` on
  day-of-month means days 1, 4, 7 … 28, 31 and then resets, so a month
  boundary can give a one- or two-day gap. Say that out loud rather than
  implying exact 72-hour spacing.
- **Kind:** agent. The deterministic half alone would be `kind: script`
  and free, and that is a legitimate cheaper option to offer the user:
  the script on the schedule, the agent run only when they ask. Offer it.
- **Tools:** `Read,Write,Edit,Glob,Grep`, plus
  `Bash(_tools/steward.py:*)` and `Bash(_tools/vault-lint:*)`. Nothing
  wider. The job edits notes; it has no reason to run anything else.
- **Brief:** `.claude/skills/vault-steward/brief.md`, copied to
  `.claude/jobs/vault-steward.prompt.md`. Do not paste it into the runner
  script; a long brief quoted inside shell is how a job breaks silently
  six weeks later.
- **Budget and timeout:** a real `--max-budget-usd` and a `timeout`. Both,
  because they fail differently.

Then verify it the way `schedule-job` §6 says — `env -i`, watch it fire
once, check the run row landed in the job note.

## 8. The panel side

`.claude/tricks/vault-steward/` renders `steward/` as cards: the strange
thing, the question, the evidence on demand, a box to type what is true,
and three buttons. It declares `vault.query`, `vault.read` and
`vault.write` on `steward/` only, plus `trabajo.estado`. Its
`vault.write.campos` is exactly `estado, respuesta, decision, respondido,
actualizado` — **the app can annotate a finding and nothing else.** It
cannot touch the notes in dispute, cannot create a file, cannot run a
script.

That is not an oversight to fix later. Structural change to the vault
belongs to the scheduled run, where it lands as a commit with a run row
behind it (README rule 4), not to a button pressed by anything that can
reach the tailnet (rule 3).

Answering in the panel and answering in an editor are the same act: both
write the same five fields into the same file. Say so when a user asks
whether they have to use the panel. They do not.

## 9. Telling the user

Plain language, no YAML, every time:

- **what it changed by itself** — the list from the run report, and the
  fact that all of it is recoverable with `git checkout`
- **what it is asking**, in one line each, and that answering is not
  urgent and nothing expires
- **the two ways to answer**: the panel's steward trick, or editing the
  file in any editor including Obsidian on a phone
- **what happens next**: a rename is carried out on the next run; an
  answer about what is true is picked up by this skill
- **anything it deliberately did not touch**, and why

Never report a card count as a health score. Twelve cards on a vault
somebody has been using for a year is normal, and framing it as a grade
teaches them to close cards rather than answer them.
