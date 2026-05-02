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

// Dump the first cart tile block fully
const tileBlocks = html.split(/(?=<div[^>]*js-ct-cart-tile[^>]*>)/);
if (tileBlocks.length > 1) {
  // Find all number-like patterns in the first block
  const block = tileBlocks[1];
  console.log('First cart tile (first 3000 chars):');
  console.log(block.slice(0, 3000));
}
