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

# Refuse to snapshot mid-merge/rebase/cherry-pick: committing here would bake
# an in-progress conflict resolution into the backup history.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ] || [ -f .git/CHERRY_PICK_HEAD ]; then
  echo "backup-db: repo has an operation in progress (merge/rebase/cherry-pick), skipping backup" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "HEAD" ]; then
  echo "backup-db: detached HEAD, refusing to commit backup here" >&2
  exit 1
fi

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

git commit --no-verify -m "chore: daily backup $(date -u +%Y-%m-%d) [$BRANCH]"
git push origin "$BRANCH"

if [ "$BRANCH" != "main" ]; then
  echo "backup-db: snapshotted branch '$BRANCH', not 'main' — main's backup history has a gap for today until this is merged" >&2
fi
