import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Hoisted so the vi.mock factories below (which vitest lifts to the top of the
// file) can close over these without hitting the TDZ.
const h = vi.hoisted(() => {
  const nodeFs = require('fs') as typeof import('fs');
  const nodeOs = require('os') as typeof import('os');
  const nodePath = require('path') as typeof import('path');
  return {
    tmpGroups: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'nc-groups-')),
    dbState: { row: null as ContainerConfigRow | null },
    group: { id: 'ag-x', name: 'Coach', folder: 'coach' } as AgentGroup,
  };
});

vi.mock('./config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config.js')>()),
  GROUPS_DIR: h.tmpGroups,
  STRAVA_PROXY_PORT: 10255,
}));

vi.mock('./db/container-configs.js', () => ({
  getContainerConfig: vi.fn(() => h.dbState.row),
}));
vi.mock('./db/agent-groups.js', () => ({
  getAgentGroup: vi.fn(() => h.group),
}));

import { configFromDb, materializeContainerJson } from './container-config.js';
import { buildPackageDockerfile } from './container-runner.js';
import type { AgentGroup, ContainerConfigRow } from './types.js';

function row(overrides: Partial<ContainerConfigRow> = {}): ContainerConfigRow {
  return {
    agent_group_id: 'ag-x',
    provider: null,
    model: null,
    effort: null,
    image_tag: null,
    assistant_name: null,
    max_messages_per_prompt: null,
    skills: '"all"',
    mcp_servers: '{}',
    packages_apt: '[]',
    packages_npm: '[]',
    packages_pip: '[]',
    additional_mounts: '[]',
    cli_scope: 'group',
    updated_at: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

const { tmpGroups, dbState, group } = h;

describe('configFromDb — pip packages', () => {
  it('surfaces packages.pip from the DB row', () => {
    const cfg = configFromDb(row({ packages_pip: '["garminconnect==0.3.6"]' }), group);
    expect(cfg.packages.pip).toEqual(['garminconnect==0.3.6']);
  });

  it('defaults pip to empty array when column is []', () => {
    const cfg = configFromDb(row(), group);
    expect(cfg.packages.pip).toEqual([]);
  });
});

describe('materializeContainerJson — Strava proxy rewrite', () => {
  const stravaMcp = JSON.stringify({
    strava: {
      type: 'http',
      url: 'https://mcp.strava.com/mcp',
      headers: { Authorization: 'Bearer {{strava}}' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function written(): any {
    const p = path.join(tmpGroups, group.folder, 'container.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  beforeEach(() => {
    dbState.row = row({ mcp_servers: stravaMcp });
  });

  afterEach(() => {
    fs.rmSync(path.join(tmpGroups, group.folder), { recursive: true, force: true });
  });

  it('repoints the Strava MCP url at the host proxy', async () => {
    const cfg = await materializeContainerJson('ag-x');
    expect(cfg.mcpServers.strava).toMatchObject({
      url: 'http://host.docker.internal:10255/',
    });
  });

  it('drops the Authorization header so no token reaches the container', async () => {
    await materializeContainerJson('ag-x');
    const mcp = written().mcpServers.strava;
    expect(mcp.headers).toEqual({});
  });

  it('never writes a Strava bearer token to container.json on disk', async () => {
    await materializeContainerJson('ag-x');
    const raw = fs.readFileSync(path.join(tmpGroups, group.folder, 'container.json'), 'utf8');
    expect(raw).not.toContain('{{strava}}');
    expect(raw).not.toMatch(/Bearer [0-9a-f]{20,}/);
  });

  it('leaves unrelated remote MCP servers untouched', async () => {
    dbState.row = row({
      mcp_servers: JSON.stringify({
        other: {
          type: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer static-key' },
        },
      }),
    });

    const cfg = await materializeContainerJson('ag-x');
    expect(cfg.mcpServers.other).toMatchObject({
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer static-key' },
    });
  });
});

describe('buildPackageDockerfile — pip channel', () => {
  it('installs pip packages into the /opt/wpenv venv', () => {
    const df = buildPackageDockerfile({ apt: [], npm: [], pip: ['garminconnect==0.3.6'] });
    expect(df).toContain('/opt/wpenv/bin/pip install');
    expect(df).toContain('garminconnect==0.3.6');
  });

  it('emits no pip line when there are no pip packages', () => {
    const df = buildPackageDockerfile({ apt: ['jq'], npm: [], pip: [] });
    expect(df).not.toContain('/opt/wpenv/bin/pip');
    expect(df).toContain('jq');
  });

  it('combines apt, npm, and pip in one Dockerfile', () => {
    const df = buildPackageDockerfile({ apt: ['jq'], npm: ['cowsay'], pip: ['garminconnect==0.3.6'] });
    expect(df).toContain('apt-get install -y jq');
    expect(df).toContain('pnpm install -g cowsay');
    expect(df).toContain('/opt/wpenv/bin/pip install');
    expect(df).toMatch(/USER node/);
  });

  it('throws when there are no packages at all', () => {
    expect(() => buildPackageDockerfile({ apt: [], npm: [], pip: [] })).toThrow();
  });
});
