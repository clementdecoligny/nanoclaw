import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { configFromDb } from './container-config.js';
import { createAgentGroup } from './db/agent-groups.js';
import { closeDb, initTestDb } from './db/connection.js';
import { ensureContainerConfig, getContainerConfig, setContainerConfigEnv } from './db/container-configs.js';
import { runMigrations } from './db/migrations/index.js';
import type { AgentGroup } from './types.js';

/**
 * Per-agent-group env vars on `container_configs`.
 *
 * These carry credentials that OneCLI structurally cannot inject: it rewrites
 * HTTP headers and query params, so a multi-step *form* login (Continente's
 * username -> password -> OAuth code -> session cookie) has nothing for it to
 * hook into. Before this column existed the value lived nowhere, and the agent
 * resorted to scraping its own chat transcript for the password.
 *
 * The load-bearing property is durability across spawns: `container.json` is
 * regenerated from the DB on every spawn, so a value that does not round-trip
 * through `configFromDb` silently disappears and the login fails weeks later
 * with no obvious cause.
 */
const GROUP: AgentGroup = {
  id: 'ag-env',
  name: 'env',
  folder: 'env',
  agent_provider: null,
  created_at: new Date().toISOString(),
};

describe('container config env vars', () => {
  beforeEach(() => {
    runMigrations(initTestDb());
    createAgentGroup(GROUP);
    ensureContainerConfig(GROUP.id);
  });
  afterEach(() => {
    closeDb();
  });

  it('defaults to an empty map, and configFromDb omits it entirely', () => {
    const row = getContainerConfig(GROUP.id)!;
    expect(JSON.parse(row.env)).toEqual({});
    // Undefined rather than {} so the runner's `if (config.env)` guard skips it.
    expect(configFromDb(row, GROUP).env).toBeUndefined();
  });

  it('round-trips values through the DB into the materialized config', () => {
    setContainerConfigEnv(GROUP.id, { CONTINENTE_EMAIL: 'a@b.c', CONTINENTE_PASSWORD: 'pw' });

    const row = getContainerConfig(GROUP.id)!;
    expect(configFromDb(row, GROUP).env).toEqual({
      CONTINENTE_EMAIL: 'a@b.c',
      CONTINENTE_PASSWORD: 'pw',
    });
  });

  it('merges on write so setting one key never drops the others', () => {
    setContainerConfigEnv(GROUP.id, { A: '1', B: '2' });
    setContainerConfigEnv(GROUP.id, { B: '22', C: '3' });

    expect(configFromDb(getContainerConfig(GROUP.id)!, GROUP).env).toEqual({
      A: '1',
      B: '22',
      C: '3',
    });
  });

  it('removes a key when its value is null, and drops back to undefined when empty', () => {
    setContainerConfigEnv(GROUP.id, { A: '1', B: '2' });
    setContainerConfigEnv(GROUP.id, { A: null });

    expect(configFromDb(getContainerConfig(GROUP.id)!, GROUP).env).toEqual({ B: '2' });

    setContainerConfigEnv(GROUP.id, { B: null });
    expect(configFromDb(getContainerConfig(GROUP.id)!, GROUP).env).toBeUndefined();
  });

  it('stores every key when several are set in one call', () => {
    // Regression: `ncl ... --var A=1 --var B=2` originally kept only the last
    // flag, because the argv parser overwrote repeated keys instead of
    // accumulating them. The caller saw a success response listing one key and
    // had no signal that the other credential was silently dropped.
    setContainerConfigEnv(GROUP.id, { CONTINENTE_EMAIL: 'a@b.c', CONTINENTE_PASSWORD: 'pw' });

    expect(Object.keys(configFromDb(getContainerConfig(GROUP.id)!, GROUP).env ?? {}).sort()).toEqual([
      'CONTINENTE_EMAIL',
      'CONTINENTE_PASSWORD',
    ]);
  });

  it('rejects names that are not valid shell env identifiers', () => {
    // A name with `=` or a space would let a value smuggle in extra `-e` args.
    expect(() => setContainerConfigEnv(GROUP.id, { 'BAD NAME': 'x' })).toThrow(/identifier/i);
    expect(() => setContainerConfigEnv(GROUP.id, { 'A=B': 'x' })).toThrow(/identifier/i);
    expect(() => setContainerConfigEnv(GROUP.id, { '1LEADING': 'x' })).toThrow(/identifier/i);
  });
});
