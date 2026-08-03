/**
 * Self-modification MCP tools: install_packages, add_mcp_server.
 *
 * Both are fire-and-forget — the tool writes a system action row and returns
 * immediately. The host processes the request (including admin approval)
 * and notifies the agent via a chat message when complete. Admin approval
 * is approval to apply the change: `install_packages` auto-rebuilds the
 * per-agent image and restarts the container; `add_mcp_server` just
 * updates `container.json` and restarts (bun runs TS directly — no build
 * step needed for a pure MCP wiring change).
 *
 * Package names are sanitized here at the tool boundary AND re-validated on
 * the host side (defense in depth).
 */
import { writeMessageOut } from '../db/messages-out.js';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[mcp-tools] ${msg}`);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
// pip spec: name + optional extras + optional pinned version, e.g. `garminconnect==0.3.6`.
const PIP_RE = /^[a-z0-9][a-z0-9._-]*(\[[a-z0-9,._-]+\])?([<>=!~]=?[a-z0-9._*+-]+)?$/i;
const MAX_PACKAGES = 20;

export const installPackages: McpToolDefinition = {
  tool: {
    name: 'install_packages',
    description:
      'Install apt, npm, and/or pip packages into YOUR per-agent container image. Requires admin approval; fire-and-forget. On approval, the image is rebuilt and the container is restarted automatically. pip packages install into the /opt/wpenv Python venv — pin versions (e.g. "garminconnect==0.3.6").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apt: { type: 'array', items: { type: 'string' }, description: 'apt packages to install (names only, no version specs or flags)' },
        npm: { type: 'array', items: { type: 'string' }, description: 'npm packages to install globally (names only, no version specs)' },
        pip: { type: 'array', items: { type: 'string' }, description: 'pip packages for the /opt/wpenv venv; pinned specs allowed (e.g. "garminconnect==0.3.6")' },
        reason: { type: 'string', description: 'Why these packages are needed' },
      },
    },
  },
  async handler(args) {
    const apt = (args.apt as string[]) || [];
    const npm = (args.npm as string[]) || [];
    const pip = (args.pip as string[]) || [];
    if (apt.length === 0 && npm.length === 0 && pip.length === 0) return err('At least one apt, npm, or pip package is required');
    if (apt.length + npm.length + pip.length > MAX_PACKAGES) return err(`Maximum ${MAX_PACKAGES} packages per request`);

    const invalidApt = apt.find((p) => !APT_RE.test(p));
    if (invalidApt) return err(`Invalid apt package name: "${invalidApt}". Only lowercase letters, digits, and ._+- allowed.`);
    const invalidNpm = npm.find((p) => !NPM_RE.test(p));
    if (invalidNpm) return err(`Invalid npm package name: "${invalidNpm}". No version specs or shell characters.`);
    const invalidPip = pip.find((p) => !PIP_RE.test(p));
    if (invalidPip) return err(`Invalid pip package spec: "${invalidPip}". Use name with optional extras/pinned version, no shell characters.`);

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'install_packages',
        apt,
        npm,
        pip,
        reason: (args.reason as string) || '',
      }),
    });

    log(`install_packages: ${requestId} → apt=[${apt.join(',')}] npm=[${npm.join(',')}] pip=[${pip.join(',')}]`);
    return ok(`Package install request submitted. You will be notified when admin approves or rejects.`);
  },
};

export const addMcpServer: McpToolDefinition = {
  tool: {
    name: 'add_mcp_server',
    description:
      'Wire an EXISTING third-party MCP server into YOUR per-agent runtime config — you must already know the exact `command` + `args` to invoke it (e.g. `npx @modelcontextprotocol/server-github`). Requires admin approval; fire-and-forget.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'MCP server name (unique identifier)' },
        command: { type: 'string', description: 'Command to run the MCP server' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        env: { type: 'object', description: 'Environment variables for the server' },
      },
      required: ['name', 'command'],
    },
  },
  async handler(args) {
    const name = args.name as string;
    const command = args.command as string;
    if (!name || !command) return err('name and command are required');

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'add_mcp_server',
        name,
        command,
        args: (args.args as string[]) || [],
        env: (args.env as Record<string, string>) || {},
      }),
    });

    log(`add_mcp_server: ${requestId} → "${name}" (${command})`);
    return ok(`MCP server request submitted. You will be notified when admin approves or rejects.`);
  },
};

const MODEL_ALIASES = ['opus', 'sonnet', 'haiku'];
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

export const setModelConfig: McpToolDefinition = {
  tool: {
    name: 'set_model_config',
    description:
      'Change YOUR model and/or reasoning effort. Used by the /model command. Fire-and-forget: the host applies the change and restarts your container, so your reply should tell the user what was set before you finish. Effort xhigh/max are the "deep research" tiers.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        model: { type: 'string', enum: MODEL_ALIASES, description: 'Model alias to switch to' },
        effort: { type: 'string', enum: EFFORT_LEVELS, description: 'Reasoning effort level' },
      },
    },
  },
  async handler(args) {
    const model = args.model as string | undefined;
    const effort = args.effort as string | undefined;
    if (!model && !effort) return err('At least one of model or effort is required');
    if (model && !MODEL_ALIASES.includes(model)) return err(`Unknown model "${model}". Valid: ${MODEL_ALIASES.join(', ')}`);
    if (effort && !EFFORT_LEVELS.includes(effort)) return err(`Unknown effort "${effort}". Valid: ${EFFORT_LEVELS.join(', ')}`);

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({ action: 'set_model_config', model, effort }),
    });

    log(`set_model_config: ${requestId} → model=${model ?? '(unchanged)'} effort=${effort ?? '(unchanged)'}`);
    return ok(`Config update submitted (model=${model ?? 'unchanged'}, effort=${effort ?? 'unchanged'}). Container will restart.`);
  },
};

registerTools([installPackages, addMcpServer, setModelConfig]);
