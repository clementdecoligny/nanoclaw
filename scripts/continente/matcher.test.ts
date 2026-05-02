/**
 * matcher.test.ts — unit tests for continente/matcher.ts
 *
 * All file I/O is mocked so tests are hermetic and fast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Mock fs — matcher reads files via fs.readFileSync
// ---------------------------------------------------------------------------

vi.mock('fs');

const mockReadFileSync = vi.mocked(fs.readFileSync);

// ---------------------------------------------------------------------------
// Sample fixture data
// ---------------------------------------------------------------------------

/** A minimal but representative preferred-products.md */
const PREFERRED_MD = `# Preferred Products

| Notre nom | Nom exact Continente | Prix | Qté / commande | Notes |
|-----------|---------------------|------|----------------|-------|
| Riz basmati | Arroz Basmati Continente | 1.49 | 2 × 1 kg | Sac 1kg |
| Yaourts nature | Iogurte Natural Continente | 0.99 | 8 × 125g | <!-- pid:6664918 --> |
| Flocons avoine | Flocos de Aveia Continente | 1.29 | 1 × 500g | |
| Lait UHT | Non vu | - | - | pas en ligne |

## Non trouvé chez Continente

| Notre nom | Notes |
|-----------|-------|
| Esparregado | Surgélé spécialisé |
| Pain de mie complet | Marque spécifique |
`;

/** A shopping list with a mix of matched, unmatched, and not-on-continente items */
const SHOPPING_MD = `# Shopping List

| Item | Qty | Unit | Category |
|------|-----|------|----------|
| Riz basmati | 2 | kg | Épicerie |
| Esparregado | 1 | paquet | Surgelés |
| Chocolat noir | 3 | tablettes | Épicerie |
| Yaourts nature | 8 | pots | Frais |
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import {
  parsePreferredProducts,
  parseShoppingList,
  parseNotOnContinenteAliases,
  matchItems,
} from './matcher.js';

function setupFileMocks(preferred = PREFERRED_MD, shopping = SHOPPING_MD) {
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const p = filePath as string;
    if (p.includes('preferred-products')) return preferred;
    if (p.includes('shopping-list')) return shopping;
    throw new Error(`Unexpected readFileSync call: ${p}`);
  });
}

// ---------------------------------------------------------------------------
// parsePreferredProducts
// ---------------------------------------------------------------------------

describe('parsePreferredProducts', () => {
  beforeEach(() => setupFileMocks());

  it('parses product rows with all columns', () => {
    const products = parsePreferredProducts();
    const riz = products.find((p) => p.aliases.includes('riz basmati'));
    expect(riz).toBeDefined();
    expect(riz!.continenteName).toBe('Arroz Basmati Continente');
    expect(riz!.usualQty).toBe(2);
  });

  it('extracts cached PID from <!-- pid:XXXXX --> comment', () => {
    const products = parsePreferredProducts();
    const yaourt = products.find((p) => p.aliases.includes('yaourts nature'));
    expect(yaourt).toBeDefined();
    expect(yaourt!.cachedPid).toBe('6664918');
  });

  it('returns null cachedPid when no PID comment is present', () => {
    const products = parsePreferredProducts();
    const flocons = products.find((p) => p.aliases.includes('flocons avoine'));
    expect(flocons).toBeDefined();
    expect(flocons!.cachedPid).toBeNull();
  });

  it('marks "Non vu" rows as notOnContinente', () => {
    const products = parsePreferredProducts();
    const lait = products.find((p) => p.aliases.includes('lait uht'));
    expect(lait).toBeDefined();
    expect(lait!.notOnContinente).toBe(true);
  });

  it('does not include header or separator rows', () => {
    const products = parsePreferredProducts();
    expect(products.every((p) => p.aliases[0] !== 'notre nom')).toBe(true);
    expect(products.every((p) => !/^-+$/.test(p.aliases[0]))).toBe(true);
  });

  it('stops parsing at the "Non trouvé chez Continente" section', () => {
    const products = parsePreferredProducts();
    // Esparregado and Pain de mie are in the not-on-continente section, not as regular products
    const regular = products.filter((p) => !p.notOnContinente);
    expect(regular.every((p) => !p.aliases[0].includes('esparregado'))).toBe(true);
  });

  it('returns empty array for empty file', () => {
    mockReadFileSync.mockReturnValue('');
    expect(parsePreferredProducts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseNotOnContinenteAliases
// ---------------------------------------------------------------------------

describe('parseNotOnContinenteAliases', () => {
  beforeEach(() => setupFileMocks());

  it('returns aliases from the "Non trouvé" section', () => {
    const aliases = parseNotOnContinenteAliases();
    expect(aliases.has('esparregado')).toBe(true);
    expect(aliases.has('pain de mie complet')).toBe(true);
  });

  it('does not include items from the main table', () => {
    const aliases = parseNotOnContinenteAliases();
    expect(aliases.has('riz basmati')).toBe(false);
  });

  it('returns empty set when section is absent', () => {
    mockReadFileSync.mockReturnValue('| A | B |\n|---|---|\n| Riz | Arroz Basmati | 1.49 | 2 × 1 kg | |');
    expect(parseNotOnContinenteAliases().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseShoppingList
// ---------------------------------------------------------------------------

describe('parseShoppingList', () => {
  beforeEach(() => setupFileMocks());

  it('parses item names and quantities', () => {
    const items = parseShoppingList();
    const riz = items.find((i) => i.name === 'Riz basmati');
    expect(riz).toBeDefined();
    expect(riz!.qty).toBe(2);
    expect(riz!.unit).toBe('kg');
    expect(riz!.category).toBe('Épicerie');
  });

  it('defaults qty to 1 when no number is present', () => {
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('shopping')) {
        return '| Item | Qty | Unit | Category |\n|------|-----|------|----------|\n| Sel | une pincée | g | Épicerie |';
      }
      return PREFERRED_MD;
    });
    const items = parseShoppingList();
    expect(items[0].qty).toBe(1);
  });

  it('skips header and separator rows', () => {
    const items = parseShoppingList();
    expect(items.every((i) => i.name !== 'Item')).toBe(true);
  });

  it('returns empty array for empty file', () => {
    mockReadFileSync.mockImplementation((p: unknown) => {
      if ((p as string).includes('shopping')) return '';
      return PREFERRED_MD;
    });
    expect(parseShoppingList()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// matchItems
// ---------------------------------------------------------------------------

describe('matchItems', () => {
  beforeEach(() => setupFileMocks());

  it('returns matched for an exact alias match', () => {
    const products = parsePreferredProducts();
    const items = [{ name: 'Riz basmati', qty: 2, unit: 'kg', category: 'Épicerie' }];
    const results = matchItems(items, products);
    expect(results[0].status).toBe('matched');
    expect(results[0].product?.continenteName).toBe('Arroz Basmati Continente');
  });

  it('returns not_on_continente for items in the "Non trouvé" section', () => {
    const products = parsePreferredProducts();
    const items = [{ name: 'Esparregado', qty: 1, unit: 'paquet', category: 'Surgelés' }];
    const results = matchItems(items, products);
    expect(results[0].status).toBe('not_on_continente');
  });

  it('returns not_on_continente for products with notOnContinente flag', () => {
    const products = parsePreferredProducts();
    const items = [{ name: 'Lait UHT', qty: 1, unit: 'L', category: 'Frais' }];
    const results = matchItems(items, products);
    expect(results[0].status).toBe('not_on_continente');
  });

  it('returns unmatched for items with no preferred product entry', () => {
    const products = parsePreferredProducts();
    const items = [{ name: 'Chocolat noir', qty: 3, unit: 'tablettes', category: 'Épicerie' }];
    const results = matchItems(items, products);
    expect(results[0].status).toBe('unmatched');
  });

  it('handles case-insensitive partial matching', () => {
    const products = parsePreferredProducts();
    // "YAOURTS NATURE" should match "yaourts nature"
    const items = [{ name: 'YAOURTS NATURE', qty: 8, unit: 'pots', category: 'Frais' }];
    const results = matchItems(items, products);
    expect(results[0].status).toBe('matched');
  });

  it('returns correct status for each item in a mixed list', () => {
    const products = parsePreferredProducts();
    const items = parseShoppingList();
    const results = matchItems(items, products);

    const byName = Object.fromEntries(results.map((r) => [r.item.name, r.status]));
    expect(byName['Riz basmati']).toBe('matched');
    expect(byName['Esparregado']).toBe('not_on_continente');
    expect(byName['Chocolat noir']).toBe('unmatched');
    expect(byName['Yaourts nature']).toBe('matched');
  });

  it('returns empty array for empty shopping list', () => {
    const products = parsePreferredProducts();
    expect(matchItems([], products)).toEqual([]);
  });

  it('returns unmatched for all items when products list is empty', () => {
    mockReadFileSync.mockImplementation((p: unknown) => {
      // Return a preferred file with no products and no not-on-continente section
      if ((p as string).includes('preferred')) return '';
      return SHOPPING_MD;
    });
    const products = parsePreferredProducts();
    const items = parseShoppingList();
    const results = matchItems(items, products);
    expect(results.every((r) => r.status === 'unmatched')).toBe(true);
  });
});
