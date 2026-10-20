// Pure rules for the Job Move 2027 sheet tool. No I/O here — sheet.ts does the
// HTTP. Everything that protects the sheet (which IDs, tabs, columns, rows and
// values are allowed) lives in this file so it can be unit-tested.

export const SHEET_IDS = {
  test: '195S_2XuVbh-ewB9kvYjuTvSWRhYDpge1Ha-y9qncpoo',
  live: '1BxLbXXsOQDOQMelFgsjvU82YfPjG3nYq_nQNnKvlTUY',
} as const;

/** JOB_SHEET_TARGET env → spreadsheet ID. Only the two known IDs are reachable. */
export function resolveSpreadsheetId(target: string | undefined): string {
  if (!target || target === 'test') return SHEET_IDS.test;
  if (target === 'live') return SHEET_IDS.live;
  throw new Error(`Unknown JOB_SHEET_TARGET "${target}" (expected test or live)`);
}

export const FIRST_ROW = 2;
export const LAST_ROW = 500;

export type RowKey =
  | { kind: 'first-empty' }
  | { kind: 'row'; row: number }
  | { kind: 'week'; date: string };

export type Rule = { kind: 'list'; values: string[] } | { kind: 'range'; values: string[] };

type TabSpec = {
  writable: string[];
  dates?: string[];
  numbers?: string[];
  /** Range-dropdown columns where a non-matching value is an error (else a warning). */
  strictRanges?: string[];
  rowKeys: RowKey['kind'][];
};

export const TABS: Record<string, TabSpec> = {
  Conversations: {
    writable: ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
    dates: ['A'],
    strictRanges: ['B'],
    rowKeys: ['first-empty', 'row'],
  },
  Contacts: {
    writable: ['A', 'B', 'C', 'D', 'E', 'G', 'H'],
    dates: ['H'],
    rowKeys: ['first-empty', 'row'],
  },
  'Pay log': {
    writable: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L'],
    dates: ['A'],
    numbers: ['G', 'H', 'J', 'L'],
    rowKeys: ['first-empty', 'row'],
  },
  Companies: { writable: ['G'], numbers: ['G'], rowKeys: ['row'] },
  'Learning log': { writable: ['A', 'B', 'C', 'D'], dates: ['A'], rowKeys: ['first-empty', 'row'] },
  'Daily log': { writable: ['A', 'B', 'C', 'D'], dates: ['A'], rowKeys: ['first-empty', 'row'] },
  'Weekly review': { writable: ['C', 'D', 'E', 'F', 'G', 'H'], rowKeys: ['week'] },
};

const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** keyCol[0] is row 2. Returns the first blank row in 2–500. */
export function firstEmptyRow(keyCol: unknown[]): number {
  for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
    if (isBlank(keyCol[row - FIRST_ROW])) return row;
  }
  throw new Error(`No empty row between ${FIRST_ROW} and ${LAST_ROW}`);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseRowKey(s: string): RowKey {
  if (s === 'first-empty') return { kind: 'first-empty' };
  let m = /^row:(\d+)$/.exec(s);
  if (m) {
    const row = Number(m[1]);
    if (row < FIRST_ROW || row > LAST_ROW) throw new Error(`Row ${row} outside ${FIRST_ROW}–${LAST_ROW}`);
    return { kind: 'row', row };
  }
  m = /^week:(.+)$/.exec(s);
  if (m) {
    if (!isValidIsoDate(m[1])) throw new Error(`week: needs a YYYY-MM-DD date, got "${m[1]}"`);
    return { kind: 'week', date: m[1] };
  }
  throw new Error(`Unknown row key "${s}" (use first-empty, row:N or week:YYYY-MM-DD)`);
}

const DAY_MS = 86_400_000;
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);

export function isoToSerial(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - SHEETS_EPOCH) / DAY_MS);
}

export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

/** colA[0] is row 2, values are date serials (UNFORMATTED_VALUE). */
export function findWeekRow(colA: unknown[], iso: string): number {
  const target = isoToSerial(mondayOf(iso));
  const i = colA.findIndex((v) => Number(v) === target);
  if (i < 0) throw new Error(`No Weekly review row for the week of ${mondayOf(iso)}`);
  return i + FIRST_ROW;
}

export type Cells = Record<string, string | number>;

export function validateWrite(
  tab: string,
  key: RowKey,
  cells: Cells,
  rules: Record<string, Rule>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = TABS[tab];
  if (!spec) return { errors: [`Tab "${tab}" is not writable`], warnings };

  if (!spec.rowKeys.includes(key.kind)) {
    errors.push(`Row key ${key.kind} not allowed on ${tab} (allowed: ${spec.rowKeys.join(', ')})`);
  }
  const cols = Object.keys(cells);
  if (cols.length === 0) errors.push('No cells to write');
  if (key.kind === 'first-empty' && isBlank(cells.A)) {
    errors.push('first-empty needs a value in key column A');
  }

  for (const col of cols) {
    const v = cells[col];
    if (!spec.writable.includes(col)) {
      errors.push(`column ${col} is not writable on ${tab}`);
      continue;
    }
    if (typeof v === 'string' && v.trim().startsWith('=')) {
      errors.push(`column ${col}: values starting with "=" would become a formula`);
      continue;
    }
    if (isBlank(v)) continue; // clearing a cell is allowed
    const s = String(v);
    if (spec.dates?.includes(col) && !isValidIsoDate(s)) {
      errors.push(`column ${col}: date must be a real YYYY-MM-DD, got "${s}"`);
    }
    if (spec.numbers?.includes(col) && !(typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(s))) {
      errors.push(`column ${col}: expected a plain number, got "${s}"`);
    }
    const rule = rules[col];
    if (rule && !rule.values.includes(s)) {
      if (rule.kind === 'list') {
        errors.push(`column ${col}: "${s}" not in dropdown [${rule.values.join(' | ')}]`);
      } else if (spec.strictRanges?.includes(col)) {
        errors.push(`column ${col}: "${s}" not found in Contacts column A (exact name needed)`);
      } else {
        warnings.push(`column ${col}: "${s}" is not in the referenced list (sheet will flag it)`);
      }
    }
  }
  return { errors, warnings };
}
