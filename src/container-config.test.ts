import { describe, expect, it } from 'vitest';

import { configFromDb } from './container-config.js';
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

const group: AgentGroup = { id: 'ag-x', name: 'Coach', folder: 'coach' } as AgentGroup;

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
