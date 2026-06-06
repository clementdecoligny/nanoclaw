# Quality Dashboard

## HMW

Make it effortless to notice when Nanoclaw's codebase is accumulating dead code, complexity, or duplication over time, so quality trends are visible at a glance and specific commits that introduced debt can be identified — relative to the upstream v2 baseline.

## Solution hypothesis

A `tools/quality/` directory inside the Nanoclaw repo containing a scanner, a backfill script, and a persistent local web dashboard. The scanner runs knip (dead exports/files), jscpd (duplication across all languages), and ts-complexity (cyclomatic complexity for TypeScript) against the whole repo, appending results to `history.json` keyed by commit hash. A separate `baseline.json` holds a single scan of `upstream/main` at the time of first run. A backfill script replays all commits since the repo's first commit. A tiny Express server on port 3456 serves a single-page dashboard (Chart.js) with trend lines per metric and a dashed reference line per metric showing the upstream baseline. A systemd user service starts the server automatically on login.

## Non-goals

- Active gates / CI enforcement (future work)
- Python cyclomatic complexity (line counts + duplication only for `.py` files)
- SonarQube or any external SaaS
- Analysis of `data/`, `logs/`, `groups/`, `node_modules/`, `.venv/` (runtime data / installed deps, not source)
- Per-file drill-down beyond native scanner output (future work)
- Tracking upstream history (single snapshot only)

## Edge cases & decisions

| Edge case | Decision |
|---|---|
| "Daily backup" commits with no code change | Include — metrics still valid, flat line is informative |
| Scope | Whole repo source: `src/`, `container/agent-runner/src/`, `scripts/`, `setup/`, `bin/`, `container/` (non-agent-runner). Exclude `data/`, `logs/`, `groups/`, `node_modules/`, `.venv/`, `pnpm-lock.yaml`, `bun.lock` |
| Python files | jscpd duplication + line counts only; no radon |
| knip and node_modules | knip runs against tsconfig without requiring installed deps for dead-export detection |
| Backfill interrupted | Idempotent: skip commits already present in history.json by hash |
| Incremental run on already-scanned commit | Silent skip, exit 0 |
| Port | 3456 |
| Auto-start | systemd user service (`nanoclaw-quality.service`) at `~/.config/systemd/user/` |
| history.json + baseline.json | Both committed to repo under `tools/quality/` |
| TS subsystems | `src/` (host) and `container/agent-runner/src/` (agent runner) use separate tsconfigs — complexity runs once per subsystem, results stored under `host` and `agentRunner` keys |
| Backfill git safety | Script stashes uncommitted changes before checking out commits; restores original HEAD on completion or failure. Never leaves repo in detached HEAD state. |
| jscpd across languages | Runs once per scan across the whole included scope. Min tokens: 50. |
| Upstream baseline | Checked out from `upstream/main` once during `backfill` (or `scan --baseline`). Stored in `baseline.json`. Re-run manually to refresh. |
| Baseline display | Dashed horizontal reference line per metric chart on the dashboard. |

## Entity model changes

None — standalone tooling, no changes to `data/v2.db` or any Nanoclaw DB.

## Session DB contract

None.

## Container boundary

None — runs entirely on the host outside containers.

## API contract

### `tools/quality/history.json` schema

```ts
type History = {
  commits: CommitRecord[];
};

type CommitRecord = {
  hash: string;           // full SHA
  shortHash: string;      // 7-char
  date: string;           // ISO 8601
  subject: string;        // commit subject line
  metrics: Metrics;
};

type Baseline = {
  hash: string;
  date: string;
  source: "upstream/main";
  metrics: Metrics;
};

type Metrics = {
  deadCode: {
    unusedFiles: number;
    unusedExports: number;
    unusedDependencies: number;
  };
  duplication: {
    percentage: number;       // 0–100
    clones: number;
    duplicatedLines: number;
  };
  complexity: {
    host: ComplexityStats;
    agentRunner: ComplexityStats;
  };
  lineCount: {
    total: number;
    byExtension: Record<string, number>; // e.g. { ".ts": 12000, ".py": 800 }
  };
};

type ComplexityStats = {
  avgComplexity: number;
  maxComplexity: number;
  functionsAboveThreshold: number; // complexity > 10
};
```

### CLI commands (pnpm workspace filter)

```bash
pnpm --filter quality scan              # scan HEAD, append to history.json
pnpm --filter quality scan --baseline   # scan upstream/main, write baseline.json
pnpm --filter quality backfill          # replay all commits + scan baseline
pnpm --filter quality serve             # start dashboard on :3456
```

## Affected files

New files only — no existing Nanoclaw source files modified:

```
tools/quality/
  package.json
  tsconfig.json
  src/
    scan.ts          # single-commit scanner (knip + jscpd + complexity)
    backfill.ts      # git log replay + baseline scan
    server.ts        # Express + static file serving
    metrics.ts       # shared types + aggregation helpers
  public/
    index.html       # single-page dashboard (Chart.js via CDN)
  history.json       # committed, starts as { "commits": [] }
  baseline.json      # committed, starts as null
~/.config/systemd/user/
  nanoclaw-quality.service
pnpm-workspace.yaml  # add "tools/quality" to packages
```

## Success signal

1. `pnpm --filter quality backfill` runs without error, checks out each of the ~50 commits, prints per-commit progress, and populates `history.json` with ~50 entries plus writes `baseline.json` from `upstream/main`.
2. `systemctl --user start nanoclaw-quality` starts the server without error.
3. Opening `http://localhost:3456` shows a dashboard with four trend charts (dead code count, duplication %, avg complexity, total line count), each with a dashed reference line showing the upstream v2 baseline value.
4. Hovering a data point shows the commit short hash and subject.
5. Running `pnpm --filter quality scan` on HEAD adds exactly one new entry (or skips silently if already present).
