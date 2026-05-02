# NanoClaw Migration Guide

Generated: 2026-05-01
Base: 934f063aff5c30e7b49ce58b53b41901d3472a3e
HEAD at generation: 88661d626dfb02033e556d9b4ac88e81b9e27b01
Upstream (v2): 663d9a409190bd1e79fa505fae04644dcdab2429

---

## Migration Plan

**Tier 3 — Complex.** 602 upstream commits, 78 user commits, 93 changed files.

### Order of Operations

**Stage 1 — Channel skills** (apply first, these are the largest blast radius)
1. Merge `upstream/channels` to get telegram + gmail adapters in v2 form
2. Reapply telegram customizations on top (3-bot setup, status, sendDocument, voice)
3. Reapply gmail container-side MCP registration
4. Validate: `npm install && npm run build`

**Stage 2 — Core src customizations**
5. `src/ipc.ts` — send_document IPC
6. `src/types.ts` — botName, sendStatus, sendDocument on Channel interface
7. `src/db.ts` — bot_name column (may need adaptation to v2 entity model)
8. `src/container-runner.ts` — env injection from data/env/env + Gmail mount
9. `src/group-queue.ts` — alert callback on max retries
10. `src/index.ts` — status messages, tool labels, alert wiring
11. `src/router.ts` + `src/text-styles.ts` — channel-native text formatting
12. `src/transcription.ts` — voice transcription module
13. Validate: `npm run build && npm test`

**Stage 3 — Container**
14. `container/Dockerfile` — WeasyPrint Python venv layer
15. `container/agent-runner/src/index.ts` — Gmail MCP + tool observability (Bun-adapted)
16. `container/agent-runner/src/ipc-mcp-stdio.ts` — send_document MCP tool
17. Copy `scripts/finance/` and `scripts/continente/`
18. Rebuild container image: `./container/build.sh`

**Stage 4 — Skills and groups**
19. Copy custom skills: `.claude/skills/add-pepa/`, `.claude/skills/add-continente/`, `.claude/skills/add-finance/`
20. Copy all `groups/*/CLAUDE.md` files (user content, copy verbatim)

### Risk Areas

| Area | Risk | Notes |
|---|---|---|
| `src/channels/telegram.ts` | High | v2 version will be different; 3-bot config must be reapplied carefully |
| `container/agent-runner/src/index.ts` | High | v2 uses Bun, file is substantially rewritten; Gmail MCP needs re-adaptation |
| `src/db.ts` | Medium | `registered_groups` replaced by v2 entity model; `bot_name` may move to `agent_groups` |
| `src/container-runner.ts` | Medium | v2 OneCLI-first; `data/env/env` injection may partially overlap with v2 patterns |
| `src/index.ts` | Medium | Heavily changed in v2; status message and alert wiring need re-adaptation |

---

## Applied Skills

These are re-applied by merging the relevant upstream branches in the worktree.

| Skill | Branch | Notes |
|---|---|---|
| Telegram channel | `upstream/channels` | Contains telegram adapter; v2 uses single channels branch |
| Gmail channel | `upstream/channels` | Contains gmail adapter; same branch as telegram |
| Channel formatting | `upstream/skill/channel-formatting` | Base text style support |

**Custom skills (copy as-is from main tree, not from upstream branches):**
- `.claude/skills/add-pepa/` — family meal agent skill (user-created)
- `.claude/skills/add-continente/` — Continente.pt grocery automation skill (user-created)
- `.claude/skills/add-finance/` — finance manager skill (user-created)

---

## Skill Interactions

**telegram + gmail** both modify `container/agent-runner/src/index.ts`:
- telegram uses it for tool observability (NANOCLAW_TOOL stdout signals)
- gmail uses it for Gmail MCP server registration
- In the current fork both coexist cleanly (confirmed: no conflicts)
- When reapplying, add both changes to the same file in sequence

**telegram + channel-formatting** both modify `src/router.ts` and `src/index.ts`:
- channel-formatting adds `parseTextStyles()` call in `formatOutbound()`
- telegram adds sendDocument/sendStatus wiring in index.ts
- No conflict in current fork; apply formatting merge first, then telegram customizations on top

---

## Section Files

| File | Contents |
|---|---|
| [skills-channels.md](skills-channels.md) | Telegram 3-bot setup, Gmail MCP, all channel customizations |
| [customizations-src.md](customizations-src.md) | All src/*.ts changes (IPC, DB, container-runner, router, types) |
| [customizations-container.md](customizations-container.md) | Dockerfile + agent-runner changes |
| [customizations-scripts.md](customizations-scripts.md) | Finance Python scripts + Continente TypeScript scripts |
