#!/usr/bin/env npx tsx
import { authCookies } from './auth.js';

const SHOP_BASE = 'https://www.continente.pt';
const DW_BASE = `${SHOP_BASE}/on/demandware.store/Sites-continente-Site/default`;

const cookies = await authCookies();

// Try Cart-Show HTML
const res = await fetch(`${DW_BASE}/Cart-Show`, {
  headers: {
    cookie: cookies,
    'x-requested-with': 'XMLHttpRequest',
    accept: '*/*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});
console.log('Status:', res.status);
const html = await res.text();
console.log('HTML length:', html.length);

// Try multiple patterns
const patterns = [
  { name: 'ecommerce items', re: /"ecommerce":\s*\{[\s\S]*?"items":\s*(\[[\s\S]*?\])\s*\}/ },
  { name: 'gtm items', re: /dataLayer\.push\((\{[\s\S]*?"items"[\s\S]*?\})\)/ },
  { name: 'cart-quantity', re: /cart-quantity[^>]*>(\d+)/ },
  { name: 'grand-total', re: /grand-total[^>]*>([\d.,€]+)/ },
  { name: 'quantityTotal', re: /"quantityTotal"\s*:\s*(\d+)/ },
  { name: 'order total', re: /"orderTotal":\s*"([^"]+)"/ },
  { name: 'numItems', re: /"numItems"\s*:\s*(\d+)/ },
  { name: 'product-name', re: /class="[^"]*product-name[^"]*"[^>]*>([^<]+)</ },
];

for (const { name, re } of patterns) {
  const m = re.exec(html);
  if (m) console.log(`FOUND [${name}]:`, m[1]?.slice(0, 200));
  else console.log(`NOT FOUND [${name}]`);
}

// Save a snippet around "cart" mentions
const cartIdx = html.toLowerCase().indexOf('quantitytotal');
if (cartIdx !== -1) {
  console.log('\nContext around quantityTotal:', html.slice(Math.max(0, cartIdx-50), cartIdx+300));
}

// Try the Cart-GetProducts JSON endpoint instead
const res2 = await fetch(`${DW_BASE}/Cart-GetProducts`, {
  headers: {
    cookie: cookies,
    'x-requested-with': 'XMLHttpRequest',
    accept: 'application/json, */*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
});
console.log('\nCart-GetProducts status:', res2.status);
const body2 = await res2.text();
console.log('Cart-GetProducts body:', body2.slice(0, 500));
