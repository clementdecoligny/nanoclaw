import { describe, expect, test } from 'bun:test';
import {
  SHEET_IDS,
  resolveSpreadsheetId,
  firstEmptyRow,
  parseRowKey,
  isoToSerial,
  mondayOf,
  findWeekRow,
  validateWrite,
  rowWindow,
  PHASE_TABS,
  type Rule,
} from './lib';

describe('resolveSpreadsheetId', () => {
  test('defaults to the test copy', () => {
    expect(resolveSpreadsheetId(undefined)).toBe(SHEET_IDS.test);
    expect(resolveSpreadsheetId('')).toBe(SHEET_IDS.test);
  });
  test('live only when explicitly set', () => {
    expect(resolveSpreadsheetId('live')).toBe(SHEET_IDS.live);
  });
  test('anything else is refused (no arbitrary IDs)', () => {
    expect(() => resolveSpreadsheetId('1AbcSomeOtherSheetId')).toThrow();
  });
});

describe('firstEmptyRow', () => {
  test('empty column → row 2', () => {
    expect(firstEmptyRow([])).toBe(2);
  });
  test('skips filled rows, returns first blank (row numbers start at 2)', () => {
    expect(firstEmptyRow(['a', 'b'])).toBe(4);
  });
  test('finds a gap, not the end', () => {
    expect(firstEmptyRow(['a', '', 'c'])).toBe(3);
  });
  test('whitespace counts as empty', () => {
    expect(firstEmptyRow(['a', '  '])).toBe(3);
  });
  test('full rows 2–500 → error', () => {
    expect(() => firstEmptyRow(Array(499).fill('x'))).toThrow(/no empty row/i);
  });
});

describe('parseRowKey', () => {
  test('first-empty', () => {
    expect(parseRowKey('first-empty')).toEqual({ kind: 'first-empty' });
  });
  test('row:N within 2–500', () => {
    expect(parseRowKey('row:17')).toEqual({ kind: 'row', row: 17 });
    expect(() => parseRowKey('row:1')).toThrow();
    expect(() => parseRowKey('row:501')).toThrow();
    expect(() => parseRowKey('row:abc')).toThrow();
  });
  test('week:YYYY-MM-DD', () => {
    expect(parseRowKey('week:2026-11-04')).toEqual({ kind: 'week', date: '2026-11-04' });
    expect(() => parseRowKey('week:04/11/2026')).toThrow();
  });
  test('unknown key refused', () => {
    expect(() => parseRowKey('append')).toThrow();
  });
});

describe('dates', () => {
  test('isoToSerial matches Sheets serials', () => {
    // Weekly review A2 holds 46314 = Mon 19/10/2026
    expect(isoToSerial('2026-10-19')).toBe(46314);
  });
  test('mondayOf', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(mondayOf('2026-10-23')).toBe('2026-10-19');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // Sunday
  });
  test('findWeekRow uses the Monday of the given date', () => {
    const colA = [46314, 46321, 46328]; // rows 2,3,4
    expect(findWeekRow(colA, '2026-10-30')).toBe(3);
  });
  test('findWeekRow errors when week is missing', () => {
    expect(() => findWeekRow([46314], '2027-06-01')).toThrow(/no weekly review row/i);
  });
});

const convRules: Record<string, Rule> = {
  B: { kind: 'range', values: ['Ana Silva', 'Bob Recruiter'] },
  D: { kind: 'list', values: ['Recruiter', 'Peer', 'Hiring manager'] },
  F: { kind: 'list', values: ['Reachable', 'Stretch', 'Out of reach'] },
  L: { kind: 'list', values: ['Yes', 'No'] },
};

describe('validateWrite', () => {
  const ok = (r: { errors: string[] }) => expect(r.errors).toEqual([]);

  test('valid Conversations row passes', () => {
    ok(validateWrite('Conversations', { kind: 'first-empty' }, {
      A: '2026-11-03', B: 'Bob Recruiter', D: 'Recruiter', F: 'Stretch', G: 'Ballpark is wide',
    }, convRules));
  });

  test('unknown tab refused', () => {
    expect(validateWrite('Pipeline', { kind: 'first-empty' }, { A: 'x' }, {}).errors[0]).toMatch(/tab/i);
  });

  test('formula / auto columns refused', () => {
    const r = validateWrite('Conversations', { kind: 'first-empty' }, { A: '2026-11-03', C: 'Acme' }, convRules);
    expect(r.errors.join()).toMatch(/column C/);
  });

  test('Pay log M (manual net) is never writable', () => {
    const r = validateWrite('Pay log', { kind: 'first-empty' }, { A: '2026-11-03', M: 50000 }, {});
    expect(r.errors.join()).toMatch(/column M/);
  });

  test('empty cells object refused', () => {
    expect(validateWrite('Daily log', { kind: 'first-empty' }, {}, {}).errors.length).toBeGreaterThan(0);
  });

  test('bad date format refused', () => {
    const r = validateWrite('Daily log', { kind: 'first-empty' }, { A: '03/11/2026' }, {});
    expect(r.errors.join()).toMatch(/date/i);
  });

  test('impossible date refused', () => {
    expect(validateWrite('Daily log', { kind: 'first-empty' }, { A: '2026-02-30' }, {}).errors.length).toBe(1);
  });

  test('first-empty requires the key column', () => {
    const r = validateWrite('Daily log', { kind: 'first-empty' }, { B: 'did stuff' }, {});
    expect(r.errors.join()).toMatch(/key column A/);
  });

  test('dropdown value must match exactly', () => {
    const r = validateWrite('Conversations', { kind: 'first-empty' }, { A: '2026-11-03', D: 'recruiter' }, convRules);
    expect(r.errors.join()).toMatch(/D/);
  });

  test('empty string clears a dropdown cell', () => {
    ok(validateWrite('Conversations', { kind: 'row', row: 5 }, { L: '' }, convRules));
  });

  test('contact must exist in Contacts (strict range)', () => {
    const r = validateWrite('Conversations', { kind: 'first-empty' }, { A: '2026-11-03', B: 'Bob recruiter' }, convRules);
    expect(r.errors.join()).toMatch(/Contacts/);
  });

  test('unknown company is a warning, not an error', () => {
    const r = validateWrite('Contacts', { kind: 'first-empty' }, { A: 'New Person', B: 'Unknown Co' }, {
      B: { kind: 'range', values: ['Acme'] },
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/Unknown Co/);
  });

  test('number columns need numbers', () => {
    const bad = validateWrite('Pay log', { kind: 'first-empty' }, { A: '2026-11-03', G: '110k' }, {});
    expect(bad.errors.join()).toMatch(/G/);
    ok(validateWrite('Pay log', { kind: 'first-empty' }, { A: '2026-11-03', G: 110000, H: '5000' }, {}));
  });

  test('text starting with = is refused (no formula injection)', () => {
    const r = validateWrite('Daily log', { kind: 'first-empty' }, { A: '2026-11-03', B: '=IMPORTXML("x")' }, {});
    expect(r.errors.join()).toMatch(/formula/i);
  });

  test('Weekly review only by week key, only C–H', () => {
    ok(validateWrite('Weekly review', { kind: 'week', date: '2026-10-23' }, { D: 'Yes, two calls' }, {}));
    expect(validateWrite('Weekly review', { kind: 'first-empty' }, { D: 'x' }, {}).errors.length).toBeGreaterThan(0);
    expect(validateWrite('Weekly review', { kind: 'week', date: '2026-10-23' }, { I: '3' }, {}).errors.join()).toMatch(/column I/);
  });

  test('week key refused on other tabs', () => {
    expect(validateWrite('Daily log', { kind: 'week', date: '2026-10-23' }, { B: 'x' }, {}).errors.length).toBeGreaterThan(0);
  });

  test('Companies: G only, existing row only', () => {
    ok(validateWrite('Companies', { kind: 'row', row: 4 }, { G: 120000 }, {}));
    expect(validateWrite('Companies', { kind: 'first-empty' }, { G: 120000 }, {}).errors.length).toBeGreaterThan(0);
    expect(validateWrite('Companies', { kind: 'row', row: 4 }, { B: '1' }, {}).errors.join()).toMatch(/column B/);
  });
});

describe('phase to-do blocks', () => {
  const ok = (r: { errors: string[] }) => expect(r.errors).toEqual([]);
  const status: Record<string, Rule> = { D: { kind: 'list', values: ['Not started', 'In progress', 'Done', 'Dropped'] } };

  test('all five phase tabs are writable', () => {
    expect(PHASE_TABS).toEqual(['1 Set up', '2 Listening tour', '3 Build pipeline', '4 Interview', '5 Close']);
  });

  test('to-do window is rows 17–31; other tabs keep 2–500', () => {
    expect(rowWindow('2 Listening tour')).toEqual({ first: 17, last: 31 });
    expect(rowWindow('Daily log')).toEqual({ first: 2, last: 500 });
  });

  test('firstEmptyRow inside a window (keyCol[0] is the window start)', () => {
    expect(firstEmptyRow(['a', 'b'], 17, 31)).toBe(19);
    expect(() => firstEmptyRow(Array(15).fill('x'), 17, 31)).toThrow(/17 and 31/);
  });

  test('new to-do: A–F with real due date and exact status', () => {
    ok(validateWrite('2 Listening tour', { kind: 'first-empty' }, {
      A: 'Ask Ana for intro to Bob', B: '2026-11-05', C: 'Owner', D: 'Not started', E: 'Contacts', F: '',
    }, status));
  });

  test('sort key G (formula) is never writable', () => {
    const r = validateWrite('1 Set up', { kind: 'first-empty' }, { A: 'x', G: '1' }, status);
    expect(r.errors.join()).toMatch(/column G/);
  });

  test('due date must be YYYY-MM-DD', () => {
    const r = validateWrite('1 Set up', { kind: 'first-empty' }, { A: 'x', B: '5 Nov' }, status);
    expect(r.errors.join()).toMatch(/date/i);
  });

  test('status must match the dropdown', () => {
    const r = validateWrite('1 Set up', { kind: 'row', row: 19 }, { D: 'done' }, status);
    expect(r.errors.join()).toMatch(/column D/);
    ok(validateWrite('1 Set up', { kind: 'row', row: 19 }, { D: 'Done' }, status));
  });

  test('row:N outside 17–31 refused (protects gate checklist and tables)', () => {
    expect(validateWrite('1 Set up', { kind: 'row', row: 9 }, { D: 'Done' }, status).errors.join()).toMatch(/17–31/);
    expect(validateWrite('1 Set up', { kind: 'row', row: 35 }, { A: 'x' }, status).errors.join()).toMatch(/17–31/);
  });
});
