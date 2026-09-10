/**
 * Strava MCP server — local implementation over the Strava REST API.
 *
 * Why this exists: `mcp.strava.com` is reachable only by OAuth clients
 * registered with Strava's dedicated MCP issuer (`www.strava.com/mcp-issuer`),
 * which ships as part of official AI-client connectors. A self-registered
 * Strava API application authenticates fine against `api.strava.com` but is
 * refused by the MCP endpoint with `403 application not authorized` — the
 * token is valid, the *client* is not. Strava's MCP help article describes
 * access via official clients only, and the issuer's dynamic-registration
 * endpoint rejects every self-service attempt with `invalid_client_metadata`.
 *
 * So instead of proxying to a door that is closed to us, we serve the MCP
 * protocol ourselves and satisfy each tool call from the plain REST API, which
 * the same token opens without complaint. The container is unaffected: it
 * still speaks MCP to the same host port, and still never holds a credential.
 *
 * The tool names mirror the ones the agent already knows
 * (`list_activities`, `get_activity_performance`, `get_activity_streams`), so
 * existing prompts and shortcuts keep working unchanged.
 */
import { createServer, Server } from 'http';

import { log as logger } from './log.js';
import { getStravaAccessToken } from './strava-token.js';

export const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

/** Heart-rate zone ceilings (bpm). Everything above `z4` is Z5. */
export interface HrZones {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
}

/**
 * Clément's zones from his lactate test. Coach reasons entirely in these —
 * he trains on heart rate alone, with no power meter.
 */
export const DEFAULT_HR_ZONES: HrZones = { z1: 106, z2: 128, z3: 145, z4: 162 };

export interface StravaMcpOptions {
  apiBase?: string;
  zones?: HrZones;
}

const PROTOCOL_VERSION = '2024-11-05';

/** Streams are ~1 sample/second; a 5h ride is 18k points, far too many to inline. */
const DEFAULT_MAX_STREAM_POINTS = 500;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_activities',
    description:
      'List recent Strava activities (rides, runs, swims, workouts) with summary metrics: ' +
      'distance, moving time, elevation gain and average/max heart rate.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', description: 'How many activities to return (default 10, max 100).' },
        days: { type: 'number', description: 'Only return activities from the last N days.' },
      },
    },
  },
  {
    name: 'get_activity_performance',
    description:
      'Full training analysis of one activity: time and percentage in each heart-rate zone, ' +
      'aerobic decoupling, first/second-half heart-rate drift, lap breakdown, and the activity ' +
      'description (where strength-training loads are logged).',
    inputSchema: {
      type: 'object',
      properties: {
        activity_id: { type: 'number', description: 'Strava activity id.' },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'get_activity_streams',
    description:
      'Raw time-series streams for one activity (heartrate, time, distance, altitude, ' +
      'velocity_smooth, cadence) for custom analysis. Downsampled to keep responses small.',
    inputSchema: {
      type: 'object',
      properties: {
        activity_id: { type: 'number', description: 'Strava activity id.' },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stream types to return. Defaults to heartrate, time, distance, altitude.',
        },
        max_points: {
          type: 'number',
          description: `Max samples per stream (default ${DEFAULT_MAX_STREAM_POINTS}).`,
        },
      },
      required: ['activity_id'],
    },
  },
];

/** Thrown for conditions the agent should see as a tool error, not a crash. */
class ToolError extends Error {}

async function stravaFetch(apiBase: string, path: string): Promise<any> {
  const token = await getStravaAccessToken();
  if (!token) {
    throw new ToolError('Strava credentials unavailable on the host — the access token could not be resolved.');
  }

  const res = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 404) throw new ToolError(`Strava activity not found (404). ${body}`);
    if (res.status === 401) throw new ToolError(`Strava rejected the token (401). ${body}`);
    throw new ToolError(`Strava API error ${res.status}. ${body}`);
  }
  return res.json();
}

const round = (n: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function summarizeActivity(a: any): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type ?? a.type,
    start_date_local: a.start_date_local,
    distance_km: round((a.distance ?? 0) / 1000),
    moving_time_min: Math.round((a.moving_time ?? 0) / 60),
    elapsed_time_min: Math.round((a.elapsed_time ?? 0) / 60),
    elevation_gain_m: Math.round(a.total_elevation_gain ?? 0),
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
  };
}

/**
 * Time-in-zone from the heart-rate stream.
 *
 * Uses real sample deltas rather than assuming 1Hz: Garmin's smart recording
 * produces irregular gaps, and a naive count would understate paused or
 * sparsely-sampled stretches.
 */
function computeZones(
  hr: number[],
  time: number[],
  zones: HrZones,
): Record<string, { seconds: number; minutes: number; percent: number }> {
  const bands: [string, number, number][] = [
    ['Z1', 0, zones.z1],
    ['Z2', zones.z1 + 1, zones.z2],
    ['Z3', zones.z2 + 1, zones.z3],
    ['Z4', zones.z3 + 1, zones.z4],
    ['Z5', zones.z4 + 1, Number.POSITIVE_INFINITY],
  ];
  const seconds: Record<string, number> = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 };

  for (let i = 1; i < hr.length; i++) {
    const dt = (time[i] ?? i) - (time[i - 1] ?? i - 1);
    if (dt <= 0) continue;
    const bpm = hr[i];
    if (bpm == null) continue;
    const band = bands.find(([, lo, hi]) => bpm >= lo && bpm <= hi);
    if (band) seconds[band[0]] += dt;
  }

  const total = Object.values(seconds).reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, { seconds: number; minutes: number; percent: number }> = {};
  for (const key of Object.keys(seconds)) {
    out[key] = {
      seconds: seconds[key],
      minutes: Math.round(seconds[key] / 60),
      percent: round((100 * seconds[key]) / total),
    };
  }
  return out;
}

/**
 * Aerobic decoupling: how much speed-per-heartbeat degrades from the first
 * half to the second. Positive means efficiency fell — the classic
 * long-ride durability signal. Under ~5% is generally read as well-fuelled
 * and aerobically sound.
 */
function computeDecoupling(hr: number[], time: number[], distance: number[]): number | null {
  if (hr.length < 4 || distance.length < 4) return null;
  const mid = Math.floor(hr.length / 2);

  const efficiency = (from: number, to: number): number | null => {
    const beats = hr.slice(from, to).filter((h) => h != null && h > 0);
    if (!beats.length) return null;
    const meanHr = beats.reduce((a, b) => a + b, 0) / beats.length;
    const dist = (distance[to - 1] ?? 0) - (distance[from] ?? 0);
    const dur = (time[to - 1] ?? 0) - (time[from] ?? 0);
    if (dur <= 0 || meanHr <= 0) return null;
    return dist / dur / meanHr;
  };

  const first = efficiency(0, mid);
  const second = efficiency(mid, hr.length);
  if (first == null || second == null || first === 0) return null;
  return round((100 * (first - second)) / first);
}

function meanHr(hr: number[]): number | null {
  const beats = hr.filter((h) => h != null && h > 0);
  if (!beats.length) return null;
  return round(beats.reduce((a, b) => a + b, 0) / beats.length);
}

/** Evenly samples a stream down to `max` points, always keeping the last one. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

async function callTool(name: string, args: Record<string, any>, apiBase: string, zones: HrZones): Promise<unknown> {
  if (name === 'list_activities') {
    const perPage = Math.min(args.per_page ?? 10, 100);
    let path = `/athlete/activities?per_page=${perPage}`;
    if (args.days) {
      const after = Math.floor(Date.now() / 1000) - args.days * 86400;
      path += `&after=${after}`;
    }
    const activities = await stravaFetch(apiBase, path);
    return (activities as any[]).map(summarizeActivity);
  }

  if (name === 'get_activity_performance') {
    const id = args.activity_id;
    const activity = await stravaFetch(apiBase, `/activities/${id}`);
    // Streams can be absent (manual entries, indoor workouts without a strap).
    // The summary is still worth returning, so a stream failure is not fatal.
    let streams: any = {};
    try {
      streams = await stravaFetch(
        apiBase,
        `/activities/${id}/streams?keys=time,heartrate,distance,altitude,velocity_smooth&key_by_type=true`,
      );
    } catch (err) {
      logger.warn('Strava streams unavailable for activity', { id, err });
    }

    const hr: number[] = streams?.heartrate?.data ?? [];
    const time: number[] = streams?.time?.data ?? [];
    const distance: number[] = streams?.distance?.data ?? [];
    const mid = Math.floor(hr.length / 2);

    return {
      ...summarizeActivity(activity),
      description: activity.description ?? null,
      calories: activity.calories ?? null,
      suffer_score: activity.suffer_score ?? null,
      device_name: activity.device_name ?? null,
      has_heartrate_stream: hr.length > 0,
      hr_zones: computeZones(hr, time, zones),
      zone_definition_bpm: {
        Z1: `<=${zones.z1}`,
        Z2: `${zones.z1 + 1}-${zones.z2}`,
        Z3: `${zones.z2 + 1}-${zones.z3}`,
        Z4: `${zones.z3 + 1}-${zones.z4}`,
        Z5: `>${zones.z4}`,
      },
      aerobic_decoupling_percent: computeDecoupling(hr, time, distance),
      hr_first_half: meanHr(hr.slice(0, mid)),
      hr_second_half: meanHr(hr.slice(mid)),
      laps: (activity.laps ?? []).map((l: any) => ({
        name: l.name,
        moving_time_min: Math.round((l.moving_time ?? 0) / 60),
        distance_km: round((l.distance ?? 0) / 1000),
        average_heartrate: l.average_heartrate ?? null,
        max_heartrate: l.max_heartrate ?? null,
      })),
    };
  }

  if (name === 'get_activity_streams') {
    const id = args.activity_id;
    const keys: string[] = args.keys ?? ['heartrate', 'time', 'distance', 'altitude'];
    const max = args.max_points ?? DEFAULT_MAX_STREAM_POINTS;
    const streams = await stravaFetch(apiBase, `/activities/${id}/streams?keys=${keys.join(',')}&key_by_type=true`);
    const out: Record<string, unknown[]> = {};
    for (const key of keys) {
      const data = (streams as any)?.[key]?.data;
      if (Array.isArray(data)) out[key] = downsample(data, max);
    }
    return out;
  }

  throw new ToolError(`Unknown tool "${name}". Available: ${TOOLS.map((t) => t.name).join(', ')}.`);
}

async function handleRpc(message: any, apiBase: string, zones: HrZones): Promise<unknown | null> {
  const { id, method, params } = message ?? {};

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'strava', version: '1.0.0' },
        },
      };

    // Notifications carry no id and must not be answered with a result.
    case 'notifications/initialized':
    case 'initialized':
      return null;

    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        const data = await callTool(name, args, apiBase, zones);
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
        };
      } catch (err) {
        // Tool failures come back as isError results rather than JSON-RPC
        // errors: that way the agent sees the reason and can explain it,
        // instead of the client treating it as a transport fault.
        const text = err instanceof ToolError ? err.message : `Strava tool failed: ${String(err)}`;
        if (!(err instanceof ToolError)) {
          logger.error('Strava MCP tool threw', { name, err });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text }], isError: true },
        };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

/**
 * Start the local Strava MCP server.
 *
 * @param port     Port to listen on. 0 picks a free port (used by tests).
 * @param host     Bind address. Defaults to all interfaces so containers can
 *                 reach it via host.docker.internal.
 * @param options  API base + heart-rate zones. Overridable for tests.
 */
export function startStravaMcpServer(port: number, host = '0.0.0.0', options: StravaMcpOptions = {}): Promise<Server> {
  const apiBase = options.apiBase ?? STRAVA_API_BASE;
  const zones = options.zones ?? DEFAULT_HR_ZONES;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        void (async () => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          let message: any;
          try {
            message = JSON.parse(Buffer.concat(chunks).toString() || '{}');
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error' },
              }),
            );
            return;
          }

          const response = await handleRpc(message, apiBase, zones);

          if (response === null) {
            res.writeHead(202).end();
            return;
          }

          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(response));
        })();
      });
    });

    server.listen(port, host, () => {
      const addr = server.address();
      logger.info('Strava MCP server started', {
        port: typeof addr === 'object' && addr ? addr.port : port,
        host,
        mode: 'local-rest',
      });
      resolve(server);
    });

    server.on('error', reject);
  });
}
