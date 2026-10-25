import { describe, expect, it } from 'vitest';

import { parseArgv } from './parse-argv.js';

describe('parseArgv repeated flags', () => {
  it('keeps every value of a repeated --var', () => {
    const { args } = parseArgv(['groups', 'config', 'set-env', '--var', 'A=1', '--var', 'B=2', '--var', 'C=']);
    expect(args.var).toEqual(['A=1', 'B=2', 'C=']);
  });

  it('passes a single --var as a plain string', () => {
    expect(parseArgv(['groups', 'config', 'set-env', '--var', 'A=1']).args.var).toBe('A=1');
  });

  it('resolves any other repeated flag to its last value', () => {
    expect(parseArgv(['groups', 'get', '--id', 'ag-a', '--id', 'ag-b']).args.id).toBe('ag-b');
  });
});
