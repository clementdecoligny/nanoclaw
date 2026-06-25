#!/usr/bin/env npx tsx
/**
 * Patched sync-delivery — fixes broken getAuthToken() call in orders.ts.
 * Uses authCookies() (cookie-based auth) instead of the non-existent getAuthToken().
 */

import * as path from 'path';
import * as fs from 'fs';
import { authCookies } from '../../extra/continente/auth.js';
import { parseOrderIds, parseOrderItems } from '../../extra/continente/orders.js';

const GROUP_PATH = process.env.CONTINENTE_GROUP_PATH || path.join(process.cwd(), 'groups/pepa');

async function syncDelivery(): Promise<void> {
  const cookieStr = await authCookies();

  const baseUrl = 'https://www.continente.pt';
  const headers: Record<string, string> = {
    Cookie: cookieStr,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-PT,pt;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  };

  console.log('Fetching order history...');
  const historyRes = await fetch(`${baseUrl}/area-pessoal/encomendas/historico-de-encomendas/`, { headers });
  if (!historyRes.ok) throw new Error(`Order history fetch failed: ${historyRes.status}`);
  const historyHtml = await historyRes.text();

  const ids = parseOrderIds(historyHtml);
  if (ids.length === 0) throw new Error('No orders found');

  console.log(`Found orders: ${ids.join(', ')}`);
  const latestId = ids[0];

  console.log(`Fetching order detail: ${latestId}`);
  const detailRes = await fetch(`${baseUrl}/detalhe-de-encomenda/?orderID=${latestId}`, { headers });
  if (!detailRes.ok) throw new Error(`Order detail fetch failed: ${detailRes.status}`);
  const detailHtml = await detailRes.text();

  const order = parseOrderItems(detailHtml);

  console.log('CONTINENTE_DELIVERY_SYNC');
  console.log('---');
  console.log(`ORDER_ID: ${order.orderId || latestId}`);
  console.log(`ORDER_DATE: ${order.orderDate}`);
  console.log(`STATUS: ${order.status}`);
  console.log(`TOTAL: €${order.total.toFixed(2)}`);
  console.log(`ITEMS: ${order.items.length}`);
  for (const item of order.items) {
    const priceStr = item.unitPrice > 0 ? ` — €${item.unitPrice.toFixed(2)}/un` : '';
    console.log(`  ${item.qty}× ${item.name} (pid:${item.pid})${priceStr}`);
  }

  console.log('\nDELIVERED_ITEMS_JSON');
  console.log(JSON.stringify({ ...order, orderId: order.orderId || latestId }, null, 2));
}

syncDelivery().catch((err) => {
  console.error('sync-delivery failed:', err.message);
  process.exit(1);
});
