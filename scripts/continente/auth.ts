/**
 * auth.ts — Continente PKCE OAuth authentication
 *
 * Flow:
 *  1. POST login.continente.pt/api/username
 *  2. POST login.continente.pt/api/email/login/validate-password  (x-cookie CSRF mirror)
 *  3. GET  login.continente.pt/api/credentials/authorize          (PKCE challenge)
 *  4. POST www.continente.pt/.../Account-Login                    (exchange code → dwsid)
 *
 * Credentials come from environment variables — never hardcoded or written to disk.
 * Set CONTINENTE_EMAIL and CONTINENTE_PASSWORD via OneCLI secrets injection.
 *
 * The resulting dwsid session cookie is cached in memory. It is NOT persisted to disk.
 */

import { createHash, randomBytes } from 'crypto';

const LOGIN_BASE = 'https://login.continente.pt';
const SHOP_BASE = 'https://www.continente.pt';
const CLIENT_ID = 'NLR6WHyO8Iba4eRS';

// Demandware Account-Login endpoint
const DW_LOGIN_PATH =
  '/on/demandware.store/Sites-continente-Site/default/Account-Login';

// In-memory session — survives the process lifetime, not persisted
let _session: { dwsid: string; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  // 28 random bytes → 56-char hex string (matches observed format)
  return randomBytes(28).toString('hex');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// Cookie jar helpers
// ---------------------------------------------------------------------------

/** Extract a named cookie value from a Set-Cookie response header array */
function extractSetCookie(headers: Headers, name: string): string | null {
  // Node fetch exposes set-cookie as comma-joined; iterate all values
  const all = headers.getSetCookie?.() ?? [];
  for (const header of all) {
    const match = new RegExp(`^${name}=([^;]+)`).exec(header);
    if (match) return match[1];
  }
  // Fallback: single header value
  const single = headers.get('set-cookie') ?? '';
  const match = new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`).exec(single);
  return match ? match[1] : null;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ---------------------------------------------------------------------------
// Auth steps
// ---------------------------------------------------------------------------

async function step1_submitUsername(
  email: string,
): Promise<{ userSessionId: string; credentialsSignupScheme: string }> {
  const res = await fetch(`${LOGIN_BASE}/api/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, clientId: CLIENT_ID, returnUrl: null }),
  });

  if (!res.ok) throw new Error(`[step1] username submit failed: ${res.status}`);

  const data = (await res.json()) as {
    properties: { userSessionId: string };
    nextStep: string;
  };

  const scheme = extractSetCookie(res.headers, 'CredentialsSignupScheme');
  if (!scheme) throw new Error('[step1] CredentialsSignupScheme cookie missing from response');

  return {
    userSessionId: data.properties.userSessionId,
    credentialsSignupScheme: scheme,
  };
}

async function step2_submitPassword(
  userSessionId: string,
  password: string,
  credentialsSignupScheme: string,
): Promise<{ idmSession: string; credentialsAuthScheme: string }> {
  const cookieJar = { CredentialsSignupScheme: credentialsSignupScheme };

  const res = await fetch(`${LOGIN_BASE}/api/email/login/validate-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Mirror the signup scheme cookie as x-cookie — Continente uses this as CSRF protection
      'x-cookie': cookieHeader(cookieJar),
      cookie: cookieHeader(cookieJar),
    },
    body: JSON.stringify({ userSessionId, password, passwordRecover: false }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[step2] password validation failed: ${res.status} — ${body}`);
  }

  const idmSession = extractSetCookie(res.headers, 'idm.session');
  const authScheme = extractSetCookie(res.headers, 'CredentialsAuthenticationScheme');

  if (!idmSession) throw new Error('[step2] idm.session cookie missing — wrong password?');
  if (!authScheme) throw new Error('[step2] CredentialsAuthenticationScheme cookie missing');

  return { idmSession, credentialsAuthScheme: authScheme };
}

async function step3_authorize(
  idmSession: string,
  credentialsSignupScheme: string,
  credentialsAuthScheme: string,
  codeChallenge: string,
): Promise<string> {
  const cookieJar = {
    CredentialsSignupScheme: credentialsSignupScheme,
    'idm.session': idmSession,
    CredentialsAuthenticationScheme: credentialsAuthScheme,
  };
  const cookieStr = cookieHeader(cookieJar);

  const url = new URL(`${LOGIN_BASE}/api/credentials/authorize`);
  url.searchParams.set('clientId', CLIENT_ID);
  url.searchParams.set('codeChallenge', codeChallenge);
  url.searchParams.set('codeChallengeMethod', 'S256');

  const res = await fetch(url.toString(), {
    headers: {
      cookie: cookieStr,
      'x-cookie': cookieStr,
    },
  });

  if (!res.ok) throw new Error(`[step3] authorize failed: ${res.status}`);

  // Response body contains the authorization code
  // Expected shape: { authorizationCode: "...", ... }
  const data = (await res.json()) as Record<string, unknown>;
  const code =
    (data['authorizationCode'] as string) ??
    (data['code'] as string) ??
    (data['authorization_code'] as string);

  if (!code) {
    throw new Error(
      `[step3] authorizationCode not found in response: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  return code;
}

async function step4_exchangeCode(
  authorizationCode: string,
  codeVerifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    authorizationCode,
    codeVerifier,
    ssoLogin: 'false',
    rurl: `${SHOP_BASE}/`,
  });

  const res = await fetch(`${SHOP_BASE}${DW_LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`[step4] Account-Login failed: ${res.status}`);

  const dwsid = extractSetCookie(res.headers, 'dwsid');
  if (!dwsid) throw new Error('[step4] dwsid cookie missing — auth exchange failed');

  return dwsid;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Authenticate and return the dwsid session cookie value.
 * Caches the session in memory until it expires (5 days conservative TTL).
 */
export async function authenticate(): Promise<string> {
  if (_session && _session.expiresAt > Date.now()) {
    return _session.dwsid;
  }

  const email = process.env.CONTINENTE_EMAIL;
  const password = process.env.CONTINENTE_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'CONTINENTE_EMAIL and CONTINENTE_PASSWORD must be set.\n' +
        'Add them as OneCLI secrets with host pattern *.continente.pt',
    );
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const { userSessionId, credentialsSignupScheme } = await step1_submitUsername(email);
  const { idmSession, credentialsAuthScheme } = await step2_submitPassword(
    userSessionId,
    password,
    credentialsSignupScheme,
  );
  const authorizationCode = await step3_authorize(
    idmSession,
    credentialsSignupScheme,
    credentialsAuthScheme,
    codeChallenge,
  );
  const dwsid = await step4_exchangeCode(authorizationCode, codeVerifier);

  // dwsid sessions last ~5 days (observed from __Host-col Expires header)
  _session = { dwsid, expiresAt: Date.now() + 4 * 24 * 3600_000 };

  return dwsid;
}

/** Return cookie header string for authenticated requests to www.continente.pt */
export async function authCookies(): Promise<string> {
  const dwsid = await authenticate();
  return `dwsid=${dwsid}`;
}
