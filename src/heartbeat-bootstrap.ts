/**
 * Heartbeat bootstrap and 24h fallback.
 *
 * Called from the host sweep on every tick:
 *   - sweepHeartbeatBootstrap(): detects new HEARTBEAT.md files and
 *     wires the synthetic session + fires the one-time bootstrap trigger.
 *   - sweepHeartbeatFallback(): fires a safety-net trigger if the agent
 *     hasn't self-scheduled a wake in the last 24h.
 *
 * The agent owns its own schedule via schedule_task. These functions are
 * the reliability layer underneath that, not the primary scheduling path.
 */
import fs from 'fs';

import { getAllAgentGroups } from './db/agent-groups.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupByPlatform,
} from './db/messaging-groups.js';
import { findSessionForAgent, getSessionsByAgentGroup } from './db/sessions.js';
import { TIMEZONE } from './config.js';
import { log } from './log.js';
import {
  inboundDbPath,
  openInboundDb,
  resolveSession,
  writeSessionMessage,
} from './session-manager.js';
import {
  hasHeartbeatConfig,
  isHeartbeatBootstrapped,
  isWithinActiveHours,
  markHeartbeatBootstrapped,
  readHeartbeatConfig,
} from './heartbeat.js';
import type { AgentGroup } from './types.js';

const FALLBACK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Public sweep entry points ───────────────────────────────────────────────

export async function sweepHeartbeatBootstrap(): Promise<void> {
  for (const group of getAllAgentGroups()) {
    try {
      await maybeBootstrapHeartbeat(group);
    } catch (err) {
      log.error('Heartbeat bootstrap error', { agentGroupId: group.id, err });
    }
  }
}

export async function sweepHeartbeatFallback(): Promise<void> {
  for (const group of getAllAgentGroups()) {
    try {
      await maybeWriteHeartbeatFallback(group);
    } catch (err) {
      log.error('Heartbeat fallback error', { agentGroupId: group.id, err });
    }
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

async function maybeBootstrapHeartbeat(group: AgentGroup): Promise<void> {
  if (!hasHeartbeatConfig(group.folder)) return;
  if (isHeartbeatBootstrapped(group.folder)) return;

  log.info('Bootstrapping heartbeat session', { agentGroupId: group.id, folder: group.folder });

  // Create the synthetic messaging group
  const mgId = generateId('mg');
  createMessagingGroup({
    id: mgId,
    channel_type: 'heartbeat',
    platform_id: group.id,
    name: `${group.name} Heartbeat`,
    is_group: 0,
    unknown_sender_policy: 'public',
    created_at: new Date().toISOString(),
  });

  // Wire it to the agent group
  createMessagingGroupAgent({
    id: generateId('mga'),
    messaging_group_id: mgId,
    agent_group_id: group.id,
    engage_mode: 'pattern',
    engage_pattern: '.',
    sender_scope: 'all',
    ignored_message_policy: 'drop',
    session_mode: 'shared',
    priority: 0,
    created_at: new Date().toISOString(),
  });

  // Create the session (also initialises the session folder + DBs)
  const { session } = resolveSession(group.id, mgId, null, 'shared');

  // Cancel legacy recurrences that heartbeat now replaces
  cancelLegacyRecurrences(group);

  // Inject bootstrap trigger — agent reads HEARTBEAT.md and sets up its schedule
  writeSessionMessage(group.id, session.id, {
    id: generateId('hb-boot'),
    kind: 'task',
    timestamp: new Date().toISOString(),
    content: JSON.stringify({
      prompt:
        'Heartbeat bootstrap: read HEARTBEAT.md, set last_run for all tasks to now, ' +
        'then schedule future wakes for each task using schedule_task. ' +
        'Also cancel any legacy recurring tasks that heartbeat now replaces.',
    }),
    trigger: 1,
  });

  // Write sentinel last — after all DB operations succeed
  markHeartbeatBootstrapped(group.folder);
  log.info('Heartbeat bootstrap complete', { agentGroupId: group.id, sessionId: session.id });
}

/**
 * Cancel legacy scheduled recurrences that heartbeat replaces.
 * Targets cron patterns we know are superseded; safe to run on all sessions
 * since `UPDATE ... WHERE recurrence = ?` is a no-op when nothing matches.
 */
function cancelLegacyRecurrences(group: AgentGroup): void {
  const LEGACY_CRONS = [
    '0 11 * * *', // Pepa daily 11am briefing
    '0 9 * * 1', //  Pepa Monday check-in
  ];
  for (const session of getSessionsByAgentGroup(group.id)) {
    const dbPath = inboundDbPath(group.id, session.id);
    if (!fs.existsSync(dbPath)) continue;
    try {
      const db = openInboundDb(group.id, session.id);
      try {
        for (const cron of LEGACY_CRONS) {
          db.prepare(
            `UPDATE messages_in SET status='completed', recurrence=NULL
             WHERE kind='task' AND recurrence=? AND status IN ('pending','paused')`,
          ).run(cron);
        }
      } finally {
        db.close();
      }
    } catch (err) {
      log.warn('Failed to cancel legacy recurrences', { sessionId: session.id, err });
    }
  }
}

// ── 24h Fallback ─────────────────────────────────────────────────────────────

async function maybeWriteHeartbeatFallback(group: AgentGroup): Promise<void> {
  if (!hasHeartbeatConfig(group.folder)) return;
  if (!isHeartbeatBootstrapped(group.folder)) return;

  const config = readHeartbeatConfig(group.folder);
  if (!isWithinActiveHours(config, TIMEZONE)) return;

  const mg = getMessagingGroupByPlatform('heartbeat', group.id);
  if (!mg) return;

  const session = findSessionForAgent(group.id, mg.id, null);
  if (!session) return;

  const dbPath = inboundDbPath(group.id, session.id);
  if (!fs.existsSync(dbPath)) return;

  // Read state — then close before writing (writeSessionMessage opens its own connection)
  let shouldFire = false;
  const db = openInboundDb(group.id, session.id);
  try {
    const pending = db
      .prepare(`SELECT COUNT(*) as c FROM messages_in WHERE kind='task' AND status='pending'`)
      .get() as { c: number };
    if (pending.c > 0) return; // agent already has a pending wake scheduled

    const lastTask = db
      .prepare(`SELECT MAX(timestamp) as ts FROM messages_in WHERE kind='task'`)
      .get() as { ts: string | null };
    const lastMs = lastTask.ts ? Date.parse(lastTask.ts) : 0;
    shouldFire = Date.now() - lastMs >= FALLBACK_INTERVAL_MS;
  } finally {
    db.close();
  }

  if (!shouldFire) return;

  log.info('Writing heartbeat fallback trigger', { agentGroupId: group.id, sessionId: session.id });
  writeSessionMessage(group.id, session.id, {
    id: generateId('hb-fallback'),
    kind: 'task',
    timestamp: new Date().toISOString(),
    content: JSON.stringify({
      prompt:
        'Heartbeat wake (24h fallback): read HEARTBEAT.md, run any tasks that are due, ' +
        'then schedule your next wake using schedule_task.',
    }),
    trigger: 1,
  });
}
