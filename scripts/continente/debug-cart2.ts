#!/usr/bin/env npx tsx
import { authCookies } from './auth.js';

const SHOP_BASE = 'https://www.continente.pt';
const DW_BASE = `${SHOP_BASE}/on/demandware.store/Sites-continente-Site/default`;

const cookies = await authCookies();
const res = await fetch(`${DW_BASE}/Cart-Show`, {
  headers: {
    cookie: cookies,
    'x-requested-with': 'XMLHttpRequest',
    accept: '*/*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});
const html = await res.text();

// Find context around cart-quantity
const idx = html.indexOf('cart-quantity');
console.log('=== cart-quantity context ===');
console.log(html.slice(Math.max(0, idx - 200), idx + 500));

// Find data-product-tile-impression (same as search page)
const impressions = [...html.matchAll(/data-product-tile-impression='([^']+)'/g)];
console.log(`\n=== data-product-tile-impression: ${impressions.length} found ===`);
for (const m of impressions.slice(0, 5)) {
  const raw = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  console.log(raw.slice(0, 200));
}

// Look for item lists in scripts
const scriptMatches = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
for (const sm of scriptMatches) {
  const content = sm[1];
  if (content.includes('"items"') && content.includes('"item_id"')) {
    console.log('\n=== Script with items ===');
    const itemsMatch = /"items"\s*:\s*(\[[^\]]*\]|\[[\s\S]*?\])/.exec(content);
    if (itemsMatch) console.log(itemsMatch[1].slice(0, 800));
    break;
  }
}

// Look for product names in the cart
const productNameMatches = [...html.matchAll(/data-pid="(\d+)"[\s\S]{0,2000}?class="[^"]*product-name[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
console.log(`\n=== Products by pid+name: ${productNameMatches.length} ===`);

// Try another approach: look for cart line items JSON
const cartLineRe = /"lineItems"\s*:\s*(\[[\s\S]*?\])/;
const lineMatch = cartLineRe.exec(html);
if (lineMatch) console.log('\n=== lineItems ===\n', lineMatch[1].slice(0, 500));

// Look for price/quantity near product tiles
const tileImpIdx = html.indexOf('ct-product-tile');
if (tileImpIdx !== -1) {
  console.log('\n=== First product tile context ===');
  console.log(html.slice(tileImpIdx, tileImpIdx + 1000).replace(/\s+/g, ' '));
}
