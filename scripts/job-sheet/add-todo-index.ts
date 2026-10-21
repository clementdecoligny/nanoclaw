#!/usr/bin/env bun
// One-off structural migration for the Job Move 2027 sheet: adds the "#" index
// column in front of each phase tab's to-do block. Host-side only (Lenny never
// runs structural changes). Idempotent: a tab whose A16 is already "#" is skipped.
//
//   onecli run --agent <lenny agent id> -- bun scripts/job-sheet/add-todo-index.ts <test|live>
//
// Per phase tab: insert column A (every existing column keeps its width and
// every formula pointing at the tab shifts with it), number the current to-dos
// 1…n in row order, point the H sort key at # and stretch the filter and the
// to-do colour rules over column A. Then retitle the Dashboard to-do list.

import { PHASE_TABS, resolveSpreadsheetId } from '../../container/skills/job-sheet/lib';

const target = process.argv[2];
if (target !== 'test' && target !== 'live') {
  console.error('Usage: add-todo-index.ts <test|live>');
  process.exit(1);
}
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${resolveSpreadsheetId(target)}`;
const HEADERS = { Authorization: 'Bearer onecli-managed', 'Content-Type': 'application/json' };
const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}
const values = async (range: string) =>
  ((await api(`/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`)).values ?? []) as unknown[][];
const batch = (requests: object[]) => api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
const setValues = (data: { range: string; values: unknown[][] }[]) =>
  api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });

const FIRST = 17;
const LAST = 31;
const sortKey = (r: number) =>
  `=IF(OR(B${r}="",E${r}="Done",E${r}="Dropped"),"",IF(A${r}="",1000,A${r})+ROW()/10000)`;

const meta = await api('?fields=sheets(properties(sheetId,title),conditionalFormats)');
const sheetIdOf = (t: string) => meta.sheets.find((s: any) => s.properties.title === t)?.properties.sheetId;

for (const tab of PHASE_TABS) {
  const sheetId = sheetIdOf(tab);
  if (sheetId === undefined) throw new Error(`Tab "${tab}" not found`);
  const [header] = await values(`${q(tab)}!A16:H16`);
  if (header?.[0] === '#') {
    console.log(`${tab}: already has #, skipped`);
    continue;
  }
  if (header?.[0] !== 'Task') throw new Error(`${tab}: A16 is "${header?.[0]}", expected "Task"; stopping`);

  await batch([
    { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, inheritFromBefore: false } },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 36 },
        fields: 'pixelSize',
      },
    },
    // Header and body formats copied from the Task column, then centred.
    {
      copyPaste: {
        source: { sheetId, startRowIndex: 15, endRowIndex: LAST, startColumnIndex: 1, endColumnIndex: 2 },
        destination: { sheetId, startRowIndex: 15, endRowIndex: LAST, startColumnIndex: 0, endColumnIndex: 1 },
        pasteType: 'PASTE_FORMAT',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 15, endRowIndex: LAST, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', wrapStrategy: 'CLIP' } },
        fields: 'userEnteredFormat(horizontalAlignment,wrapStrategy)',
      },
    },
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 15, endRowIndex: LAST, startColumnIndex: 0, endColumnIndex: 8 } },
      },
    },
  ]);

  const tasks = await values(`${q(tab)}!B${FIRST}:B${LAST}`);
  let n = 0;
  const colA = Array.from({ length: LAST - FIRST + 1 }, (_, i) => [String(tasks[i]?.[0] ?? '').trim() ? ++n : '']);
  const colH = Array.from({ length: LAST - FIRST + 1 }, (_, i) => [sortKey(FIRST + i)]);
  await setValues([
    { range: `${q(tab)}!A16`, values: [['#']] },
    { range: `${q(tab)}!A${FIRST}:A${LAST}`, values: colA },
    { range: `${q(tab)}!H${FIRST}:H${LAST}`, values: colH },
  ]);
  console.log(`${tab}: # added, ${n} to-dos numbered`);
}

// To-do colour rules (overdue / done) now start at column B: stretch them to A.
const after = await api('?fields=sheets(properties(sheetId,title),conditionalFormats)');
const requests: object[] = [];
for (const s of after.sheets) {
  if (!PHASE_TABS.includes(s.properties.title)) continue;
  // H sort key is now # + row/10000, not a date: show it as a number.
  requests.push({
    repeatCell: {
      range: { sheetId: s.properties.sheetId, startRowIndex: FIRST - 1, endRowIndex: LAST, startColumnIndex: 7, endColumnIndex: 8 },
      cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.0000' } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  });
  (s.conditionalFormats ?? []).forEach((rule: any, index: number) => {
    const r = rule.ranges?.[0];
    if (rule.ranges.length === 1 && r.startRowIndex === FIRST - 1 && r.startColumnIndex === 1) {
      requests.push({
        updateConditionalFormatRule: {
          index,
          sheetId: s.properties.sheetId,
          rule: { ...rule, ranges: [{ ...r, startColumnIndex: 0 }] },
        },
      });
    }
  });
}
if (requests.length) await batch(requests);
console.log(`tidy-up requests sent: ${requests.length}`);

await setValues([{ range: 'Dashboard!A14', values: [['NEXT TO-DOS — current phase, in # order (red = overdue)']] }]);
console.log('Dashboard title updated');
