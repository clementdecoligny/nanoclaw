import { authenticate, get, post, mergeCookies } from './auth.js';
import type { Cart, CartItem, PharmeeProduct } from './types.js';

// Fixed product catalogue from wishlist (PIDs verified 2026-05-28)
export const PRODUCTS: PharmeeProduct[] = [
  { pid: '66413', name: 'Bambo Nature Fraldas T4 (L) 7-14kg (3x48)', qty: 1 },
  { pid: '65635', name: 'Bambo Nature Fraldas T5 (XL) 12-18kg (3x44)', qty: 1 },
  { pid: '79898', name: 'Bambo Nature Toalhitas Sem Perfume 80un (x12)', qty: 1 },
];

const WISHLIST_ID = '41';

export async function addToCart(pid: string, qty: number): Promise<Cart> {
  const cookies = await authenticate();
  const path = `/api/api.php/addToBasket/${WISHLIST_ID}/0/${pid}/${qty}/0`;
  const res = await get(path);
  if (res.status !== 200) throw new Error(`addToBasket failed for pid ${pid}: HTTP ${res.status}`);

  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new Error(`addToBasket returned non-JSON for pid ${pid}: ${res.body.slice(0, 200)}`);
  }

  if (json.status !== 'true' && json.status !== true) {
    throw new Error(`addToBasket returned error for pid ${pid}: ${JSON.stringify(json).slice(0, 200)}`);
  }

  return parseCart(json.response?.cart);
}

function parseCart(cart: any): Cart {
  if (!cart) return { items: [], total: 0, itemCount: 0 };
  const items: CartItem[] = (cart.items || []).map((item: any) => ({
    pid: item.product_id ?? item.data_line?.pid ?? '',
    title: item.title ?? '',
    quantity: Number(item.quantity ?? 0),
    linePrice: Number(item.line_price?.value ?? 0),
  }));
  return {
    items,
    total: Number(cart.total_price?.value ?? cart.subtotal_price?.value ?? 0),
    itemCount: Number(cart.item_count ?? items.length),
  };
}

export async function selectMbway(): Promise<void> {
  const cookies = await authenticate();
  // Select MBWay as payment method (p=28, m=7)
  const body = 'p=28&m=7&cp=1200-168&distrito=';
  await post('/checkout/v1/ajax_pagamento.php', body, cookies, {
    Referer: 'https://www.pharmeestore.com/checkout/v1/?id=4',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: 'https://www.pharmeestore.com',
  });
}

export async function submitOrder(phone: string): Promise<void> {
  const cookies = await authenticate();

  // Validate postcode (pre-flight)
  await post('/checkout/v1/ajax_validar_cp.php', 'cp=1200-168', cookies, {
    Referer: 'https://www.pharmeestore.com/checkout/v1/?id=4',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: 'https://www.pharmeestore.com',
  });

  // Validate NIF (pre-flight)
  await get(`/checkout/v1/ajax_validar_nif.php?cc=pt&nif=291628788&distrito=0`);

  // Strip leading +351 or 351 if present — the form wants just the 9-digit number
  const phoneClean = phone.replace(/^\+?351/, '').replace(/\s/g, '');

  const params = new URLSearchParams({
    sem_entrega: '0',
    pickuptype: '1',
    metodo: '7',
    op_entrega: '7||2',
    ma: 'ODUyOQ==',
    shipping_nome: 'Clément de Coligny',
    shipping_morada1: 'Rua Eduardo Coelho 46 2D',
    shipping_morada2: '',
    shipping_cp: '1200-168',
    shipping_cidade: 'Lisboa',
    prefix1: '205',
    telefone1: `351${phoneClean}`,
    pick_city: '1200',
    pick_store: '1',
    prefix2: '205',
    telefone2: `351${phoneClean}`,
    pickme_city: '1200',
    prefix3: '205',
    telefone3: `351${phoneClean}`,
    maHome: 'ODUyOQ==',
    shippinghome_nome: 'Clément de Coligny',
    shippinghome_morada1: 'Rua Eduardo Coelho 46 2D',
    shippinghome_morada2: '',
    shippinghome_cp: '1200-168',
    shippinghome_cidade: 'Lisboa',
    pickmehome_city: '1200',
    pickup_parceiros: '1200',
    enviar_factura: '1',
    nif: '291628788',
    fact_shipp: '2',
    encomenda_obs: '',
    points_type: '0',
    payment: '28',
    mbwaynumber: phoneClean,
  });

  const res = await post('/checkout/v1/actions_checkout.php', params.toString(), cookies, {
    Referer: 'https://www.pharmeestore.com/checkout/v1/?id=4',
    Origin: 'https://www.pharmeestore.com',
    'Cache-Control': 'max-age=0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  });

  // Expect 302 redirect to p_globalpayment_mbway.php
  if (res.status !== 302 || !res.location?.includes('mbway')) {
    throw new Error(`Checkout submission unexpected response: HTTP ${res.status}, location: ${res.location ?? 'none'}\n${res.body.slice(0, 300)}`);
  }
}
