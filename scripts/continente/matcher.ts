/**
 * matcher.ts — maps shopping list items to preferred Continente products
 *
 * Reads:
 *   inventory/preferred-products.md   — known product names + cached PIDs
 *   inventory/shopping-list.md        — current shopping list
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PreferredProduct, ShoppingItem, MatchResult } from './types.js';

const GROUP_PATH =
  process.env.CONTINENTE_GROUP_PATH ||
  path.join(process.cwd(), 'groups/telegram_main');

const PREFERRED_PATH = path.join(GROUP_PATH, 'inventory/preferred-products.md');
const SHOPPING_PATH = path.join(GROUP_PATH, 'inventory/shopping-list.md');

const NOT_ON_CONTINENTE_MARKER = '## Non trouvé chez Continente';

/**
 * Parse the "Non trouvé chez Continente" section and return lowercase aliases
 * of items that are definitively not available online.
 */
export function parseNotOnContinenteAliases(): Set<string> {
  const raw = fs.readFileSync(PREFERRED_PATH, 'utf-8');
  const cutoff = raw.indexOf(NOT_ON_CONTINENTE_MARKER);
  if (cutoff === -1) return new Set();

  const section = raw.slice(cutoff);
  const aliases = new Set<string>();

  // Match any table row in the "not on Continente" section: | Item name | ... |
  const rowRe = /^\|\s*([^|]+?)\s*\|/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section)) !== null) {
    const alias = m[1].trim();
    if (!alias || alias === 'Notre nom' || /^-+$/.test(alias) || alias === 'Item') continue;
    aliases.add(normalize(alias));
  }

  return aliases;
}

// ---------------------------------------------------------------------------
// Parse preferred-products.md
// ---------------------------------------------------------------------------

/**
 * Parse preferred-products.md.
 *
 * Table columns (as written by Pepa):
 *   | Notre nom | Nom exact Continente | Prix | Qté / commande | Notes |
 *
 * We also look for an optional `<!-- pid:XXXXX -->` HTML comment on any row
 * to store a cached PID without changing the table layout.
 */
export function parsePreferredProducts(): PreferredProduct[] {
  const raw = fs.readFileSync(PREFERRED_PATH, 'utf-8');

  // Stop at the "not on Continente" section
  const cutoff = raw.indexOf(NOT_ON_CONTINENTE_MARKER);
  const relevant = cutoff !== -1 ? raw.slice(0, cutoff) : raw;

  const products: PreferredProduct[] = [];

  const rowRe =
    /^\|\s*([^|]+?)\s*\|\s*([A-Z0-9][^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm;

  // Also catch 2-column rows like "| Item | Non vu |" that mark unavailable items
  const shortRowRe = /^\|\s*([^|]+?)\s*\|\s*(Non vu|N\/A|Não encontrado|-|—)\s*\|/gim;
  let sm: RegExpExecArray | null;
  while ((sm = shortRowRe.exec(relevant)) !== null) {
    const alias = sm[1].trim();
    if (alias === 'Notre nom' || /^-+$/.test(alias)) continue;
    products.push({
      aliases: [alias.toLowerCase()],
      continenteName: '',
      usualQty: 1,
      notes: '',
      cachedPid: null,
      notOnContinente: true,
    });
  }

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(relevant)) !== null) {
    const alias = m[1].trim();
    const continenteName = m[2].trim();

    if (
      alias === 'Notre nom' ||
      alias === '---' ||
      /^-+$/.test(alias) ||
      continenteName === 'Nom exact Continente' ||
      /^-+$/.test(continenteName)
    )
      continue;

    const qtyField = m[4].trim();
    const qtyMatch = /(\d+)/.exec(qtyField);
    const usualQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    // Look for cached PID in a comment: <!-- pid:6664918 -->
    const fullRow = m[0];
    const pidMatch = /<!--\s*pid:(\d+)\s*-->/.exec(fullRow);

    // Skip rows where the Continente name is a placeholder meaning "not found"
    const notFoundPlaceholders = ['non vu', 'n/a', 'na', 'not found', '-', '—', 'não encontrado'];
    if (notFoundPlaceholders.includes(continenteName.toLowerCase())) {
      // Treat as not_on_continente — store with a sentinel so matchItems can identify it
      products.push({
        aliases: [alias.toLowerCase()],
        continenteName: '',
        usualQty,
        notes: m[5].trim(),
        cachedPid: null,
        notOnContinente: true,
      });
      continue;
    }

    products.push({
      aliases: [alias.toLowerCase()],
      continenteName,
      usualQty,
      notes: m[5].trim(),
      cachedPid: pidMatch ? pidMatch[1] : null,
    });
  }

  return products;
}

/**
 * Persist a resolved PID back into preferred-products.md.
 * Appends a `<!-- pid:XXXXX -->` comment to the matching row.
 */
export function cachePid(continenteName: string, pid: string): void {
  let raw = fs.readFileSync(PREFERRED_PATH, 'utf-8');

  // Find the row and append the PID comment if not already present
  const escapedName = continenteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRe = new RegExp(`(\\|[^|]*\\|\\s*${escapedName}[^\\n]*)`, 'i');

  if (rowRe.test(raw) && !raw.includes(`<!-- pid:${pid} -->`)) {
    raw = raw.replace(rowRe, `$1 <!-- pid:${pid} -->`);
    fs.writeFileSync(PREFERRED_PATH, raw, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Parse shopping-list.md
// ---------------------------------------------------------------------------

export function parseShoppingList(): ShoppingItem[] {
  const raw = fs.readFileSync(SHOPPING_PATH, 'utf-8');
  const items: ShoppingItem[] = [];

  const rowRe =
    /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(raw)) !== null) {
    const name = m[1].trim();
    if (name === 'Item' || /^-+$/.test(name)) continue;

    const qtyMatch = /(\d+)/.exec(m[2].trim());
    items.push({
      name,
      qty: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
      unit: m[3].trim(),
      category: m[4].trim(),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchItems(
  shoppingItems: ShoppingItem[],
  products: PreferredProduct[],
): MatchResult[] {
  const notOnContinenteAliases = parseNotOnContinenteAliases();

  return shoppingItems.map((item) => {
    // Check if this item is explicitly listed as not available on Continente
    const normItemName = normalize(item.name);
    if (notOnContinenteAliases.has(normItemName)) {
      return { status: 'not_on_continente', item };
    }
    // Also check partial matches against the not-on-continente list
    for (const alias of notOnContinenteAliases) {
      if (alias === normItemName || alias.includes(normItemName) || normItemName.includes(alias)) {
        return { status: 'not_on_continente', item };
      }
    }

    const normItem = normItemName;
    const itemWords = new Set(normItem.split(' ').filter((w) => w.length > 2));

    for (const product of products) {
      for (const alias of product.aliases) {
        const normAlias = normalize(alias);

        if (normAlias === normItem)
          return product.notOnContinente
            ? { status: 'not_on_continente', item }
            : { status: 'matched', item, product };
        if (normAlias.includes(normItem) || normItem.includes(normAlias))
          return product.notOnContinente
            ? { status: 'not_on_continente', item }
            : { status: 'matched', item, product };

        const aliasWords = normAlias.split(' ').filter((w) => w.length > 2);
        const overlap = aliasWords.filter((w) => itemWords.has(w)).length;
        const coverage = overlap / Math.max(aliasWords.length, itemWords.size, 1);
        if (coverage >= 0.5)
          return product.notOnContinente
            ? { status: 'not_on_continente', item }
            : { status: 'matched', item, product };
      }
    }

    return { status: 'unmatched', item };
  });
}
