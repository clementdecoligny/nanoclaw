#!/usr/bin/env bun
// Job Move 2027 sheet tool. Reaches Google Sheets through the OneCLI gateway
// (HTTPS_PROXY); the gateway swaps the placeholder bearer for the real token.
//
//   bun sheet.ts read "<A1 range>"
//   bun sheet.ts rules "<tab>" [row]
//   bun sheet.ts write "<tab>" <first-empty|row:N|week:YYYY-MM-DD> '<json cells>'
//
// Output is always one JSON object on stdout; exit 1 on error.

import {
  TABS,
  resolveSpreadsheetId,
  parseRowKey,
  firstEmptyRow,
  findWeekRow,
  validateWrite,
  rowWindow,
  type Cells,
  type Rule,
} from './lib';

let BASE = '';
const HEADERS = { Authorization: 'Bearer onecli-managed', 'Content-Type': 'application/json' };

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

async function getValues(range: string, render = 'FORMATTED_VALUE'): Promise<unknown[][]> {
  const r = await api(`/values/${encodeURIComponent(range)}?valueRenderOption=${render}`);
  return r.values ?? [];
}

async function column(tab: string, col: string, render = 'FORMATTED_VALUE'): Promise<unknown[]> {
  const { first, last } = rowWindow(tab);
  const rows = await getValues(`${q(tab)}!${col}${first}:${col}${last}`, render);
  return rows.map((r) => r[0]);
}

/** Dropdown rules as defined on the target row's cells (the sheet's own source of truth). */
async function rulesFor(tab: string, row: number): Promise<Record<string, Rule>> {
  const range = encodeURIComponent(`${q(tab)}!A${row}:Z${row}`);
  const r = await api(`?ranges=${range}&fields=sheets(data(startColumn,rowData.values.dataValidation))`);
  const block = r.sheets?.[0]?.data?.[0];
  const cells = block?.rowData?.[0]?.values ?? [];
  const out: Record<string, Rule> = {};
  for (let i = 0; i < cells.length; i++) {
    const cond = cells[i]?.dataValidation?.condition;
    if (!cond) continue;
    const col = String.fromCharCode(65 + (block.startColumn ?? 0) + i);
    if (cond.type === 'ONE_OF_LIST') {
      out[col] = { kind: 'list', values: cond.values.map((v: any) => String(v.userEnteredValue)) };
    } else if (cond.type === 'ONE_OF_RANGE') {
      const ref = String(cond.values[0].userEnteredValue).replace(/^=/, '').replace(/\$/g, '');
      const vals = (await getValues(ref)).map((x) => String(x[0] ?? '')).filter((s) => s.trim() !== '');
      out[col] = { kind: 'range', values: vals };
    }
  }
  return out;
}

async function resolveRow(tab: string, keyArg: string): Promise<number> {
  const key = parseRowKey(keyArg);
  if (key.kind === 'first-empty') {
    const { first, last } = rowWindow(tab);
    return firstEmptyRow(await column(tab, 'A'), first, last);
  }
  if (key.kind === 'week') return findWeekRow(await column(tab, 'A', 'UNFORMATTED_VALUE'), key.date);
  // row:N edits an existing record only — never an empty row.
  const existing = await getValues(`${q(tab)}!A${key.row}`);
  if (!existing[0]?.[0]) throw new Error(`Row ${key.row} of ${tab} is empty; use first-empty for new rows`);
  return key.row;
}

async function write(tab: string, keyArg: string, cellsJson: string) {
  if (!TABS[tab]) throw new Error(`Tab "${tab}" is not writable`);
  const key = parseRowKey(keyArg);
  const cells = JSON.parse(cellsJson) as Cells;
  // Static checks first (no network) so bad input never touches the sheet.
  const pre = validateWrite(tab, key, cells, {});
  if (pre.errors.length) return fail(pre.errors);

  const row = await resolveRow(tab, keyArg);
  const { errors, warnings } = validateWrite(tab, key, cells, await rulesFor(tab, row));
  if (errors.length) return fail(errors);

  const data = Object.entries(cells).map(([col, v]) => ({ range: `${q(tab)}!${col}${row}`, values: [[v]] }));
  await api('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  });
  out({ ok: true, tab, row, written: Object.keys(cells), warnings });
}

function out(o: object) {
  const target = process.env.JOB_SHEET_TARGET === 'live' ? 'live' : 'test';
  console.log(JSON.stringify({ target, ...o }, null, 2));
}
function fail(errors: string[]) {
  out({ ok: false, errors });
  process.exit(1);
}

async function main() {
  BASE = `https://sheets.googleapis.com/v4/spreadsheets/${resolveSpreadsheetId(process.env.JOB_SHEET_TARGET)}`;
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === 'read' && a) return out({ ok: true, range: a, values: await getValues(a) });
  if (cmd === 'rules' && a) return out({ ok: true, tab: a, rules: await rulesFor(a, Number(b ?? rowWindow(a).first)) });
  if (cmd === 'write' && a && b && c) return write(a, b, c);
  fail(['Usage: read <range> | rules <tab> [row] | write <tab> <first-empty|row:N|week:YYYY-MM-DD> <json>']);
}

main().catch((e) => fail([String(e?.message ?? e)]));
