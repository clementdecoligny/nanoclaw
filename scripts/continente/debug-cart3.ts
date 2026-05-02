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

// Grand total from minicart
const totalMatch = /minicart-grandtotal[^>]*>\s*([\d,]+)&euro;/.exec(html);
const qtyMatch = /minicart-quantity[^"]*">\s*(\d+)/.exec(html);
console.log(`Total: ${totalMatch?.[1]}€  Qty: ${qtyMatch?.[1]}`);

// Extract cart tiles: each has data-pid and a quantity input
// Pattern: js-ct-cart-tile ... data-pid="XXXX" ... quantity input
const cartTileRe = /js-ct-cart-tile[^>]*data-pid="(\d+)"[\s\S]*?data-product-tile-impression='([^']+)'[\s\S]*?(?:data-quantity="(\d+)"|value="(\d+)"[^>]*(?:quantity|qty)[^>]*>|(?:quantity|qty)[^>]*value="(\d+)")/gi;

// Simpler: extract pid + impression + look for quantity near each tile
// Split by cart tile divs
const tileBlocks = html.split(/(?=<div[^>]*js-ct-cart-tile[^>]*>)/);
console.log(`\nCart tile blocks: ${tileBlocks.length - 1}`);

for (const block of tileBlocks.slice(1, 30)) {
  const pidMatch = /data-pid="(\d+)"/.exec(block);
  const impMatch = /data-product-tile-impression='([^']+)'/.exec(block);
  const qtyInputMatch = /(?:name="quantity"|data-quantity)[^>]*?(?:value|data-quantity)="(\d+)"/.exec(block)
    || /value="(\d+)"[^>]*name="quantity"/.exec(block)
    || /input[^>]*quantity[^>]*value="(\d+)"/.exec(block)
    || /data-quantity="(\d+)"/.exec(block)
    || /<span[^>]*ct-counter-display[^>]*>(\d+)/.exec(block)
    || /ct-counter[^>]*>[\s\S]*?<[^>]*>(\d+)<\//.exec(block);

  if (!pidMatch) continue;

  const pid = pidMatch[1];
  let name = 'unknown';
  let price = 0;
  if (impMatch) {
    try {
      const data = JSON.parse(impMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'")) as any;
      name = data.name || 'unknown';
      price = data.price || 0;
    } catch {}
  }
  const qty = qtyInputMatch?.[1] || '?';
  console.log(`pid:${pid} qty:${qty} price:${price}€ — ${name}`);

  // Debug: show first 500 chars of block if qty not found
  if (qty === '?') {
    const snippet = block.slice(0, 600).replace(/\s+/g, ' ');
    // Look for any number patterns near counter/quantity keywords
    const counterMatch = /counter[^>]*>([\s\S]{0,100})/.exec(block);
    if (counterMatch) console.log('  counter context:', counterMatch[0].slice(0, 150).replace(/\s+/g, ' '));
  }
}
