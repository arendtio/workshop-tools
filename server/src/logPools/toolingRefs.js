import { ensureToolingMockSeeded, getToolingDatabase } from "../toolingMock/store.js";

/**
 * @typedef {{
 *   shops: { number: string }[],
 *   products: { id: string, sku: string }[],
 *   orders: { id: string, customer_id: string, shop_id: string, product_id: string }[],
 * }} ToolingLogRefs
 */

/**
 * Load shop numbers, product ids, and order/customer/product bundles from the tooling mock DB.
 * @returns {ToolingLogRefs | null}
 */
export function loadToolingRefsForLogs() {
  try {
    ensureToolingMockSeeded();
    const db = getToolingDatabase();
    const shopRows = db.prepare("SELECT number FROM shops ORDER BY CAST(number AS INTEGER)").all();
    const productRows = db.prepare("SELECT id, sku FROM products").all();
    const orderRows = db.prepare(
      "SELECT id, customer_id, shop_id, line_items_json FROM orders",
    ).all();

    if (!shopRows.length || !orderRows.length) return null;

    /** @type {ToolingLogRefs["orders"]} */
    const orders = [];
    for (const row of orderRows) {
      const r = /** @type {Record<string, unknown>} */ (row);
      let productId = "";
      try {
        const lines = JSON.parse(String(r.line_items_json || "[]"));
        if (Array.isArray(lines) && lines[0]) {
          const li = /** @type {Record<string, unknown>} */ (lines[0]);
          productId = String(li.productId || li.sku || "").trim();
        }
      } catch {
        productId = "";
      }
      orders.push({
        id: String(r.id),
        customer_id: String(r.customer_id),
        shop_id: String(r.shop_id),
        product_id: productId,
      });
    }

    return {
      shops: shopRows.map((r) => ({ number: String(/** @type {Record<string, unknown>} */ (r).number) })),
      products: productRows.map((r) => {
        const x = /** @type {Record<string, unknown>} */ (r);
        return { id: String(x.id), sku: String(x.sku) };
      }),
      orders,
    };
  } catch {
    return null;
  }
}
