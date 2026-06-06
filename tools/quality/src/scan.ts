import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  mergeComplexityResults,
  isCommitScanned,
  appendCommitRecord,
  type CommitRecord,
  type History,
  type Baseline,
  type Metrics,
  type ComplexityStats,
} from './metrics.js';

// Default repo root: pnpm sets cwd to tools/quality/, so resolve two levels up.
const DEFAULT_REPO_ROOT =
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const HISTORY_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'history.json');
const BASELINE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baseline.json');

// Binaries resolved at import time — always from tools/quality/node_modules regardless of repoRoot
const KNIP_BIN = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', '.bin', 'knip');
const JSCPD_BIN = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', '.bin', 'jscpd');

// ---------------------------------------------------------------------------
// Dead code via knip
// ---------------------------------------------------------------------------

function runKnip(repoRoot: string): { unusedFiles: number; unusedExports: number; unusedDependencies: number } {
  const hasKnipConfig =
    fs.existsSync(path.join(repoRoot, 'knip.json')) ||
    fs.existsSync(path.join(repoRoot, 'knip.ts')) ||
    (() => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        return 'knip' in pkg;
      } catch { return false; }
    })();
  if (!hasKnipConfig) {
    return { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 };
  }
  try {
    const output = execSync(`"${KNIP_BIN}" --reporter json 2>/dev/null`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const json = JSON.parse(output);
    const unusedFiles = Array.isArray(json.files) ? json.files.length : 0;
    const unusedExports = Array.isArray(json.exports)
      ? json.exports.reduce((acc: number, f: { exports?: unknown[] }) => acc + (Array.isArray(f.exports) ? f.exports.length : 0), 0)
      : 0;
    const unusedDependencies = Array.isArray(json.dependencies)
      ? json.dependencies.reduce((acc: number, f: { dependencies?: unknown[] }) => acc + (Array.isArray(f.dependencies) ? f.dependencies.length : 0), 0)
      : (typeof json.unlisted === 'object' && json.unlisted !== null ? Object.keys(json.unlisted).length : 0);
    return { unusedFiles, unusedExports, unusedDependencies };
  } catch (err) {
    console.warn('[quality] knip failed, returning zeroes:', (err as Error).message?.slice(0, 120));
    return { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 };
  }
}

// ---------------------------------------------------------------------------
// Duplication via jscpd
// ---------------------------------------------------------------------------

function runJscpd(repoRoot: string): { percentage: number; clones: number; duplicatedLines: number } {
  const outputDir = '/tmp/quality-jscpd';
  try {
    // Scan explicit source dirs — avoids jscpd crawling .venv/, node_modules/, or
    // other large non-source trees present in old commits.
    const scanDirs = ['src', 'container', 'setup', 'scripts']
      .filter((d) => fs.existsSync(path.join(repoRoot, d)))
      .map((d) => `"${path.join(repoRoot, d)}"`)
      .join(' ');
    if (!scanDirs) return { percentage: 0, clones: 0, duplicatedLines: 0 };
    execSync(
      `"${JSCPD_BIN}" --min-tokens 50 --reporters json --output "${outputDir}" ${scanDirs}`,
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60_000,
      }
    );
    const reportPath = path.join(outputDir, 'jscpd-report.json');
    if (!fs.existsSync(reportPath)) {
      console.warn('[quality] jscpd report not found at', reportPath);
      return { percentage: 0, clones: 0, duplicatedLines: 0 };
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const stats = report?.statistics?.total ?? report?.total ?? {};
    const percentage = typeof stats.percentage === 'number' ? stats.percentage : 0;
    const clones = typeof stats.clones === 'number' ? stats.clones : (Array.isArray(report.duplicates) ? report.duplicates.length : 0);
    const duplicatedLines = typeof stats.duplicatedLines === 'number' ? stats.duplicatedLines : 0;
    return { percentage, clones, duplicatedLines };
  } catch (err) {
    console.warn('[quality] jscpd failed, returning zeroes:', (err as Error).message?.slice(0, 120));
    return { percentage: 0, clones: 0, duplicatedLines: 0 };
  }
}

// ---------------------------------------------------------------------------
// Complexity — regex-based cyclomatic complexity approximation
// ---------------------------------------------------------------------------

const COMPLEXITY_KEYWORDS = /\b(if|else\s+if|for|while|switch|case|catch|\?)\b/g;

function computeComplexityForDir(repoRoot: string, dir: string): ComplexityStats {
  const absDir = path.join(repoRoot, dir);
  if (!fs.existsSync(absDir)) {
    return { avgComplexity: 0, maxComplexity: 0, functionsAboveThreshold: 0 };
  }

  const complexities: number[] = [];
  walkFiles(absDir, ['.ts', '.tsx'], (filePath) => {
    if (filePath.includes('node_modules') || filePath.includes('.d.ts')) return;
    try {
      const src = fs.readFileSync(filePath, 'utf8');
      const fileLines = src.split('\n');
      const totalLines = fileLines.length;
      if (totalLines === 0) return;
      const branches = (src.match(COMPLEXITY_KEYWORDS) ?? []).length;
      const estimatedFunctions = Math.max(1, Math.round(totalLines / 15));
      const avgPerFunction = Math.max(1, branches / estimatedFunctions);
      complexities.push(avgPerFunction);
    } catch {
      // skip unreadable files
    }
  });

  return mergeComplexityResults(complexities);
}

function walkFiles(dir: string, extensions: string[], callback: (filePath: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.venv', 'data', 'logs', 'groups', '.git'].includes(entry.name)) continue;
      walkFiles(fullPath, extensions, callback);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      callback(fullPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Line counts — recursive walk
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set(['node_modules', '.venv', 'data', 'logs', 'groups', '.git']);
const EXCLUDED_FILES = new Set(['pnpm-lock.yaml', 'bun.lock']);

function countLines(repoRoot: string): { total: number; byExtension: Record<string, number> } {
  const byExtension: Record<string, number> = {};
  let total = 0;

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;
        const ext = path.extname(entry.name) || '(no ext)';
        const fullPath = path.join(dir, entry.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n').length;
          byExtension[ext] = (byExtension[ext] ?? 0) + lines;
          total += lines;
        } catch {
          // skip binary / unreadable files
        }
      }
    }
  }

  walk(repoRoot);
  return { total, byExtension };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------------------
// Main scan function — repoRoot passed explicitly so backfill worktrees work correctly
// ---------------------------------------------------------------------------

export async function runScan(repoRoot = DEFAULT_REPO_ROOT): Promise<CommitRecord> {
  console.log('[quality] Running knip...');
  const deadCode = runKnip(repoRoot);

  console.log('[quality] Running jscpd...');
  const duplication = runJscpd(repoRoot);

  console.log('[quality] Computing complexity (host)...');
  const host = computeComplexityForDir(repoRoot, 'src');

  console.log('[quality] Computing complexity (agentRunner)...');
  const agentRunner = computeComplexityForDir(repoRoot, 'container/agent-runner/src');

  console.log('[quality] Counting lines...');
  const lineCount = countLines(repoRoot);

  const hash = git('rev-parse HEAD', repoRoot);
  const shortHash = git('rev-parse --short HEAD', repoRoot);
  const date = git('log -1 --format=%cI HEAD', repoRoot);
  const subject = git('log -1 --format=%s HEAD', repoRoot);

  const metrics: Metrics = {
    deadCode,
    duplication,
    complexity: { host, agentRunner },
    lineCount,
  };

  return { hash, shortHash, date, subject, metrics };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isBaseline = process.argv.includes('--baseline');

if (isBaseline) {
  // Scan upstream/main in an isolated git worktree — never touches the main working tree
  const upstreamHash = execSync('git rev-parse upstream/main', { cwd: DEFAULT_REPO_ROOT, encoding: 'utf8' }).trim();
  const wtPath = `/tmp/quality-baseline-wt-${upstreamHash.slice(0, 7)}`;

  if (fs.existsSync(wtPath)) {
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: DEFAULT_REPO_ROOT, stdio: 'pipe' });
    } catch { /* may not be registered */ }
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  execSync(`git worktree add --detach "${wtPath}" upstream/main`, {
    cwd: DEFAULT_REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let baselineData: string | null = null;
  try {
    console.log('[quality] Scanning upstream/main in worktree for baseline...');
    const record = await runScan(wtPath);
    const baseline: Baseline = {
      hash: record.hash,
      date: record.date,
      source: 'upstream/main',
      metrics: record.metrics,
    };
    baselineData = JSON.stringify(baseline, null, 2);
  } finally {
    try {
      execSync(`git worktree remove --force "${wtPath}"`, { cwd: DEFAULT_REPO_ROOT, stdio: 'pipe' });
    } catch { /* ignore */ }
    fs.rmSync(wtPath, { recursive: true, force: true });
    if (baselineData !== null) {
      fs.writeFileSync(BASELINE_PATH, baselineData);
      console.log('[quality] Baseline written to', BASELINE_PATH);
    }
  }
} else {
  // Normal scan: append to history.json
  const historyRaw = fs.existsSync(HISTORY_PATH)
    ? fs.readFileSync(HISTORY_PATH, 'utf8')
    : '{"commits":[]}';
  const history: History = JSON.parse(historyRaw);

  const currentHash = git('rev-parse HEAD', DEFAULT_REPO_ROOT);
  if (isCommitScanned(history, currentHash)) {
    console.log('[quality] Already scanned, skipping.');
    process.exit(0);
  }

  const record = await runScan(DEFAULT_REPO_ROOT);
  const updated = appendCommitRecord(history, record);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(updated, null, 2));
  console.log(`[quality] Appended commit ${record.shortHash} (${record.subject})`);
}