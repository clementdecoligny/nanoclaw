/**
 * SQL operations on per-session inbound/outbound DBs.
 *
 * These are NOT the central app DB — they're the cross-mount SQLite files
 * shared between host and container. Callers own the connection lifecycle
 * (open-write-close per op). See session-manager.ts header for invariants.
 */
import Database from 'better-sqlite3';

import { INBOUND_SCHEMA, OUTBOUND_SCHEMA } from './schema.js';

/**
 * Durability pragmas for session DBs.
 *
 * journal_mode=DELETE is load-bearing in production and is NEVER relaxed —
 * see the header of container/agent-runner/src/db/connection.ts for why
 * (cross-mount visibility between host and container).
 *
 * synchronous defaults to FULL, which means every commit fsyncs the journal
 * file it just created and again when it unlinks it. On hosts with slow fsync
 * (WSL2 measures ~148ms per fsync) that is ~325ms per single-row write, enough
 * to blow vitest's per-test budget during setup alone.
 *
 * Under test we drop to synchronous=OFF: ~0.4ms per write, a ~600x speedup on
 * the suite. This is safe *only* because tests never survive a crash — the
 * temp dirs are wiped in beforeEach. It must never apply in production, where
 * a torn write means a lost or corrupted message.
 */
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

function applySessionPragmas(db: Database.Database, opts: { readonly?: boolean } = {}): void {
  // A readonly connection cannot change journal_mode; the writer owns it.
  if (!opts.readonly) db.pragma('journal_mode = DELETE');
  if (IS_TEST) db.pragma('synchronous = OFF');
  db.pragma('busy_timeout = 5000');
}

/** Apply the inbound or outbound schema to a DB file. Idempotent. */
export function ensureSchema(dbPath: string, schema: 'inbound' | 'outbound'): void {
  const db = new Database(dbPath);
  applySessionPragmas(db);
  db.exec(schema === 'inbound' ? INBOUND_SCHEMA : OUTBOUND_SCHEMA);
  db.close();
}

/** Open the inbound DB for a session (host reads/writes). */
export function openInboundDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  applySessionPragmas(db);
  return db;
}

/** Open the outbound DB for a session (host reads only). */
export function openOutboundDb(dbPath: string): Database.Database {
  const db = new Database(dbPath, { readonly: true });
  applySessionPragmas(db, { readonly: true });
  return db;
}

/** Open the outbound DB for a session with write access. Only safe to call when no container is running. */
export function openOutboundDbRw(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  applySessionPragmas(db);
  return db;
}

export function upsertSessionRouting(
  db: Database.Database,
  routing: { channel_type: string | null; platform_id: string | null; thread_id: string | null },
): void {
  db.prepare(
    `INSERT INTO session_routing (id, channel_type, platform_id, thread_id)
     VALUES (1, @channel_type, @platform_id, @thread_id)
     ON CONFLICT(id) DO UPDATE SET
       channel_type = excluded.channel_type,
       platform_id  = excluded.platform_id,
       thread_id    = excluded.thread_id`,
  ).run(routing);
}

export interface DestinationRow {
  name: string;
  display_name: string | null;
  type: 'channel' | 'agent';
  channel_type: string | null;
  platform_id: string | null;
  agent_group_id: string | null;
}

export function replaceDestinations(db: Database.Database, entries: DestinationRow[]): void {
  const tx = db.transaction((rows: DestinationRow[]) => {
    db.prepare('DELETE FROM destinations').run();
    const stmt = db.prepare(
      `INSERT INTO destinations (name, display_name, type, channel_type, platform_id, agent_group_id)
       VALUES (@name, @display_name, @type, @channel_type, @platform_id, @agent_group_id)`,
    );
    for (const row of rows) stmt.run(row);
  });
  tx(entries);
}

// ---------------------------------------------------------------------------
// messages_in
// ---------------------------------------------------------------------------

/**
 * Next even seq number for host-owned inbound.db.
 *
 * Exported so the scheduling module's task helpers can maintain the
 * host-writes-even-seq invariant without duplicating the logic. Not part of
 * the general public API — imported by `src/modules/scheduling/db.ts` only.
 */
export function nextEvenSeq(db: Database.Database): number {
  const maxSeq = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_in').get() as { m: number }).m;
  return maxSeq < 2 ? 2 : maxSeq + 2 - (maxSeq % 2);
}

export function insertMessage(
  db: Database.Database,
  message: {
    id: string;
    kind: string;
    timestamp: string;
    platformId: string | null;
    channelType: string | null;
    threadId: string | null;
    content: string;
    processAfter: string | null;
    recurrence: string | null;
    /**
     * 1 = wake the agent (default); 0 = accumulate as context only.
     * Host countDueMessages gates on this; container reads everything.
     */
    trigger?: 0 | 1;
    /**
     * For agent-to-agent inbound: the source session id that emitted the
     * outbound message which became this inbound row. Used as the return
     * path for the target's reply. NULL on channel-side inbound.
     */
    sourceSessionId?: string | null;
    /**
     * 1 = only deliver on the container's first poll (fresh start).
     * Dying containers (past first poll) skip these rows.
     */
    onWake?: 0 | 1;
  },
): void {
  db.prepare(
    `INSERT INTO messages_in (id, seq, kind, timestamp, status, platform_id, channel_type, thread_id, content, process_after, recurrence, series_id, trigger, source_session_id, on_wake)
     VALUES (@id, @seq, @kind, @timestamp, 'pending', @platformId, @channelType, @threadId, @content, @processAfter, @recurrence, @id, @trigger, @sourceSessionId, @onWake)`,
  ).run({
    ...message,
    trigger: message.trigger ?? 1,
    onWake: message.onWake ?? 0,
    sourceSessionId: message.sourceSessionId ?? null,
    seq: nextEvenSeq(db),
  });
}

export function countDueMessages(db: Database.Database): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM messages_in
       WHERE status = 'pending'
         AND trigger = 1
         AND (process_after IS NULL OR datetime(process_after) <= datetime('now'))`,
      )
      .get() as { count: number }
  ).count;
}

export function markMessageFailed(db: Database.Database, messageId: string): void {
  db.prepare("UPDATE messages_in SET status = 'failed' WHERE id = ?").run(messageId);
}

export function retryWithBackoff(db: Database.Database, messageId: string, backoffSec: number): void {
  db.prepare(
    `UPDATE messages_in SET tries = tries + 1, process_after = datetime('now', '+${backoffSec} seconds') WHERE id = ?`,
  ).run(messageId);
}

export function getMessageForRetry(
  db: Database.Database,
  messageId: string,
  status: string,
): { id: string; tries: number; processAfter: string | null } | undefined {
  return db
    .prepare('SELECT id, tries, process_after as processAfter FROM messages_in WHERE id = ? AND status = ?')
    .get(messageId, status) as { id: string; tries: number; processAfter: string | null } | undefined;
}

export function syncProcessingAcks(inDb: Database.Database, outDb: Database.Database): void {
  const completed = outDb
    .prepare("SELECT message_id FROM processing_ack WHERE status IN ('completed', 'failed')")
    .all() as Array<{ message_id: string }>;

  if (completed.length === 0) return;

  const updateStmt = inDb.prepare("UPDATE messages_in SET status = 'completed' WHERE id = ? AND status != 'completed'");
  inDb.transaction(() => {
    for (const { message_id } of completed) {
      updateStmt.run(message_id);
    }
  })();
}

export function getStuckProcessingIds(outDb: Database.Database): string[] {
  return (
    outDb.prepare("SELECT message_id FROM processing_ack WHERE status = 'processing'").all() as Array<{
      message_id: string;
    }>
  ).map((r) => r.message_id);
}

export interface ProcessingClaim {
  message_id: string;
  status_changed: string;
}

/** Return processing_ack rows still in 'processing' with their claim timestamps. */
export function getProcessingClaims(outDb: Database.Database): ProcessingClaim[] {
  return outDb
    .prepare("SELECT message_id, status_changed FROM processing_ack WHERE status = 'processing'")
    .all() as ProcessingClaim[];
}

/**
 * Delete orphan 'processing' rows. Called by the host after killing a
 * container so the leftover claim doesn't trip claim-stuck on the next sweep
 * tick (which would kill the freshly respawned container before its
 * agent-runner can run its own startup cleanup).
 *
 * Safe because the host only writes to outbound.db when no container is
 * running (we just killed it). Returns the number of rows deleted.
 */
export function deleteOrphanProcessingClaims(outDb: Database.Database): number {
  return outDb.prepare("DELETE FROM processing_ack WHERE status = 'processing'").run().changes;
}

export interface ContainerState {
  current_tool: string | null;
  tool_declared_timeout_ms: number | null;
  tool_started_at: string | null;
}

/**
 * Read the container's current tool-in-flight state, if any. Returns null
 * when either the table doesn't exist yet (older session DB) or no tool is
 * active. Host sweep reads this to widen stuck-detection tolerance while
 * Bash is running with a long declared timeout.
 */
export function getContainerState(outDb: Database.Database): ContainerState | null {
  try {
    const row = outDb
      .prepare(
        `SELECT current_tool, tool_declared_timeout_ms, tool_started_at
           FROM container_state WHERE id = 1`,
      )
      .get() as ContainerState | undefined;
    return row ?? null;
  } catch {
    // Table not present on older session DBs — treat as "no tool in flight".
    return null;
  }
}

// ---------------------------------------------------------------------------
// messages_out (read-only from host)
// ---------------------------------------------------------------------------

export interface OutboundMessage {
  id: string;
  kind: string;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  content: string;
  in_reply_to: string | null;
}

export function getDueOutboundMessages(db: Database.Database): OutboundMessage[] {
  return db
    .prepare(
      `SELECT * FROM messages_out
       WHERE (deliver_after IS NULL OR deliver_after <= datetime('now'))
       ORDER BY timestamp ASC`,
    )
    .all() as OutboundMessage[];
}

// ---------------------------------------------------------------------------
// delivered
// ---------------------------------------------------------------------------

export function getDeliveredIds(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare('SELECT message_out_id FROM delivered').all() as Array<{ message_out_id: string }>).map(
      (r) => r.message_out_id,
    ),
  );
}

export function markDelivered(db: Database.Database, messageOutId: string, platformMessageId: string | null): void {
  db.prepare(
    "INSERT OR IGNORE INTO delivered (message_out_id, platform_message_id, status, delivered_at) VALUES (?, ?, 'delivered', datetime('now'))",
  ).run(messageOutId, platformMessageId ?? null);
}

export function markDeliveryFailed(db: Database.Database, messageOutId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO delivered (message_out_id, platform_message_id, status, delivered_at) VALUES (?, NULL, 'failed', datetime('now'))",
  ).run(messageOutId);
}

/** Ensure the delivered table has columns added after initial schema. */
export function migrateDeliveredTable(db: Database.Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info('delivered')").all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!cols.has('platform_message_id')) {
    db.prepare('ALTER TABLE delivered ADD COLUMN platform_message_id TEXT').run();
  }
  if (!cols.has('status')) {
    db.prepare("ALTER TABLE delivered ADD COLUMN status TEXT NOT NULL DEFAULT 'delivered'").run();
  }
}

// ---------------------------------------------------------------------------
// Status-feedback sentinels (agent-status-feedback feature)
// ---------------------------------------------------------------------------
//
// Two well-known rows in the `delivered` table track Telegram status-feedback
// state per session. Both use a sentinel string as `message_out_id` so they
// survive session re-open (host restarts). The container never reads or writes
// these rows.
//
//   __status_msg__   — platform message ID of the current status message.
//   __reaction_msg__ — platform message ID of the user message with 👀 reaction.
//
// Using INSERT OR REPLACE so each sentinel can be updated in-place as
// the session progresses.
//

export type StatusSentinelKey = '__status_msg__' | '__reaction_msg__';

/**
 * Read a status-feedback sentinel from the delivered table.
 * Returns the stored platform_message_id, or null if not set.
 */
export function getStatusSentinel(db: Database.Database, key: StatusSentinelKey): string | null {
  const row = db.prepare('SELECT platform_message_id FROM delivered WHERE message_out_id = ?').get(key) as
    | { platform_message_id: string | null }
    | undefined;
  return row?.platform_message_id ?? null;
}

/**
 * Upsert a status-feedback sentinel into the delivered table.
 * Uses INSERT OR REPLACE so it updates if the row already exists.
 */
export function upsertStatusSentinel(db: Database.Database, key: StatusSentinelKey, platformMessageId: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO delivered (message_out_id, platform_message_id, status, delivered_at)
     VALUES (?, ?, 'sentinel', datetime('now'))`,
  ).run(key, platformMessageId);
}

/**
 * Delete both status-feedback sentinel rows from the delivered table.
 * Called after the final answer is delivered or the container is killed.
 */
export function clearStatusSentinels(db: Database.Database): void {
  db.prepare("DELETE FROM delivered WHERE message_out_id IN ('__status_msg__', '__reaction_msg__')").run();
}

// Adds columns added to messages_in after the initial v2 schema to
// pre-existing session DBs. No-op on fresh installs where the columns are
// in the baseline schema. Backfills existing rows so invariants hold.
export function migrateMessagesInTable(db: Database.Database): void {
  const cols = new Set(
    (db.prepare("PRAGMA table_info('messages_in')").all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!cols.has('series_id')) {
    db.prepare('ALTER TABLE messages_in ADD COLUMN series_id TEXT').run();
    db.prepare('UPDATE messages_in SET series_id = id WHERE series_id IS NULL').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_messages_in_series ON messages_in(series_id)').run();
  }
  if (!cols.has('trigger')) {
    // All pre-existing rows got written with the old "every inbound wakes
    // the agent" semantics, so backfill 1 and default 1 for new inserts.
    db.prepare('ALTER TABLE messages_in ADD COLUMN trigger INTEGER NOT NULL DEFAULT 1').run();
  }
  if (!cols.has('source_session_id')) {
    // For agent-to-agent return-path routing. NULL on existing rows is fine —
    // their replies fall back to the legacy "newest active session" lookup.
    db.prepare('ALTER TABLE messages_in ADD COLUMN source_session_id TEXT').run();
  }
  if (!cols.has('on_wake')) {
    // 1 = only deliver on the container's first poll (fresh start).
    // All existing rows are normal messages, so default 0.
    db.prepare('ALTER TABLE messages_in ADD COLUMN on_wake INTEGER NOT NULL DEFAULT 0').run();
  }
}

/**
 * Look up an inbound row's source_session_id by its message id. Returns null
 * if the row doesn't exist or the column is NULL (channel inbound or
 * pre-migration a2a inbound). Used by a2a routing to route replies back to
 * the originating session.
 */
export function getInboundSourceSessionId(db: Database.Database, messageId: string): string | null {
  const row = db.prepare('SELECT source_session_id FROM messages_in WHERE id = ?').get(messageId) as
    | { source_session_id: string | null }
    | undefined;
  return row?.source_session_id ?? null;
}

/**
 * Find the source_session_id of the most recent a2a inbound row from a
 * specific peer (by agent group id). Used as a peer-affinity fallback in
 * a2a routing when an outbound reply has no `in_reply_to` (e.g. the
 * container's send_message MCP tool path didn't thread the batch's
 * in_reply_to through).
 *
 * Heuristic: "the last time this peer talked to me, which session was it?"
 * Returns null when no prior a2a inbound from that peer carries a
 * non-null source_session_id (typical for pre-migration installs).
 */
export function getMostRecentPeerSourceSessionId(db: Database.Database, peerAgentGroupId: string): string | null {
  const row = db
    .prepare(
      `SELECT source_session_id FROM messages_in
        WHERE channel_type = 'agent'
          AND platform_id = ?
          AND source_session_id IS NOT NULL
        ORDER BY seq DESC
        LIMIT 1`,
    )
    .get(peerAgentGroupId) as { source_session_id: string | null } | undefined;
  return row?.source_session_id ?? null;
}
