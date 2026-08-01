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

# Branch hygiene: flag branches fully merged into main (safe to delete) and
# branches untouched 2+ days (the user finishes same-day work, so anything
# older than that is forgotten, not in progress). Written into Alain's group
# folder (mounted at /workspace/agent in his container) so his scheduled
# task can read and relay it as a chat message — this script only detects,
# it never deletes or messages anyone itself.
HYGIENE_FILE="$REPO_DIR/groups/alain/git-branch-hygiene.json"
mkdir -p "$(dirname "$HYGIENE_FILE")"

merged_json="[]"
stale_json="[]"
merged_list=""
stale_list=""

while read -r b; do
  [ "$b" = "main" ] && continue
  if git merge-base --is-ancestor "$b" main 2>/dev/null; then
    merged_list="$merged_list$b"$'\n'
  else
    ts=$(git log -1 --format=%ct "$b")
    age_days=$(( ( $(date +%s) - ts ) / 86400 ))
    if [ "$age_days" -ge 2 ]; then
      stale_list="$stale_list$b (${age_days}d)"$'\n'
    fi
  fi
done < <(git for-each-ref refs/heads --format='%(refname:short)')

if [ -n "$merged_list" ] || [ -n "$stale_list" ]; then
  node -e '
    const [merged, stale] = process.argv.slice(1);
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      merged: merged.trim() ? merged.trim().split("\n") : [],
      stale: stale.trim() ? stale.trim().split("\n") : [],
    }, null, 2));
  ' "$merged_list" "$stale_list" > "$HYGIENE_FILE"
else
  rm -f "$HYGIENE_FILE"
fi
