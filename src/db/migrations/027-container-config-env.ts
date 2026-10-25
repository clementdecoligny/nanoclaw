import type { Migration } from './index.js';

/**
 * Per-agent-group environment variables on `container_configs`.
 *
 * Carries credentials the OneCLI gateway structurally cannot inject. OneCLI
 * rewrites HTTP headers and query params, so an API call with a bearer token is
 * fine — but a multi-step *form* login (Continente: username -> password ->
 * OAuth code -> session cookie) puts the secret in a request body, where there
 * is nothing to hook into. Prefer OneCLI whenever the credential travels in a
 * header; reach for this column only when it cannot.
 *
 * Values are passed as `-e KEY=VALUE` at spawn and are scoped to the one agent
 * group. They never enter chat context or the model's prompt.
 *
 * Defaults to '{}' rather than NULL so readers can `JSON.parse` unconditionally,
 * matching the other JSON columns on this table (mcp_servers, packages_*).
 */
export const migration027: Migration = {
  // First shipped as 023 on this install; dedup is keyed on `name`, so the
  // renumber is safe. Never change the name.
  version: 27,
  name: 'container-config-env',
  async up(db) {
    await db.exec(`ALTER TABLE container_configs ADD COLUMN env TEXT NOT NULL DEFAULT '{}';`);
  },
};
