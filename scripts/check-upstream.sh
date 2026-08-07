#!/usr/bin/env bash
#
# Weekly upstream-awareness gate. NOTIFY ONLY — never merges, never checks out,
# never touches the working tree. Exists to stop the gap that made the 2026-08
# sync a 601-commit, 36-conflict event.
#
# Pre-task gate contract: the LAST stdout line must be
#   {"wakeAgent": <bool>, "data": {...}}
# wakeAgent=false costs zero tokens, so a quiet week is free.
#
# State lives in data/.upstream-watch-last so we only wake on NEW commits, not
# on the same backlog every week.
set -uo pipefail

cd "$(dirname "$0")/.." || { echo '{"wakeAgent": false, "data": {"error": "cd failed"}}'; exit 0; }

STATE_FILE="data/.upstream-watch-last"

# Read-only: writes refs/objects into .git/, never the worktree.
if ! git fetch upstream --tags --quiet 2>/dev/null; then
    # Surface as an error run so repeated failures back off and eventually pause.
    echo "ERROR: git fetch upstream failed" >&2
    exit 1
fi

BEHIND=$(git rev-list --count HEAD..upstream/main 2>/dev/null || echo 0)
HEAD_UP=$(git rev-parse --short upstream/main 2>/dev/null || echo "unknown")
LAST_SEEN=$(cat "$STATE_FILE" 2>/dev/null || echo "")

# Nothing new since the last report → stay silent.
if [ "$BEHIND" = "0" ] || [ "$HEAD_UP" = "$LAST_SEEN" ]; then
    echo "{\"wakeAgent\": false, \"data\": {\"behind\": $BEHIND, \"upstreamHead\": \"$HEAD_UP\"}}"
    exit 0
fi

LOCAL_VER=$(node -p "require('./package.json').version" 2>/dev/null || echo "?")
UP_VER=$(git show upstream/main:package.json 2>/dev/null \
    | node -p "JSON.parse(require('fs').readFileSync(0)).version" 2>/dev/null || echo "?")

# The two things that turned the last sync into a blocker: schema changes and
# breaking-change notes. Counted, not dumped — data must stay small.
MIGRATIONS=$(git diff --name-only HEAD..upstream/main -- src/db/migrations/ 2>/dev/null | wc -l | tr -d ' ')
BREAKING=$(git log HEAD..upstream/main --oneline --grep='BREAKING' -i 2>/dev/null | head -10 | tr '\n' ';' | sed 's/"/\\"/g')
SURFACES=$(git diff --name-only HEAD..upstream/main \
    -- src/channels/ src/container-runner.ts container/Dockerfile versions.json 2>/dev/null \
    | wc -l | tr -d ' ')

echo "$HEAD_UP" > "$STATE_FILE"

printf '{"wakeAgent": true, "data": {"behind": %s, "localVersion": "%s", "upstreamVersion": "%s", "migrationFilesChanged": %s, "installSurfacesChanged": %s, "breakingCommits": "%s"}}\n' \
    "$BEHIND" "$LOCAL_VER" "$UP_VER" "$MIGRATIONS" "$SURFACES" "$BREAKING"
exit 0
