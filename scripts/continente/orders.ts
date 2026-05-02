/**
 * orders.ts — parse Continente order history and order detail pages
 *
 * Pure functions only. No network calls here — callers are responsible for
 * fetching HTML and passing it in. See getLatestOrder() for the orchestrator.
 */

import type { DeliveredItem, DeliveredOrder } from './types.js';

// ---------------------------------------------------------------------------
// parseOrderIds
// ---------------------------------------------------------------------------

/**
 * Extract order IDs from a Continente order history page.
 * Tries data-order-id attributes first, falls back to orderID= query params.
 * Deduplicates and preserves order.
 */
export function parseOrderIds(html: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  // Primary: data-order-id="..."
  const attrRe = /data-order-id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }

  // Fallback / supplement: ?orderID=... in href links
  const linkRe = /orderID=(\d+)/g;
  while ((m = linkRe.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }

  return ids;
}

// ---------------------------------------------------------------------------
// parseOrderItems
// ---------------------------------------------------------------------------

/** Parse a price string like "€1.49" or "€2,49" → number */
function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Extract inner text of the first element matching a CSS-like selector (class name). */
function extractText(html: string, className: string): string {
  const re = new RegExp(
    `class="${className}"[^>]*>\\s*([^<]+?)\\s*<`,
    's',
  );
  const m = re.exec(html);
  return m ? m[1].trim() : '';
}

/** Extract attribute value from the first element with the given class. */
function extractAttr(
  html: string,
  className: string,
  attr: string,
): string {
  const re = new RegExp(
    `class="${className}"[^>]*${attr}="([^"]*)"`,
    's',
  );
  const m = re.exec(html);
  if (m) return m[1];
  // Also try attr before class
  const re2 = new RegExp(
    `${attr}="([^"]*)"[^>]*class="${className}"`,
    's',
  );
  const m2 = re2.exec(html);
  return m2 ? m2[1] : '';
}

/** Extract data-order-id from the wrapper div (any class containing "order"). */
function extractOrderId(html: string): string {
  const m = /data-order(?:id|-id)="(\d+)"/i.exec(html);
  return m ? m[1] : '';
}

/** Extract order date — looks for common class patterns. */
function extractOrderDate(html: string): string {
  for (const cls of [
    'order-date-value',
    'order-date',
    'orderDate',
  ]) {
    const v = extractText(html, cls);
    if (v) return v;
  }
  return '';
}

/** Extract order status. */
function extractOrderStatus(html: string): string {
  for (const cls of [
    'order-status-value',
    'order-status',
    'orderStatus',
  ]) {
    const v = extractText(html, cls);
    if (v) return v;
  }
  return '';
}

/**
 * Try to extract items from a dataLayer.push({ ecommerce: { ... } }) script block.
 * Returns null if no dataLayer purchase event found.
 */
function tryParseDataLayer(html: string): {
  orderId: string;
  total: number;
  items: DeliveredItem[];
} | null {
  // Find all <script> blocks
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const scriptContent = m[1];
    if (!scriptContent.includes('dataLayer')) continue;

    // Extract the object literal passed to dataLayer.push(...)
    const pushRe = /dataLayer\.push\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;/;
    const pushMatch = pushRe.exec(scriptContent);
    if (!pushMatch) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(pushMatch[1]);
    } catch {
      continue;
    }

    const data = obj as Record<string, unknown>;
    if (data['event'] !== 'purchase') continue;

    const ecommerce = data['ecommerce'] as Record<string, unknown> | undefined;
    if (!ecommerce) continue;

    const rawItems = ecommerce['items'] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(rawItems)) continue;

    const orderId = String(ecommerce['transaction_id'] ?? '');
    const total = typeof ecommerce['value'] === 'number' ? ecommerce['value'] : 0;

    const items: DeliveredItem[] = rawItems.map((it) => ({
      pid: String(it['item_id'] ?? ''),
      name: String(it['item_name'] ?? ''),
      qty: typeof it['quantity'] === 'number' ? it['quantity'] : parseInt(String(it['quantity'] ?? '0'), 10),
      unitPrice: typeof it['price'] === 'number' ? it['price'] : parseFloat(String(it['price'] ?? '0')),
    }));

    return { orderId, total, items };
  }

  return null;
}

/**
 * Parse DOM-format product line items.
 * Matches <div class="product-line-item" data-pid="...">...</div> blocks.
 */
function parseDomItems(html: string): DeliveredItem[] {
  const items: DeliveredItem[] = [];

  // Match each product-line-item block (greedy stop at next closing div)
  const blockRe =
    /<div[^>]+class="product-line-item"[^>]*data-pid="([^"]+)"[^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const pid = m[1];
    const block = m[2];

    const name = extractText(block, 'line-item-name');
    const qtyRaw = extractText(block, 'line-item-quantity');
    const priceRaw = extractText(block, 'line-item-unit-price');

    const qty = parseInt(qtyRaw, 10) || 0;
    const unitPrice = priceRaw ? parsePrice(priceRaw) : 0;

    items.push({ pid, name, qty, unitPrice });
  }

  return items;
}

/**
 * Parse a Continente order detail page.
 * Supports both DOM format (product-line-item divs) and dataLayer JSON format.
 */
export function parseOrderItems(html: string): DeliveredOrder {
  // Try dataLayer format first (richer data)
  const dataLayer = tryParseDataLayer(html);

  const orderId =
    dataLayer?.orderId ||
    extractOrderId(html);

  const orderDate = extractOrderDate(html);
  const status = extractOrderStatus(html);

  let items: DeliveredItem[];
  let total: number;

  if (dataLayer) {
    items = dataLayer.items;
    total = dataLayer.total;
  } else {
    items = parseDomItems(html);
    total = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
  }

  return { orderId, orderDate, status, items, total };
}

// ---------------------------------------------------------------------------
// getLatestOrder — network orchestrator
// ---------------------------------------------------------------------------

/**
 * Fetch the latest order from the authenticated Continente account.
 * Requires CONTINENTE_EMAIL + CONTINENTE_PASSWORD in the environment.
 */
export async function getLatestOrder(): Promise<DeliveredOrder> {
  const { getAuthToken } = await import('./auth.js');
  const token = await getAuthToken();

  const baseUrl = 'https://www.continente.pt';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-PT,pt;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  };

  // 1. Fetch order history page
  const historyRes = await fetch(
    `${baseUrl}/area-pessoal/encomendas/historico-de-encomendas/`,
    { headers },
  );
  if (!historyRes.ok) {
    throw new Error(
      `Order history fetch failed: ${historyRes.status} ${historyRes.statusText}`,
    );
  }
  const historyHtml = await historyRes.text();

  const ids = parseOrderIds(historyHtml);
  if (ids.length === 0) {
    throw new Error('No orders found in order history page');
  }

  const latestId = ids[0];

  // 2. Fetch order detail page
  const detailRes = await fetch(
    `${baseUrl}/detalhe-de-encomenda/?orderID=${latestId}`,
    { headers },
  );
  if (!detailRes.ok) {
    throw new Error(
      `Order detail fetch failed: ${detailRes.status} ${detailRes.statusText}`,
    );
  }
  const detailHtml = await detailRes.text();

  return parseOrderItems(detailHtml);
}
