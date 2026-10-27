/**
 * Prepare agent text for Telegram.
 *
 * Since @chat-adapter/telegram 4.41, markdown messages go out through
 * sendRichMessage: Telegram renders the markdown server-side with CommonMark
 * rules. Agents write chat-style text, so two things need adjusting:
 *
 * 1. A single newline is a soft break there (rendered as a space), so short
 *    lines written one under the other collapse into one paragraph. We insert
 *    a blank line between consecutive lines, except inside lists, tables and
 *    blockquotes, where single newlines are structural. Telegram shows a
 *    paragraph break as a plain line break, so the look matches what the
 *    agent wrote.
 * 2. `•` bullets are plain text to CommonMark. We turn them into `- ` list
 *    items so Telegram renders a native list.
 *
 * Emphasis is left alone: both the rich path and the MarkdownV2 fallback
 * convert CommonMark `**bold**` / `*italic*` themselves. Code spans and
 * fenced blocks are never touched.
 */
import { stripInternalTags } from '../text-styles.js';

const CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/g;
const PLACEHOLDER_PREFIX = '\x00CODE';
const PLACEHOLDER_SUFFIX = '\x00';

const LIST_ITEM = /^\s*(?:[-+*]|\d+[.)])\s+/;
const TABLE_ROW = /^\s*\|/;
const QUOTE_LINE = /^\s*>/;
const INDENTED = /^\s+\S/;

/** True when a single newline between these two lines is structural and must stay. */
function keepsSingleNewline(prev: string, next: string, inList: boolean): boolean {
  if (inList && (LIST_ITEM.test(next) || INDENTED.test(next))) return true;
  if (TABLE_ROW.test(prev) && TABLE_ROW.test(next)) return true;
  if (QUOTE_LINE.test(prev) && QUOTE_LINE.test(next)) return true;
  return false;
}

export function prepareTelegramMarkdown(input: string): string {
  if (!input) return input;

  const codeSegments: string[] = [];
  const text = input.replace(CODE_PATTERN, (m) => {
    codeSegments.push(m);
    return `${PLACEHOLDER_PREFIX}${codeSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
  });

  const lines = text.split('\n').map((line) => line.replace(/^(\s*)•\s*/, '$1- '));
  const out: string[] = [];
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : '';
    if (i > 0 && prev.trim() !== '' && line.trim() !== '' && !keepsSingleNewline(prev, line, inList)) {
      out.push('');
    }
    out.push(line);
    if (line.trim() === '') inList = false;
    else if (LIST_ITEM.test(line)) inList = true;
    else if (!(inList && INDENTED.test(line))) inList = false;
  }

  return out
    .join('\n')
    .replace(new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'), (_, i) => codeSegments[Number(i)]);
}

/** Full outbound transform for Telegram bots (passed to the Chat SDK bridge). */
export function telegramOutboundText(text: string): string {
  return prepareTelegramMarkdown(stripInternalTags(text));
}
