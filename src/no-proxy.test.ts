import { describe, expect, it } from 'vitest';

import { buildNoProxyValue } from './no-proxy.js';

describe('buildNoProxyValue', () => {
  it('includes host.docker.internal so host-local services bypass the gateway', () => {
    // OneCLI sets HTTP_PROXY to its gateway. Without an exemption, a request
    // to a *different* host-local port (e.g. the Strava proxy) is tunnelled
    // through OneCLI, which has no route for it and drops the connection.
    const v = buildNoProxyValue(undefined);
    expect(v.split(',')).toContain('host.docker.internal');
  });

  it('exempts localhost and loopback too', () => {
    const parts = buildNoProxyValue(undefined).split(',');
    expect(parts).toContain('localhost');
    expect(parts).toContain('127.0.0.1');
  });

  it('preserves entries contributed by a provider', () => {
    const parts = buildNoProxyValue('example.internal,10.0.0.5').split(',');
    expect(parts).toContain('example.internal');
    expect(parts).toContain('10.0.0.5');
    expect(parts).toContain('host.docker.internal');
  });

  it('does not duplicate an entry the provider already supplied', () => {
    const parts = buildNoProxyValue('host.docker.internal').split(',');
    expect(parts.filter((p) => p === 'host.docker.internal')).toHaveLength(1);
  });

  it('ignores blank and whitespace-only provider entries', () => {
    const parts = buildNoProxyValue(' , ,example.internal, ').split(',');
    expect(parts).not.toContain('');
    expect(parts).toContain('example.internal');
  });

  it('produces a comma-separated list with no spaces', () => {
    expect(buildNoProxyValue('a.internal, b.internal')).not.toMatch(/\s/);
  });
});
