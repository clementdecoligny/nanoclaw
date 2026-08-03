import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

// Token source is mocked so tests control exactly what the proxy resolves
// per request — that per-request freshness is the whole point of this module.
const tokenState = { value: null as string | null, calls: 0 };
vi.mock('./strava-token.js', () => ({
  getStravaAccessToken: vi.fn(async () => {
    tokenState.calls++;
    return tokenState.value;
  }),
}));

vi.mock('./log.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { startStravaProxy } from './strava-proxy.js';

function makeRequest(
  port: number,
  options: http.RequestOptions,
  body = '',
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, hostname: '127.0.0.1', port }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode!,
          body: Buffer.concat(chunks).toString(),
          headers: res.headers,
        }),
      );
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('strava-proxy', () => {
  let proxyServer: http.Server;
  let upstreamServer: http.Server;
  let received: { headers: http.IncomingHttpHeaders; url: string; method: string; body: string }[];

  beforeEach(async () => {
    tokenState.value = 'fresh-token-1';
    tokenState.calls = 0;
    received = [];

    upstreamServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          headers: req.headers,
          url: req.url!,
          method: req.method!,
          body: Buffer.concat(chunks).toString(),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((r) => upstreamServer.listen(0, '127.0.0.1', r));
    const upstreamPort = (upstreamServer.address() as AddressInfo).port;

    proxyServer = await startStravaProxy(0, '127.0.0.1', `http://127.0.0.1:${upstreamPort}/mcp`);
  });

  afterEach(async () => {
    await new Promise<void>((r) => proxyServer.close(() => r()));
    await new Promise<void>((r) => upstreamServer.close(() => r()));
  });

  function proxyPort(): number {
    return (proxyServer.address() as AddressInfo).port;
  }

  it('injects the current access token as a Bearer header', async () => {
    await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    expect(received).toHaveLength(1);
    expect(received[0].headers.authorization).toBe('Bearer fresh-token-1');
  });

  it('resolves the token on every request, not once at startup', async () => {
    await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    // Simulate the 6-hour expiry boundary: host refreshes, token rotates.
    tokenState.value = 'fresh-token-2';
    await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    expect(tokenState.calls).toBe(2);
    expect(received[0].headers.authorization).toBe('Bearer fresh-token-1');
    expect(received[1].headers.authorization).toBe('Bearer fresh-token-2');
  });

  it('overwrites any Authorization header supplied by the container', async () => {
    await makeRequest(
      proxyPort(),
      { method: 'POST', path: '/', headers: { authorization: 'Bearer stale-container-token' } },
      '{}',
    );

    expect(received[0].headers.authorization).toBe('Bearer fresh-token-1');
  });

  it('forwards method, body and path to the upstream MCP endpoint', async () => {
    await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{"jsonrpc":"2.0"}');

    expect(received[0].method).toBe('POST');
    expect(received[0].body).toBe('{"jsonrpc":"2.0"}');
    expect(received[0].url).toBe('/mcp');
  });

  it('sets the Host header to the upstream host, not the proxy', async () => {
    await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    expect(received[0].headers.host).toBe(
      `127.0.0.1:${(upstreamServer.address() as AddressInfo).port}`,
    );
  });

  it('strips hop-by-hop headers before forwarding', async () => {
    await makeRequest(
      proxyPort(),
      {
        method: 'POST',
        path: '/',
        // `connection` is deliberately not asserted: Node's http client always
        // re-adds `connection: keep-alive` on the outgoing socket after the
        // proxy deletes it, so asserting on it would test Node, not us.
        headers: { 'transfer-encoding': 'chunked', 'keep-alive': 'timeout=5' },
      },
      '{}',
    );

    expect(received[0].headers['keep-alive']).toBeUndefined();
    expect(received[0].headers['transfer-encoding']).toBeUndefined();
    // Body still arrives intact with an explicit content-length instead.
    expect(received[0].body).toBe('{}');
    expect(received[0].headers['content-length']).toBe('2');
  });

  it('returns 503 without calling upstream when no token is available', async () => {
    tokenState.value = null;

    const res = await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    expect(res.statusCode).toBe(503);
    expect(received).toHaveLength(0);
  });

  it('passes the upstream status code and body back to the caller', async () => {
    const res = await makeRequest(proxyPort(), { method: 'POST', path: '/' }, '{}');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
