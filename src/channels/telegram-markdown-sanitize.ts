/**
 * Prepare agent text for the @chat-adapter/telegram converter.
 *
 * The adapter parses CommonMark and renders Telegram MarkdownV2 itself
 * (`**bold**` → `*bold*`, `*italic*` → `_italic_`, escaping included), so we
 * must NOT pre-convert emphasis — an earlier legacy-Markdown workaround did,
 * which turned every bold into italic once the adapter moved to MarkdownV2.
 *
 * The one thing we still do: list bullets. The adapter renders `- item` as an
 * escaped `\- item` preceded by a blank line, so dash/plus bullets become a
 * plain `•` and the line stays prose.
 */
import { stripInternalTags } from '../text-styles.js';

const CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/g;
const PLACEHOLDER_PREFIX = '\x00CODE';
const PLACEHOLDER_SUFFIX = '\x00';

export function prepareTelegramMarkdown(input: string): string {
  if (!input) return input;

  const codeSegments: string[] = [];
  let text = input.replace(CODE_PATTERN, (m) => {
    codeSegments.push(m);
    return `${PLACEHOLDER_PREFIX}${codeSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
  });

  text = text.replace(/^(\s*)[-+]\s+/gm, '$1• ');

  return text.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_, i) => codeSegments[Number(i)],
  );
}

/** Full outbound transform for Telegram bots (passed to the Chat SDK bridge). */
export function telegramOutboundText(text: string): string {
  return prepareTelegramMarkdown(stripInternalTags(text));
}
