/**
 * finance.test.ts — vitest wrapper that runs the Python finance test suite.
 *
 * The finance scripts are Python (for reproducible decimal arithmetic).
 * This wrapper ensures they run as part of the standard `npm test` / vitest CI pass.
 */

import { execSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FINANCE_DIR = path.join(import.meta.dirname, '.');
const PYTHON = path.join(import.meta.dirname, '../../.venv/finance/bin/python3');

function runPytest(pattern: string): { passed: number; failed: number; output: string } {
  try {
    const output = execSync(
      `${PYTHON} -m pytest ${pattern} -v --tb=short 2>&1`,
      { cwd: FINANCE_DIR, encoding: 'utf-8' },
    );
    const passedMatch = output.match(/(\d+) passed/);
    return {
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      failed: 0,
      output,
    };
  } catch (err: any) {
    const output: string = err.stdout ?? err.message ?? '';
    const failedMatch = output.match(/(\d+) failed/);
    return {
      passed: 0,
      failed: failedMatch ? parseInt(failedMatch[1]) : 1,
      output,
    };
  }
}

describe('finance Python scripts', () => {
  it('salary.py — all tests pass', { timeout: 30000 }, () => {
    const result = runPytest('test_salary.py');
    expect(result.failed, result.output).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it('excel_parser.py — all tests pass', { timeout: 30000 }, () => {
    const result = runPytest('test_excel_parser.py');
    expect(result.failed, result.output).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it('receipt.py — all tests pass', { timeout: 30000 }, () => {
    const result = runPytest('test_receipt.py');
    expect(result.failed, result.output).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it('categorizer.py — all tests pass', { timeout: 30000 }, () => {
    const result = runPytest('test_categorizer.py');
    expect(result.failed, result.output).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });

  it('aggregator.py — all tests pass', { timeout: 30000 }, () => {
    const result = runPytest('test_aggregator.py');
    expect(result.failed, result.output).toBe(0);
    expect(result.passed).toBeGreaterThan(0);
  });
});
