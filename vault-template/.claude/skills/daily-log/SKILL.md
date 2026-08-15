---
name: daily-log
description: Append a session entry to today's daily log in the vault. Use at the end of any working session, or when the user says "log this", "daily log", "what did I do today". Unconditional — every session gets logged, even short ones.
---

# Daily log

One file per day at `~/vault/daily/YYYY-MM-DD.md`. Append-only — never
rewrite earlier entries.

## Create the file if today's doesn't exist

```sh
DATE=$(date +%F)
FILE=~/vault/daily/$DATE.md
[ -f "$FILE" ] || cat > "$FILE" <<EOT
---
titulo: $DATE
tipo: log
area: bitacora
estado: activo
actualizado: $DATE
etiquetas: [diario]
cuando-usar: "Qué pasó el $DATE. Léelo al reconstruir la cronología de una decisión."
---

# $DATE
EOT
```

## Append the entry

```markdown
## HH:MM — <what this session was about>

- What changed, in one line each.
- Decisions made, and why.
- Anything that broke, and what fixed it.
- Open threads to pick up next time.
```

## Rules

- **Facts, not narration.** "Fixed Wi-Fi: needed `wpa_supplicant`" beats
  "worked on networking issues".
- **Anything non-obvious learned here should also become a real note** in
  `notes/` via the `capture-note` skill. The daily log is chronological;
  atomic notes are how things get found later.
- Link to notes written today with `[[wiki-links]]`.
