/**
 * Best-effort status feedback writer.
 *
 * Writes `kind='status'` rows to outbound.db so the host can display
 * real-time progress indicators in the channel (currently Telegram only).
 * All writes are wrapped in try/catch — status messages must never affect
 * the agent's main loop.
 */
import { writeMessageOut } from './db/messages-out.js';
import { getSessionRouting } from './db/session-routing.js';

function generateId(): string {
  return `status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TOOL_PHASES: Record<string, string> = {
  Bash: 'Running command',
  computer: 'Running command',
  Read: 'Reading/writing files',
  Write: 'Reading/writing files',
  Edit: 'Reading/writing files',
  MultiEdit: 'Reading/writing files',
  Glob: 'Reading/writing files',
  Grep: 'Reading/writing files',
  NotebookEdit: 'Reading/writing files',
  WebSearch: 'Browsing the web',
  WebFetch: 'Browsing the web',
};

function phaseForTool(toolName: string): string {
  if (TOOL_PHASES[toolName]) return TOOL_PHASES[toolName];
  if (toolName.startsWith('mcp__')) return `Using tool: ${toolName.replace('mcp__nanoclaw__', '').replace('mcp__', '')}`;
  return 'Working…';
}

/**
 * Write a status message with a given phase string.
 * Only emits for Telegram channels; silently no-ops for all others.
 */
export function writeStatusMessage(phase: string): void {
  try {
    const routing = getSessionRouting();
    if (!routing.channel_type || !routing.platform_id) return;
    // Only emit for Telegram channels
    if (!routing.channel_type.startsWith('telegram')) return;

    writeMessageOut({
      id: generateId(),
      kind: 'status',
      platform_id: routing.platform_id,
      channel_type: routing.channel_type,
      thread_id: routing.thread_id,
      content: JSON.stringify({ phase }),
    });
  } catch {
    // Best-effort — never let status writes crash the agent
  }
}

/**
 * Write a status message derived from a tool name.
 * Maps known tools to human-readable phase labels.
 */
export function writeToolStatusMessage(toolName: string): void {
  writeStatusMessage(phaseForTool(toolName));
}
