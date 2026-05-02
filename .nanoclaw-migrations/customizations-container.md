# Container Customizations

Changes to the Dockerfile and agent-runner that must be reapplied after upgrade.

---

## Dockerfile — WeasyPrint Python Virtualenv

**Intent:** The finance agent (Edmond) generates PDF salary receipts using WeasyPrint. The virtualenv is baked into the container image so Python scripts can generate PDFs without network access at runtime.

**Files:** `container/Dockerfile`

**How to apply:**

Add this layer after the Chromium/system dependencies block and before the agent-runner build steps:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/wpenv \
    && /opt/wpenv/bin/pip install --no-cache-dir weasyprint openpyxl \
    && rm -rf /root/.cache/pip
```

**Why a separate layer:** Keeping this separate from the Chromium install block allows Docker to cache the Chromium build independently. WeasyPrint changes don't bust the Chromium layer and vice versa.

**Runtime path:** Finance Python scripts invoke WeasyPrint via `/opt/wpenv/bin/python3`.

**After adding the layer**, rebuild the container:
```bash
./container/build.sh
```

If the build cache is stale (WeasyPrint not found in the container after rebuild), prune the builder first:
```bash
docker builder prune -f
./container/build.sh
```

---

## Agent Runner — Tool Observability

**Intent:** The host can display real-time status of which tool the agent is currently using by reading `NANOCLAW_TOOL:<name>` lines from the container's stdout.

**Files:** `container/agent-runner/src/index.ts`

**How to apply (v2/Bun adaptation):**

In the agent-runner, wherever tool use is intercepted or logged, emit to stdout:

```typescript
// When the agent calls a tool:
process.stdout.write(`NANOCLAW_TOOL:${toolName}\n`);
```

In v1 this was added in the assistant message processing loop where tool_use blocks are detected. In v2 (Bun), find the equivalent location in the agent execution pipeline and emit the same stdout signal.

The host-side (`src/index.ts`) reads these lines and maps them to status labels — see `customizations-src.md` under "Index — Status Messages".

---

## Agent Runner — Gmail MCP Server

**Intent:** Register the Gmail MCP server in the agent-runner so agents can call `mcp__gmail__*` tools to read email threads, search mail, and draft replies.

**Files:** `container/agent-runner/src/index.ts`

**How to apply (v2/Bun adaptation):**

In the MCP server registration section, conditionally add the Gmail server:

```typescript
// Only register if credentials directory exists in the container
const gmailCredsPath = '/home/node/.gmail-mcp';
if (fs.existsSync(gmailCredsPath)) {
  mcpServers.push({
    name: 'gmail',
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
    env: {
      HOME: '/home/node',
      PATH: process.env.PATH ?? '',
    },
  });
}
```

**v2 note:** In v2 the agent-runner is Bun-based. `npx` should be available since Node 22 is still present in the container image. If it's not on PATH from within Bun, use the full path: `/usr/local/bin/npx`.

The `~/.gmail-mcp` host directory is mounted into the container at `/home/node/.gmail-mcp` by the container-runner customization (see `customizations-src.md`).

---

## Agent Runner — send_document MCP Tool

**Intent:** Agents use `mcp__nanoclaw__send_document` to deliver generated files to users. Edmond's CLAUDE.md calls this tool explicitly when sending PDF receipts.

**⚠️ Do NOT reimplement the v1 IPC file-staging pattern** (copying to `IPC_DIR/files/`, writing a JSON IPC message). V2 has no `data/ipc/` directory — all outbound communication goes through `outbound.db`.

**Files:** `container/agent-runner/src/` (whichever file defines the nanoclaw MCP tools in v2)

**How to apply:**

**Step 1 — Check if it already exists.** After merging `upstream/channels`, grep for `send_document` in the agent-runner:
```bash
grep -r "send_document" container/agent-runner/src/
```
If found, verify the tool schema matches what Edmond's CLAUDE.md expects (`file_path`, `filename?`, `caption?`) and move on — no changes needed.

**Step 2 — If absent**, add it following the v2 outbound delivery model. The tool must:
1. Copy the file into the session's `outbox/{messageId}/` directory (how `send_message` attaches files in v2)
2. Write a row to `outbound.db` `messages_out` with `type: 'document'` and the messageId

The exact schema of `messages_out` and the outbox path are defined in v2's agent-runner source — use the same pattern as `send_message` but with `type: 'document'`.

**Tool definition to add** (schema is valid regardless of delivery mechanism):
```typescript
{
  name: 'send_document',
  description: 'Send a file to the user chat. The file must exist on disk before calling this tool. Supported formats: PDF, HTML, CSV, JSON, and any other format.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file inside the container (e.g. /tmp/receipt.pdf)',
      },
      filename: {
        type: 'string',
        description: 'Optional display filename. Defaults to the basename of file_path.',
      },
      caption: {
        type: 'string',
        description: 'Optional caption displayed alongside the file.',
      },
    },
    required: ['file_path'],
  },
}
```
