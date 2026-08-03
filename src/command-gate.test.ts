import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gateCommand } from './command-gate.js';
import { closeDb, createAgentGroup, initTestDb, runMigrations } from './db/index.js';
import { grantRole } from './modules/permissions/db/user-roles.js';
import { createUser } from './modules/permissions/db/users.js';

function now(): string {
  return new Date().toISOString();
}

function seedAgentGroup(id: string): void {
  createAgentGroup({ id, name: id.toUpperCase(), folder: id, agent_provider: null, created_at: now() });
}

function seedUser(id: string): void {
  createUser({ id, kind: 'telegram', display_name: null, created_at: now() });
}

beforeEach(() => {
  const db = initTestDb();
  runMigrations(db);
  seedAgentGroup('ag-1');
  seedAgentGroup('ag-2');
  seedUser('telegram:1');
});

afterEach(() => {
  closeDb();
});

describe('gateCommand — /model', () => {
  it('passes through non-slash messages unchanged', () => {
    expect(gateCommand(JSON.stringify({ text: 'hello' }), 'telegram:1', 'ag-1')).toEqual({ action: 'pass' });
  });

  it('recognizes bare /model as a model command with no argument', () => {
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: 'ag-1', granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('recognizes /model <alias> and lowercases the argument', () => {
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: 'ag-1', granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model OPUS' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: 'opus' });
  });

  it('trims and lowercases a /model argument with extra whitespace', () => {
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: 'ag-1', granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model   Sonnet  ' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: 'sonnet' });
  });

  it('denies /model for a sender with no admin role', () => {
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:2', 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('denies /model for a null userId', () => {
    const result = gateCommand(JSON.stringify({ text: '/model opus' }), null, 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('denies /model for an admin scoped to a different agent group', () => {
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: 'ag-2', granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'deny', command: '/model' });
  });

  it('allows /model for a global admin regardless of agent group', () => {
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: null, granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('allows /model for an owner regardless of agent group', () => {
    grantRole({ user_id: 'telegram:1', role: 'owner', agent_group_id: null, granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result).toEqual({ action: 'model', argument: undefined });
  });

  it('never dispatches /model as container pass-through text, authorized or not', () => {
    // Regression guard: /model must never reach the SDK/container — it is
    // fully host-intercepted, unlike ADMIN_COMMANDS entries (/clear, /compact)
    // which pass through to the container once authorized.
    grantRole({ user_id: 'telegram:1', role: 'admin', agent_group_id: 'ag-1', granted_by: null, granted_at: now() });
    const result = gateCommand(JSON.stringify({ text: '/model' }), 'telegram:1', 'ag-1');
    expect(result.action).not.toBe('pass');
  });
});
