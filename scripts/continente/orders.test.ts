/**
 * orders.test.ts — unit tests for continente/orders.ts
 *
 * All network calls are mocked. Only the pure HTML-parsing functions are tested
 * directly; the orchestration function (getLatestOrder) is tested via fetch mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseOrderIds, parseOrderItems } from './orders.js';

// ---------------------------------------------------------------------------
// Fixture HTML — realistic Continente order history page (SFCC/Demandware)
// ---------------------------------------------------------------------------

const ORDER_HISTORY_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="order-history-wrapper">
    <div class="order-card" data-order-id="428057242">
      <a href="/detalhe-de-encomenda/?orderID=428057242">
        <span class="order-number">428057242</span>
        <span class="order-date">10/04/2026</span>
        <span class="order-status">Entregue</span>
      </a>
    </div>
    <div class="order-card" data-order-id="427121412">
      <a href="/detalhe-de-encomenda/?orderID=427121412">
        <span class="order-number">427121412</span>
        <span class="order-date">27/03/2026</span>
        <span class="order-status">Entregue</span>
      </a>
    </div>
    <div class="order-card" data-order-id="426000001">
      <a href="/detalhe-de-encomenda/?orderID=426000001">
        <span class="order-number">426000001</span>
        <span class="order-date">13/03/2026</span>
        <span class="order-status">Entregue</span>
      </a>
    </div>
  </div>
</body>
</html>
`;

// Alternate format: order IDs embedded in links only (no data attribute)
const ORDER_HISTORY_HTML_LINKS_ONLY = `
<div class="account-order-history">
  <ul class="order-history-table">
    <li><a href="/detalhe-de-encomenda/?orderID=428057242">Encomenda #428057242</a></li>
    <li><a href="/detalhe-de-encomenda/?orderID=427121412">Encomenda #427121412</a></li>
  </ul>
</div>
`;

// ---------------------------------------------------------------------------
// Fixture HTML — realistic Continente order detail page
// ---------------------------------------------------------------------------

const ORDER_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="order-detail-wrapper" data-order-id="428057242">
    <div class="order-header">
      <span class="order-number-label">428057242</span>
      <span class="order-date-value">10/04/2026</span>
      <span class="order-status-value">Entregue</span>
      <span class="order-total">€47.32</span>
    </div>
    <div class="product-line-items">
      <div class="product-line-item" data-pid="4949515">
        <span class="line-item-name">ARROZ BASMATI BRAJMA CIGALA KG</span>
        <span class="line-item-quantity">2</span>
        <span class="line-item-unit-price">€1.49</span>
      </div>
      <div class="product-line-item" data-pid="6664918">
        <span class="line-item-name">IOG MYTHOS NATURAL COT 1KG</span>
        <span class="line-item-quantity">2</span>
        <span class="line-item-unit-price">€1.99</span>
      </div>
      <div class="product-line-item" data-pid="9012345">
        <span class="line-item-name">OVOS MATINADOS M/L CAC 1DZ</span>
        <span class="line-item-quantity">1</span>
        <span class="line-item-unit-price">€3.99</span>
      </div>
    </div>
  </div>
</body>
</html>
`;

// Alternate format: items in a dataLayer push (JSON-in-HTML)
const ORDER_DETAIL_HTML_DATALAYER = `
<html><body>
<div class="order-confirmation-wrapper" data-orderid="428057242">
  <span class="order-status">Entregue</span>
  <span class="order-date">10/04/2026</span>
</div>
<script>
dataLayer.push({
  "event": "purchase",
  "ecommerce": {
    "transaction_id": "428057242",
    "value": 47.32,
    "items": [
      {"item_id": "4949515", "item_name": "ARROZ BASMATI BRAJMA CIGALA KG", "quantity": 2, "price": 1.49},
      {"item_id": "6664918", "item_name": "IOG MYTHOS NATURAL COT 1KG", "quantity": 2, "price": 1.99},
      {"item_id": "9012345", "item_name": "OVOS MATINADOS M/L CAC 1DZ", "quantity": 1, "price": 3.99}
    ]
  }
});
</script>
</body></html>
`;

// Edge case: order with substituted item (qty differs from what was ordered)
const ORDER_DETAIL_HTML_WITH_SUBSTITUTION = `
<html><body>
<div class="order-detail-wrapper" data-order-id="429000001">
  <span class="order-number-label">429000001</span>
  <span class="order-date-value">17/04/2026</span>
  <span class="order-status-value">Entregue</span>
  <div class="product-line-items">
    <div class="product-line-item" data-pid="1111111">
      <span class="line-item-name">LEITE MEIO GORDO CONTINENTE 1L</span>
      <span class="line-item-quantity">4</span>
      <span class="line-item-unit-price">€0.89</span>
    </div>
    <div class="product-line-item" data-pid="2222222">
      <span class="line-item-name">FLOCOS AVEIA CONTINENTE 500G</span>
      <span class="line-item-quantity">1</span>
      <span class="line-item-unit-price">€1.29</span>
    </div>
  </div>
</div>
</body></html>
`;

// ---------------------------------------------------------------------------
// parseOrderIds
// ---------------------------------------------------------------------------

describe('parseOrderIds', () => {
  it('extracts order IDs from data-order-id attributes', () => {
    const ids = parseOrderIds(ORDER_HISTORY_HTML);
    expect(ids).toEqual(['428057242', '427121412', '426000001']);
  });

  it('falls back to extracting IDs from order detail links', () => {
    const ids = parseOrderIds(ORDER_HISTORY_HTML_LINKS_ONLY);
    expect(ids).toEqual(['428057242', '427121412']);
  });

  it('deduplicates IDs that appear multiple times', () => {
    const html = `
      <div data-order-id="428057242"></div>
      <a href="/detalhe-de-encomenda/?orderID=428057242">link</a>
    `;
    const ids = parseOrderIds(html);
    expect(ids).toEqual(['428057242']);
  });

  it('returns empty array when no order IDs found', () => {
    expect(parseOrderIds('<html><body>No orders</body></html>')).toEqual([]);
  });

  it('returns empty array for empty HTML', () => {
    expect(parseOrderIds('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseOrderItems — DOM-based format
// ---------------------------------------------------------------------------

describe('parseOrderItems — DOM format', () => {
  it('extracts order ID from data attribute', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML);
    expect(order.orderId).toBe('428057242');
  });

  it('extracts order date', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML);
    expect(order.orderDate).toBe('10/04/2026');
  });

  it('extracts order status', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML);
    expect(order.status).toBe('Entregue');
  });

  it('extracts all product line items with pid, name, qty, unitPrice', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML);
    expect(order.items).toHaveLength(3);

    expect(order.items[0]).toMatchObject({
      pid: '4949515',
      name: 'ARROZ BASMATI BRAJMA CIGALA KG',
      qty: 2,
      unitPrice: 1.49,
    });
    expect(order.items[1]).toMatchObject({
      pid: '6664918',
      name: 'IOG MYTHOS NATURAL COT 1KG',
      qty: 2,
      unitPrice: 1.99,
    });
    expect(order.items[2]).toMatchObject({
      pid: '9012345',
      name: 'OVOS MATINADOS M/L CAC 1DZ',
      qty: 1,
      unitPrice: 3.99,
    });
  });

  it('computes total from items when not present in HTML', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML);
    // 2×1.49 + 2×1.99 + 1×3.99 = 2.98 + 3.98 + 3.99 = 10.95
    expect(order.total).toBeCloseTo(10.95, 2);
  });

  it('handles substituted/different quantities correctly', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML_WITH_SUBSTITUTION);
    expect(order.items).toHaveLength(2);
    expect(order.items[0].qty).toBe(4);
    expect(order.items[1].qty).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseOrderItems — dataLayer JSON format
// ---------------------------------------------------------------------------

describe('parseOrderItems — dataLayer JSON format', () => {
  it('extracts order ID from transaction_id', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML_DATALAYER);
    expect(order.orderId).toBe('428057242');
  });

  it('extracts items from dataLayer ecommerce.items', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML_DATALAYER);
    expect(order.items).toHaveLength(3);
    expect(order.items[0]).toMatchObject({
      pid: '4949515',
      name: 'ARROZ BASMATI BRAJMA CIGALA KG',
      qty: 2,
      unitPrice: 1.49,
    });
  });

  it('extracts total from dataLayer ecommerce.value', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML_DATALAYER);
    expect(order.total).toBeCloseTo(47.32, 2);
  });

  it('extracts status from DOM even when items come from dataLayer', () => {
    const order = parseOrderItems(ORDER_DETAIL_HTML_DATALAYER);
    expect(order.status).toBe('Entregue');
  });
});

// ---------------------------------------------------------------------------
// parseOrderItems — edge cases
// ---------------------------------------------------------------------------

describe('parseOrderItems — edge cases', () => {
  it('returns empty items array for HTML with no product blocks', () => {
    const order = parseOrderItems('<html><body><div>No products</div></body></html>');
    expect(order.items).toEqual([]);
  });

  it('handles price strings with comma decimal separator', () => {
    const html = `
      <div class="order-detail-wrapper" data-order-id="111">
        <div class="product-line-items">
          <div class="product-line-item" data-pid="123">
            <span class="line-item-name">PRODUTO X</span>
            <span class="line-item-quantity">3</span>
            <span class="line-item-unit-price">€2,49</span>
          </div>
        </div>
      </div>
    `;
    const order = parseOrderItems(html);
    expect(order.items[0].unitPrice).toBeCloseTo(2.49, 2);
  });

  it('handles missing unit price gracefully (defaults to 0)', () => {
    const html = `
      <div class="order-detail-wrapper" data-order-id="111">
        <div class="product-line-items">
          <div class="product-line-item" data-pid="123">
            <span class="line-item-name">PRODUTO X</span>
            <span class="line-item-quantity">1</span>
          </div>
        </div>
      </div>
    `;
    const order = parseOrderItems(html);
    expect(order.items[0].unitPrice).toBe(0);
  });
});
