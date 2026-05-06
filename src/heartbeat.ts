/**
 * Heartbeat configuration — per-agent-group HEARTBEAT.md parser.
 *
 * The heartbeat system gives agents a lightweight autonomous execution
 * channel: a synthetic messaging group fires periodic triggers so the
 * agent can run proactive tasks (inventory updates, briefings, triage)
 * without a user message. Each heartbeat session starts fresh — no
 * conversation history — to keep token costs minimal.
 *
 * HEARTBEAT.md format (in groups/<folder>/HEARTBEAT.md):
 *
 *   # Heartbeat
 *
 *   active_hours: 06:00-22:00
 *
 *   ## Tasks
 *
 *   ### task-name
 *   schedule: 0 6 * * *
 *   last_run: 2026-05-06T06:31:00.000Z
 *   silent_if_nothing: true
 *   action: >
 *     Description of what the agent should do when this task is due.
 *
 * The host only reads `active_hours` (for the 24h fallback guard).
 * Task scheduling, last_run tracking, and next-wake scheduling are
 * fully owned by the agent.
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';

export interface HeartbeatConfig {
  /** Active hours window — null means no restriction (always active). */
  active_hours: { start: string; end: string } | null;
}

/** Absolute path to the HEARTBEAT.md file for an agent group folder. */
export function heartbeatMdPath(folder: string): string {
  return path.join(GROUPS_DIR, folder, 'HEARTBEAT.md');
}

/** Absolute path to the bootstrap sentinel file for an agent group folder. */
export function heartbeatSentinelPath(folder: string): string {
  return path.join(GROUPS_DIR, folder, '.heartbeat-bootstrapped');
}

/** Returns true if a HEARTBEAT.md exists for this agent group folder. */
export function hasHeartbeatConfig(folder: string): boolean {
  return fs.existsSync(heartbeatMdPath(folder));
}

/** Returns true if the heartbeat session has already been bootstrapped. */
export function isHeartbeatBootstrapped(folder: string): boolean {
  return fs.existsSync(heartbeatSentinelPath(folder));
}

/** Write the bootstrap sentinel — call after all DB operations succeed. */
export function markHeartbeatBootstrapped(folder: string): void {
  fs.writeFileSync(heartbeatSentinelPath(folder), new Date().toISOString(), 'utf8');
}

/** Read and parse the HEARTBEAT.md for a given group folder. */
export function readHeartbeatConfig(folder: string): HeartbeatConfig {
  const content = fs.readFileSync(heartbeatMdPath(folder), 'utf8');
  return parseHeartbeatMd(content);
}

/**
 * Parse active_hours from HEARTBEAT.md content.
 * Accepts formats: "06:00-22:00" or "06:00–22:00" (en-dash).
 */
export function parseHeartbeatMd(content: string): HeartbeatConfig {
  const match = content.match(/^active_hours:\s*(.+)$/m);
  let active_hours: { start: string; end: string } | null = null;
  if (match) {
    // Split on hyphen or en-dash
    const parts = match[1].trim().split(/[-–]/);
    if (parts.length === 2) {
      active_hours = { start: parts[0].trim(), end: parts[1].trim() };
    }
  }
  return { active_hours };
}

/**
 * Returns true if the current wall-clock time (in the given timezone)
 * falls within the active_hours window. Returns true when no window is set.
 */
export function isWithinActiveHours(config: HeartbeatConfig, timezone: string): boolean {
  if (!config.active_hours) return true;

  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const [sh, sm] = config.active_hours.start.split(':').map(Number);
  const [eh, em] = config.active_hours.end.split(':').map(Number);
  // timeStr can be "24:00" midnight edge-case on some platforms — clamp
  const parts = timeStr.split(':').map(Number);
  const ch = parts[0] ?? 0;
  const cm = parts[1] ?? 0;

  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const curMins = ch * 60 + cm;

  return curMins >= startMins && curMins < endMins;
}
