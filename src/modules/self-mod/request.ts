/**
 * Delivery-action handlers for agent-initiated self-modification requests.
 *
 * Two actions the container can write into messages_out (via the self-mod
 * MCP tools): install_packages, add_mcp_server. Each one validates input
 * and queues an approval request. The admin's approval triggers the
 * matching approval handler in ./apply.ts, which also performs the
 * required follow-up (rebuild+restart for install_packages, restart-only
 * for add_mcp_server).
 *
 * Host-side sanitization for install_packages is defense-in-depth — the MCP
 * tool validates first. Both layers matter: the DB row carries the payload
 * verbatim through to shell exec on apply.
 */
import { restartAgentGroupContainers } from '../../container-restart.js';
import { getAgentGroup } from '../../db/agent-groups.js';
import { updateContainerConfigScalars } from '../../db/container-configs.js';
import { log } from '../../log.js';
import type { Session } from '../../types.js';
import { notifyAgent, requestApproval } from '../approvals/index.js';

/** Model aliases `/model` accepts. Full model IDs stay CLI-only. */
const MODEL_ALIASES = ['opus', 'sonnet', 'haiku'];
/** Mirrors ProviderOptions.effort in container/agent-runner/src/providers/types.ts. */
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Apply a model/effort change from the `/model` command.
 *
 * No approval gate: `/model` is already admin-only at the command gate
 * (src/command-gate.ts), and unlike install_packages this changes no code
 * and no dependencies. Values are re-validated here because the MCP tool's
 * validation is client-side (defense in depth, same as install_packages).
 */
export async function handleSetModelConfig(content: Record<string, unknown>, session: Session): Promise<void> {
  const model = content.model as string | undefined;
  const effort = content.effort as string | undefined;

  if (!model && !effort) {
    notifyAgent(session, 'set_model_config failed: at least one of model or effort is required.');
    return;
  }
  if (model && !MODEL_ALIASES.includes(model)) {
    notifyAgent(session, `set_model_config failed: unknown model "${model}". Valid: ${MODEL_ALIASES.join(', ')}.`);
    log.warn('set_model_config: invalid model rejected', { model });
    return;
  }
  if (effort && !EFFORT_LEVELS.includes(effort)) {
    notifyAgent(session, `set_model_config failed: unknown effort "${effort}". Valid: ${EFFORT_LEVELS.join(', ')}.`);
    log.warn('set_model_config: invalid effort rejected', { effort });
    return;
  }

  const updates: { model?: string; effort?: string } = {};
  if (model) updates.model = model;
  if (effort) updates.effort = effort;
  updateContainerConfigScalars(session.agent_group_id, updates);

  // A wakeMessage is required for respawn — without it killContainer has no
  // onExit callback and the container stays down until the next user message.
  const restarted = restartAgentGroupContainers(
    session.agent_group_id,
    'model command',
    'Model/effort updated — resuming.',
  );

  log.info('set_model_config applied', { agentGroupId: session.agent_group_id, ...updates, restarted });
}

export async function handleInstallPackages(content: Record<string, unknown>, session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notifyAgent(session, 'install_packages failed: agent group not found.');
    return;
  }

  const apt = (content.apt as string[]) || [];
  const npm = (content.npm as string[]) || [];
  const pip = (content.pip as string[]) || [];
  const reason = (content.reason as string) || '';

  const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
  const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
  // pip package spec: name plus optional extras and a pinned version, e.g.
  // `garminconnect==0.3.6` or `pydantic[email]>=2`. Kept conservative.
  const PIP_RE = /^[a-z0-9][a-z0-9._-]*(\[[a-z0-9,._-]+\])?([<>=!~]=?[a-z0-9._*+-]+)?$/i;
  const MAX_PACKAGES = 20;
  const total = apt.length + npm.length + pip.length;
  if (total === 0) {
    notifyAgent(session, 'install_packages failed: at least one apt, npm, or pip package is required.');
    return;
  }
  if (total > MAX_PACKAGES) {
    notifyAgent(session, `install_packages failed: max ${MAX_PACKAGES} packages per request.`);
    return;
  }
  const invalidApt = apt.find((p) => !APT_RE.test(p));
  if (invalidApt) {
    notifyAgent(session, `install_packages failed: invalid apt package name "${invalidApt}".`);
    log.warn('install_packages: invalid apt package rejected', { pkg: invalidApt });
    return;
  }
  const invalidNpm = npm.find((p) => !NPM_RE.test(p));
  if (invalidNpm) {
    notifyAgent(session, `install_packages failed: invalid npm package name "${invalidNpm}".`);
    log.warn('install_packages: invalid npm package rejected', { pkg: invalidNpm });
    return;
  }
  const invalidPip = pip.find((p) => !PIP_RE.test(p));
  if (invalidPip) {
    notifyAgent(session, `install_packages failed: invalid pip package spec "${invalidPip}".`);
    log.warn('install_packages: invalid pip package rejected', { pkg: invalidPip });
    return;
  }

  const packageList = [
    ...apt.map((p) => `apt: ${p}`),
    ...npm.map((p) => `npm: ${p}`),
    ...pip.map((p) => `pip: ${p}`),
  ].join(', ');
  await requestApproval({
    session,
    agentName: agentGroup.name,
    action: 'install_packages',
    payload: { apt, npm, pip, reason },
    title: 'Install Packages Request',
    question: `Agent "${agentGroup.name}" is attempting to install a package + rebuild container:\n${packageList}${reason ? `\nReason: ${reason}` : ''}`,
  });
}

export async function handleAddMcpServer(content: Record<string, unknown>, session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notifyAgent(session, 'add_mcp_server failed: agent group not found.');
    return;
  }
  const serverName = content.name as string;
  const command = content.command as string;
  if (!serverName || !command) {
    notifyAgent(session, 'add_mcp_server failed: name and command are required.');
    return;
  }
  await requestApproval({
    session,
    agentName: agentGroup.name,
    action: 'add_mcp_server',
    payload: {
      name: serverName,
      command,
      args: (content.args as string[]) || [],
      env: (content.env as Record<string, string>) || {},
    },
    title: 'Add MCP Request',
    question: `Agent "${agentGroup.name}" is attempting to add a new MCP server:\n${serverName} (${command})`,
  });
}
