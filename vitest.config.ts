import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // container/agent-runner tests run under Bun (they depend on bun:sqlite).
    // See container/agent-runner/package.json "test" script.
    // container/*.test.ts: top-level only — container/agent-runner tests run
    // under Bun (they depend on bun:sqlite) and must not be picked up here.
    include: ['src/**/*.test.ts', 'setup/**/*.test.ts', 'scripts/**/*.test.ts', 'container/*.test.ts'],

    // Tests that touch session DBs are fsync-bound, not CPU-bound. Session DBs
    // run journal_mode=DELETE (load-bearing for cross-mount visibility — see
    // src/db/session-db.ts), so every commit creates, fsyncs and unlinks a
    // journal file. On slow-fsync hosts (WSL2 measures ~148ms per fsync) that
    // is ~325ms per write, and the 5s default fires mid-test.
    //
    // src/db/session-db.ts drops to synchronous=OFF under VITEST, which brings
    // that back to ~0.4ms per write. This timeout is the backstop for hosts
    // where fsync is slow anyway; it should not be load-bearing in practice.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
