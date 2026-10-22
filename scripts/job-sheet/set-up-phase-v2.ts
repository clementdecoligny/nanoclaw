#!/usr/bin/env bun
// Set up phase v2 (owner decision 2026-10-22): new outcome, exit gate and 31 Oct
// milestone. Writes fixed cells only, so re-running is harmless. Checks the
// labels first and stops if the sheet isn't laid out as expected (needs the #
// column from add-todo-index.ts).
//
//   onecli run --agent <lenny agent id> -- bun scripts/job-sheet/set-up-phase-v2.ts <test|live>

import { resolveSpreadsheetId } from '../../container/skills/job-sheet/lib';

const target = process.argv[2];
if (target !== 'test' && target !== 'live') {
  console.error('Usage: set-up-phase-v2.ts <test|live>');
  process.exit(1);
}
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${resolveSpreadsheetId(target)}`;
const HEADERS = { Authorization: 'Bearer onecli-managed', 'Content-Type': 'application/json' };

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}
const cell = async (range: string) =>
  String((await api(`/values/${encodeURIComponent(range)}`)).values?.[0]?.[0] ?? '');

const expect: [string, string][] = [
  ["'1 Set up'!B3", 'Outcome'],
  ["'1 Set up'!B4", 'Exit gate'],
  ["'1 Set up'!B8", 'Gate item'],
  ["'1 Set up'!A16", '#'],
  ['Settings!B4', 'Set up'],
  ['Settings!B11', 'Milestone (charter §3)'],
  ['Dashboard!A40', 'Milestone'],
];
for (const [range, label] of expect) {
  const got = await cell(range);
  if (got !== label) throw new Error(`${range} is "${got}", expected "${label}"; stopping, nothing written`);
}

export const OUTCOME = [
  '4 CMFs validated for self-fit, each with a one-sentence version a recruiter can repeat.',
  'Mnookin 2-pager rehabbed for Madrid.',
  'LinkedIn and master resume consistent with an umbrella narrative that covers the ideal and Backup 1, credible enough to send with outreach.',
  'First calibration calls booked, so pay and stretch data start arriving in the first week of November.',
  'Company list v0 of about 30 companies across Madrid and remote EU/US, ready to test in conversations.',
].map((l) => `• ${l}`).join('\n');

const GATE = 'At least 3 calibration calls booked; company list v0 done (6 h timebox); profile and resume live';
const MILESTONE = '3 calibration calls booked; company list v0 done; profile and resume live';

// Booked = contacts whose next action is a calibration call, plus calls already
// held with recruiters, product leaders or hiring managers (Lenny replaces the
// next action once a call is logged, so a call is never counted twice).
const CALLS =
  '=COUNTIF(Contacts!$G$2:$G$500,"Calibration call*")' +
  '+SUM(COUNTIF(Conversations!$D$2:$D$500,{"Recruiter","Product leader","Hiring manager"}))';

const data: { range: string; values: unknown[][] }[] = [
  { range: "'1 Set up'!C3", values: [[OUTCOME]] },
  { range: 'Settings!E4', values: [[GATE]] },
  { range: 'Settings!B12', values: [[MILESTONE]] },
  {
    range: "'1 Set up'!B9:F11",
    values: [
      ['At least 3 calibration calls booked', 'Contacts (next action "Calibration call") + calls held', CALLS, 3, '=IF(D9>=E9,"Yes","No")'],
      ['Company list v0 (about 30, 6 h timebox)', 'Companies (rows filled)', '=COUNTA(Companies!$A$2:$A$500)', 30, '=IF(D10>=E10,"Yes","No")'],
      ['Profile and resume live', 'Manual', '', 'Yes', '=IF(D11="Yes","Yes","No")'],
    ],
  },
  {
    range: 'Dashboard!C41:D41',
    values: [['=IF(LEFT(\'1 Set up\'!C5,6)="PASSED","Met",IF(B41<TODAY(),"Missed","Open"))', 'Set up gate passed']],
  },
];
await api('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
console.log(`Set up v2 written to ${target}: outcome, gate (Settings E4 + checklist rows 9–11), 31 Oct milestone, Dashboard check`);
