import { describe, it, expect } from 'vitest';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { prepareTelegramMarkdown, telegramOutboundText } from './telegram-markdown-sanitize.js';

// What the bridge actually hands Telegram. Since @chat-adapter/telegram 4.41
// a markdown message goes out through sendRichMessage, whose `markdown` field
// Telegram renders server-side with CommonMark rules: a single newline is a
// soft break (shown as a space), only a blank line starts a new block.
const adapter = createTelegramAdapter({ botToken: '1:test', mode: 'polling' }) as any;
const richSent = (agentText: string): string =>
  adapter.resolveRichMessage({ markdown: telegramOutboundText(agentText) }, null, 0, 0).markdown;
// Fallback path (sendMessage + MarkdownV2) when rich messages are unavailable.
const fallbackSent = (agentText: string): string =>
  adapter.formatConverter.renderPostable({ markdown: telegramOutboundText(agentText) });

// Lenny's reply of 2026-10-25 that arrived as one run-on paragraph.
const LENNY =
  '**Demain (lundi 26 oct) :**\n\n' +
  '• **1ère action :** LinkedIn rehab — en retard de 2j.\n' +
  '• **En retard (3) :** LinkedIn rehab · CV master.\n' +
  '• **À venir :** session du council, jeudi 29 oct 11h.\n\n' +
  'Le vrai sujet : les 3 tâches de vendredi.';

describe('Telegram outbound formatting (rich message path)', () => {
  it('turns • lines into a native list, each item on its own line', () => {
    expect(richSent(LENNY)).toBe(
      '**Demain (lundi 26 oct) :**\n\n' +
        '- **1ère action :** LinkedIn rehab — en retard de 2j.\n' +
        '- **En retard (3) :** LinkedIn rehab · CV master.\n' +
        '- **À venir :** session du council, jeudi 29 oct 11h.\n\n' +
        'Le vrai sujet : les 3 tâches de vendredi.',
    );
  });

  it('keeps consecutive label lines on separate lines', () => {
    expect(richSent('**Due:** nothing\n**First action:** call')).toBe('**Due:** nothing\n\n**First action:** call');
  });

  it('keeps dash lists as a list', () => {
    expect(richSent('- one\n- two')).toBe('- one\n- two');
  });

  it('separates a prose line that follows a list item', () => {
    expect(richSent('- one\nAfter the list')).toBe('- one\n\nAfter the list');
  });

  it('separates a list from the prose line just above it', () => {
    expect(richSent('Points:\n- one')).toBe('Points:\n\n- one');
  });

  it('keeps nested items and indented continuations inside the list', () => {
    expect(richSent('- one\n  - nested\n  continued')).toBe('- one\n  - nested\n  continued');
  });

  it('keeps ordered lists together', () => {
    expect(richSent('1. one\n2. two')).toBe('1. one\n2. two');
  });

  it('keeps table rows together', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    expect(richSent(table)).toBe(table);
  });

  it('keeps blockquote lines together', () => {
    expect(richSent('>one\n>two')).toBe('>one\n>two');
  });

  it('does not add extra blank lines where one already exists', () => {
    expect(richSent('one\n\ntwo')).toBe('one\n\ntwo');
  });

  it('internal tags are stripped', () => {
    expect(richSent('<internal>note to self</internal>Hello')).toBe('Hello');
  });
});

describe('Telegram outbound formatting (MarkdownV2 fallback path)', () => {
  it('**bold** arrives as MarkdownV2 bold, not italic', () => {
    expect(fallbackSent('**Countdown:** 31 Oct')).toBe('*Countdown:* 31 Oct');
  });

  it('*italic* arrives as MarkdownV2 italic', () => {
    expect(fallbackSent('an *aside*')).toBe('an _aside_');
  });

  it('list items stay on their own lines with bold intact', () => {
    expect(fallbackSent('• **Due:** nothing\n• **First action:** call')).toBe(
      '\\- *Due:* nothing\n\\- *First action:* call',
    );
  });

  it('underscores in plain words are escaped, not italic', () => {
    expect(fallbackSent('file_name here')).toBe('file\\_name here');
  });
});

describe('prepareTelegramMarkdown', () => {
  it('leaves CommonMark emphasis for the adapter to convert', () => {
    expect(prepareTelegramMarkdown('**a** and *b*')).toBe('**a** and *b*');
  });

  it('preserves indentation of nested • bullets', () => {
    expect(prepareTelegramMarkdown('- a\n  • nested')).toBe('- a\n  - nested');
  });

  it('leaves code blocks and spans untouched', () => {
    const input = '```\n• not a bullet\nline two\n```';
    expect(prepareTelegramMarkdown(input)).toBe(input);
    expect(prepareTelegramMarkdown('and `• y`')).toBe('and `• y`');
  });

  it('is a no-op on empty string', () => {
    expect(prepareTelegramMarkdown('')).toBe('');
  });
});
