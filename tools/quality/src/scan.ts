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

const REPO_ROOT = process.env.REPO_ROOT ?? process.cwd();
const HISTORY_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'history.json');
const BASELINE_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baseline.json');

// ---------------------------------------------------------------------------
// Dead code via knip
// ---------------------------------------------------------------------------

function runKnip(): { unusedFiles: number; unusedExports: number; unusedDependencies: number } {
  try {
    const output = execSync('npx --yes knip --reporter json 2>/dev/null', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    const json = JSON.parse(output);
    // knip JSON shape varies; be defensive
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

function runJscpd(): { percentage: number; clones: number; duplicatedLines: number } {
  const outputDir = '/tmp/quality-jscpd';
  try {
    execSync(
      `npx --yes jscpd --min-tokens 50 --reporters json --output "${outputDir}" ` +
        `--ignore "data/**,logs/**,groups/**,node_modules/**,.venv/**,pnpm-lock.yaml,bun.lock" .`,
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
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
// Count branching keywords per function/file
// ---------------------------------------------------------------------------

const COMPLEXITY_KEYWORDS = /\b(if|else\s+if|for|while|switch|case|catch|\?)\b/g;

function computeComplexityForDir(dir: string): ComplexityStats {
  const absDir = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(absDir)) {
    return { avgComplexity: 0, maxComplexity: 0, functionsAboveThreshold: 0 };
  }

  const complexities: number[] = [];
  walkFiles(absDir, ['.ts', '.tsx'], (filePath) => {
    if (filePath.includes('node_modules') || filePath.includes('.d.ts')) return;
    try {
      const src = fs.readFileSync(filePath, 'utf8');
      // Split into approximate function blocks: split on function declarations/expressions
      // For simplicity, compute per-file complexity then scale by estimating ~10 lines per function
      const fileLines = src.split('\n');
      const totalLines = fileLines.length;
      if (totalLines === 0) return;

      // Count branches in whole file
      const branches = (src.match(COMPLEXITY_KEYWORDS) ?? []).length;
      // Estimate function count (rough: one function per 15 lines)
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

function countLines(): { total: number; byExtension: Record<string, number> } {
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

  walk(REPO_ROOT);
  return { total, byExtension };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------------------
// Main scan function (exported for backfill reuse)
// ---------------------------------------------------------------------------

export async function runScan(): Promise<CommitRecord> {
  console.log('[quality] Running knip...');
  const deadCode = runKnip();

  console.log('[quality] Running jscpd...');
  const duplication = runJscpd();

  console.log('[quality] Computing complexity (host)...');
  const host = computeComplexityForDir('src');

  console.log('[quality] Computing complexity (agentRunner)...');
  const agentRunner = computeComplexityForDir('container/agent-runner/src');

  console.log('[quality] Counting lines...');
  const lineCount = countLines();

  const hash = git('rev-parse HEAD');
  const shortHash = git('rev-parse --short HEAD');
  const date = git('log -1 --format=%cI HEAD');
  const subject = git('log -1 --format=%s HEAD');

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
  // Scan upstream/main and write baseline.json
  const originalHead = git('rev-parse HEAD');
  try {
    console.log('[quality] Checking out upstream/main for baseline scan...');
    execSync('git checkout upstream/main', { cwd: REPO_ROOT, stdio: 'inherit' });
    const record = await runScan();
    const baseline: Baseline = {
      hash: record.hash,
      date: record.date,
      source: 'upstream/main',
      metrics: record.metrics,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
    console.log('[quality] Baseline written to', BASELINE_PATH);
  } finally {
    execSync(`git checkout ${originalHead}`, { cwd: REPO_ROOT, stdio: 'inherit' });
    console.log('[quality] Restored HEAD to', originalHead.slice(0, 7));
  }
} else {
  // Normal scan: append to history.json
  const historyRaw = fs.existsSync(HISTORY_PATH)
    ? fs.readFileSync(HISTORY_PATH, 'utf8')
    : '{"commits":[]}';
  const history: History = JSON.parse(historyRaw);

  const currentHash = git('rev-parse HEAD');
  if (isCommitScanned(history, currentHash)) {
    console.log('[quality] Already scanned, skipping.');
    process.exit(0);
  }

  const record = await runScan();
  const updated = appendCommitRecord(history, record);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(updated, null, 2));
  console.log(`[quality] Appended commit ${record.shortHash} (${record.subject})`);
}
