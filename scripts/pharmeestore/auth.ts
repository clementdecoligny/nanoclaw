import * as https from 'https';

const BASE = 'www.pharmeestore.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

interface Response {
  status: number;
  headers: Record<string, string | string[]>;
  cookies: string;
  body: string;
  location?: string;
}

export function get(path: string, cookies = ''): Promise<Response> {
  return request({ method: 'GET', path, cookies });
}

export function post(path: string, body: string, cookies = '', extraHeaders: Record<string, string> = {}): Promise<Response> {
  return request({ method: 'POST', path, cookies, body, extraHeaders });
}

function request({ method, path, cookies, body, extraHeaders = {} }: {
  method: string; path: string; cookies?: string; body?: string; extraHeaders?: Record<string, string>;
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'pt-PT,pt;q=0.9',
      ...extraHeaders,
    };
    if (cookies) headers['Cookie'] = cookies;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }

    const req = https.request({ hostname: BASE, path, method, headers }, (res) => {
      const setCookies = res.headers['set-cookie'] || [];
      const cookieStr = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => !c.includes('deleted') && c.includes('='))
        .join('; ');
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({
          status: res.status ?? res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[]>,
          cookies: cookieStr,
          body: data,
          location: res.headers.location as string | undefined,
        }),
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Merge two cookie strings, later values win
export function mergeCookies(...parts: string[]): string {
  const map = new Map<string, string>();
  for (const part of parts) {
    for (const pair of part.split(';').map((s) => s.trim()).filter(Boolean)) {
      const eq = pair.indexOf('=');
      if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

let _cookies = '';

export async function authenticate(): Promise<string> {
  if (_cookies) return _cookies;

  const email = process.env.PHARMEESTORE_EMAIL;
  const password = process.env.PHARMEESTORE_PASSWORD;
  if (!email || !password) throw new Error('PHARMEESTORE_EMAIL / PHARMEESTORE_PASSWORD not set');

  // 1. Get CSRF token + session cookie
  const loginPage = await get('/checkout/v1/?id=2');
  const csrf = (loginPage.body.match(/name='csrf' value='([^']+)'/) || [])[1];
  if (!csrf) throw new Error('Could not extract CSRF token from login page');
  let cookies = loginPage.cookies;

  // 2. POST login
  const body = new URLSearchParams({ csrf, email, password }).toString();
  const loginRes = await post('/checkout/v1/dologin.php', body, cookies, {
    Referer: 'https://www.pharmeestore.com/checkout/v1/?id=2',
    'X-Requested-With': 'XMLHttpRequest',
  });

  cookies = mergeCookies(cookies, loginRes.cookies);

  // Verify we got auth cookies
  if (!cookies.includes('_sui=') || !cookies.includes('_sau=')) {
    throw new Error('Login failed — no auth cookies received. Check credentials.');
  }

  _cookies = cookies;
  return cookies;
}

export function resetSession(): void {
  _cookies = '';
}
