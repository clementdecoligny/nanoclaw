import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isCommitScanned, appendCommitRecord, type History } from './metrics.js';
import { runScan } from './scan.js';

// pnpm sets cwd to the package dir (tools/quality/). Resolve two levels up to repo root.
const REPO_ROOT = process.env.REPO_ROOT ??
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const HISTORY_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'history.json');

function git(args: string, cwd = REPO_ROOT): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}

async function scanCommitInWorktree(hash: string): Promise<Awaited<ReturnType<typeof runScan>>> {
  const wtPath = `/tmp/quality-wt-${hash.slice(0, 7)}`;

  // Clean up any stale worktree from a previous interrupted run
  if (fs.existsSync(wtPath)) {
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
    } catch { /* may not be registered */ }
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  execSync(`git worktree add --detach "${wtPath}" ${hash}`, {
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    return await runScan(wtPath);
  } finally {
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
    } catch { /* ignore */ }
    fs.rmSync(wtPath, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  // Get commits on this fork that are not in upstream/main, oldest-first
  const logOutput = git('log upstream/main..HEAD --reverse --format="%H %cI %s"');
  const lines = logOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const commits = lines.map((line) => {
    const [hash, date, ...subjectParts] = line.replace(/^"/, '').replace(/"$/, '').split(' ');
    return { hash: hash ?? '', date: date ?? '', subject: subjectParts.join(' ') };
  }).filter((c) => c.hash.length > 0);

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

  for (const commit of unscanned) {
    done++;
    const shortHash = commit.hash.slice(0, 7);
    process.stdout.write(`[${done}/${total}] ${shortHash} ${commit.subject}\n`);

    let record;
    try {
      record = await scanCommitInWorktree(commit.hash);
    } catch (err) {
      console.warn(`[backfill] Scan failed for ${shortHash}:`, (err as Error).message?.slice(0, 120));
      continue;
    }

    history = appendCommitRecord(history, record);
    // Write incrementally — if interrupted, progress so far is preserved
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  }

  console.log(`[backfill] History saved (${history.commits.length} commits).`);

  // Baseline scan — also uses a worktree internally (see scan.ts --baseline path)
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
  process.exit(1);
});
