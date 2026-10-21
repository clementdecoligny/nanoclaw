import { describe, it, expect } from 'vitest';
import { createTelegramAdapter } from '@chat-adapter/telegram';
import { prepareTelegramMarkdown, telegramOutboundText } from './telegram-markdown-sanitize.js';

// What the bridge actually hands Telegram: our transform, then the adapter's
// CommonMark → MarkdownV2 converter.
const converter = (createTelegramAdapter({ botToken: '1:test', mode: 'polling' }) as any).formatConverter;
const sent = (agentText: string): string => converter.renderPostable({ markdown: telegramOutboundText(agentText) });

describe('Telegram outbound formatting (end to end)', () => {
  it('**bold** arrives as MarkdownV2 bold, not italic', () => {
    expect(sent('**Countdown:** 31 Oct')).toBe('*Countdown:* 31 Oct');
  });

  it('*italic* arrives as MarkdownV2 italic', () => {
    expect(sent('an *aside*')).toBe('an _aside_');
  });

  it('bold inside bullets stays bold', () => {
    expect(sent('- **Due:** nothing\n- **First action:** call')).toBe('• *Due:* nothing\n• *First action:* call');
  });

  it('underscores in plain words are escaped, not italic', () => {
    expect(sent('file_name here')).toBe('file\\_name here');
  });

  it('internal tags are stripped', () => {
    expect(sent('<internal>note to self</internal>Hello')).toBe('Hello');
  });
});

describe('prepareTelegramMarkdown', () => {
  it('leaves CommonMark emphasis for the adapter to convert', () => {
    expect(prepareTelegramMarkdown('**a** and *b*')).toBe('**a** and *b*');
  });

  it('replaces dash/plus list bullets with •', () => {
    expect(prepareTelegramMarkdown('- one\n+ two')).toBe('• one\n• two');
  });

  it('preserves indentation of nested bullets', () => {
    expect(prepareTelegramMarkdown('  - nested')).toBe('  • nested');
  });

  it('leaves code blocks and spans untouched', () => {
    const input = '```\n- not a bullet **x**\n```\nand `- y`';
    expect(prepareTelegramMarkdown(input)).toBe(input);
  });

  it('is a no-op on empty string', () => {
    expect(prepareTelegramMarkdown('')).toBe('');
  });
});
