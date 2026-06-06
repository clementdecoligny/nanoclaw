import { describe, it, expect } from 'vitest';
import {
  mergeComplexityResults,
  isCommitScanned,
  appendCommitRecord,
  type CommitRecord,
  type History,
} from './metrics.js';

describe('isCommitScanned', () => {
  it('returns false for empty history', () => {
    const history: History = { commits: [] };
    expect(isCommitScanned(history, 'abc123')).toBe(false);
  });

  it('returns true when commit hash is present', () => {
    const record: CommitRecord = {
      hash: 'abc123def456',
      shortHash: 'abc123d',
      date: '2026-06-01T00:00:00Z',
      subject: 'feat: something',
      metrics: {
        deadCode: { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 },
        duplication: { percentage: 0, clones: 0, duplicatedLines: 0 },
        complexity: {
          host: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
          agentRunner: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
        },
        lineCount: { total: 100, byExtension: { '.ts': 100 } },
      },
    };
    const history: History = { commits: [record] };
    expect(isCommitScanned(history, 'abc123def456')).toBe(true);
  });

  it('returns false for a different hash', () => {
    const record: CommitRecord = {
      hash: 'abc123def456',
      shortHash: 'abc123d',
      date: '2026-06-01T00:00:00Z',
      subject: 'feat: something',
      metrics: {
        deadCode: { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 },
        duplication: { percentage: 0, clones: 0, duplicatedLines: 0 },
        complexity: {
          host: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
          agentRunner: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
        },
        lineCount: { total: 100, byExtension: { '.ts': 100 } },
      },
    };
    const history: History = { commits: [record] };
    expect(isCommitScanned(history, 'zzz999')).toBe(false);
  });
});

describe('appendCommitRecord', () => {
  it('adds a record to empty history', () => {
    const history: History = { commits: [] };
    const record: CommitRecord = {
      hash: 'abc123',
      shortHash: 'abc123',
      date: '2026-06-01T00:00:00Z',
      subject: 'test',
      metrics: {
        deadCode: { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 },
        duplication: { percentage: 0, clones: 0, duplicatedLines: 0 },
        complexity: {
          host: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
          agentRunner: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
        },
        lineCount: { total: 0, byExtension: {} },
      },
    };
    const updated = appendCommitRecord(history, record);
    expect(updated.commits).toHaveLength(1);
    expect(updated.commits[0].hash).toBe('abc123');
  });

  it('does not mutate the original history', () => {
    const history: History = { commits: [] };
    const record: CommitRecord = {
      hash: 'abc123',
      shortHash: 'abc123',
      date: '2026-06-01T00:00:00Z',
      subject: 'test',
      metrics: {
        deadCode: { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 },
        duplication: { percentage: 0, clones: 0, duplicatedLines: 0 },
        complexity: {
          host: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
          agentRunner: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
        },
        lineCount: { total: 0, byExtension: {} },
      },
    };
    appendCommitRecord(history, record);
    expect(history.commits).toHaveLength(0);
  });

  it('does not add a duplicate commit', () => {
    const record: CommitRecord = {
      hash: 'abc123',
      shortHash: 'abc123',
      date: '2026-06-01T00:00:00Z',
      subject: 'test',
      metrics: {
        deadCode: { unusedFiles: 0, unusedExports: 0, unusedDependencies: 0 },
        duplication: { percentage: 0, clones: 0, duplicatedLines: 0 },
        complexity: {
          host: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
          agentRunner: { avgComplexity: 1, maxComplexity: 1, functionsAboveThreshold: 0 },
        },
        lineCount: { total: 0, byExtension: {} },
      },
    };
    const history: History = { commits: [record] };
    const updated = appendCommitRecord(history, record);
    expect(updated.commits).toHaveLength(1);
  });
});

describe('mergeComplexityResults', () => {
  it('computes avg, max, and above-threshold count correctly', () => {
    const complexities = [1, 3, 5, 8, 12, 15];
    const result = mergeComplexityResults(complexities);
    expect(result.maxComplexity).toBe(15);
    expect(result.functionsAboveThreshold).toBe(2); // 12 and 15 are > 10
    expect(result.avgComplexity).toBeCloseTo((1 + 3 + 5 + 8 + 12 + 15) / 6, 2);
  });

  it('returns zeroes for empty input', () => {
    const result = mergeComplexityResults([]);
    expect(result.avgComplexity).toBe(0);
    expect(result.maxComplexity).toBe(0);
    expect(result.functionsAboveThreshold).toBe(0);
  });
});
