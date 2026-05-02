# Source File Customizations

All changes to `src/*.ts` files not covered by the channel skill sections.

---

## send_document — File Delivery from Agent to User

**Intent:** Edmond (and potentially other agents) can generate files (PDF receipts, CSV exports) and deliver them directly to the user's Telegram chat. In v1 this was implemented via JSON file polling in `data/ipc/`. In v2 the IPC system is completely replaced — there is no `data/ipc/` directory, no file watcher, and no `src/ipc.ts` equivalent.

**⚠️ Do NOT reimplement the v1 IPC file-polling pattern.** The entire delivery pipeline is database-driven in v2.

**How v2 file delivery works:**
- Container writes to `outbound.db` (`messages_out` table)
- File attachments are placed in `outbox/{messageId}/`
- The host's DB-polling loop reads due rows and delivers files through the channel adapter

**How to apply:**

**Step 1 — Check if v2 already has send_document.** After merging `upstream/channels`, inspect `container/agent-runner/src/` for any existing file delivery tool in the MCP server. If `send_document` or equivalent already exists in v2, use it as-is — no custom code needed. Edmond's CLAUDE.md calls `mcp__nanoclaw__send_document` which should work if the tool exists.

**Step 2 — If send_document is absent in v2**, implement it following the same pattern as `send_message` but with a file attachment:

In the container-side MCP server (`ipc-mcp-stdio.ts` or equivalent), add a `send_document` tool that:
1. Copies the file into the session's `outbox/{messageId}/` directory
2. Writes a row to `outbound.db` `messages_out` with `type: 'document'`, the `messageId`, filename, and caption

In the host-side delivery loop (wherever v2 polls `outbound.db`), add handling for `type: 'document'` rows that reads from `outbox/{messageId}/` and calls `channel.sendDocument()`.

**Channel interface addition** (needed regardless of which path above):
```typescript
// In whatever v2 equivalent of Channel interface exists:
sendDocument?(chatJid: string, filePath: string, filename?: string, caption?: string): Promise<void>;
```

**Telegram implementation** (in `src/channels/telegram.ts` — this part is still valid):
```typescript
async sendDocument(chatJid: string, filePath: string, filename?: string, caption?: string): Promise<void> {
  const chatId = this.parseChatId(chatJid);
  await this.bot.api.sendDocument(chatId, new InputFile(filePath, filename), { caption });
}
```

**Authorization rule to preserve:** Only the main group, or a group sending to its own chatJid, can trigger file delivery (prevents cross-group file leaks).

---

## Multi-Bot Telegram — No bot_name Column Needed in v2

**Intent:** Three Telegram bots run from the same instance — default (Pepa), finance (Edmond), alain (reserved). In v1 this required a `bot_name` column on `registered_groups` to scope which bot owned which group.

**In v2 the `bot_name` column is not needed.** The entity model makes it redundant.

**How v2 handles this natively:**
- Each Telegram bot is registered as its own channel instance in the host process (three `TelegramChannel` instances with three separate tokens, same as v1)
- Each bot receives messages from its own Telegram account, creating distinct `messaging_groups` rows keyed by `(channel_type='telegram', platform_id=<chat_id_scoped_to_that_bot>)`
- Wirings in `messaging_group_agents` connect each messaging group to its agent group — Pepa's bot → `pepa` agent group, finance bot → `finance` agent group
- No explicit scoping column needed; the entity model naturally separates them

**What this means for the 3-bot registration code:**
The v1 channel registration (three `registerChannel()` calls with different bot names/tokens) should still work in v2 — the channel name (`telegram`, `telegram_finance`, `telegram_alain`) scopes which channel instance receives and sends for each bot. Check if v2's channel registry supports named instances the same way; if the API changed, adapt accordingly but the three-bot concept is correct.

**⚠️ One open question:** How does v2 know which bot token maps to which channel instance when sending replies? In v1 `botName` was used to look this up. In v2 this is likely handled via the `(channel_type, platform_id)` pair in `messaging_groups` — the channel adapter that received the original message is the one that sends the reply. Verify this in v2's outbound routing code after the upgrade.

---

## Non-Anthropic Credentials — Continente and Finance Bot Token

**Intent:** Continente credentials (`CONTINENTE_EMAIL`, `CONTINENTE_PASSWORD`) and the finance Telegram bot token (`TELEGRAM_BOT_TOKEN_FINANCE`) need to be accessible to agents inside containers. In v1 these were injected via a `data/env/env` file parsed by `parseEnvFile()` in container-runner.ts.

**⚠️ Do NOT reimplement the v1 `data/env/env` injection pattern.** V2 deprecated it and `container.json` has no `env` key. Re-adding this code to v2's container-runner could conflict with its startup sequence.

**How to handle in v2 — investigate in this order during the upgrade:**

**Option 1 (preferred): Check if OneCLI supports arbitrary secrets.**
OneCLI Agent Vault is the sole credential path in v2. Run `onecli --help` or check `onecli secret --help` to see if it can store and inject non-Anthropic key-value secrets. If it can, add `CONTINENTE_EMAIL`, `CONTINENTE_PASSWORD`, and `TELEGRAM_BOT_TOKEN_FINANCE` to the vault.

**Option 2: Credential file mount via container.json.**
If OneCLI doesn't support arbitrary secrets, store the credentials in a gitignored file (e.g., `data/env/continente.env`) and mount it into the Continente-using containers via `container.json`:
```json
{
  "additionalMounts": [
    {
      "hostPath": "data/env/continente.env",
      "containerPath": "credentials/continente.env",
      "readonly": true
    }
  ]
}
```
The agent then reads the file: `cat /workspace/extra/credentials/continente.env`.

**Option 3: Check v2's container.json for an env key.**
Inspect the v2 container-runner source after the upgrade — if v2 added native `env` support to `container.json`, use that. It would look like:
```json
{
  "env": {
    "CONTINENTE_EMAIL": "...",
    "CONTINENTE_PASSWORD": "..."
  }
}
```

**Credentials that need to reach containers:**
- `CONTINENTE_EMAIL` + `CONTINENTE_PASSWORD` → `pepa` group container (Continente grocery automation)
- `TELEGRAM_BOT_TOKEN_FINANCE` → the finance bot token is used by the host process (channel registration), not inside containers — verify this is still the case in v2 before adding it anywhere

---

## Container Runner — Gmail Mount

**Intent:** Mount the `~/.gmail-mcp` credential directory into the container so the Gmail MCP server can find its OAuth tokens.

**Files:** `src/container-runner.ts`

**How to apply:**

In the volume mounts section, conditionally add the Gmail credentials mount:
```typescript
const gmailMcpDir = path.join(os.homedir(), '.gmail-mcp');
if (fs.existsSync(gmailMcpDir)) {
  mounts.push({
    hostPath: gmailMcpDir,
    containerPath: '/home/node/.gmail-mcp',
    readonly: false, // OAuth token refresh writes back to this directory
  });
}
```

---

## Group Queue — Alert on Max Retries

**Intent:** When an agent group repeatedly fails to respond (5 consecutive retries), the orchestrator sends an alert to the main control group so the owner knows something is broken.

**Files:** `src/group-queue.ts`, `src/index.ts`

**How to apply:**

In `src/group-queue.ts`, add an optional alert callback:
```typescript
let alertFn: ((groupName: string) => void) | undefined;

export function setAlertFn(fn: (groupName: string) => void): void {
  alertFn = fn;
}
```

Call it after MAX_RETRIES consecutive failures:
```typescript
if (consecutiveFailures >= MAX_RETRIES) {
  alertFn?.(group.name);
}
```

In `src/index.ts`, wire it up during startup:
```typescript
import { setAlertFn } from './group-queue.js';

setAlertFn((groupName) => {
  const mainGroup = getMainGroup();
  if (mainGroup) {
    sendToGroup(mainGroup, `⚠️ *NanoClaw alert*: agent "${groupName}" failed to respond after 5 retries. Check logs at logs/container-*.log. Will retry automatically on next message.`);
  }
});
```

---

## Index — Status Messages During Processing

**Intent:** Show ephemeral status messages ("⏳ Thinking...", "📖 Reading...") during agent processing so users see activity rather than silence.

**Files:** `src/index.ts`

**How to apply:**

When starting agent processing, call `sendStatus`:
```typescript
await channel.sendStatus?.(chatJid, '⏳ Thinking...');
```

Add a tool-use callback that updates the status with a tool-specific label:
```typescript
const TOOL_LABELS: Record<string, string> = {
  Read: '📖 Reading...',
  Write: '✍️ Writing...',
  Edit: '✍️ Writing...',
  Bash: '⚙️ Running...',
  Glob: '🔍 Searching...',
  Grep: '🔍 Searching...',
  WebSearch: '🌐 Searching...',
  WebFetch: '🌐 Fetching...',
  Agent: '🤖 Delegating...',
  TodoWrite: '📋 Planning...',
};

onToolUse: (toolName) => {
  const label = TOOL_LABELS[toolName] ?? '⚙️ Working...';
  channel.sendStatus?.(chatJid, label);
},
```

After the agent completes (success or error), clear the status:
```typescript
await channel.sendStatus?.(chatJid, null);
```

---

## Router + Text Styles — Channel-Native Formatting

**Intent:** Convert Claude's Markdown output to each channel's native text syntax before sending, so bold/italic/links render correctly instead of appearing as raw asterisks.

**Files:** `src/text-styles.ts` (new file, 380 lines), `src/router.ts`

**How to apply:**

Copy `src/text-styles.ts` verbatim from the v1 tree — this is a new file with no equivalent in v2 upstream. It implements:
- WhatsApp/Telegram: `**bold**` → `*bold*`, `*italic*` → `_italic_`, links stripped to plain text
- Slack: same plus `[text](url)` → `<url|text>`
- Discord: passthrough (native Markdown)
- Signal: `parseSignalStyles()` for structured `textStyle` array with UTF-16 offsets
- Code block protection: fenced and inline blocks are never transformed
- Table wrapping, heading conversion, HR stripping

In `src/router.ts`, import and apply:
```typescript
import { parseTextStyles, ChannelType } from './text-styles.js';

// In formatOutbound(), add channel parameter:
export function formatOutbound(text: string, channel?: ChannelType): string {
  // ... existing logic ...
  if (channel) {
    text = parseTextStyles(text, channel);
  }
  return text;
}
```

In `src/index.ts`, all `formatOutbound()` calls pass the channel name:
```typescript
formatOutbound(text, channel.name as ChannelType)
```

---

## Transcription Module

**Intent:** Transcribe voice messages locally using a Whisper Python script, without calling an external API.

**Files:** `src/transcription.ts` (new file, 25 lines)

**How to apply:**

Copy `src/transcription.ts` verbatim from the v1 tree:

```typescript
import { spawn } from 'child_process';

export function transcribeAudio(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      '.venv/whisper/bin/python',
      ['scripts/transcribe.py', filePath],
      { timeout: 60_000 }
    );
    let output = '';
    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.on('close', (code) => resolve(code === 0 ? output.trim() : null));
    proc.on('error', () => resolve(null));
  });
}
```

The Python virtualenv at `.venv/whisper/` is not in the container — it runs on the host. See `scripts/transcribe.py` in customizations-scripts.md.

---

## Global Shared Workspace — Cross-Group Mount

**Intent:** The `groups/global/` folder is a shared data directory, not a standalone agent group. Alain (executive) writes to `/workspace/global/calendar.md` and `/workspace/global/household.md`. Pepa reads from `/workspace/global/calendar.md` before every meal planning cycle. Neither group can directly access the other's workspace — the `global` folder is the shared layer between them.

**This is not a code change** — it is a container configuration that must exist on disk for both groups after the upgrade.

**Files:** `groups/executive/container.json` (create), `groups/pepa/container.json` (create)

**How to apply:**

Create `groups/executive/container.json`:
```json
{
  "additionalMounts": [
    {
      "hostPath": "groups/global",
      "containerPath": "global",
      "readonly": false
    }
  ]
}
```

Create `groups/pepa/container.json`:
```json
{
  "additionalMounts": [
    {
      "hostPath": "groups/global",
      "containerPath": "global",
      "readonly": false
    }
  ]
}
```

Both groups get read-write access (`readonly: false`) because:
- Alain writes `calendar.md` and `household.md`
- Pepa may also need to write (e.g. flagging a replan-requested.md)

Inside both containers the shared folder appears at `/workspace/extra/global/`. Both CLAUDE.md files reference it as `/workspace/global/` — if v2 mounts `additionalMounts` under `/workspace/extra/` rather than `/workspace/`, the CLAUDE.md references in both `groups/executive/CLAUDE.md` and `groups/pepa/CLAUDE.md` will need to be updated accordingly. Verify the mount point prefix in the v2 container-runner before copying the CLAUDE.md files.

**In v1** this was configured via `containerConfig.additionalMounts` in the `registered_groups` table for each group. In v2 it moves to `container.json` on disk.

---

## Andy's CLAUDE.md — v1 DB References Must Be Updated Post-Migration

**Intent:** `groups/main/CLAUDE.md` contains detailed group management instructions written for the v1 database schema. After the upgrade these references will be wrong and Andy will give incorrect instructions or fail to manage groups.

**This is not a code change** — it is a CLAUDE.md content update to perform after the upgrade is complete and v2 is running.

**Files:** `groups/main/CLAUDE.md`

**How to apply:**

After the upgrade, Andy's CLAUDE.md needs two types of updates:

**Type 1 — Mechanical path/table replacements:**

| Find (v1) | Replace with (v2) |
|---|---|
| `/workspace/project/store/messages.db` | `/workspace/project/data/v2.db` |
| `registered_groups` table | `agent_groups` + `messaging_groups` + `messaging_group_agents` |
| `/workspace/project/data/registered_groups.json` | *(remove — no longer exists)* |
| `containerConfig.additionalMounts` in DB | `groups/{name}/container.json` on disk |
| `sqlite3 .../store/messages.db` | `sqlite3 .../data/v2.db` |

**Type 2 — Workflow changes (more significant):**

The entire "Adding a Group" and "Removing a Group" workflow in Andy's CLAUDE.md must be rewritten. In v1, Andy used `register_group` as an IPC task to create groups autonomously. **In v2, `register_group` is not an agent-initiated operation** — group registration goes through owner-driven approval flows. When Andy encounters an unwired messaging group, v2 sends an approval card to the owner; Andy does not register it himself.

The updated workflow should describe:
- **Finding groups:** query `messaging_groups` for unregistered chats, query `agent_groups` for available workspaces
- **Registering a group:** Andy proposes a wiring to the owner (shows the approval card details), owner approves → v2 creates the wiring automatically
- **Container config:** write `groups/{folder}/container.json` for additional mounts, restart the service to apply
- **Listing groups:** query `messaging_group_agents` joined with `agent_groups` and `messaging_groups`

**Practical note:** After the upgrade, send Andy a test message asking him to list current groups. His response will reveal whether his group management instructions need further adjustment for the v2 MCP tools he actually has available.
