/**
 * Pharmeestore ordering script for Pepa.
 *
 * Commands:
 *   prepare  — propose basket with quantities from last order (or qty=1 for first order)
 *   execute  — add items to cart, select MBWay, submit order
 *
 * Env vars required:
 *   PHARMEESTORE_EMAIL, PHARMEESTORE_PASSWORD, PHARMEESTORE_PHONE
 *
 * Optional:
 *   PHARMEESTORE_GROUP_PATH  — path to group workspace (default: ./groups/pepa)
 */

import * as fs from 'fs';
import * as path from 'path';
import { addToCart, selectMbway, submitOrder, PRODUCTS } from './client.js';
import type { LastOrder, PendingBasket, PharmeeProduct } from './types.js';

const groupPath = process.env.PHARMEESTORE_GROUP_PATH ?? './groups/pepa';
const pendingFile = path.join(groupPath, 'pharmeestore-pending-basket.json');
const lastOrderFile = path.join(groupPath, 'pharmeestore-last-order.json');

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function prepare(): Promise<void> {
  const lastOrder = readJson<LastOrder>(lastOrderFile);

  // Build proposed quantities: default to last order, fall back to 1
  const proposed: PharmeeProduct[] = PRODUCTS.map((p) => {
    const prev = lastOrder?.products.find((lp) => lp.pid === p.pid);
    return { ...p, qty: prev?.qty ?? 1 };
  });

  const pending: PendingBasket = { products: proposed, createdAt: new Date().toISOString() };
  writeJson(pendingFile, pending);

  const lines = proposed.map((p) => `• ${p.name} ×${p.qty}${lastOrder ? '' : ' (première commande — confirme les quantités)'}`).join('\n');
  const lastOrderNote = lastOrder
    ? `\nDernière commande : ${new Date(lastOrder.executedAt).toLocaleDateString('fr-FR')} — €${lastOrder.total.toFixed(2)}`
    : '\n(Pas d\'historique — quantités par défaut à 1)';

  console.log(`PHARMEESTORE_BASKET_REVIEW
READY: ${proposed.length} articles${lastOrderNote}

${lines}

Réponds *ok* pour confirmer, ou dis-moi les quantités à changer.`);
}

async function execute(): Promise<void> {
  const phone = process.env.PHARMEESTORE_PHONE;
  if (!phone) throw new Error('PHARMEESTORE_PHONE not set');

  const pending = readJson<PendingBasket>(pendingFile);
  if (!pending) throw new Error('No pending basket found. Run prepare first.');

  const products = pending.products;
  let lastCart = { items: [] as any[], total: 0, itemCount: 0 };

  for (const p of products) {
    process.stderr.write(`Adding ${p.name} ×${p.qty}...\n`);
    lastCart = await addToCart(p.pid, p.qty);
  }

  process.stderr.write('Selecting MBWay payment...\n');
  await selectMbway();

  process.stderr.write('Submitting order...\n');
  await submitOrder(phone);

  // Save last order
  const lastOrder: LastOrder = {
    executedAt: new Date().toISOString(),
    products,
    total: lastCart.total,
  };
  writeJson(lastOrderFile, lastOrder);

  // Clean up pending basket
  try { fs.unlinkSync(pendingFile); } catch { /* already gone */ }

  const lines = products.map((p) => `• ${p.name} ×${p.qty}`).join('\n');
  console.log(`PHARMEESTORE_ORDER_DONE
Articles ajoutés : ${products.length}
Total panier : €${lastCart.total.toFixed(2)}

${lines}

MBWay : notification envoyée au +351${phone.replace(/^\+?351/, '')}. Accepte le paiement sur ton téléphone.`);
}

const cmd = process.argv[2];
(async () => {
  try {
    if (cmd === 'prepare') await prepare();
    else if (cmd === 'execute') await execute();
    else {
      console.error('Usage: pharmeestore prepare | execute');
      process.exit(1);
    }
  } catch (err) {
    console.error('PHARMEESTORE_ERROR');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();
