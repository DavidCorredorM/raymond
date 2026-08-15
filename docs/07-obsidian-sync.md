# 06 — Obsidian vault sync

**Not started.** Blocked on the OS install (`docs/02-*` through
`docs/05-*`) being finished.

This file exists to hold the decision when we get there. The four
realistic approaches, so the choice isn't made from scratch later:

| Approach | What it gives | Cost |
|---|---|---|
| **Syncthing** | Continuous file-level sync between Mac, phone and server. No server-side Obsidian needed. | Conflict files on simultaneous edits. Mobile support on iOS is poor. |
| **Git** | Full version history, trivial rollback, works with the vault as plain files. | Manual or cron'd commits. Merge conflicts need hands. |
| **Obsidian LiveSync (CouchDB)** | Near-realtime sync, proper mobile support including iOS, handles conflicts inside Obsidian. | Runs a CouchDB instance. Most moving parts of the four. |
| **Samba / NFS share** | Vault lives in one place, no sync at all. | Only works on the LAN. Obsidian over a network share is slow and risks index corruption. |

Decide once the server is up. The choice depends on whether the vault
needs to be reachable from outside the house and whether iOS is in
scope — both open questions in `docs/01-decisions.md`.
