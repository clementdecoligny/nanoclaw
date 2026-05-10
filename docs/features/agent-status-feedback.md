# Agent Status Feedback (Telegram)

## HMW
How might we give the user immediate, continuous visibility into whether an agent received their message and what it is currently doing?

## Solution hypothesis
When a message routes to an agent, the host immediately adds a 👀 reaction to the user's message (acknowledgment: "received"). The container then emits named status messages as it works — one per tool call, automatically. The host delivers each status update by editing a single pinned "status" message in the chat. When the agent finishes, the status message is deleted and the 👀 reaction is removed. If the container crashes or goes silent for ≥2 min, the status message updates to "❌ Something went wrong". This is Telegram-only.

## Non-goals
- No other channel (Slack, Discord, etc.) — Telegram only for now.
- No manual `set_status` tool for the agent to call explicitly — status is automatic from tool calls only.
- No ETA or time estimates in the status text — just what the agent is doing + elapsed time.
- No per-message status threads — one status message per session, collapsed.

## Edge cases & decisions

| Edge case | Decision |
|-----------|----------|
| Fast responses (< 3s) | Reaction appears instantly. Status message also appears immediately (no threshold). It will be deleted when the answer arrives, which happens fast — acceptable flicker. |
| Multiple messages before agent responds | Collapse: one status message per session. The existing status message is edited in place, not a new one created. Reaction is added to the latest trigger message only. |
| Agent crashes mid-processing | Status message is edited to "❌ Something went wrong" by the host sweep when it detects the container died (heartbeat dead + processing claims stale). |
| Stuck detection (no heartbeat for ≥2 min) | Host sweep already kills the container at ceiling. Before killing, the sweep edits the status message to "⚠️ Still working… (Xm)" at the 2-minute mark, then "❌ Something went wrong" when it kills. |
| Agent finishes with no tool calls | Status message appears ("⚡ Got it…") then is immediately deleted. Reaction is removed. |
| Reaction on a message the bot didn't send | Host adds 👀 on the inbound user message (by its platform message ID). Telegram allows bots to react to any message in a chat. |
| Status message ID lost (host restart) | Stored in inbound.db delivered table keyed on a well-known sentinel row so it survives session re-open. |
| Reaction removal fails | Best-effort. Log warning, do not retry — the answer has already arrived. |
| Status edit fails (message deleted by user) | Best-effort. Log warning, swallow error. Do not retry. |
| Channel is not Telegram | Entire status-feedback path is gated on `channel_type.startsWith('telegram')`. No-op for other channels. |
| Agent sends a message mid-turn (via send_message MCP) | Status message remains active — the agent is still working. It is only cleaned up when `result` event fires. |
| Session has no inbound routing (heartbeat-originated) | Skip reaction and status entirely — heartbeat sessions have no user to acknowledge. |

## Entity model changes
None. No new tables.

## Session DB contract

### inbound.db (host-owned)
New rows in the existing `delivered` table (already has `platform_message_id` column) with a sentinel `message_out_id`:

- `message_out_id = '__status_msg__'` — stores the platform message ID of the current status message so the host can edit it on subsequent status updates and delete it on completion.
- `message_out_id = '__reaction_msg__'` — stores the platform message ID of the user's message that received the 👀 reaction, so the host can remove it on completion.

Both rows are upserted (INSERT OR REPLACE). Written and read exclusively by the host. Container never touches them.

### outbound.db (container-owned)
New `kind = 'status'` messages written by the container poll-loop automatically on each tool call event. Content shape:
```json
{ "phase": "Using calculator" }
```

The host delivery loop recognizes `kind = 'status'` and edits (or creates) the pinned status message instead of sending a new chat message.

## Container boundary

| Direction | What crosses |
|-----------|-------------|
| Container → Host | `kind='status'` rows in `outbound.db` with `phase` + `elapsed_ms` |
| Host → Telegram | Reaction on user's inbound message; send/edit/delete of status message |

## API contract

### New type: status outbound message (container → outbound.db)
```typescript
// Written by container poll-loop on each tool_use event
interface StatusMessageContent {
  phase: string;      // e.g. "Reading files", "Querying database", "Browsing web"
}
// kind = 'status', channel_type and platform_id copied from inbound routing
```

### Host delivery (src/delivery.ts)
`deliverMessage` gains a `kind === 'status'` branch that:
1. Checks `channel_type.startsWith('telegram')` — no-op otherwise.
2. Reads the current status message ID from `delivered` (sentinel `__status_msg__`).
3. If no status message exists: sends a new message → stores platform ID under `__status_msg__`.
4. If one exists: calls `adapter.editMessage(...)` with the new text.
5. Does NOT mark the status row in `delivered` as delivered — host re-edits on each tick without double-delivery guard.

### Host router (src/router.ts)
`deliverToAgent` gains a call to `addTelegramAcknowledgement(session, event)` immediately after `writeSessionMessage` when `wake === true`:
- Sends 👀 reaction to `event.message.id` (the inbound platform message ID) via `deliveryAdapter.deliver(...)` with `operation: 'reaction'`.
- Stores the user message's platform ID under `__reaction_msg__` in `inbound.db`.
- Gated on `event.channelType.startsWith('telegram')`.

### Cleanup path (src/delivery.ts)
When a `kind !== 'status' && kind !== 'system'` message is delivered (i.e. the actual answer arrives):
- Deletes the status message via `adapter.deliver(... { operation: 'delete', messageId })`.
- Removes 👀 reaction via `adapter.deliver(... { operation: 'remove_reaction', messageId, emoji: '👀' })`.
- Clears both sentinel rows from `delivered`.

### Stuck/crash path (src/host-sweep.ts)
When the sweep decides to kill a container:
- Before killing: if a status message exists (`__status_msg__` sentinel present), edits it to "⚠️ Still working… (Xm)".
- After killing: edits status message to "❌ Something went wrong".
- Removes 👀 reaction.
- Clears both sentinel rows.

### Telegram adapter additions (src/channels/telegram.ts / chat-sdk-bridge.ts)
The `deliver` method already handles `operation: 'edit'` and `operation: 'reaction'`. Need to add:
- `operation: 'delete'` — calls Telegram `deleteMessage`.
- `operation: 'remove_reaction'` — calls Telegram `setMessageReaction` with empty reactions array.

### Container poll-loop (container/agent-runner/src/poll-loop.ts)
`processQuery` emits a `kind='status'` row on each `progress` event from the provider, and also on each `tool_use` event (when the provider exposes it). The `phase` string is derived from the tool name or progress message:

| Event / tool name | Phase text |
|-------------------|------------|
| `progress` event | Use `event.message` directly |
| `tool_use`: `bash`, `computer` | "Running command" |
| `tool_use`: `read_file`, `write_file`, `edit` | "Reading/writing files" |
| `tool_use`: `web_search`, `web_fetch` | "Browsing the web" |
| `tool_use`: `mcp__*` | "Using tool: \<tool-name\>" |
| Any other tool | "Working…" |

Status rows are written with `channel_type` and `platform_id` copied from `routing` (the inbound message's routing context). No elapsed time is included.

### Reaction lifecycle
- 👀 is added on message receipt (routing time).
- 👀 stays until the actual answer arrives (not removed when the status message appears).
- 👀 is removed when the real answer is delivered, or when the container crashes/gets killed.

## Affected files

| File | Change |
|------|--------|
| `src/router.ts` | Add `addTelegramAcknowledgement()` called from `deliverToAgent` on wake |
| `src/delivery.ts` | Handle `kind='status'` branch; cleanup path on real answer delivery |
| `src/host-sweep.ts` | Edit/delete status message before killing stuck container |
| `src/channels/telegram.ts` or `src/channels/chat-sdk-bridge.ts` | Add `operation: 'delete'` and `operation: 'remove_reaction'` |
| `src/session-manager.ts` | Expose helper to read/write sentinel rows in `delivered` table |
| `container/agent-runner/src/poll-loop.ts` | Emit `kind='status'` on tool_use/progress events in `processQuery` |
| `container/agent-runner/src/db/messages-out.ts` | Accept `kind='status'` (already generic — no schema change needed) |

## Success signal
1. User sends a message on Telegram.
2. Within 1–2 seconds: 👀 reaction appears on their message.
3. Within ~2 seconds: a status message appears in the chat: "⚡ Got it, working…"
4. As the agent uses tools: status message edits in place — "🔍 Browsing the web", "📂 Reading files", etc.
5. When the answer arrives: status message disappears, 👀 reaction disappears, answer is visible.
6. If the agent hangs for 2+ minutes: status shows "⚠️ Still working… (2m)" then "❌ Something went wrong".
