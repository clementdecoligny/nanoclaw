# `/model` admin command

## HMW

How might we let an admin switch a NanoClaw agent's model and reasoning effort (including a "deep research" tier) directly from chat, without needing the `ncl` CLI or shell access?

## Solution hypothesis

`/model` is admin-gated at the host command gate, then handed to the agent as a normal instruction. The agent runs the interaction using tools it *already has*: `ask_user_question` (a blocking MCP tool that renders a Chat-SDK button card and returns the clicked value inline) for the wizard, and one new fire-and-forget tool `set_model_config` to apply the choice. The host applies it to `container_configs` and restarts the container.

Two entry points:
- `/model` → agent asks model (4 buttons), then effort (5 buttons), then applies both.
- `/model opus` → agent applies the model directly, no cards.

Success signal: admin sends `/model` in Telegram, taps two buttons, gets a confirmation, and the agent's next reply runs on the new config.

## Why this shape (design note)

An earlier iteration tried to make the whole flow host-side with zero LLM turns, using `pending_approvals` + a bespoke response handler + a parallel card-delivery path. That cost ~240 lines of new machinery to save one cheap agent turn, and it duplicated a card system that already exists.

The deciding fact: **`ask_user_question` is blocking** (`container/agent-runner/src/mcp-tools/interactive.ts`) — it writes the card, polls `messages_in`, and returns the clicked value as the tool result. The wizard therefore costs **one** agent turn total, not one per click, and needs no new click-routing whatsoever.

## Non-goals

- No per-session override — always the agent group's persistent default in `container_configs`.
- No separate "deep research" toggle — folded into the effort picker; `xhigh`/`max` IS the deep-research tier.
- No custom/typed model IDs from the picker — only `opus`, `sonnet`, `haiku` (+ "Keep current" in the wizard). Full model IDs stay settable via `ncl groups config update`.
- No `/effort <level>` shortcut — the wizard's "Keep current" model option covers effort-only changes.
- No new host-side card delivery, no `pending_approvals` usage, no new response handler. Reuse `ask_user_question` as-is.
- No admin approval on `set_model_config` — `/model` is already admin-gated at the command gate, and unlike `install_packages` this changes no code or dependencies.
- No changes to `src/session-commands.ts` (unrelated dead code).

## Edge cases & decisions

| Edge case | Decision |
|---|---|
| Who can run `/model`? | Admin-only (owner / global admin / admin scoped to the agent group), enforced in `command-gate.ts` via `user_roles`. Non-admins get the standard "Permission denied" reply. |
| Where does the card appear? | The chat the command was typed in — automatic, since `ask_user_question` uses the session's own routing. |
| Admin abandons the wizard | `ask_user_question` times out after its default 300s and returns an error to the agent, which reports it. No persistent state to clean up. |
| Models offered | 4 buttons: Opus, Sonnet, Haiku, Keep current. Current model shown in the question text. |
| Effort levels offered | 5 buttons: low, medium, high, xhigh, max — the exact `ProviderOptions.effort` union. |
| `/model <alias>` | Valid alias (`opus`/`sonnet`/`haiku`, case-insensitive) → apply model only, effort untouched, no cards. |
| `/model <invalid>` | Agent replies with the valid options; nothing changes. Validated again host-side in the delivery handler. |
| No running container | `restartAgentGroupContainers` restarts 0 sessions; confirmation says the change applies on the next message. |
| Running container | Killed and immediately respawned (a `wakeMessage` is required for respawn — without it `container-restart.ts` kills without restarting). |
| Multi-agent chat | Each wired agent handles its own `/model` independently, same as `/clear` today. No special-casing. |
| Bad values reaching the host | The delivery handler re-validates model against the alias list and effort against the enum before writing (defense in depth, mirroring `self-mod`'s tool-boundary + host-side double validation). |

## Entity model changes

None. Writes existing `container_configs.model` / `.effort` columns. No migration.

## Session DB contract

Nothing new. `set_model_config` writes a `system`-kind row to `messages_out` (existing container→host path); the card flow uses the existing `ask_question` / `pending_questions` / `question_response` machinery unchanged.

## Container boundary

New MCP tool `set_model_config` in `container/agent-runner/src/mcp-tools/self-mod.ts`, writing `{ action: 'set_model_config', model?, effort? }`. Matched host-side by a `registerDeliveryAction('set_model_config', ...)` handler. Container picks up new values on restart (existing mechanism).

## API contract

**Container** (`container/agent-runner/src/mcp-tools/self-mod.ts`):
```ts
set_model_config({ model?: 'opus'|'sonnet'|'haiku', effort?: 'low'|'medium'|'high'|'xhigh'|'max' })
// fire-and-forget; writes a system action row, returns immediately
```

**Host** (`src/modules/self-mod/`): `handleSetModelConfig` delivery action —
validate → `updateContainerConfigScalars(agentGroupId, { model?, effort? })` →
`restartAgentGroupContainers(agentGroupId, 'model command', 'Model/effort updated — resuming.')`.

**Gate** (`src/command-gate.ts`, already implemented): `GateResult` gains `{ action: 'model'; argument?: string }`; `/model` is admin-gated and never passed through to the SDK as raw text.

**Router** (`src/router.ts`): on `gate.action === 'model'`, rewrite the inbound message content into an instruction for the agent (bare → run the wizard; with argument → apply directly), then continue the normal `writeSessionMessage` + wake path.

## Affected files

- `src/command-gate.ts` — done.
- `src/session-manager.ts` — `writeOutboundDirect` readonly-DB bugfix (pre-existing bug, surfaced by these tests).
- `src/router.ts` — handle `gate.action === 'model'`.
- `container/agent-runner/src/mcp-tools/self-mod.ts` — `set_model_config` tool.
- `src/modules/self-mod/request.ts` + `index.ts` — delivery action + registration.
- `src/command-gate.test.ts` — done (10 green).
- `src/host-core.test.ts` — router-level `/model` tests.
- `product-docs/` — user-facing note that `/model` exists.

## Success signal

1. **Wizard**: `/model` → "Choose model (current: opus): [Opus][Sonnet][Haiku][Keep current]" → tap Sonnet → "Choose effort (current: high): [low][medium][high][xhigh][max]" → tap xhigh → "Model set to sonnet, effort set to xhigh." → `container_configs` updated, container restarted.
2. **Shortcut**: `/model opus` → no cards → "Model set to opus." → `container_configs.model = 'opus'`, effort untouched.
