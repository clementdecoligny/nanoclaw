#!/usr/bin/env npx tsx
/**
 * scripts/continente/index.ts
 *
 * Two-step basket preparation for Pepa:
 *
 *   prepare   — resolve shopping list → products → write pending basket + print review
 *   execute   — add all pending basket items to Continente cart (requires prior prepare)
 *
 * Credentials: CONTINENTE_EMAIL + CONTINENTE_PASSWORD via environment (OneCLI injection).
 * The password is NEVER written to disk or logged.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parsePreferredProducts, parseShoppingList, matchItems, cachePid } from './matcher.js';
import { searchProduct, addToCart, getCart } from './client.js';
import type { BasketItem, MatchResult } from './types.js';

const GROUP_PATH =
  process.env.CONTINENTE_GROUP_PATH ||
  path.join(process.cwd(), 'groups/telegram_main');

const PENDING_PATH = path.join(GROUP_PATH, 'inventory/continente-pending-basket.json');

// ---------------------------------------------------------------------------
// PREPARE
// ---------------------------------------------------------------------------

async function prepare(): Promise<void> {
  const preferred = parsePreferredProducts();
  const shopping = parseShoppingList();
  const matches: MatchResult[] = matchItems(shopping, preferred);

  const basket: BasketItem[] = [];
  const needsInput: Array<{ name: string; reason: string; options?: string[] }> = [];
  const notOnContinente: string[] = [];
  const unresolved: string[] = [];

  for (const match of matches) {
    if (match.status === 'not_on_continente') {
      notOnContinente.push(match.item.name);
      continue;
    }
    if (match.status === 'unmatched') {
      unresolved.push(match.item.name);
      continue;
    }

    const { item, product } = match;
    const qty = item.qty > 0 ? item.qty : product.usualQty;

    // Use cached PID if available — skip search
    if (product.cachedPid) {
      basket.push({
        shoppingListName: item.name,
        continenteName: product.continenteName,
        pid: product.cachedPid,
        price: 0, // confirmed at execute time
        qty,
      });
      continue;
    }

    // Search Continente by exact product name
    let results;
    try {
      results = await searchProduct(product.continenteName, 5);
    } catch (err) {
      needsInput.push({
        name: item.name,
        reason: `Search error: ${(err as Error).message}`,
      });
      continue;
    }

    if (results.length === 0) {
      needsInput.push({
        name: item.name,
        reason: `"${product.continenteName}" not found on Continente`,
      });
      continue;
    }

    const top = results[0];
    const isExact =
      top.name.toUpperCase().includes(product.continenteName.toUpperCase()) ||
      results.length === 1;

    if (isExact) {
      // Cache the PID for future runs
      cachePid(product.continenteName, top.pid);
      basket.push({
        shoppingListName: item.name,
        continenteName: top.name,
        pid: top.pid,
        price: top.price,
        qty,
      });
    } else {
      needsInput.push({
        name: item.name,
        reason: 'Multiple results — pick one',
        options: results
          .slice(0, 3)
          .map((p, i) => `[${i + 1}] ${p.name} (pid:${p.pid})${p.price ? ` — €${p.price.toFixed(2)}` : ''}`),
      });
    }
  }

  // Save pending basket
  fs.writeFileSync(PENDING_PATH, JSON.stringify(basket, null, 2), 'utf-8');

  // Print structured review for Pepa to relay
  const knownTotal = basket
    .filter((b) => b.price > 0)
    .reduce((s, b) => s + b.price * b.qty, 0);

  console.log('CONTINENTE_BASKET_REVIEW');
  console.log('---');
  console.log(
    `READY: ${basket.length} items${knownTotal > 0 ? ` (~€${knownTotal.toFixed(2)} — prices confirmed at checkout)` : ''}`,
  );
  for (const b of basket) {
    const priceStr = b.price > 0 ? ` — €${(b.price * b.qty).toFixed(2)}` : '';
    console.log(`  ✅ ${b.continenteName} ×${b.qty}${priceStr}`);
  }

  if (needsInput.length > 0) {
    console.log(`\nNEEDS_INPUT: ${needsInput.length} items`);
    for (const r of needsInput) {
      console.log(`  ❓ ${r.name}: ${r.reason}`);
      if (r.options) r.options.forEach((o) => console.log(`     ${o}`));
    }
  }

  if (notOnContinente.length > 0) {
    console.log(`\nNOT_ON_CONTINENTE: ${notOnContinente.join(', ')}`);
  }

  if (unresolved.length > 0) {
    console.log(
      `\nUNRESOLVED (not in preferred products DB — add to preferred-products.md): ${unresolved.join(', ')}`,
    );
  }

  if (basket.length > 0) {
    console.log('\nReply "ok" to add all ready items to your Continente cart.');
  }
}

// ---------------------------------------------------------------------------
// EXECUTE
// ---------------------------------------------------------------------------

async function execute(): Promise<void> {
  if (!fs.existsSync(PENDING_PATH)) {
    console.error('No pending basket. Run "prepare" first.');
    process.exit(1);
  }

  const basket: BasketItem[] = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf-8'));

  if (basket.length === 0) {
    console.log('Pending basket is empty.');
    process.exit(0);
  }

  console.log(`Adding ${basket.length} items to Continente cart...`);

  const errors: string[] = [];
  let lastTotal = 0;
  let lastQtyTotal = 0;

  for (const item of basket) {
    try {
      const result = await addToCart(item.pid, item.qty);
      lastTotal = result.grandTotal;
      lastQtyTotal = result.quantityTotal;
      console.log(`  ✅ ${item.continenteName} ×${item.qty}`);
    } catch (err) {
      const msg = `  ❌ ${item.continenteName} (pid:${item.pid}): ${(err as Error).message}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  console.log(`\nCart: ${lastQtyTotal} items — €${lastTotal.toFixed(2)}`);
  console.log(`Open continente.pt to review and complete checkout.`);

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} items failed — add manually:\n${errors.join('\n')}`);
  }

  // Clean up
  fs.unlinkSync(PENDING_PATH);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const cmd = process.argv[2];
if (cmd === 'prepare') {
  prepare().catch((err) => {
    console.error('prepare failed:', err.message);
    process.exit(1);
  });
} else if (cmd === 'execute') {
  execute().catch((err) => {
    console.error('execute failed:', err.message);
    process.exit(1);
  });
} else {
  console.error('Usage: npx tsx scripts/continente/index.ts [prepare|execute]');
  process.exit(1);
}
