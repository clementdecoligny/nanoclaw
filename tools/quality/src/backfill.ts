import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isCommitScanned, appendCommitRecord, type History } from './metrics.js';
import { runScan } from './scan.js';

const REPO_ROOT = process.env.REPO_ROOT ?? process.cwd();
const HISTORY_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'history.json');

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
    // Format: "<hash> <date> <subject...>"
    const [hash, date, ...subjectParts] = line.replace(/^"/, '').replace(/"$/, '').split(' ');
    return { hash: hash ?? '', date: date ?? '', subject: subjectParts.join(' ') };
  }).filter((c) => c.hash.length > 0);

  // Load existing history
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
  }

  // Stash if working tree is dirty
  const isDirty = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  if (isDirty) {
    console.log('[backfill] Stashing uncommitted changes...');
    execSync('git stash', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  const originalHead = git('rev-parse HEAD');

  try {
    for (const commit of unscanned) {
      done++;
      const shortHash = commit.hash.slice(0, 7);
      process.stdout.write(`[${done}/${total}] ${shortHash} ${commit.subject}\n`);

      // Checkout this commit
      execSync(`git checkout ${commit.hash}`, {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set REPO_ROOT so scan.ts uses the right directory
      process.env.REPO_ROOT = REPO_ROOT;

      let record;
      try {
        record = await runScan();
      } catch (err) {
        console.warn(`[backfill] Scan failed for ${shortHash}:`, (err as Error).message?.slice(0, 80));
        continue;
      }

      history = appendCommitRecord(history, record);
      // Write incrementally so progress is preserved on interruption
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    }
  } finally {
    // Always restore original HEAD
    console.log('[backfill] Restoring original HEAD...');
    execSync(`git checkout ${originalHead}`, { cwd: REPO_ROOT, stdio: 'inherit' });

    if (isDirty) {
      console.log('[backfill] Popping stash...');
      try {
        execSync('git stash pop', { cwd: REPO_ROOT, stdio: 'inherit' });
      } catch {
        console.warn('[backfill] stash pop failed — you may need to manually run: git stash pop');
      }
    }
  }

  // Run baseline scan
  console.log('[backfill] Running baseline scan against upstream/main...');
  const { default: { spawnSync } } = await import('node:child_process');
  const result = spawnSync(
    'pnpm',
    ['--filter', 'quality', 'scan', '--', '--baseline'],
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    console.warn('[backfill] Baseline scan failed (upstream/main may not be fetched). Run: git fetch upstream && pnpm --filter quality scan --baseline');
  }

  console.log('[backfill] Done.');
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  // Try to restore HEAD
  try {
    execSync('git checkout -', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    // ignore
  }
  process.exit(1);
});
