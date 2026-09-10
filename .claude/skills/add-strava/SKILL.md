---
name: add-strava
description: Add Strava as an MCP tool (activities, heart-rate zone analysis, streams) served by a local MCP server over the Strava REST API. OAuth tokens are managed host-side and resolved per request — no raw credentials reach the container, and tokens never go stale mid-session.
---

# Add Strava (Local MCP Server over the REST API)

This skill wires Strava into selected agent groups as an MCP tool. The host runs a
local MCP server (`src/strava-mcp.ts`, default port 10260) that speaks the MCP
protocol to the container and satisfies each tool call from the Strava REST API
(`https://www.strava.com/api/v3`).

Authentication uses Strava's standard OAuth 2.0 flow. A one-time script obtains
tokens, then the host-side `strava-token.ts` module auto-refreshes them before expiry.

Containers do **not** hold a Strava token. `materializeContainerJson` rewrites any MCP
server marked `Bearer {{strava}}` to point at the local server and strips the
Authorization header. The server resolves a fresh access token on **every request**.

## Why not `mcp.strava.com`?

Strava operates a hosted MCP endpoint, and this skill originally proxied to it. That
path is **closed to self-registered API applications** and is not usable here:

- `mcp.strava.com/mcp` trusts a dedicated issuer, `https://www.strava.com/mcp-issuer`,
  separate from the normal Strava OAuth server that issues our tokens.
- With **no** token it answers `401 unauthorized`; with a **valid** token from a
  self-registered app it answers `403 {"error":"forbidden","detail":"application not
  authorized"}`. The credential is fine — the *client* is refused.
- The issuer exposes a `registration_endpoint`, but dynamic client registration is
  rejected with `invalid_client_metadata`, so there is no self-service way in.
- Strava's [MCP Connector help article](https://support.strava.com/en-us/articles/15401531-strava-mcp-connector)
  describes access via official AI clients ("We're launching with Anthropic (Claude)"),
  not via personal API applications.

The same token works perfectly against `api.strava.com`, so the local server serves the
identical tool surface from REST. **A Strava subscription is required for the hosted MCP
but not for this path** — the REST API is available to any Strava API application.

If Strava later opens the MCP endpoint to self-registered clients, this can revert to a
pass-through proxy; nothing about the container config would need to change.

## Tools provided

| Tool | What it returns |
|------|-----------------|
| `list_activities` | Recent activities (`per_page`, or `days` window): distance, moving/elapsed time, elevation, avg/max HR |
| `get_activity_performance` | Full analysis of one activity: **time + % in each HR zone**, aerobic decoupling, first/second-half HR drift, laps, description, calories, suffer score |
| `get_activity_streams` | Raw streams (heartrate, time, distance, altitude, velocity_smooth, cadence), downsampled via `max_points` |

Heart-rate zones default to `DEFAULT_HR_ZONES` in `src/strava-mcp.ts`. Adjust them there
if the athlete's lactate-test zones differ.

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

The `Bearer {{strava}}` marker tells `resolveRemoteMcpTokens` in `src/container-config.ts` to repoint this server at the local MCP server and drop the header. The URL above is only a marker — the container is rewritten to `http://host.docker.internal:10260/` and never reaches `mcp.strava.com`. The token is resolved per request host-side, so it stays valid no matter how long the container runs.

### Restart the group

```bash
ncl groups restart --id <group-id> --message "Strava MCP added — you now have access to Strava activity data, stats, routes, and training zones."
```

## Phase 4: Build and Restart

```bash
pnpm run build
```

Restart the host so the new `strava-mcp.ts` / `strava-token.ts` modules are loaded:

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
- `Strava MCP port already in use` → another process owns the port; Strava MCP will not work until resolved. Note the OneCLI container publishes 10254–10255. Set `STRAVA_PROXY_PORT` in `.env` to a free port and restart.
- `Strava MCP server started` missing from the log → `data/strava-tokens.json` doesn't exist, so the server was skipped. Run the OAuth script.
- **Agent reports Strava wants an OAuth reconnect** (a `strava.com/oauth/mcp/authorize?...client_id=...` link) → do not click it; that link is built on a client_id that is not ours and can never work. It means something is still pointing at `mcp.strava.com` instead of the local server. Confirm the group's MCP url was rewritten to `host.docker.internal:10260`.
- **`403 {"error":"forbidden","detail":"application not authorized"}`** → something is reaching `mcp.strava.com` directly. That endpoint is closed to self-registered apps (see "Why not mcp.strava.com?" above). It is *not* a token problem: verify with
  `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" https://www.strava.com/api/v3/athlete` — a `200` there means the token is healthy and only the MCP client registration is refused.

### Verify the server directly

```bash
curl -s -X POST http://127.0.0.1:10260/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expect the three tool names. Then exercise a real activity:

```bash
curl -s -X POST http://127.0.0.1:10260/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_activities","arguments":{"per_page":3}}}'
```
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
