#!/bin/bash
# Starter script for the `boton` trick. Replace the body with real work.
#
# It exits 0 and says plainly that it is a stub. That is deliberate: a
# half-built trick says so in its own output rather than presenting a
# button that appears to work (README, "Conventions"). Faking output here
# is how someone later trusts a number nobody computed.
#
# Notes for whatever replaces this:
#   - Run with execFile and no shell, with a hard 5s timeout. Anything
#     slower than that belongs in a scheduled job, not a button.
#   - Arguments come from `args:` in trick.yaml, fixed at author time.
#     Nothing a browser sends reaches this script.
#   - Output belongs next to what it is about, never in a dump folder.
#   - A secret is read from a file outside the vault (e.g.
#     ~/.config/<name>/env) and sourced here. The vault is a git repo.
set -uo pipefail

echo "This is the starter script for the 'boton' trick."
echo "It has not been replaced with real work yet, so it did nothing."
echo
echo "Edit .claude/tricks/<your trick>/ejemplo.sh and this text changes."
exit 0
