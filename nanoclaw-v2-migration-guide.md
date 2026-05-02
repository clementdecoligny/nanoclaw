# NanoClaw v1.2.52 → v2.0.0 Migration Guide

Your setup has 5 agent groups (`main`, `executive`, `finance`, `pepa`, `global`) and ~25 applied skills. This is a **Tier 3 (complex) migration** — the `/migrate-nanoclaw` skill handles the heavy lifting, but several things in your configuration need manual attention.

---

## What actually changes for you

| Area | v1 (your current state) | v2 |
|---|---|---|
| Central DB | `store/messages.db` | `data/v2.db` |
| Sessions | `store/messages.db` sessions table + JSONL | `data/v2-sessions/{group_id}/{session_id}/inbound.db` + `outbound.db` |
| Group config | `registered_groups` table in SQLite | `agent_groups` + `messaging_groups` + `messaging_group_agents` (wirings) |
| Per-group container config | `containerConfig` field in DB | `groups/{name}/container.json` file on disk |
| Agent runner | Node.js | **Bun 1.3.12** (TypeScript runs without compilation) |
| Channel adapters | Bundled in trunk | Must re-install via `/add-whatsapp`, `/add-telegram` |
| CLAUDE.md mount | Static file | Dynamically regenerated per-spawn, mounted read-only |
| Memory | `memory.md` (single file) | `memory/` subdirectory (multiple `.md` files) |
| Mount security policy | `~/.config/nanoclaw/sender-allowlist.json` | `~/.config/nanoclaw/mount-allowlist.json` |
| Credentials | OneCLI (already yours) | OneCLI — no change |

---

## Step 0 — Pre-flight check

Make sure you have a clean tree before starting:

```bash
git status --porcelain   # must be empty
git remote -v            # confirm 'upstream' points to qwibitai/nanoclaw
git fetch upstream --prune
```

If `upstream` is missing:

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git
git fetch upstream --prune
```

---

## Step 1 — Run `/migrate-nanoclaw` (Extract Phase)

This is the starting point. The skill will:
1. Analyze all your divergence from upstream
2. Identify which skills are applied vs. which files you modified manually
3. Ask you a few targeted questions about intent
4. Write a migration guide to `.nanoclaw-migrations/guide.md`

```
/migrate-nanoclaw
```

**When it asks about scope and tier:** it will detect Tier 3 (complex) due to your large number of applied skills plus custom finance code. Confirm that.

**When it asks which applied skills you customized further**, specifically flag:
- `add-finance` — you added WeasyPrint, custom Python scripts, and `send_document` IPC support after applying it
- `add-pepa` — you renamed the group from `telegram_main` to `pepa`
- Any other skill where you edited files after merging

---

## Step 2 — Review the generated migration guide before upgrading

After extraction, read `.nanoclaw-migrations/guide.md` carefully and verify these items specific to your setup:

### 2a. Finance group — WeasyPrint + Python scripts

Your Edmond agent relies on:
- `/opt/wpenv/bin/python3` (WeasyPrint virtualenv baked into the container image)
- Python scripts mounted at `/workspace/extra/finance/`
- `send_document` IPC (added in `src/ipc.ts`)

The guide should capture:
- The container build steps that install WeasyPrint (`container/build.sh` or `container/Dockerfile`)
- The `additionalMounts` config for the finance group pointing to finance scripts
- The `send_document` handler in `src/ipc.ts`

If any of these are missing from the guide, add them manually before proceeding to the upgrade.

### 2b. Global folder / shared workspace

Your `global` group is a shared data folder (not a standalone agent group) — Alain writes to `/workspace/global/calendar.md`, Pepa reads from it. In v2, cross-group workspace sharing is handled via `additionalMounts` in `container.json`. Verify the guide documents this mount for both the `executive` and `pepa` groups.

### 2c. Main group — registered_groups references

`groups/main/CLAUDE.md` contains detailed instructions referencing `/workspace/project/store/messages.db` and the `registered_groups` table. In v2 these no longer exist — they are replaced by `data/v2.db` with `agent_groups`, `messaging_groups`, and `messaging_group_agents` tables. The guide should note that Andy's CLAUDE.md will need these references updated post-migration.

### 2d. `send_document` IPC handler

This was added recently and is custom to your fork. Verify the guide captures the implementation in `src/ipc.ts` — it needs to be present in the v2 codebase after the upgrade.

---

## Step 3 — Run the Upgrade Phase

After reviewing and approving the guide, tell the skill to proceed with the upgrade. It will:
1. Create a backup branch and tag (`pre-migrate-<hash>-<timestamp>`)
2. Create a worktree from `upstream/main` (clean v2 base)
3. Re-merge all your skill branches
4. Reapply your customizations from the guide
5. Build and test in the worktree
6. Optionally do a live test before swapping

**When it offers a live test — say yes.** Given the complexity of your setup (WeasyPrint, Python scripts, multiple channels), it's worth confirming the finance and executive agents respond before fully swapping.

---

## Step 4 — Reinstall channel skills (mandatory after upgrade)

In v2, channel adapters are **not** in trunk. After the upgrade, reinstall each channel you use:

```
/add-whatsapp
/add-telegram
/add-gmail
```

Your existing WhatsApp auth credentials and Telegram bot token are in OneCLI — they will be picked up automatically.

---

## Step 5 — Migrate group configuration to v2 entity model

After the code upgrade, your groups need to be re-registered in the new `data/v2.db` schema. The `/migrate-nanoclaw` skill handles data migration automatically (Phase 3–4 of the skill), but verify each group comes through correctly:

| Your group | v1 folder | Expected v2 agent group name | Channel |
|---|---|---|---|
| Andy | `main` | `main` | WhatsApp (personal chat, `isMain: true`) |
| Alain | `executive` | `executive` | WhatsApp or Telegram |
| Edmond | `finance` | `finance` | Telegram |
| Pepa | `pepa` | `pepa` | Telegram (`@PepaLisboaBot`) |
| Global | `global` | Shared mount only — not a standalone agent group |

In v2 the `global` folder isn't registered as an agent group — it's purely a shared filesystem mount for Alain and Pepa. Verify `container.json` files are generated for both `executive` and `pepa` with the global mount:

```json
{
  "additionalMounts": [
    {
      "hostPath": "groups/global",
      "containerPath": "global",
      "readonly": false
    }
  ]
}
```

---

## Step 6 — Update Andy's CLAUDE.md for v2 APIs

`groups/main/CLAUDE.md` is your most complex CLAUDE.md. Several sections reference v1-specific internals and will need updating after migration:

**Remove these v1 references:**
- `/workspace/project/store/messages.db` → use `data/v2.db`
- `registered_groups` table → use `agent_groups` + `messaging_group_agents` tables
- `/workspace/project/data/registered_groups.json` (no longer exists)

**Update these patterns:**
- Group registration instructions now use the v2 wiring model (messaging group + agent group + wiring)
- The `containerConfig.additionalMounts` field in the DB is replaced by `container.json` files on disk

---

## Step 7 — Post-migration validation

Test each agent in order:

1. **Andy (main)** — send a message from WhatsApp, verify response. Ask him to list groups to confirm v2 DB reads correctly.
2. **Pepa** — send a meal planning request on Telegram `@PepaLisboaBot`. Verify she can read `global/calendar.md`.
3. **Alain** — send an email triage request. Verify Gmail access works through OneCLI.
4. **Edmond** — send a salary calculation request. Verify:
   - Python script runs at `/opt/wpenv/bin/python3`
   - `send_document` delivers a PDF to Telegram
   - Finance scripts are accessible at `/workspace/extra/finance/`

---

## Rollback

If anything breaks after the swap:

```bash
git reset --hard pre-migrate-<hash>-<timestamp>
npm install && npm run build
systemctl --user restart nanoclaw
```

The backup tag name is shown at the end of the upgrade phase output.

---

## Summary of manual work beyond the skill

The `/migrate-nanoclaw` skill handles ~80% of this. The remaining manual steps specific to your setup:

1. Reinstall `/add-whatsapp`, `/add-telegram`, `/add-gmail` after upgrade
2. Verify `global` shared mount is in `container.json` for both `executive` and `pepa`
3. Update Andy's CLAUDE.md DB references from v1 table names to v2 equivalents
4. Validate Edmond's WeasyPrint + `send_document` pipeline end-to-end
5. Confirm the finance group's `additionalMounts` for Python scripts survived migration
