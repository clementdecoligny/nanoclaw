/**
 * Telegram status feedback (local feature).
 *
 * While an agent works, the user sees:
 *   - a 👀 reaction on their message, added when it is routed to the agent;
 *   - one status message ("📂 Reading/writing files", …) edited in place as the
 *     agent's `kind='status'` outbound rows arrive.
 * When the real reply is delivered, the status message is deleted and the
 * reaction removed.
 *
 * Which platform messages to clean up is kept in host memory, per session. A
 * host restart mid-turn forgets them, so at worst one status message and one
 * reaction stay behind; nothing else depends on this state.
 *
 * Everything here is best-effort: failures are logged, never thrown.
 */
import type { ChannelDeliveryAdapter } from './delivery.js';
import { log } from './log.js';

interface Target {
  channelType: string;
  platformId: string;
  threadId: string | null;
}

const statusMessageBySession = new Map<string, string>();
const reactionMessageBySession = new Map<string, string>();

export function isTelegramChannel(channelType: string | null | undefined): channelType is string {
  return !!channelType && channelType.startsWith('telegram');
}

/** Map a status phase to its display text with an emoji prefix. */
export function formatStatusText(phase: string): string {
  const icons: Record<string, string> = {
    'Running command': '⚙️',
    'Reading/writing files': '📂',
    'Browsing the web': '🌐',
  };
  const icon = Object.entries(icons).find(([k]) => phase.startsWith(k))?.[1] ?? '🔄';
  return `${icon} ${phase}`;
}

/**
 * React 👀 to the user's inbound message and remember it for cleanup. Also
 * forgets any status message from a previous turn, so this turn's first status
 * update creates a fresh message instead of editing a stale one.
 */
export async function addTelegramAcknowledgement(
  adapter: ChannelDeliveryAdapter | null,
  sessionId: string,
  target: Target,
  inboundMessageId: string | undefined,
): Promise<void> {
  if (!adapter || !isTelegramChannel(target.channelType) || !inboundMessageId) return;
  statusMessageBySession.delete(sessionId);
  try {
    await adapter.deliver(
      target.channelType,
      target.platformId,
      target.threadId,
      'chat',
      JSON.stringify({ operation: 'reaction', messageId: inboundMessageId, emoji: '👀' }),
    );
    reactionMessageBySession.set(sessionId, inboundMessageId);
  } catch (err) {
    log.warn('Status feedback: reaction failed', { sessionId, messageId: inboundMessageId, err });
  }
}

/** Create or edit the session's single status message from a `kind='status'` row. */
export async function deliverStatusMessage(
  adapter: ChannelDeliveryAdapter | null,
  sessionId: string,
  target: Target,
  content: string,
): Promise<void> {
  if (!adapter || !isTelegramChannel(target.channelType)) return;

  let phase = 'Working…';
  try {
    phase = (JSON.parse(content) as { phase?: string }).phase ?? phase;
  } catch {
    return;
  }
  const text = formatStatusText(phase);

  const existing = statusMessageBySession.get(sessionId);
  if (existing) {
    try {
      await adapter.deliver(
        target.channelType,
        target.platformId,
        target.threadId,
        'chat',
        JSON.stringify({ operation: 'edit', messageId: existing, text }),
      );
    } catch (err) {
      // Telegram rejects an edit whose text is unchanged — not a real error.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('message is not modified')) {
        log.warn('Status feedback: edit failed', { sessionId, messageId: existing, err });
      }
    }
    return;
  }

  try {
    const platformMessageId = await adapter.deliver(
      target.channelType,
      target.platformId,
      target.threadId,
      'chat',
      JSON.stringify({ text }),
    );
    if (platformMessageId) statusMessageBySession.set(sessionId, platformMessageId);
  } catch (err) {
    log.warn('Status feedback: send failed', { sessionId, err });
  }
}

/** After the real reply lands: delete the status message and remove the 👀 reaction. */
export async function cleanupTelegramStatusFeedback(
  adapter: ChannelDeliveryAdapter | null,
  sessionId: string,
  target: Target,
): Promise<void> {
  if (!adapter || !isTelegramChannel(target.channelType)) return;
  const statusMessageId = statusMessageBySession.get(sessionId);
  const reactionMessageId = reactionMessageBySession.get(sessionId);
  statusMessageBySession.delete(sessionId);
  reactionMessageBySession.delete(sessionId);

  if (statusMessageId) {
    try {
      await adapter.deliver(
        target.channelType,
        target.platformId,
        target.threadId,
        'chat',
        JSON.stringify({ operation: 'delete', messageId: statusMessageId }),
      );
    } catch (err) {
      log.warn('Status feedback: delete failed', { sessionId, messageId: statusMessageId, err });
    }
  }
  if (reactionMessageId) {
    try {
      await adapter.deliver(
        target.channelType,
        target.platformId,
        target.threadId,
        'chat',
        JSON.stringify({ operation: 'remove_reaction', messageId: reactionMessageId, emoji: '👀' }),
      );
    } catch (err) {
      log.warn('Status feedback: remove reaction failed', { sessionId, messageId: reactionMessageId, err });
    }
  }
}

/**
 * The container is being killed mid-turn: turn the status message into an
 * error notice and remove the 👀 reaction, so the user is not left watching a
 * "working" indicator that will never resolve.
 */
export async function failTelegramStatusFeedback(
  adapter: ChannelDeliveryAdapter | null,
  sessionId: string,
  target: Target,
): Promise<void> {
  if (!adapter || !isTelegramChannel(target.channelType)) return;
  const statusMessageId = statusMessageBySession.get(sessionId);
  const reactionMessageId = reactionMessageBySession.get(sessionId);
  statusMessageBySession.delete(sessionId);
  reactionMessageBySession.delete(sessionId);

  if (statusMessageId) {
    try {
      await adapter.deliver(
        target.channelType,
        target.platformId,
        target.threadId,
        'chat',
        JSON.stringify({ operation: 'edit', messageId: statusMessageId, text: '❌ Something went wrong' }),
      );
    } catch (err) {
      log.warn('Status feedback: error edit failed', { sessionId, messageId: statusMessageId, err });
    }
  }
  if (reactionMessageId) {
    try {
      await adapter.deliver(
        target.channelType,
        target.platformId,
        target.threadId,
        'chat',
        JSON.stringify({ operation: 'remove_reaction', messageId: reactionMessageId, emoji: '👀' }),
      );
    } catch (err) {
      log.warn('Status feedback: remove reaction failed', { sessionId, messageId: reactionMessageId, err });
    }
  }
}

/** Test-only: forget all remembered messages. */
export function _resetStatusFeedbackForTesting(): void {
  statusMessageBySession.clear();
  reactionMessageBySession.clear();
}
