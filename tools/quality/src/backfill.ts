import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isCommitScanned, appendCommitRecord, type History } from './metrics.js';
import { runScan } from './scan.js';

const REPO_ROOT = process.env.REPO_ROOT ?? process.cwd();
const HISTORY_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'history.json');
// Write history to a temp path during iteration — files written inside the repo while in
// detached HEAD state block `git checkout <branch>` with "untracked file would be overwritten".
const HISTORY_TMP = '/tmp/quality-history-tmp.json';

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  // Get commits on this fork that are not in upstream/main, oldest-first
  const logOutput = git('log upstream/main..HEAD --reverse --format="%H %cI %s"');
  const lines = logOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Parse commit list
  const commits = lines.map((line) => {
    const [hash, date, ...subjectParts] = line.replace(/^"/, '').replace(/"$/, '').split(' ');
    return { hash: hash ?? '', date: date ?? '', subject: subjectParts.join(' ') };
  }).filter((c) => c.hash.length > 0);

  // Load existing history from the canonical path (we're still on main here)
  const historyRaw = fs.existsSync(HISTORY_PATH)
    ? fs.readFileSync(HISTORY_PATH, 'utf8')
    : '{"commits":[]}';
  let history: History = JSON.parse(historyRaw);

  const unscanned = commits.filter((c) => !isCommitScanned(history, c.hash));
  const total = commits.length;
  let done = total - unscanned.length;

  console.log(`[backfill] ${total} commits total, ${unscanned.length} to scan`);

  if (unscanned.length === 0) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  // Stash if working tree is dirty
  const isDirty = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  if (isDirty) {
    console.log('[backfill] Stashing uncommitted changes...');
    execSync('git stash', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  const originalHead = git('rev-parse HEAD');

  // Seed temp file with current history so we can write incrementally
  fs.writeFileSync(HISTORY_TMP, JSON.stringify(history, null, 2));

  try {
    for (const commit of unscanned) {
      done++;
      const shortHash = commit.hash.slice(0, 7);
      process.stdout.write(`[${done}/${total}] ${shortHash} ${commit.subject}\n`);

      execSync(`git checkout ${commit.hash}`, {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      process.env.REPO_ROOT = REPO_ROOT;

      let record;
      try {
        record = await runScan();
      } catch (err) {
        console.warn(`[backfill] Scan failed for ${shortHash}:`, (err as Error).message?.slice(0, 80));
        continue;
      }

      history = appendCommitRecord(history, record);
      // Write to temp path — writing inside the repo while in detached HEAD state
      // blocks the restore checkout with "untracked file would be overwritten"
      fs.writeFileSync(HISTORY_TMP, JSON.stringify(history, null, 2));
    }
  } finally {
    // Restore HEAD before moving any files into the repo
    console.log('[backfill] Restoring original HEAD...');
    execSync(`git checkout ${originalHead}`, { cwd: REPO_ROOT, stdio: 'inherit' });

    if (isDirty) {
      console.log('[backfill] Popping stash...');
      try {
        execSync('git stash pop', { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        console.warn('[backfill] stash pop failed — run: git stash pop');
      }
    }

    // Now safe to write history into the repo
    fs.copyFileSync(HISTORY_TMP, HISTORY_PATH);
    console.log(`[backfill] History saved (${history.commits.length} commits).`);
  }

  // Run baseline scan (also handles its own stash/restore internally)
  console.log('[backfill] Running baseline scan against upstream/main...');
  const result = spawnSync(
    'pnpm',
    ['--filter', 'quality', 'scan', '--', '--baseline'],
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.warn('[backfill] Baseline scan failed. Run: git fetch upstream && pnpm --filter quality scan --baseline');
  }

  console.log('[backfill] Done.');
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  try {
    execSync('git checkout -', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch { /* ignore */ }
  process.exit(1);
});
