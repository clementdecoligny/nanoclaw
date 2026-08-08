/**
 * Container config types and materialization.
 *
 * Source of truth is the `container_configs` table in the central DB.
 * This module provides:
 *   - Type definitions for the file shape (read by the container runner)
 *   - `materializeContainerJson()` — writes `groups/<folder>/container.json`
 *     from the DB at spawn time
 *   - `configFromDb()` — builds a `ContainerConfig` from a DB row + agent group
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR, STRAVA_PROXY_PORT, TIMEZONE } from './config.js';
import { getContainerConfig } from './db/container-configs.js';
import { getAgentGroup } from './db/agent-groups.js';
import { isValidTimezone } from './timezone.js';
import type { AgentGroup, ContainerConfigRow } from './types.js';

export interface McpServerStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  instructions?: string;
}

export interface McpServerRemoteConfig {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  instructions?: string;
}

export type McpServerConfig = McpServerStdioConfig | McpServerRemoteConfig;

export interface AdditionalMountConfig {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

/** Shape of the materialized `container.json` file read by the container runner. */
export interface ContainerConfig {
  mcpServers: Record<string, McpServerConfig>;
  packages: { apt: string[]; npm: string[]; pip: string[] };
  imageTag?: string;
  additionalMounts: AdditionalMountConfig[];
  skills: string[] | 'all';
  provider?: string;
  groupName?: string;
  assistantName?: string;
  agentGroupId?: string;
  maxMessagesPerPrompt?: number;
  model?: string;
  effort?: string;
  env?: Record<string, string>;
  timezone?: string;
}

/**
 * Effective timezone for an agent group: per-group override → install global.
 * The ncl write path validates, but a hand-edited DB value must not silently
 * flip scheduling to UTC — an invalid override falls back to the global tz,
 * same as no override.
 */
export function resolveGroupTimezone(agentGroupId: string): string {
  const tz = getContainerConfig(agentGroupId)?.timezone;
  return tz && isValidTimezone(tz) ? tz : TIMEZONE;
}

/** Build a `ContainerConfig` from a DB row + agent group identity. */
export function configFromDb(row: ContainerConfigRow, group: AgentGroup): ContainerConfig {
  return {
    mcpServers: JSON.parse(row.mcp_servers) as Record<string, McpServerConfig>,
    packages: {
      apt: JSON.parse(row.packages_apt) as string[],
      npm: JSON.parse(row.packages_npm) as string[],
      pip: JSON.parse(row.packages_pip) as string[],
    },
    imageTag: row.image_tag ?? undefined,
    additionalMounts: JSON.parse(row.additional_mounts) as AdditionalMountConfig[],
    skills: JSON.parse(row.skills) as string[] | 'all',
    provider: row.provider ?? undefined,
    groupName: group.name,
    assistantName: row.assistant_name ?? group.name,
    agentGroupId: group.id,
    maxMessagesPerPrompt: row.max_messages_per_prompt ?? undefined,
    model: row.model ?? undefined,
    effort: row.effort ?? undefined,
    timezone: row.timezone && isValidTimezone(row.timezone) ? row.timezone : undefined,
    // Undefined rather than {} when empty: the runner guards with `if (config.env)`,
    // and an empty object would still be truthy — harmless today, but it keeps the
    // materialized container.json free of a meaningless `"env": {}` line.
    env: parseEnvColumn(row.env),
  };
}

/**
 * Parse the `env` JSON column into the shape the container runner expects.
 *
 * Tolerates NULL/absent (rows written before migration 023) and malformed JSON:
 * a bad value degrades to "no env vars" rather than aborting every spawn for
 * the group. Non-string values are dropped — they would stringify into
 * surprising `-e KEY=[object Object]` arguments.
 */
function parseEnvColumn(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Rewrite remote MCP servers marked with a `{{strava}}` placeholder to go
 * through the host-side Strava proxy.
 *
 * We deliberately do NOT inject an access token here. Strava tokens expire
 * after 6 hours, and `container.json` is only materialized at spawn time, so a
 * baked-in token goes stale in any container that outlives it — producing 401s
 * that `mcp.strava.com` reports as a bogus "reconnect via OAuth" prompt.
 *
 * Instead we point the container at the proxy, which resolves a fresh token on
 * every request. The Authorization header is dropped entirely: the proxy
 * supplies it, and the container never sees a Strava credential.
 */
function resolveRemoteMcpTokens(config: ContainerConfig): void {
  for (const mcp of Object.values(config.mcpServers)) {
    if (!('url' in mcp) || !mcp.headers) continue;

    const usesStrava = Object.values(mcp.headers).some((v) => v === 'Bearer {{strava}}');
    if (!usesStrava) continue;

    for (const [key, value] of Object.entries(mcp.headers)) {
      if (value === 'Bearer {{strava}}') delete mcp.headers[key];
    }
    mcp.url = `http://host.docker.internal:${STRAVA_PROXY_PORT}/`;
  }
}

/**
 * Materialize `container.json` from the DB. Called at spawn time so the
 * container always sees fresh config. Returns the `ContainerConfig` for
 * use by the caller (buildMounts, buildContainerArgs, etc.).
 */
export async function materializeContainerJson(agentGroupId: string): Promise<ContainerConfig> {
  const group = getAgentGroup(agentGroupId);
  if (!group) throw new Error(`Agent group not found: ${agentGroupId}`);

  const row = getContainerConfig(agentGroupId);
  if (!row) throw new Error(`Container config not found for agent group: ${agentGroupId}`);

  const config = configFromDb(row, group);

  // Point Strava-marked MCP servers at the host proxy before writing
  resolveRemoteMcpTokens(config);

  const p = path.join(GROUPS_DIR, group.folder, 'container.json');
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n');

  return config;
}
