# Channel Skills — Customizations

After merging `upstream/channels` (which provides the base telegram and gmail adapters), reapply the following customizations.

---

## Telegram: 3-Bot Setup

**Intent:** Run three separate Telegram bots from the same NanoClaw instance — one for the main/Pepa group, one for Edmond (finance), one reserved for Alain (not yet configured). Each bot has its own JID prefix so messages from different bots are scoped to different groups.

**Files:** `src/channels/telegram.ts`

**How to apply:**

After the v2 telegram adapter is merged, find where the channel is registered (there will be a single `registerChannel` call). Replace it with a triple registration pattern:

```typescript
// Default bot (Pepa / main group)
const defaultToken = process.env.TELEGRAM_BOT_TOKEN || envVars?.TELEGRAM_BOT_TOKEN || '';
if (defaultToken) {
  registerChannel('telegram', new TelegramChannel(defaultToken, opts));
} else {
  logger.warn('TELEGRAM_BOT_TOKEN not set — default Telegram bot disabled');
}

// Finance bot (Edmond)
const financeToken = process.env.TELEGRAM_BOT_TOKEN_FINANCE || envVars?.TELEGRAM_BOT_TOKEN_FINANCE || '';
if (financeToken) {
  registerChannel('telegram_finance', new TelegramChannel(financeToken, opts, 'finance'));
}

// Alain bot (reserved, not yet active)
const alainToken = process.env.TELEGRAM_BOT_TOKEN_ALAIN || envVars?.TELEGRAM_BOT_TOKEN_ALAIN || '';
if (alainToken) {
  registerChannel('telegram_alain', new TelegramChannel(alainToken, opts, 'alain'));
}
```

The `TelegramChannel` constructor takes `(token, opts, botName?)`. The `botName` parameter:
- Sets the JID prefix: `tg_finance:` for finance, `tg_alain:` for alain, `tg:` for default
- Used to scope which `registered_groups` rows this bot owns (groups with matching `bot_name` column)

**Token sources (data/env/env, gitignored):**
- `TELEGRAM_BOT_TOKEN` — default bot
- `TELEGRAM_BOT_TOKEN_FINANCE` — finance bot
- `TELEGRAM_BOT_TOKEN_ALAIN` — alain bot (not yet configured, skip silently)

---

## Telegram: Status Messages

**Intent:** Show ephemeral "Thinking..." / "Writing..." status indicators in the chat during agent processing.

**Files:** `src/channels/telegram.ts`, `src/types.ts`

**How to apply:**

The `TelegramChannel` class needs a `sendStatus(chatJid, status)` method:

```typescript
async sendStatus(chatJid: string, status: string | null): Promise<void> {
  if (status === null) {
    // Delete the status message if it exists
    const msgId = this.statusMessages.get(chatJid);
    if (msgId) {
      await this.bot.api.deleteMessage(chatId, msgId).catch(() => {});
      this.statusMessages.delete(chatJid);
    }
    return;
  }
  const existing = this.statusMessages.get(chatJid);
  if (existing) {
    await this.bot.api.editMessageText(chatId, existing, status).catch(() => {});
  } else {
    const msg = await this.bot.api.sendMessage(chatId, status);
    this.statusMessages.set(chatJid, msg.message_id);
  }
}
```

Add `private statusMessages = new Map<string, number>()` to the class.

Also add to `Channel` interface in `src/types.ts`:
```typescript
sendStatus?(chatJid: string, status: string | null): Promise<void>;
```

---

## Telegram: Document Upload (sendDocument)

**Intent:** Allow agents to send generated files (PDFs, CSVs, receipts) directly to Telegram.

**Files:** `src/channels/telegram.ts`, `src/types.ts`

**How to apply:**

Add `sendDocument` to `TelegramChannel`:

```typescript
async sendDocument(chatJid: string, filePath: string, caption?: string): Promise<void> {
  const chatId = this.parseChatId(chatJid);
  await this.bot.api.sendDocument(chatId, new InputFile(filePath), { caption });
}
```

Add to `Channel` interface in `src/types.ts`:
```typescript
sendDocument?(chatJid: string, filePath: string, caption?: string): Promise<void>;
```

---

## Telegram: Voice Transcription

**Intent:** Automatically transcribe voice messages and prepend the transcript to the message before routing to the agent.

**Files:** `src/channels/telegram.ts`, `src/transcription.ts` (new file — see customizations-src.md)

**How to apply:**

In the message handler where voice/audio messages are downloaded, after saving the file:

```typescript
if (msg.voice || msg.audio) {
  const filePath = await this.downloadFile(fileId, attachmentsDir, filename);
  const transcript = await transcribeAudio(filePath);
  if (transcript) {
    content = `[Voice message transcript]: ${transcript}\n\n${content}`;
  }
}
```

Import `transcribeAudio` from `./transcription.js`.

---

## Telegram: Bot Commands

**Intent:** Built-in `/chatid` and `/ping` commands for debugging; these bypass normal message processing.

**Files:** `src/channels/telegram.ts`

**How to apply:**

At the start of the message handler, before routing to the agent:

```typescript
if (msg.text?.startsWith('/chatid')) {
  await this.bot.api.sendMessage(chatId, `JID: tg${prefix}:${chatId}\nThread: ${msg.message_thread_id ?? 'none'}`);
  return;
}
if (msg.text?.startsWith('/ping')) {
  await this.bot.api.sendMessage(chatId, `✅ Bot online (${this.botName ?? 'default'})`);
  return;
}
```

---

## Gmail: Container-Side MCP Registration

**Intent:** Agents (specifically Alain) can access Gmail via MCP tools inside the container, enabling them to read and draft emails.

**Files:** `container/agent-runner/src/index.ts`

**How to apply:**

In the MCP server setup section of the agent-runner, add the Gmail MCP server:

```typescript
// Gmail MCP — spawns npx server if credentials exist
const gmailCredsPath = path.join(os.homedir(), '.gmail-mcp');
if (fs.existsSync(gmailCredsPath)) {
  mcpServers.push({
    name: 'gmail',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    env: { HOME: os.homedir() },
  });
}
```

The MCP server exposes `mcp__gmail__*` tools to the agent. The credentials are stored in `~/.gmail-mcp/` on the host and mounted into the container (see container-runner customization in customizations-src.md).

**Note for v2 (Bun):** The agent-runner in v2 runs under Bun. `npx` should still work as Node is still present in the container image. Verify `npx` is on PATH in the container after the upgrade.

---

## Gmail: Channel Mount

**Intent:** The `~/.gmail-mcp` credential directory on the host must be mounted into the container so the Gmail MCP server can find its OAuth tokens.

**Files:** `src/container-runner.ts`

**How to apply:** See the Gmail mount entry in `customizations-src.md` under "Container Runner — Gmail Mount".
