/**
 * client.ts — Continente shopping API (Salesforce Commerce Cloud / Demandware)
 *
 * Base: https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/
 * Auth: dwsid session cookie from PKCE OAuth flow in auth.ts
 */

import { authCookies } from './auth.js';
import type { ContinenteProduct, Cart, CartItem } from './types.js';

const SHOP_BASE = 'https://www.continente.pt';
const DW_BASE = `${SHOP_BASE}/on/demandware.store/Sites-continente-Site/default`;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

async function shopHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    cookie: await authCookies(),
    'x-requested-with': 'XMLHttpRequest',
    accept: '*/*',
    'accept-language': 'pt-PT,pt;q=0.9',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Product search
// ---------------------------------------------------------------------------

/**
 * Search Continente for a product by name.
 *
 * Strategy: scrape the HTML search page and extract data-pid attributes.
 * The search URL accepts exact product names so results are narrow.
 * Product PIDs appear in data-pid attributes on product tile elements.
 *
 * Returns up to `limit` matches.
 */
export async function searchProduct(query: string, limit = 5): Promise<ContinenteProduct[]> {
  const url = new URL(`${SHOP_BASE}/pesquisa/`);
  url.searchParams.set('q', query);
  url.searchParams.set('start', '0');
  url.searchParams.set('srule', 'Continente');
  url.searchParams.set('pmin', '0.01');

  const res = await fetch(url.toString(), {
    headers: {
      ...(await shopHeaders()),
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Search failed for "${query}": ${res.status}`);
  }

  const html = await res.text();
  return parseProductsFromSearchHtml(html, limit);
}

/**
 * Extract products from the Continente search results HTML page.
 *
 * Demandware product tiles contain a data-product-tile-impression attribute
 * with JSON: {"name":"...","id":"4949515","price":1.99,...}
 */
function parseProductsFromSearchHtml(html: string, limit: number): ContinenteProduct[] {
  const results: ContinenteProduct[] = [];
  const seen = new Set<string>();

  // Extract JSON from data-product-tile-impression attributes
  // The JSON is HTML-entity-encoded (&quot; instead of ")
  const impressionRe = /data-product-tile-impression='([^']+)'/g;
  let m: RegExpExecArray | null;

  while ((m = impressionRe.exec(html)) !== null && results.length < limit) {
    try {
      // Decode HTML entities in the JSON
      const raw = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'");
      const data = JSON.parse(raw) as { name?: string; id?: string; price?: number };
      const pid = data.id;
      // Decode any remaining HTML entities in the name
      const name = data.name
        ? data.name
            .replace(/&amp;/g, '&')
            .replace(/&eacute;/g, 'é')
            .replace(/&ecirc;/g, 'ê')
            .replace(/&ocirc;/g, 'ô')
            .replace(/&iacute;/g, 'í')
            .replace(/&oacute;/g, 'ó')
            .replace(/&uacute;/g, 'ú')
            .replace(/&atilde;/g, 'ã')
            .replace(/&otilde;/g, 'õ')
            .replace(/&ccedil;/g, 'ç')
            .replace(/&aacute;/g, 'á')
            .replace(/&agrave;/g, 'à')
            .replace(/&ucirc;/g, 'û')
            .replace(/&icirc;/g, 'î')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        : undefined;
      if (!pid || !name || seen.has(pid)) continue;
      seen.add(pid);
      results.push({
        pid,
        name,
        price: data.price ?? 0,
        available: true,
        url: `${SHOP_BASE}/produto/${name.toLowerCase().replace(/\s+/g, '-')}-${pid}.html`,
      });
    } catch {
      // Malformed JSON — skip
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cart operations
// ---------------------------------------------------------------------------

interface DwCartAddResponse {
  error: boolean;
  errorMessage?: string;
  cart?: {
    items: DwCartItem[];
    totals: { grandTotal: string; grandTotalNumber: number };
    quantityTotal: number;
  };
  product?: { id: string };
}

interface DwCartItem {
  id: string;
  productName: string;
  quantity: number;
  price: { sales: { value: number; decimalPrice: string } };
  priceTotal: { value: number };
}

/**
 * Add a product to the cart.
 * Returns the updated cart total for confirmation messages.
 */
export async function addToCart(
  pid: string,
  quantity: number,
): Promise<{ grandTotal: number; quantityTotal: number }> {
  const body = new URLSearchParams({
    pid,
    quantity: String(quantity),
    isCart: '0',
    gtmList: '',
    gtmIndex: '',
    breadcrumbs: '',
    promotionData: '',
    taggstarPromotionData: '',
  });

  const res = await fetch(`${DW_BASE}/Cart-AddProduct`, {
    method: 'POST',
    headers: {
      ...(await shopHeaders({
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: SHOP_BASE,
        referer: `${SHOP_BASE}/`,
      })),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cart-AddProduct ${res.status} for pid ${pid}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as DwCartAddResponse;

  if (data.error) {
    throw new Error(`Cart error for pid ${pid}: ${data.errorMessage ?? 'unknown error'}`);
  }

  return {
    grandTotal: data.cart?.totals.grandTotalNumber ?? 0,
    quantityTotal: data.cart?.quantityTotal ?? 0,
  };
}

/**
 * Get current cart contents.
 * Uses Cart-GetProducts (lightweight JSON endpoint).
 */
export async function getCart(): Promise<Cart> {
  const res = await fetch(`${DW_BASE}/Cart-Show`, {
    headers: {
      ...(await shopHeaders({ accept: 'application/json, text/javascript, */*' })),
    },
  });

  if (!res.ok) throw new Error(`Cart-Show ${res.status}`);

  // Cart-Show returns HTML; parse the totals from embedded JSON data layer
  const html = await res.text();

  // Extract cart items from data layer JSON embedded in the page
  const dlMatch = /"ecommerce":\s*\{[\s\S]*?"items":\s*(\[[\s\S]*?\])\s*\}/.exec(html);
  const items: CartItem[] = [];
  let grandTotal = 0;

  if (dlMatch) {
    try {
      const raw = JSON.parse(dlMatch[1]) as Array<{
        item_id: string;
        item_name: string;
        quantity: number;
        price: number;
      }>;
      for (const i of raw) {
        items.push({
          pid: i.item_id,
          name: i.item_name,
          quantity: i.quantity,
          unitPrice: i.price,
          totalPrice: i.price * i.quantity,
        });
        grandTotal += i.price * i.quantity;
      }
    } catch {
      // Fallback: return empty — not fatal
    }
  }

  return { items, grandTotal, quantityTotal: items.reduce((s, i) => s + i.quantity, 0) };
}
