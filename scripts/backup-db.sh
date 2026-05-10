#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="$REPO_DIR/data/v2.db"
DUMP="$REPO_DIR/data/v2.dump.sql"

if ! command -v sqlite3 &>/dev/null; then
  sudo apt-get install -y -q sqlite3
fi

# Checkpoint WAL into the main DB file before dumping
sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);"

sqlite3 "$DB" .dump > "$DUMP"

cd "$REPO_DIR"
git add -f data/v2.dump.sql
git add groups/

# Back up per-agent-group shared settings (model overrides, env flags, etc.)
find data/v2-sessions -name "settings.json" -path "*/.claude-shared/*" | while read -r f; do
  git add -f "$f"
done

if git diff --cached --quiet; then
  echo "backup-db: nothing changed, skipping commit"
  exit 0
fi

git commit --no-verify -m "chore: daily backup $(date -u +%Y-%m-%d)"
git push origin main
