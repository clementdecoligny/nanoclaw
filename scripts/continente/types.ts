// Continente / Demandware API types

export interface ContinenteProduct {
  pid: string;        // Demandware product ID, e.g. "6664918"
  name: string;       // display name, e.g. "Ovos de Ar Livre Classe M/L Matinados"
  price: number;      // euros, e.g. 4.59
  available: boolean;
  url?: string;       // full product page URL
}

export interface CartItem {
  pid: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Cart {
  items: CartItem[];
  grandTotal: number;
  quantityTotal: number;
}

// Internal matcher/planner types

export interface PreferredProduct {
  aliases: string[];
  continenteName: string;  // exact name used for searching
  usualQty: number;
  notes: string;
  cachedPid: string | null; // cached after first successful search
  notOnContinente?: boolean; // true when continenteName is a placeholder meaning "not found"
}

export interface ShoppingItem {
  name: string;
  qty: number;
  unit: string;
  category: string;
}

export type MatchResult =
  | { status: 'matched'; item: ShoppingItem; product: PreferredProduct }
  | { status: 'unmatched'; item: ShoppingItem }
  | { status: 'not_on_continente'; item: ShoppingItem };

export interface BasketItem {
  shoppingListName: string;
  continenteName: string;
  pid: string;
  price: number;
  qty: number;
}
