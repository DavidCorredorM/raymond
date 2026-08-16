---
name: schedule-job
description: Turn a plain-language request into a real scheduled job on this machine — a cron entry, a runner script, and a registry note in the vault. Use when the user says "every morning", "every Monday at 8", "run this nightly", "schedule this", "automate this", "remind me weekly", or asks what is currently scheduled, or wants a job changed or removed.
---

# Schedule a job

Scheduled unattended runs are a feature here, not a risk to be deferred
(README rule 4). The one thing a job owes is a **file trail**: it is
registered as a note in the vault, every run appends a line to that note,
and its real output lands as files. A run that left no file did not
happen.

You are creating three things, always, in this order:

1. `.claude/jobs/<JOB_NAME>.sh` — the runner cron actually executes
2. `.claude/jobs/<JOB_NAME>.md` — the registry note (rule 1: the job is a
   file, not just a line in `crontab -l` on a box nobody logs into)
3. one cron entry, added without touching anything else in the crontab

## 1. Script or agent? Decide this before anything else

| The job is | Use |
|---|---|
| Deterministic — regenerate a report, run the linter, commit and push, rsync a backup | **A plain script.** No Claude in the loop. |
| Needs judgment — summarize the week, triage what changed, write prose | **An agent run** (`claude -p`). |

**Prefer the script whenever it is genuinely sufficient.** An agent run
for something a script can do is slower, costs money per run, and gives a
different answer every time. "Deterministic thing, done by an agent" is
the most common way a scheduled job becomes expensive and flaky at once.

If the job is mostly deterministic with one judgment step, split it: a
script that does the work, and a separate, smaller agent job for the
judgment part.

## 2. Ask what you need, don't guess

- **When**, in the user's own words, and **which timezone**. "8am" is not
  a schedule until you know whose 8am.
- **What the output is, and where it belongs.** Not "an output folder" —
  output lands next to what it is *about*, the way a person filing that
  report by hand would choose a folder. A monthly numbers package belongs
  beside the notes about those numbers. This is a decided principle, not
  a preference: `docs/roadmap.md` §9. There is no `outputs/` folder in
  this vault and adding one is the wrong answer.
- **What should happen if it fails** — silently retry next time is
  usually right; say so out loud rather than leaving it implicit.
- For an agent job: **which tools it may use**, and a **cost ceiling**.

## 3. Write the runner script

Everything hard about cron is solved in this file, not in the crontab
line. Keep the crontab line dumb: a schedule and one path.

### 3a. A plain script job

```sh
mkdir -p .claude/jobs/logs
cat > .claude/jobs/<JOB_NAME>.sh <<'EOF'
#!/bin/bash
# Runner for the <JOB_NAME> job. Registered at .claude/jobs/<JOB_NAME>.md
set -uo pipefail

# Cron's PATH is roughly /usr/bin:/bin and no shell profile is sourced.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.npm-global/bin"

VAULT="<VAULT_ABS_PATH>"
JOB="<JOB_NAME>"
NOTE="$VAULT/.claude/jobs/$JOB.md"
LOG="$VAULT/.claude/jobs/logs/$JOB-$(date +%Y-%m).log"
mkdir -p "$(dirname "$LOG")"

# Never let two runs overlap. -n = give up rather than queue.
exec 9>"$VAULT/.claude/jobs/.$JOB.lock"
flock -n 9 || { echo "$(date -Iseconds) skipped: previous run still going" >>"$LOG"; exit 0; }

cd "$VAULT" || exit 1
START=$(date +%s); STAMP=$(date -Iseconds)

{
  echo "=== $STAMP ==="
  <THE ACTUAL COMMAND>
} >>"$LOG" 2>&1
CODE=$?

printf '| %s | %s | %ss |\n' "$STAMP" "$CODE" "$(( $(date +%s) - START ))" >>"$NOTE"
exit $CODE
EOF
chmod +x .claude/jobs/<JOB_NAME>.sh
```

### 3b. An agent job

Same skeleton, with the command replaced. Write the prompt to its own
file — a brief is long, and quoting it inside a shell script is how a
job silently breaks six weeks later.

```sh
cat > .claude/jobs/<JOB_NAME>.prompt.md <<'EOF'
<the brief: what to do, what "done" looks like, where output goes,
 and an explicit instruction to stop rather than ask a question>
EOF
```

```sh
timeout <SECONDS> claude -p "$(cat "$VAULT/.claude/jobs/$JOB.prompt.md")" \
  --output-format text \
  --permission-mode acceptEdits \
  --allowedTools "Read,Write,Edit,Glob,Grep" \
  --max-budget-usd <BUDGET> \
  </dev/null
```

Every flag there is load-bearing:

- **`-p`** — print and exit. Without it `claude` starts an interactive
  session, which under cron means a process that never returns.
- **`</dev/null`** — cron gives the job no stdin. Close it explicitly so
  nothing can block waiting on a terminal that isn't there.
- **`--permission-mode acceptEdits`** — *nobody is there to answer a
  permission prompt.* In the default mode a print-mode run cannot write
  files: it will churn and then die on its budget ceiling rather than do
  the work. `acceptEdits` clears file writes and edits only; `Bash` still
  needs an explicit rule, e.g.
  `--allowedTools "Bash(git add:*) Bash(git commit:*)"`. Grant the
  narrowest set the brief actually needs, and grant it deliberately —
  a job that can't do its work is the failure mode you get for free, and
  a job that can do anything is the one you have to choose.
- **`--max-budget-usd`** — the ceiling that ends a wedged run. This is
  the backstop that turns "my agent looped all night" into a line in the
  log with a non-zero exit code.
- **`timeout <SECONDS>`** — a wall-clock bound on top of the cost bound.
  They fail differently; you want both.
- **`cd "$VAULT"`** (in the skeleton above) — Claude Code loads
  `CLAUDE.md` from its working directory. Under cron the working
  directory is `$HOME`, so without the `cd` the agent runs with none of
  the vault's rules loaded. If the job legitimately needs a path outside
  the vault, add `--add-dir <PATH>` rather than starting somewhere else.

`--permission-mode bypassPermissions` (or `--dangerously-skip-permissions`)
is defensible on a personal box: it is the user's own machine and their
own vault. Use it only when the tool list genuinely can't be enumerated
up front, and tell the user plainly that you did. `assumed:` it refuses
to run as root — do not schedule agent jobs from the root crontab.

**Authentication.** `claude` must already be authenticated as the same
user who owns the crontab — run `claude` interactively once on that
account first. If the job fails with an auth error, `claude setup-token`
issues a long-lived token; keep it in a file **outside** the vault (e.g.
`~/.config/<NAME>/env`) and source it at the top of the runner. Never a
credential inside the vault — it is a git repo.

## 4. Register the job in the vault

The registry is files, not `crontab -l`. Copy
`_templates/note-template.md` for the standard frontmatter (do not write
it from memory, and use whatever field names this vault's `CLAUDE.md`
defines) and add a `job:` block:

```markdown
---
titulo: <Job title, one line>
tipo: referencia
area: meta
estado: activo
actualizado: <YYYY-MM-DD>
etiquetas: [job]
cuando-usar: "Read before changing, pausing or deleting the <JOB_NAME> job."
job:
  name: <JOB_NAME>
  schedule: "<CRON_SCHEDULE>"
  timezone: <TZ>
  kind: agent            # agent | script
  runner: .claude/jobs/<JOB_NAME>.sh
  log: .claude/jobs/logs/<JOB_NAME>-YYYY-MM.log
  output: <where its files land, e.g. projects/<thing>/>
  enabled: true
---

# <Job title>

What it does, in one paragraph, for someone who finds it broken in six
months and has no idea why it exists.

## Runs

| When | Exit | Duration |
|---|---|---|
```

The keys under `job:` are English machine keys, not vault schema fields —
same split the shipped `panel/home.md` already uses, where `widgets:`,
`kind:` and `params:` sit in English alongside this vault's own schema
fields. The runner appends one row per run to the table at the bottom, so
**the note grows downward and is never rewritten** — same discipline as
`daily/`.

Then add a row to `.claude/jobs/index.md` in the same change. An index
that lies is worse than no index.

Raw stdout goes to `.claude/jobs/logs/`, one file per month. Keep those
out of git — the committed trail is the run table in the note, not
megabytes of log churn:

```sh
grep -qxF '.claude/jobs/logs/' .gitignore 2>/dev/null || echo '.claude/jobs/logs/' >> .gitignore
```

`.claude/` is deliberately the right home for all of this: `vault-lint`
and `_tools/linkcheck.py` both skip it, so a job's brief and registry
can't contaminate the vault's broken-link and frontmatter counts. That is
not a theory — an agent brief left inside the vault did exactly that
once (`docs/log.md`, 2026-08-14).

## 5. Install the cron entry, without clobbering anything

Every job gets a marked block. The markers are what make edit and
removal safe later.

```sh
# No crontab yet is not an error here — the redirect leaves an empty file.
crontab -l 2>/dev/null > /tmp/cron.cur || true

# Drop any existing block for this job, so re-running this is idempotent.
awk '/^# >>> raymond:job:<JOB_NAME> >>>$/{s=1} !s{print} /^# <<< raymond:job:<JOB_NAME> <<<$/{s=0}' \
  /tmp/cron.cur > /tmp/cron.new

cat >> /tmp/cron.new <<'EOF'

# >>> raymond:job:<JOB_NAME> >>>
<CRON_SCHEDULE> /bin/bash <VAULT_ABS_PATH>/.claude/jobs/<JOB_NAME>.sh
# <<< raymond:job:<JOB_NAME> <<<
EOF

crontab /tmp/cron.new
crontab -l          # read it back — this is the confirmation, not the exit code
```

The crontab needs this header **once**, at the top. Add it if missing,
don't duplicate it:

```
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
MAILTO=""
CRON_TZ=<TZ>
```

`MAILTO=""` because cron's default is to mail output to a local mailbox
nobody on this machine will ever read — which is how a job fails
silently for a month. The runner redirects to a real log file instead.

## 6. Verify before walking away

An unverified scheduled job is a job you will discover is broken by
noticing its output never appeared.

```sh
# 1. Does the runner work at all, from a cron-like environment?
env -i HOME="$HOME" PATH=/usr/bin:/bin /bin/bash <VAULT_ABS_PATH>/.claude/jobs/<JOB_NAME>.sh
echo "exit=$?"

# 2. Did it leave the trail it is supposed to leave?
tail -5 <VAULT_ABS_PATH>/.claude/jobs/<JOB_NAME>.md
tail -20 <VAULT_ABS_PATH>/.claude/jobs/logs/<JOB_NAME>-$(date +%Y-%m).log

# 3. Is cron actually going to run it?
crontab -l | grep -A2 'raymond:job:<JOB_NAME>'
```

Step 1 is the one that matters. `env -i` strips your interactive
environment, which is exactly the difference between "works when I run
it" and "works at 3am". If it only passes without `env -i`, the runner is
depending on something cron won't give it.

For a first run, schedule it a couple of minutes out, watch it fire, then
edit the schedule to the real one. Cheaper than a day of waiting.

## 7. Cron pitfalls, each with the fix

Every one of these has cost somebody a night. All are handled by §3–§5
above; this is the checklist for when a job silently doesn't run.

| Symptom | Cause | Fix |
|---|---|---|
| `claude: command not found`, `node: not found` | Cron's `PATH` is roughly `/usr/bin:/bin` — it excludes `/usr/local/bin`, `~/.npm-global/bin` and every nvm path | `export PATH=...` at the top of the runner (§3), and a `PATH=` line in the crontab |
| Works interactively, not from cron | No shell profile is sourced. `~/.bashrc` also returns early for non-interactive shells, so `source ~/.bashrc` does not help either (`docs/08-server-setup.md`) | Set what you need explicitly in the runner. Never rely on a profile |
| Agent ignores every vault rule | Cron starts the job in `$HOME`, so `CLAUDE.md` never loads | `cd "$VAULT" \|\| exit 1` before invoking `claude` |
| Process never exits | Interactive `claude`, or something reading stdin | `-p` and `</dev/null` |
| Ran for hours / spent a fortune | No ceiling | `--max-budget-usd <BUDGET>` and `timeout <SECONDS>` |
| Failed for weeks, nobody knew | Cron mailed the error to a local mailbox | `MAILTO=""` plus `>>"$LOG" 2>&1`, and the run table in the job note |
| Command truncates at a `%`, or a log filename comes out mangled | In a crontab line, an unescaped `%` means newline | Escape it as `\%`, or keep `date` inside the runner where `%` is ordinary |
| Fires at the wrong hour | Cron uses the system timezone | `CRON_TZ=<TZ>` in the crontab, and record the timezone in the job note |
| Two copies running at once | A slow run overlapped the next tick | `flock -n` on a lock file (§3) |
| Job disappeared | Someone ran `crontab <file>` and replaced the whole thing | Always `crontab -l > backup` first, and only ever edit through the marked blocks (§5, §8) |
| `systemctl --user ...` fails from the job, works fine typed by hand | `XDG_RUNTIME_DIR` isn't set outside a real login session — `Linger=yes` alone does not set it, and it is the specific thing an interactive SSH session gets for free from `pam_systemd` that cron does not. Found 2026-08-16: a job's build succeeded, the restart step failed silently, and running the exact same command by hand minutes later "just worked" — which makes this look like a fluke instead of the guaranteed failure it actually is | `export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"` before any `systemctl --user` call in the runner. Confirmed with `env -i` that this one export is the whole fix — systemd derives `DBUS_SESSION_BUS_ADDRESS` from it, nothing else is needed |

If a job did not run at all and none of the above explains it, check the
system cron log (`journalctl -u cron` on Ubuntu) before assuming the
runner is at fault — it will say whether cron even tried.

## 8. List, edit, remove

**List** — the vault registry first, the machine second. They should
agree; if they don't, the machine is what actually runs, and the
disagreement is the bug to fix:

```sh
cat .claude/jobs/index.md
crontab -l | grep 'raymond:job:'
```

**Edit** — change the runner script or the job note freely; neither
requires touching cron. Only a schedule change needs the crontab, and the
add snippet in §5 is already idempotent: re-run it with the new
`<CRON_SCHEDULE>` and it replaces that job's block, leaving every other
entry alone. Update the `schedule:` field in the note in the same change.

**Pause** without deleting: set `enabled: false` in the note and remove
the crontab block. The runner, the prompt and the run history all stay.

**Remove** — back up first, filter by marker, never hand-edit:

```sh
crontab -l > /tmp/cron.bak
awk '/^# >>> raymond:job:<JOB_NAME> >>>$/{s=1} !s{print} /^# <<< raymond:job:<JOB_NAME> <<<$/{s=0}' \
  /tmp/cron.bak > /tmp/cron.new
crontab /tmp/cron.new
crontab -l          # confirm the job is gone and everything else survived
```

Then mark the note `estado: reemplazado` rather than deleting it —
supersede, don't delete. The run history is the record of what the
machine did while nobody was watching, which is the whole point of rule
4.

## 9. Why cron and not systemd timers

Cron, deliberately. A job is then one text file you can read, diff and
regenerate in a single command, and the vault registry stays the source
of truth with the crontab as a derived artifact. A systemd timer needs
two unit files per job, a `daemon-reload`, and — for a user unit —
`loginctl enable-linger`, or it stops at logout; this project already got
bitten by exactly that (`docs/log.md`, 2026-08-12).

The one thing that would change the answer: systemd timers have
`Persistent=true`, which runs a missed job after downtime. Cron has no
equivalent — if the machine is off at 3am, that run is simply skipped. If
a job must catch up after downtime, use a timer for that job and say why
in its note.

## 10. Tell the user what you built

In plain language, no YAML: what runs, when (in their timezone), what it
produces and where that lands, what it costs per run if it calls Claude,
where to look when it breaks, and the exact command to turn it off.
Someone non-technical should be able to stop this job without asking you.
