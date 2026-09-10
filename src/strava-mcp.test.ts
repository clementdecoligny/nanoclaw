import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

// Token source is mocked: these tests are about the MCP/REST translation,
// not about token refresh (covered in strava-token handling).
const tokenState = { value: 'test-token' as string | null };
vi.mock('./strava-token.js', () => ({
  getStravaAccessToken: vi.fn(async () => tokenState.value),
}));

vi.mock('./log.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { startStravaMcpServer } from './strava-mcp.js';

/** Zone boundaries from Clément's lactate test (see groups/coach instructions). */
const ZONES = { z1: 106, z2: 128, z3: 145, z4: 162 };

function rpc(port: number, method: string, params?: unknown): Promise<{ statusCode: number; json: any }> {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method: 'POST',
        path: '/',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          let json: any = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = raw;
          }
          resolve({ statusCode: res.statusCode!, json });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Unwraps the JSON payload an MCP tool returns in its text content block. */
function toolPayload(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe('strava-mcp (local MCP server over the Strava REST API)', () => {
  let server: http.Server;
  let stravaApi: http.Server;
  let apiCalls: { url: string; auth: string | undefined }[];

  // A synthetic ride: 100 samples, 1s apart, HR climbing 90 -> 140 so it
  // straddles Z1/Z2/Z3 and gives decoupling something to chew on.
  const hrStream = Array.from({ length: 100 }, (_, i) => 90 + Math.floor(i / 2));
  const timeStream = Array.from({ length: 100 }, (_, i) => i);
  const distStream = Array.from({ length: 100 }, (_, i) => i * 5);

  beforeEach(async () => {
    tokenState.value = 'test-token';
    apiCalls = [];

    stravaApi = http.createServer((req, res) => {
      apiCalls.push({ url: req.url!, auth: req.headers.authorization });
      const send = (obj: unknown, code = 200) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const url = req.url!;

      if (url.startsWith('/athlete/activities')) {
        return send([
          {
            id: 777,
            name: 'Ride #1408',
            sport_type: 'Ride',
            start_date_local: '2026-09-10T12:25:54Z',
            distance: 27533.6,
            moving_time: 4749,
            elapsed_time: 4769,
            total_elevation_gain: 77,
            average_heartrate: 94,
            max_heartrate: 126,
          },
        ]);
      }
      if (url === '/activities/777') {
        return send({
          id: 777,
          name: 'Ride #1408',
          description: 'Bulgarian lunge 3x8 @ 20kg',
          sport_type: 'Ride',
          start_date_local: '2026-09-10T12:25:54Z',
          distance: 27533.6,
          moving_time: 4749,
          elapsed_time: 4769,
          total_elevation_gain: 77,
          average_heartrate: 94,
          max_heartrate: 126,
          calories: 294,
          suffer_score: 10,
          device_name: 'Garmin Edge 540',
          laps: [{ name: 'Lap 1', moving_time: 1200, distance: 7000, average_heartrate: 92 }],
        });
      }
      if (url.startsWith('/activities/777/streams')) {
        return send({
          time: { data: timeStream },
          heartrate: { data: hrStream },
          distance: { data: distStream },
          altitude: { data: Array.from({ length: 100 }, () => 60) },
          velocity_smooth: { data: Array.from({ length: 100 }, () => 5) },
        });
      }
      if (url.startsWith('/activities/999')) {
        return send({ message: 'Record Not Found' }, 404);
      }
      if (url.startsWith('/athletes/')) {
        return send({ recent_ride_totals: { count: 5, distance: 100000 } });
      }
      return send({ message: 'unexpected' }, 500);
    });
    await new Promise<void>((r) => stravaApi.listen(0, '127.0.0.1', r));
    const apiPort = (stravaApi.address() as AddressInfo).port;

    server = await startStravaMcpServer(0, '127.0.0.1', {
      apiBase: `http://127.0.0.1:${apiPort}`,
      zones: ZONES,
    });
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await new Promise<void>((r) => stravaApi.close(() => r()));
  });

  const port = () => (server.address() as AddressInfo).port;

  describe('MCP protocol', () => {
    it('responds to initialize with protocol version and server info', async () => {
      const { json } = await rpc(port(), 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      });

      expect(json.result.protocolVersion).toBeTruthy();
      expect(json.result.serverInfo.name).toBe('strava');
      expect(json.result.capabilities.tools).toBeDefined();
    });

    it('advertises exactly the three tools Coach depends on', async () => {
      const { json } = await rpc(port(), 'tools/list');

      const names = json.result.tools.map((t: any) => t.name).sort();
      expect(names).toEqual(['get_activity_performance', 'get_activity_streams', 'list_activities']);
    });

    it('gives every tool an input schema so the agent can call it correctly', async () => {
      const { json } = await rpc(port(), 'tools/list');

      for (const tool of json.result.tools) {
        expect(tool.description, `${tool.name} needs a description`).toBeTruthy();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('returns a JSON-RPC error for an unknown method', async () => {
      const { json } = await rpc(port(), 'no/such/method');

      expect(json.error.code).toBe(-32601);
    });

    it('accepts notifications/initialized without a response body', async () => {
      const res = await rpc(port(), 'notifications/initialized');

      expect(res.statusCode).toBe(202);
    });
  });

  describe('list_activities', () => {
    it('returns recent activities with the fields Coach reports on', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'list_activities',
        arguments: { per_page: 1 },
      });

      const acts = toolPayload(json.result);
      expect(acts).toHaveLength(1);
      expect(acts[0]).toMatchObject({
        id: 777,
        name: 'Ride #1408',
        sport_type: 'Ride',
        distance_km: 27.5,
        moving_time_min: 79,
        elevation_gain_m: 77,
        average_heartrate: 94,
      });
    });

    it('passes per_page through to the Strava API', async () => {
      await rpc(port(), 'tools/call', { name: 'list_activities', arguments: { per_page: 30 } });

      expect(apiCalls.some((c) => c.url.includes('per_page=30'))).toBe(true);
    });

    it('supports a days window via the after parameter', async () => {
      await rpc(port(), 'tools/call', { name: 'list_activities', arguments: { days: 7 } });

      expect(apiCalls.some((c) => c.url.includes('after='))).toBe(true);
    });

    it('sends the host-side bearer token to Strava', async () => {
      await rpc(port(), 'tools/call', { name: 'list_activities', arguments: {} });

      expect(apiCalls[0].auth).toBe('Bearer test-token');
    });
  });

  describe('get_activity_performance', () => {
    it('computes time in each heart-rate zone', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      const perf = toolPayload(json.result);
      // HR runs 90..139: 90-106 is Z1, 107-128 Z2, 129-139 Z3. Nothing above.
      expect(perf.hr_zones.Z1.seconds).toBeGreaterThan(0);
      expect(perf.hr_zones.Z2.seconds).toBeGreaterThan(0);
      expect(perf.hr_zones.Z3.seconds).toBeGreaterThan(0);
      expect(perf.hr_zones.Z4.seconds).toBe(0);
      expect(perf.hr_zones.Z5.seconds).toBe(0);
    });

    it('reports zone percentages that sum to 100', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      const perf = toolPayload(json.result);
      const total = Object.values(perf.hr_zones).reduce((sum: number, z: any) => sum + z.percent, 0);
      expect(total).toBeCloseTo(100, 0);
    });

    it('includes aerobic decoupling for long-ride drift analysis', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      expect(typeof toolPayload(json.result).aerobic_decoupling_percent).toBe('number');
    });

    it('includes the activity description, where strength loads are logged', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      expect(toolPayload(json.result).description).toBe('Bulgarian lunge 3x8 @ 20kg');
    });

    it('includes HR drift between first and second half', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      const perf = toolPayload(json.result);
      expect(perf.hr_first_half).toBeLessThan(perf.hr_second_half);
    });

    it('reports summary fields alongside the analysis', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 777 },
      });

      expect(toolPayload(json.result)).toMatchObject({
        name: 'Ride #1408',
        distance_km: 27.5,
        elevation_gain_m: 77,
        average_heartrate: 94,
        max_heartrate: 126,
      });
    });

    it('returns an MCP error when the activity does not exist', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_performance',
        arguments: { activity_id: 999 },
      });

      expect(json.result.isError).toBe(true);
    });
  });

  describe('get_activity_streams', () => {
    it('returns raw streams for custom analysis', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_streams',
        arguments: { activity_id: 777, keys: ['heartrate', 'time'] },
      });

      const streams = toolPayload(json.result);
      expect(streams.heartrate.length).toBe(100);
      expect(streams.time.length).toBe(100);
    });

    it('downsamples very long streams to stay within the context budget', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_activity_streams',
        arguments: { activity_id: 777, max_points: 10 },
      });

      expect(toolPayload(json.result).heartrate.length).toBeLessThanOrEqual(10);
    });
  });

  describe('failure handling', () => {
    it('returns an MCP error, not a crash, when the host has no token', async () => {
      tokenState.value = null;

      const { json } = await rpc(port(), 'tools/call', {
        name: 'list_activities',
        arguments: {},
      });

      expect(json.result.isError).toBe(true);
      expect(json.result.content[0].text).toMatch(/credential|token/i);
    });

    it('returns an MCP error for an unknown tool name', async () => {
      const { json } = await rpc(port(), 'tools/call', {
        name: 'get_segment_leaderboard',
        arguments: {},
      });

      expect(json.result.isError).toBe(true);
    });
  });
});
