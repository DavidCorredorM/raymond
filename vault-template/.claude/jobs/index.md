---
titulo: Scheduled jobs
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta, job]
cuando-usar: "Read to see everything this machine runs on a schedule, before adding, changing or removing a job."
---

# Scheduled jobs

Everything this machine runs unattended, one row per job. This table is
the registry — `crontab -l` is what actually executes, and the two are
meant to agree. If they don't, the machine is the truth and the
difference is a bug to fix.

Jobs are created by the `schedule-job` skill: describe what you want and
when, in plain language, and it writes the runner, the note and the cron
entry. Don't hand-edit the crontab.

| Job | When | Kind | Output lands in | Status |
|---|---|---|---|---|
| — | — | — | — | Nothing scheduled yet |

## What's in this folder

| File | What |
|---|---|
| `<job>.md` | One note per job: its schedule, what it does, and a run-by-run table appended by the runner |
| `<job>.sh` | The runner script cron executes |
| `<job>.prompt.md` | The brief, for jobs that run an agent rather than a script |
| `logs/` | Raw stdout and stderr, one file per job per month. Not committed — the run table in each job's note is the committed trail |

Why here and not in a normal vault folder: `vault-lint` and
`_tools/linkcheck.py` both skip `.claude/`, so a job's brief and its
example links can't contaminate the vault's own health counts.
