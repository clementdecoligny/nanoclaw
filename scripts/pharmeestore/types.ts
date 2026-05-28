export interface PharmeeProduct {
  pid: string;
  name: string;
  qty: number;
}

export interface CartItem {
  pid: string;
  title: string;
  quantity: number;
  linePrice: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}

export interface PendingBasket {
  products: PharmeeProduct[];
  createdAt: string;
}

export interface LastOrder {
  executedAt: string;
  products: PharmeeProduct[];
  total: number;
}
