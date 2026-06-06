export type ComplexityStats = {
  avgComplexity: number;
  maxComplexity: number;
  functionsAboveThreshold: number; // complexity > 10
};

export type Metrics = {
  deadCode: {
    unusedFiles: number;
    unusedExports: number;
    unusedDependencies: number;
  };
  duplication: {
    percentage: number; // 0–100
    clones: number;
    duplicatedLines: number;
  };
  complexity: {
    host: ComplexityStats;
    agentRunner: ComplexityStats;
  };
  lineCount: {
    total: number;
    byExtension: Record<string, number>;
  };
};

export type CommitRecord = {
  hash: string;       // full SHA
  shortHash: string;  // 7-char
  date: string;       // ISO 8601
  subject: string;    // commit subject line
  metrics: Metrics;
};

export type History = {
  commits: CommitRecord[];
};

export type Baseline = {
  hash: string;
  date: string;
  source: "upstream/main";
  metrics: Metrics;
};

/**
 * Computes avg, max, and count of values > 10 from a list of complexity numbers.
 * Returns zeroes for empty input.
 */
export function mergeComplexityResults(complexities: number[]): ComplexityStats {
  if (complexities.length === 0) {
    return { avgComplexity: 0, maxComplexity: 0, functionsAboveThreshold: 0 };
  }

  let sum = 0;
  let max = 0;
  let aboveThreshold = 0;

  for (const c of complexities) {
    sum += c;
    if (c > max) max = c;
    if (c > 10) aboveThreshold++;
  }

  return {
    avgComplexity: sum / complexities.length,
    maxComplexity: max,
    functionsAboveThreshold: aboveThreshold,
  };
}

/**
 * Returns true if the given commit hash already exists in history.
 */
export function isCommitScanned(history: History, hash: string): boolean {
  return history.commits.some((c) => c.hash === hash);
}

/**
 * Returns a new History with the record appended.
 * Does not mutate the original history.
 * Skips silently if the hash is already present.
 */
export function appendCommitRecord(history: History, record: CommitRecord): History {
  if (isCommitScanned(history, record.hash)) {
    return { ...history, commits: [...history.commits] };
  }
  return { ...history, commits: [...history.commits, record] };
}
