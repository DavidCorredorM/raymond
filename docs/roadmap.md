---
scope: Raymond, the base package (this repo, including panel/), not any single deployment
---

# Roadmap — deferred base-package work

Decisions and gaps that apply to Raymond generically, deferred rather than
lost. Not Angela-specific — anything about her vault's content or her
SIGRA skills lives in her deployment, not here.

## 5. Git remote for the vault

Right now a vault's git history lives only on the machine it was created
on. A disk failure loses all of it — notes and history both. Needs:

- Decide the default: does the bootstrap script prompt for a remote, or
  is this left entirely to the user?
- Document the private-repo requirement prominently — a vault is
  personal notes by default.
- Consider whether the panel should surface "no remote configured" as a
  visible warning, since a silent gap here is the dangerous kind.

## 6. Backup, distinct from git

Git is version control, not backup — it doesn't protect against the
machine itself dying, and a sync mechanism (once phase 2 picks one)
propagates deletions and corruption exactly as faithfully as edits.
Needs a real off-box target and schedule. `restic` was the working
assumption in `01-decisions.md`; not yet designed or scripted.

## 7. Dashboards-as-files spec, agent inbox, proposal/approve flow

The architectural principle is settled (see `panel/README.md`): a
dashboard is a file with a frontmatter widget spec, an agent adds a todo
or a message by writing a file, nothing lives only in the app's memory.

**Partially designed now** — `panel/docs/frontend-implementation-plan.md`
§5 specifies the widget spec (`query`, `stale`, `count`, `vault-health`,
`backlinks`, plus a phase-4 `actions` kind), with worked YAML examples,
and reasons through why it's a flat filter object rather than a query
language (this app has no auth in front of it — a query language is
arbitrary power handed to anything that can write a file).

Still not designed:

- Where the agent's proposals land before a human approves them —
  `inbox/` vs a git branch, and what the panel does with either
- The approve/reject UI and what "reject" does to the underlying file
- Conflict resolution — the plan explicitly leaves this out of phase 1;
  writes are full-file overwrites with no ETag, so two tabs editing the
  same note will clobber each other

## 8. Field names are English in prose, Spanish in the one field that matters

`vault-template/CLAUDE.md` and its tools (`vault-lint`, `vault-search`,
`linkcheck.py`, the panel's `/api/health/vault`) are written in English
but all hardcode **`cuando-usar`** — Spanish — as the retrieval-key field
name, because that's what got built and verified against Angela's real
vault. A fresh English-language deployment inherits a Spanish field name
with no indication why.

Found and partially fixed 2026-08-15: `vault-template/CLAUDE.md` had
Angela's specific `companies/icpp/`, `companies/sigra/` structure
hardcoded as if it were the generic default, and the shipped
`panel/home.md` was in Spanish prose. Both fixed — the structure section
is now generic guidance rather than one deployment's actual folders, and
`home.md`'s prose is English. The field-name coupling itself (documented
in an earlier log entry as "the abstraction is deliberately not built
yet") was not — fixing it means either parameterizing every tool's field
name or shipping two schema variants, and doing that correctly needs more
than the time available in the pass that found it.

Until fixed: **any new deployment inherits `cuando-usar` as the literal
field name**, regardless of the vault's language. Rename it consistently
across `_templates/`, `_tools/*`, and `panel/server/src/index.ts`'s
health check if a deployment wants a different name — same instruction
as before, now written down instead of only implied.
