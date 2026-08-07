import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration022: Migration = {
  version: 22,
  // NOTE: dedup is keyed on `name`, not `version` — this value is already
  // recorded in schema_version on existing installs. Do not change it, or the
  // ALTER re-runs and fails on a duplicate column.
  name: 'container-configs-pip',
  up(db: Database.Database) {
    // Add a pip package channel to per-agent-group container config, parallel
    // to packages_apt / packages_npm. Installed into the base image's
    // /opt/wpenv venv at per-group build time. See src/container-runner.ts.
    db.exec(`ALTER TABLE container_configs ADD COLUMN packages_pip TEXT NOT NULL DEFAULT '[]';`);
  },
};
