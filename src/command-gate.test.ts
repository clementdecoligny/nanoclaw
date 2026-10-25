/**
 * Tests for the host-side command gate — filtered commands are dropped
 * before reaching the container, and admin commands are gated against
 * the user_roles table.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gateCommand } from './command-gate.js';
import { closeDb, createAgentGroup, initTestDb, runMigrations } from './db/index.js';
import { createUser } from './modules/permissions/db/users.js';
import { grantRole } from './modules/permissions/db/user-roles.js';

function now(): string {
  return new Date().toISOString();
}

async function seedAgentGroup(id: string): Promise<void> {
  await createAgentGroup({ id, name: id.toUpperCase(), folder: id, agent_provider: null, created_at: now() });
}

async function seedUser(id: string): Promise<void> {
  await createUser({ id, kind: 'telegram', display_name: null, created_at: now() });
}

beforeEach(async () => {
  const db = await initTestDb();
  await runMigrations(db);
  await seedAgentGroup('ag-1');
  await seedAgentGroup('ag-2');
  await seedUser('telegram:1');
});

afterEach(async () => {
  await closeDb();
});

describe('filtered commands', () => {
  it('drops /start before it reaches the container', async () => {
    expect(await gateCommand('/start', 'telegram:1', 'ag-1')).toEqual({ action: 'filter' });
  });

  it('drops /start regardless of sender', async () => {
    expect(await gateCommand('/start', null, 'ag-1')).toEqual({ action: 'filter' });
  });
});

describe('admin gating goes through roles', () => {
  it('denies an admin command from a non-admin user', async () => {
    expect(await gateCommand('/clear', 'telegram:nobody', 'ag-1')).toEqual({ action: 'deny', command: '/clear' });
  });

  it('denies an admin command with no sender', async () => {
    expect(await gateCommand('/clear', null, 'ag-1')).toEqual({ action: 'deny', command: '/clear' });
  });

  it('allows an admin command from an owner', async () => {
    await seedUser('telegram:owner');
    await grantRole({
      user_id: 'telegram:owner',
      role: 'owner',
      agent_group_id: null,
      granted_by: null,
      granted_at: now(),
    });
    expect(await gateCommand('/clear', 'telegram:owner', 'ag-1')).toEqual({ action: 'pass' });
  });

  it('allows an admin command from a scoped admin of the group', async () => {
    await seedUser('telegram:admin');
    await grantRole({
      user_id: 'telegram:admin',
      role: 'admin',
      agent_group_id: 'ag-1',
      granted_by: null,
      granted_at: now(),
    });
    expect(await gateCommand('/clear', 'telegram:admin', 'ag-1')).toEqual({ action: 'pass' });
    expect(await gateCommand('/clear', 'telegram:admin', 'ag-2')).toEqual({ action: 'deny', command: '/clear' });
  });
});

describe('normal messages pass through', () => {
  it('passes a plain message', async () => {
    expect(await gateCommand('hello there', 'telegram:1', 'ag-1')).toEqual({ action: 'pass' });
  });

  it('passes an unknown slash command', async () => {
    expect(await gateCommand('/whatever', 'telegram:1', 'ag-1')).toEqual({ action: 'pass' });
  });
});

// Each row: message text and the runner-handled command it executes, if any
// (mirrored in container/agent-runner/src/slash-command.test.ts). A non-admin
// must be denied exactly the rows the runner would execute.
const RUNNER_COMMAND_CORPUS: Array<[string, '/clear' | '/upload-trace' | null]> = [
  ['/clear', '/clear'],
  ['/CLEAR', '/clear'],
  ['  /clear now ', '/clear'],
  ['/clear@somebot', '/clear'],
  ['/CLEAR@Bot', '/clear'],
  ['/clear@somebot please', '/clear'],
  ['/clear\tnow', '/clear'],
  ['/clear\nnow', '/clear'],
  ['/clearx', null],
  ['/clear.', null],
  ['/clear-', null],
  ['/clear_all', null],
  ['/clear@', null],
  ['/clear@bot.', null],
  ['/clear@bot/x', null],
  ['/upload-trace', '/upload-trace'],
  ['/upload-trace@somebot', '/upload-trace'],
  ['/UPLOAD-TRACE now', '/upload-trace'],
  ['/upload-tracex', null],
  ['/upload-trace.', null],
  ['/upload', null],
  ['clear', null],
  ['hello /clear', null],
];

describe('gate and runner agree on command names', () => {
  it.each(RUNNER_COMMAND_CORPUS)('%j from a non-admin', async (text, executes) => {
    const expected = executes ? { action: 'deny', command: executes } : { action: 'pass' };
    expect(await gateCommand(JSON.stringify({ text }), 'telegram:nobody', 'ag-1')).toEqual(expected);
  });

  it('gates a native admin command sent with a bot suffix', async () => {
    expect(await gateCommand('/compact@somebot', 'telegram:nobody', 'ag-1')).toEqual({
      action: 'deny',
      command: '/compact',
    });
  });

  it('still lets an owner run a suffixed admin command', async () => {
    await seedUser('telegram:owner');
    await grantRole({
      user_id: 'telegram:owner',
      role: 'owner',
      agent_group_id: null,
      granted_by: null,
      granted_at: now(),
    });
    expect(await gateCommand('/clear@somebot', 'telegram:owner', 'ag-1')).toEqual({ action: 'pass' });
  });

  it('drops a filtered command sent with a bot suffix', async () => {
    expect(await gateCommand('/start@somebot', 'telegram:1', 'ag-1')).toEqual({ action: 'filter' });
  });

  // The Claude SDK runs these aliases as the gated command itself.
  it.each(['/reset', '/new', '/usage', '/stats'])('denies the SDK alias %s to a non-admin', async (alias) => {
    expect(await gateCommand(`${alias}@somebot now`, 'telegram:nobody', 'ag-1')).toEqual({
      action: 'deny',
      command: alias,
    });
  });

  it.each(['/checkup', '/settings', '/rc'])('drops the SDK alias %s like its command', async (alias) => {
    expect(await gateCommand(alias, 'telegram:1', 'ag-1')).toEqual({ action: 'filter' });
  });
});

describe('gateCommand — /model', () => {
  it('passes through non-slash messages unchanged', async () => {
    expect(await gateCommand(JSON.stringify({ text: 'hello' }), 'telegram:1', 'ag-1')).toEqual({ action: 'pass' });
  });

  it('recognizes bare /model as a model command with no argument', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: 'ag-1',
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('recognizes /model <alias> and lowercases the argument', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: 'ag-1',
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model OPUS' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: 'opus' });
  });

  it('trims and lowercases a /model argument with extra whitespace', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: 'ag-1',
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model   Sonnet  ' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: 'sonnet' });
  });

  it('denies /model for a sender with no admin role', async () => {
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:2', 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('denies /model for a null userId', async () => {
    const result = await gateCommand(JSON.stringify({ text: '/model opus' }), null, 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('denies /model for an admin scoped to a different agent group', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: 'ag-2',
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('allows /model for a global admin regardless of agent group', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: null,
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('allows /model for an owner regardless of agent group', async () => {
    await grantRole({
      user_id: 'telegram:1',
      role: 'owner',
      agent_group_id: null,
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('never dispatches /model as container pass-through text, authorized or not', async () => {
    // Regression guard: /model must never reach the SDK/container — it is
    // fully host-intercepted, unlike ADMIN_COMMANDS entries (/clear, /compact)
    // which pass through to the container once authorized.
    await grantRole({
      user_id: 'telegram:1',
      role: 'admin',
      agent_group_id: 'ag-1',
      granted_by: null,
      granted_at: now(),
    });
    const result = await gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result.action).not.toBe('pass');
  });
});
