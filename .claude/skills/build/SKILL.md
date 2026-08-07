---
name: build
description: Structured feature pipeline for NanoClaw — understand the problem, pick the right solution, audit edge cases, then implement with hard gates. Use when starting any non-trivial feature. Not for quick fixes or config changes.
---

# /build — Feature Pipeline

Three thinking phases before any code is written, then a disciplined implementation pipeline with hard gates. The thinking phases exist to understand the problem deeply, pick the right solution, and surface every edge case before implementation to give implementation agents a reliable spec and prevent rework.

## When to use

- New host-side features (routing, entity model, delivery)
- New channel adapters or provider integrations
- Agent-runner changes (MCP tools, poll loop, formatter)
- Any change touching more than two files or crossing the host/container boundary

**Skip for:** config tweaks, single-file bug fixes, documentation-only changes, skill installs.

---

## Nanoclaw Quick Reference

| Layer | Key files |
|-------|-----------|
| Host entry / init | `src/index.ts` |
| Inbound routing | `src/router.ts` |
| Outbound delivery | `src/delivery.ts` |
| Session manager | `src/session-manager.ts` |
| Container spawn | `src/container-runner.ts`, `src/container-runtime.ts` |
| Channel adapters | `src/channels/adapter.ts`, `src/channels/channel-registry.ts` |
| Central DB layer | `src/db/` (migrations in `src/db/migrations/`) |
| Admin CLI | `src/cli/dispatch.ts`, `src/cli/crud.ts`, `src/cli/resources/` |
| Agent runner (Bun) | `container/agent-runner/src/` |
| Container skills | `container/skills/` |
| Per-group config | `groups/<folder>/` (`CLAUDE.local.md` for persona, `container.json` materialized at spawn) |
| A2A routing | `src/modules/a2a/` (agent-to-agent message delivery) |
| Router hooks | `setSenderResolver`, `setAccessGate`, `setSenderScopeGate`, `setChannelRequestGate` — set in module init |

**Session DB tables:**
- `inbound.db`: `messages_in`, `delivered`, `destinations`, `session_routing`
- `outbound.db`: `messages_out`, `processing_ack`, `session_state` (SDK session resumption), `container_state` (stuck-tool detection)

**Invariants — never violate:**
- `inbound.db` — host writes only. `outbound.db` — container writes only.
- `journal_mode=DELETE` on session DBs — load-bearing for cross-mount visibility. WAL mode breaks across Docker bind mounts.
- Host must close DB connections after writing (invalidates container page cache for fresh reads).
- `on_wake` messages are only consumed by a fresh container's first poll — never set them from a dying container path.
- No secrets in env vars or chat context — credentials go through OneCLI only.
- Container runtime is Bun; host is Node/pnpm. They are separate package trees. Do not run `pnpm test` against `container/agent-runner/src/`.

---

## Phase 0 — Understand the problem

**Goal:** Build a precise picture of what problem we're solving and why it matters — before any solution discussion.

Ask questions until you can answer all of these:
- What actually goes wrong today, and how often?
- Who experiences it and what's their workaround?
- What does success look like in concrete, observable terms?
- What's the scope — one user, one workflow, one account type?

Keep asking until the answers are specific. Vague answers ("it's annoying", "it doesn't work well") mean the problem isn't understood yet.

Then write a **HMW (How Might We)** — one sentence that frames the problem space without prescribing a solution. This is the north star for everything that follows.

**Readiness check:**

| Question | Must answer yes before proceeding |
|----------|----------------------------------|
| Problem described without solution language? | ✓ |
| Specific scenario known (not hypothetical)? | ✓ |
| Success signal observable (not "feels better")? | ✓ |
| Scope is clear (who, what data, what accounts)? | ✓ |

If any answer is no — keep asking. Don't proceed on a fuzzy problem.

---

## Phase 1 — Pick the right solution

**Goal:** Understand what we're building and make sure it's the best path — not just the first path.

Ask: *"What solution do you have in mind?"* Then work through:

- Does it directly address the HMW?
- Are there simpler alternatives? (2 minutes of thought — not exhaustive ideation. "Is there a clearly simpler path?")
- What are the architectural constraints? (Entity model, container boundary, DB cross-write rules, existing scripts/tools already in place)
- What does the user need to do to trigger it, and what do they get back?

Write a one-paragraph **solution hypothesis**: what we're building, why it solves the HMW, and what the success signal looks like.

**Readiness check:**

| Question | Must answer yes before proceeding |
|----------|----------------------------------|
| Solution directly answers the HMW? | ✓ |
| No obviously simpler alternative? | ✓ |
| No known architectural blocker? | ✓ |
| Input and output clearly defined? | ✓ |

If any answer is no — resolve it before writing the spec.

---

## Phase 1.5 — Edge case audit

**Goal:** Surface every way the happy path can break before writing the spec. Edge cases found here become spec decisions. Edge cases found during implementation become rework.

Work through each axis systematically. Ask the user about each one — don't assume. Document every decision.

### Input & data quality
- What format is the input? What happens if it's malformed, empty, or missing?
- What if the user sends the wrong file, the wrong account, or a duplicate?
- What if a field is blank, null, or has an unexpected value?
- What if the data spans multiple months or the wrong month?
- Are there encoding, locale, or format variants to handle?

### Ambiguity & classification
- Where does the system have to make a choice that hasn't been defined?
- What happens when two valid options exist (e.g. same merchant, two categories)?
- How does the system signal uncertainty — does it guess, ask, or refuse?
- What's the fallback category / state when nothing fits?

### Sequencing & partial state
- What if only part of the expected input arrives (e.g. one file instead of two)?
- What if the user goes silent mid-flow?
- What if a step is triggered twice (duplicate upload, double confirmation)?
- What's the retry / follow-up behaviour and after how long?

### Confirmation & persistence
- What can be undone before the user confirms?
- What gets persisted, and only after what gate?
- What if the user wants to correct something after confirming?

### DB boundary
- Does this change read or write session DBs (`inbound.db` / `outbound.db`)? Which side (host or container)?
- Does any new write cross the one-writer-per-file rule?
- If it touches `inbound.db` schema — does the container reader need updating too?

### Container boundary
- What crosses host↔container? (message fields, new DB columns, MCP tool shapes)
- Does the container need a restart to pick up the change? Does it need an `on_wake` message?
- If `on_wake` is used — is it written *after* the old container is confirmed dead?

### Credentials & CLI scope
- Does this feature make outbound API calls? Are credentials handled via OneCLI only?
- Does it expose new `ncl` verbs or resources? What `cli_scope` level does it require?
- Are cross-group access paths explicitly blocked?

### Wiring & engage behaviour
- Does this change affect which agents engage? Consider `engage_mode` (`mention`, `pattern`, `mention-sticky`) and `sender_scope` (`all` / `known`).
- What happens to non-engaging agents — `ignored_message_policy`: `drop` (forget) or `accumulate` (carry forward for next wake)?
- Does the feature need a new wiring option in `messaging_group_agents`? If so, update `ncl wirings` CRUD and the session DB routing path.

### Skills delegation
- Does a dedicated skill already exist for this? (`/add-<channel>`, `/add-<provider>`, etc.)
- If yes — invoke the skill instead of implementing manually.

For each question: either get an explicit answer from the user, or write it as an explicit non-goal. Nothing is left as an assumption.

Write all decisions into a **decisions log** — a table of `Edge case → Decision`. This goes directly into the spec.

---

## Phase 2 — Spec

Write the spec to disk before any implementation agent is spawned. This is the single source of truth — all agents read it, and it must survive context compaction.

```
docs/features/<kebab-case-name>.md
```

Sections:
- **HMW** — from Phase 0
- **Solution hypothesis** — from Phase 1
- **Non-goals** — what this does not solve (prevents scope creep mid-implementation)
- **Edge cases & decisions** — the full decisions log from Phase 1.5
- **Entity model changes** — new tables/columns/migrations, or "none"
- **Session DB contract** — new fields in `inbound.db`/`outbound.db`, which side writes/reads, or "none"
- **Container boundary** — what crosses host↔container, or "none"
- **API contract** — new/changed TypeScript types, function signatures, MCP tool shapes
- **Affected files** — best-guess list to focus agents
- **Success signal** — observable golden path (message in → specific output), not vague

Show to the user, confirm, update if needed.

---

## Phase 2.5 — Write failing tests first

Before any implementation agent is spawned, write the tests that will validate the success signal and key edge cases from the spec. Tests must be **red** (failing, not erroring) before implementation starts.

For host-side changes:
```bash
pnpm test  # must see relevant tests failing
```

For container-side changes:
```bash
cd container/agent-runner && bun test  # must see relevant tests failing
```

Commit the failing tests. Implementation agents are told: *"Tests already exist and are red — make them green. Do not delete or skip tests to pass the gate."*

---

## Phase 3 — Backend

**Scope:** Host-side only — `src/`, `src/db/migrations/`, central DB changes, session DB schema (schema only, not container readers).

Spawn a backend agent:

> Read `docs/features/<name>.md` before writing any code. Implement the backend as described. Pay special attention to the "Edge cases & decisions" section — every decision there must be handled. If you touch files not in "Affected files", note it. When done, add "Implementation notes — backend" to the spec: contract decisions made (type shapes, column names, migration number).

**Gate A:**
```bash
pnpm run build && pnpm test
```

`pnpm test` runs vitest — host-side only (`src/`). Do not run it against `container/agent-runner/src/` (different runtime, wrong test framework). Green before proceeding. Two failed attempts at the same gate = stop and surface the root cause, don't keep iterating.

---

## Phase 4 — Frontend / Adapter

**Scope:** Container-side (`container/agent-runner/src/`), channel adapters (`src/channels/`), delivery-side — whatever the spec designates as frontend.

Spawn a frontend/adapter agent:

> Read `docs/features/<name>.md` before writing any code. Backend is implemented — read "Implementation notes — backend" for the exact contract to consume. Pay special attention to the "Edge cases & decisions" section. Implement the frontend/adapter portion. When done, add "Implementation notes — frontend" to the spec.

**Gate B:**
```bash
pnpm run build && pnpm test
```

If the spec's "Container boundary" is not "none", also run — these are not optional, a green `pnpm test` does not cover container code:
```bash
pnpm exec tsc -p container/agent-runner/tsconfig.json --noEmit
cd container/agent-runner && bun test
```

Green before proceeding.

---

## Phase 5 — /simplify

Invoke `/simplify`. Wait for it to complete.

**Gate C:**
```bash
pnpm run build && pnpm test
```

---

## Phase 6 — /review

Invoke `/review` with this context:

> Review changes against `docs/features/<name>.md`. Does the implementation match the HMW, the API contract, and the success signal? Check every item in "Edge cases & decisions" — is each one handled correctly? Flag spec drift, unhandled error states, and any of these as blocking: session DB writer-rule violations (cross-mount writes), `on_wake` race conditions (dying container stealing the message), `cli_scope` enforcement gaps for any new `ncl` verbs, credentials passed outside OneCLI. If behavior is user-visible, are product-docs updated?

Address flagged issues. Then **Gate D — smoke test:**

```bash
pnpm run build
```

Start the service, manually verify:
- Happy path end-to-end (matches the success signal in the spec)
- At least two edge cases from the decisions log
- No regression in an adjacent flow (routing, delivery, or container wake — whichever is closest to what changed)

**Gate D — product-docs (mandatory per CLAUDE.md):**
- Does this feature change a user-visible workflow? → update the relevant page in `product-docs/`
- Does it move something from "limitation" to "active"? → update it
- Does it add a new agent workflow? → new page

This is not optional. The commit must include `product-docs/` changes alongside the code.

---

## Phase 7 — Commit

Only commit once all four gates are green and the smoke test passed.

Stage deliberately — no `git add -A`. Exclude:
- `groups/` contents
- `.claude/settings.json`, `.claude/settings.local.json`
- `.env`, `data/`, `logs/`

Include `docs/features/<name>.md` in the commit alongside the code.

Commit message: subject line under 72 chars, blank line, bullets for non-obvious decisions only.

Ask before pushing.

---

## Deviations

- **Host-only feature:** Skip agent-runner typecheck in Gate B. Phases 3 and 4 may collapse into one agent.
- **Container-only feature:** Phase 3 is minimal (schema/types only); Phase 4 carries the weight.
- **Spec wrong mid-implementation:** Update the spec file immediately. Stale spec = agent drift.
- **You arrive with a fully-formed solution:** Still run Phases 0, 1, and 1.5 — takes 10 minutes and catches the edge cases that cause rework. At minimum, write the HMW, confirm the solution answers it, and run the edge case audit axes.
- **Simple feature with obvious edge cases:** Phase 1.5 can be fast — run through the axes in one pass, document the answers, move on. The point is to make decisions explicit, not to be exhaustive for its own sake.
