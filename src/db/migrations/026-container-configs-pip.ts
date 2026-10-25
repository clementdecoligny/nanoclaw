import type { Migration } from './index.js';

export const migration026: Migration = {
  version: 26,
  // NOTE: dedup is keyed on `name`, not `version`. This install first shipped
  // it as 022; the name is already recorded in schema_version, so renumbering
  // the file is safe. Never change the name, or the ALTER re-runs and fails on
  // a duplicate column.
  name: 'container-configs-pip',
  async up(db) {
    // Add a pip package channel to per-agent-group container config, parallel
    // to packages_apt / packages_npm. Installed into the base image's
    // /opt/wpenv venv at per-group build time. See src/container-runner.ts.
    await db.exec(`ALTER TABLE container_configs ADD COLUMN packages_pip TEXT NOT NULL DEFAULT '[]';`);
  },
};
