/**
 * Strava MCP proxy — keeps containers off expiring credentials.
 *
 * Strava access tokens live 6 hours. Injecting one into `container.json` at
 * spawn time (the previous approach) freezes it for the life of the container,
 * so any session outliving the token started getting 401s from
 * `mcp.strava.com`. The remote endpoint answers those by advertising its own
 * OAuth flow, which surfaced to users as "Strava disconnected, click this link"
 * — a link built on Strava's client_id, not ours, so it could never work.
 *
 * This proxy resolves the token per request instead. Containers point their
 * Strava MCP server at the proxy with no Authorization header of their own;
 * the proxy calls getStravaAccessToken() (which refreshes 5 minutes before
 * expiry) and injects the result on the way through. A container can now run
 * indefinitely across any number of token rotations.
 *
 * Bonus: the container never holds a Strava credential at all, restoring the
 * v2 invariant that raw credentials stay host-side.
 */
import { createServer, Server } from 'http';
import { request as httpRequest, RequestOptions } from 'http';
import { request as httpsRequest } from 'https';

import { log as logger } from './log.js';
import { getStravaAccessToken } from './strava-token.js';

export const STRAVA_MCP_UPSTREAM = 'https://mcp.strava.com/mcp';

/**
 * Start the Strava MCP proxy.
 *
 * @param port      Port to listen on. 0 picks a free port (used by tests).
 * @param host      Bind address. Defaults to all interfaces so containers can
 *                  reach it via host.docker.internal; pass 127.0.0.1 to keep
 *                  it host-local.
 * @param upstream  Upstream MCP URL. Overridable for tests.
 */
export function startStravaProxy(
  port: number,
  host = '0.0.0.0',
  upstream: string = STRAVA_MCP_UPSTREAM,
): Promise<Server> {
  const upstreamUrl = new URL(upstream);
  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        void (async () => {
          const body = Buffer.concat(chunks);

          // Resolved per request — this is what makes the proxy immune to the
          // 6-hour expiry that broke the spawn-time injection.
          let token: string | null;
          try {
            token = await getStravaAccessToken();
          } catch (err) {
            logger.error('Strava proxy token resolution threw', { err });
            token = null;
          }

          if (!token) {
            // Fail loudly rather than forwarding an unauthenticated request:
            // the upstream would answer with its bogus OAuth dance, which is
            // exactly the confusing failure mode this module exists to kill.
            logger.error('Strava proxy has no access token — refusing request', { url: req.url });
            res.writeHead(503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Strava credentials unavailable on host' }));
            return;
          }

          const headers: Record<string, string | number | string[] | undefined> = {
            ...(req.headers as Record<string, string>),
            host: upstreamUrl.host,
            'content-length': body.length,
          };

          // Hop-by-hop headers must not be forwarded by a proxy.
          delete headers['connection'];
          delete headers['keep-alive'];
          delete headers['transfer-encoding'];

          // Always ours, never whatever the container happened to send.
          delete headers['authorization'];
          headers['authorization'] = `Bearer ${token}`;

          const upstreamReq = makeRequest(
            {
              hostname: upstreamUrl.hostname,
              port: upstreamUrl.port || (isHttps ? 443 : 80),
              path: upstreamUrl.pathname,
              method: req.method,
              headers,
            } as RequestOptions,
            (upRes) => {
              res.writeHead(upRes.statusCode!, upRes.headers);
              upRes.pipe(res);
            },
          );

          upstreamReq.on('error', (err) => {
            logger.error('Strava proxy upstream error', { err, url: req.url });
            if (!res.headersSent) {
              res.writeHead(502, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad Gateway' }));
            }
          });

          upstreamReq.write(body);
          upstreamReq.end();
        })();
      });
    });

    server.listen(port, host, () => {
      const addr = server.address();
      logger.info('Strava MCP proxy started', {
        port: typeof addr === 'object' && addr ? addr.port : port,
        host,
        upstream,
      });
      resolve(server);
    });

    server.on('error', reject);
  });
}
