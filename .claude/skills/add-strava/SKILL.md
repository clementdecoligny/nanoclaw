---
name: add-strava
description: Add Strava as an MCP tool (activities, stats, routes, training zones) using the official Strava MCP endpoint. OAuth tokens are managed host-side and injected per request by a local proxy — no raw credentials reach the container, and tokens never go stale mid-session.
---

# Add Strava (Official MCP Endpoint)

This skill wires the official Strava MCP endpoint (`https://mcp.strava.com/mcp`) into selected agent groups using HTTP transport. Unlike stdio-based MCP servers, this is a remote endpoint — the container connects directly to Strava's hosted MCP service.

Authentication uses Strava's standard OAuth 2.0 flow. A one-time script obtains tokens, then the host-side `strava-token.ts` module auto-refreshes them before expiry.

Containers do **not** hold a Strava token. `materializeContainerJson` rewrites any MCP server marked `Bearer {{strava}}` to point at a host-side proxy (`src/strava-proxy.ts`, default port 10260) and strips the Authorization header. The proxy resolves a fresh access token on **every request** and injects it before forwarding to `https://mcp.strava.com/mcp`.

**Why this pattern:** Strava access tokens expire after 6 hours, but `container.json` is only materialized at spawn time. Injecting the token there froze it for the container's lifetime — any session running longer than 6h started getting 401s, which `mcp.strava.com` reports by advertising its own OAuth flow. Users saw a "reconnect Strava" link built on Strava's `client_id` that could never work, and the only fix was restarting the container. Resolving per request removes the expiry window entirely, and upholds v2's invariant that raw credentials never reach a container.

**Dependency:** This skill requires remote MCP type support (`McpServerRemoteConfig` in `src/container-config.ts`). If the types aren't present, apply the remote MCP types PR first.

## Phase 1: Pre-flight

### Check remote MCP type support

```bash
grep -q 'McpServerRemoteConfig' src/container-config.ts && echo "OK — remote MCP types present" || echo "MISSING — apply remote MCP types PR first"
```

If missing, tell the user:

> Remote MCP types (`McpServerRemoteConfig` with `url` and `headers` fields) are required for Strava's hosted MCP endpoint. Apply the remote MCP types PR first, then re-run this skill.

**STOP** if the types are missing. The rest of this skill depends on them.

### Check if Strava is already configured

```bash
ls -la data/strava-tokens.json 2>&1
```

If the file exists and contains valid tokens, skip to Phase 3 (wiring). If it exists but is stale or corrupt, delete it and proceed to Phase 2.

## Phase 2: Strava API App + OAuth

### Create a Strava API app

Tell the user:

> 1. Go to https://www.strava.com/settings/api
> 2. Create an application:
>    - **Application Name**: anything (e.g., "NanoClaw")
>    - **Category**: pick any
>    - **Website**: `http://localhost`
>    - **Authorization Callback Domain**: `localhost`
> 3. Note the **Client ID** and **Client Secret** from the app page.

Ask the user for `client_id` and `client_secret`.

### Run the OAuth flow

```bash
pnpm exec tsx scripts/strava-oauth.ts <client_id> <client_secret>
```

This opens a browser for Strava authorization, captures the callback on `localhost:9876`, exchanges for tokens, and saves them to `data/strava-tokens.json`.

### Verify tokens were saved

```bash
cat data/strava-tokens.json | head -5
```

Expected: a JSON object with `access_token`, `refresh_token`, `expires_at`, and athlete info.

## Phase 3: Wire to Agent Group(s)

### List groups

```bash
ncl groups list
```

Ask the user which agent group(s) should get Strava access.

### Add the Strava MCP server

For each chosen `<group-id>`:

```bash
ncl groups config add-mcp-server \
  --id <group-id> \
  --name strava \
  --type http \
  --url https://mcp.strava.com/mcp \
  --headers '{"Authorization": "Bearer {{strava}}"}'
```

The `Bearer {{strava}}` marker tells `resolveRemoteMcpTokens` in `src/container-config.ts` to repoint this server at the host proxy and drop the header. The token itself is injected per request by the proxy, so it stays valid no matter how long the container runs.

### Restart the group

```bash
ncl groups restart --id <group-id> --message "Strava MCP added — you now have access to Strava activity data, stats, routes, and training zones."
```

## Phase 4: Build and Restart

```bash
pnpm run build
```

Restart the host so the new `strava-token.ts` module is loaded:

```bash
source setup/lib/install-slug.sh
launchctl kickstart -k gui/$(id -u)/$(launchd_label)  # macOS
systemctl --user restart $(systemd_unit)              # Linux
```

## Phase 5: Verify

### Test from a wired agent

Tell the user:

> In your agent chat, send: **"What were my last 5 Strava activities?"** or **"Show my Strava stats for this year"**.
>
> The agent should use Strava MCP tools. The first call may take a moment while the MCP connection is established.

### Check logs if the tool isn't working

```bash
tail -100 logs/nanoclaw.log logs/nanoclaw.error.log | grep -iE 'strava|mcp'
```

Common signals:
- `Strava token refresh failed` → check that `data/strava-tokens.json` has valid `client_id`, `client_secret`, and `refresh_token`. Re-run the OAuth script if needed.
- `Strava proxy port already in use` → another process owns the port; Strava MCP will not work until resolved. Note the OneCLI container publishes 10254–10255. Set `STRAVA_PROXY_PORT` in `.env` to a free port and restart.
- **Agent reports Strava wants an OAuth reconnect** (a `strava.com/oauth/mcp/authorize?...client_id=...` link) → the upstream is rejecting the token. That link is Strava's own client_id and will never work; do not click it. Check for `Strava proxy has no access token` or a refresh failure in the error log.
- `Strava MCP proxy started` missing from the log → `data/strava-tokens.json` doesn't exist, so the proxy was skipped. Run the OAuth script.
- `Bearer {{strava}}` appears literally in `container.json` → `resolveRemoteMcpTokens` didn't run. Ensure `pnpm run build` completed and the group was re-materialized (restart the group).
- Connection timeout to `host.docker.internal:<port>` from the container → the proxy isn't bound, or bound to `127.0.0.1` instead of `0.0.0.0`. Verify with `ss -ltn | grep <port>`.
- **HTTP 000 from inside a real agent container, but 200 from an ad-hoc `docker run`** → `NO_PROXY` is missing. OneCLI sets `HTTP_PROXY` in agent containers, which captures host-local requests too and tunnels them into a gateway with no route for them. Check with `docker exec <container> env | grep -i no_proxy`; it must list `host.docker.internal`. Set in `src/container-runner.ts` via `buildNoProxyValue`. Note that ad-hoc `docker run` containers have no `HTTP_PROXY`, so they will not reproduce this — always verify from a real agent container.
- Agent says "I don't have Strava tools" → the `strava` MCP server isn't registered in this group's `mcpServers` (re-run the `ncl groups config add-mcp-server` step).

Verify the whole path from inside a container:

```bash
docker run --rm --add-host=host.docker.internal:host-gateway curlimages/curl:latest \
  -s -X POST http://host.docker.internal:10260/ \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect a `tools` list. A 503 means the host has no usable Strava token.

## Removal

1. For each group that had Strava wired, remove the MCP server:
   ```bash
   ncl groups config remove-mcp-server --id <group-id> --name strava
   ```
2. Remove the token file:
   ```bash
   rm data/strava-tokens.json
   ```
3. Optionally remove `src/strava-token.ts`, `src/strava-proxy.ts`, the proxy start/stop block in `src/index.ts`, and the `resolveRemoteMcpTokens` block in `src/container-config.ts` if no other remote MCP integrations use this pattern.
4. `pnpm run build` and restart the host.
5. Optionally delete the Strava API app at https://www.strava.com/settings/api.

## Notes

- **Token refresh is automatic.** The host refreshes the access token 5 minutes before expiry. Strava access tokens last 6 hours; refresh tokens don't expire (unless the user deauthorizes the app).
- **Long-lived containers are safe.** Because the proxy resolves the token per request, a container that runs for days keeps working across every token rotation. No restart is ever needed to "reconnect" Strava.
- **The proxy binds on `0.0.0.0`** so containers can reach it via `host.docker.internal`. Default port is **10260**, chosen to avoid 10254–10255 (published by the OneCLI container). Override with `STRAVA_PROXY_PORT` in `.env` if it collides. It only starts when `data/strava-tokens.json` exists.
- **No container image rebuild needed.** Unlike stdio MCP servers (gmail, calendar), the Strava MCP runs remotely — no binary is installed in the container image.
- **No additional mounts needed.** Tokens live in `data/strava-tokens.json` on the host and never leave it — `container.json` carries only the proxy URL and an empty header set.
- **Scope is read-only.** The OAuth scopes requested are `read,read_all,activity:read,activity:read_all,profile:read_all`. No write access to Strava data.
- **One athlete per install.** The token file holds credentials for a single Strava account. Multi-athlete support would need per-group token files (not implemented).
