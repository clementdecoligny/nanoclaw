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
  keyColumn,
  planTodoOrder,
  checkTodoHeader,
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
  const status: Record<string, Rule> = { E: { kind: 'list', values: ['Not started', 'In progress', 'Done', 'Dropped'] } };

  test('all five phase tabs are writable', () => {
    expect(PHASE_TABS).toEqual(['1 Set up', '2 Listening tour', '3 Build pipeline', '4 Interview', '5 Close']);
  });

  test('to-do window is rows 17–31; other tabs keep 2–500', () => {
    expect(rowWindow('2 Listening tour')).toEqual({ first: 17, last: 31 });
    expect(rowWindow('Daily log')).toEqual({ first: 2, last: 500 });
  });

  test('key column is B (Task) on phase tabs, A elsewhere', () => {
    expect(keyColumn('3 Build pipeline')).toBe('B');
    expect(keyColumn('Contacts')).toBe('A');
  });

  test('firstEmptyRow inside a window (keyCol[0] is the window start)', () => {
    expect(firstEmptyRow(['a', 'b'], 17, 31)).toBe(19);
    expect(() => firstEmptyRow(Array(15).fill('x'), 17, 31)).toThrow(/17 and 31/);
  });

  test('new to-do: B–G with real due date and exact status', () => {
    ok(validateWrite('2 Listening tour', { kind: 'first-empty' }, {
      B: 'Ask Ana for intro to Bob', C: '2026-11-05', D: 'Owner', E: 'Not started', F: 'Contacts', G: '',
    }, status));
  });

  test('first-empty needs the task (B)', () => {
    const r = validateWrite('1 Set up', { kind: 'first-empty' }, { C: '2026-11-05' }, status);
    expect(r.errors.join()).toMatch(/column B/);
  });

  test('index A is set only through move/sort, never by write', () => {
    const r = validateWrite('1 Set up', { kind: 'row', row: 19 }, { A: 2 }, status);
    expect(r.errors.join()).toMatch(/column A/);
  });

  test('sort key H (formula) is never writable', () => {
    const r = validateWrite('1 Set up', { kind: 'first-empty' }, { B: 'x', H: '1' }, status);
    expect(r.errors.join()).toMatch(/column H/);
  });

  test('due date (C) must be YYYY-MM-DD', () => {
    const r = validateWrite('1 Set up', { kind: 'first-empty' }, { B: 'x', C: '5 Nov' }, status);
    expect(r.errors.join()).toMatch(/date/i);
  });

  test('status (E) must match the dropdown', () => {
    const r = validateWrite('1 Set up', { kind: 'row', row: 19 }, { E: 'done' }, status);
    expect(r.errors.join()).toMatch(/column E/);
    ok(validateWrite('1 Set up', { kind: 'row', row: 19 }, { E: 'Done' }, status));
  });

  test('row:N outside 17–31 refused (protects gate checklist and tables)', () => {
    expect(validateWrite('1 Set up', { kind: 'row', row: 9 }, { E: 'Done' }, status).errors.join()).toMatch(/17–31/);
    expect(validateWrite('1 Set up', { kind: 'row', row: 35 }, { B: 'x' }, status).errors.join()).toMatch(/17–31/);
  });
});

describe('checkTodoHeader', () => {
  test('accepts the # layout', () => {
    expect(checkTodoHeader('1 Set up', ['#', 'Task', 'Due', 'Due basis', 'Status', 'Register', 'Notes', 'Sort key'])).toBeNull();
  });
  test('refuses the old layout (task in A) so nothing lands in the wrong column', () => {
    expect(checkTodoHeader('1 Set up', ['Task', 'Due', 'Due basis', 'Status', 'Register', 'Notes', 'Sort key'])).toMatch(/# column is missing/);
  });
});

describe('planTodoOrder', () => {
  const slot = (row: number, index: unknown, task: unknown = `t${row}`) => ({ row, index, task });
  const idx = (plan: { from: number; index: number }[]) => plan.map((p) => [p.from, p.index]);

  test('orders by index, ties by current row, renumbers 1…n', () => {
    const plan = planTodoOrder([slot(17, 3), slot(18, 1), slot(19, 1), slot(20, 7)], 17);
    expect(idx(plan)).toEqual([[18, 1], [19, 2], [17, 3], [20, 4]]);
    expect(plan.map((p) => p.to)).toEqual([17, 18, 19, 20]);
  });

  test('missing or non-numeric index goes to the end, in row order', () => {
    const plan = planTodoOrder([slot(17, ''), slot(18, 2), slot(19, 'abc'), slot(20, '1')], 17);
    expect(idx(plan)).toEqual([[20, 1], [18, 2], [17, 3], [19, 4]]);
  });

  test('empty slots (no task) are left out, even with a stale index', () => {
    const plan = planTodoOrder([slot(17, 1), slot(18, 2, ''), slot(19, 3)], 17);
    expect(idx(plan)).toEqual([[17, 1], [19, 2]]);
  });

  test('move a to-do to a position; others shift', () => {
    const slots = [slot(17, 1), slot(18, 2), slot(19, 3), slot(20, 4)];
    const plan = planTodoOrder(slots, 17, { row: 20, to: 2 });
    expect(idx(plan)).toEqual([[17, 1], [20, 2], [18, 3], [19, 4]]);
    expect(plan.find((p) => p.from === 20)?.to).toBe(18);
  });

  test('move down and past the end clamps to last', () => {
    const slots = [slot(17, 1), slot(18, 2), slot(19, 3)];
    expect(idx(planTodoOrder(slots, 17, { row: 17, to: 99 }))).toEqual([[18, 1], [19, 2], [17, 3]]);
  });

  test('move to a non-positive position or an empty row is refused', () => {
    const slots = [slot(17, 1), slot(18, 2, '')];
    expect(() => planTodoOrder(slots, 17, { row: 17, to: 0 })).toThrow(/position/);
    expect(() => planTodoOrder(slots, 17, { row: 18, to: 1 })).toThrow(/no to-do/i);
  });
});
