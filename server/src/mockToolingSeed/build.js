import {
  FIRST_NAMES,
  LAST_NAMES,
  PLZ_CITIES,
  STREET_NAMES,
  CATALOG_PRODUCTS,
  WAREHOUSES,
} from "./lists.js";

export const MOCK_TOOLING_SEED_CONFIG = {
  shopNumberMin: 1000,
  shopNumberMax: 2000,
  customerCount: 800,
  ordersPerCustomerMin: 1,
  ordersPerCustomerMax: 10,
};

const ORDER_STATUSES = ["paid", "open", "shipped", "cancelled"];

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rng
 * @param {number} max exclusive
 */
function randInt(rng, max) {
  return Math.floor(rng() * max);
}

/**
 * @param {() => number} rng
 * @param {readonly string[]} arr
 */
function pick(rng, arr) {
  return arr[randInt(rng, arr.length)];
}

/**
 * @param {string} s
 */
function slugAscii(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {{ seed?: number }} [opts]
 */
export function buildMockToolingSeed(opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = createRng(seed);
  const cfg = MOCK_TOOLING_SEED_CONFIG;

  /** @type {{ id: string, number: string, name: string, region: string, status: string }[]} */
  const shop = [];
  for (let n = cfg.shopNumberMin; n <= cfg.shopNumberMax; n++) {
    const num = String(n);
    shop.push({
      id: num,
      number: num,
      name: `Shop ${num}`,
      region: n % 2 === 0 ? "DE" : "AT",
      status: rng() < 0.03 ? "closed" : "active",
    });
  }

  /** @type {{ id: string, title: string, price: string, category: string, sku: string }[]} */
  const products = CATALOG_PRODUCTS.map((p) => ({
    id: p.id,
    sku: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
  }));

  /** @type {typeof products[number][]} */
  const customers = [];
  for (let i = 1; i <= cfg.customerCount; i++) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const street = pick(rng, STREET_NAMES);
    const houseNumber = String(1 + randInt(rng, 180));
    const loc = pick(rng, PLZ_CITIES);
    const id = `cust-${String(i).padStart(6, "0")}`;
    const emailLocal = `${slugAscii(firstName)}.${slugAscii(lastName)}${i % 97}`;
    customers.push({
      id,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email: `${emailLocal}@kunde-beispiel.de`,
      street,
      houseNumber,
      zip: loc.plz,
      city: loc.city,
      address: `${street} ${houseNumber}, ${loc.plz} ${loc.city}`,
    });
  }

  /** @type {object[]} */
  const orders = [];
  let orderSeq = 1;
  const statusWeights = [0.55, 0.2, 0.18, 0.07];

  function pickStatus() {
    const r = rng();
    let acc = 0;
    for (let i = 0; i < ORDER_STATUSES.length; i++) {
      acc += statusWeights[i];
      if (r < acc) return ORDER_STATUSES[i];
    }
    return ORDER_STATUSES[0];
  }

  for (const cust of customers) {
    const nOrders = clampInt(
      cfg.ordersPerCustomerMin +
        randInt(rng, cfg.ordersPerCustomerMax - cfg.ordersPerCustomerMin + 1),
      cfg.ordersPerCustomerMin,
      cfg.ordersPerCustomerMax,
    );

    for (let o = 0; o < nOrders; o++) {
      const lineCount = 1 + randInt(rng, 4);
      /** @type {{ productId: string, sku: string, title: string, quantity: number, unitPrice: string, lineTotal: string }[]} */
      const lineItems = [];
      let total = 0;
      const used = new Set();

      for (let li = 0; li < lineCount; li++) {
        let prod = products[randInt(rng, products.length)];
        let guard = 0;
        while (used.has(prod.id) && guard++ < 8) {
          prod = products[randInt(rng, products.length)];
        }
        used.add(prod.id);
        const qty = 1 + randInt(rng, 3);
        const unit = Number.parseFloat(prod.price);
        const lineTotal = unit * qty;
        total += lineTotal;
        lineItems.push({
          productId: prod.id,
          sku: prod.sku,
          title: prod.title,
          quantity: qty,
          unitPrice: prod.price,
          lineTotal: lineTotal.toFixed(2),
        });
      }

      const status = pickStatus();
      const id = `ord-${String(orderSeq++).padStart(7, "0")}`;
      const daysAgo = randInt(rng, 365);
      const created = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

      orders.push({
        id,
        customerId: cust.id,
        shopId: shop[randInt(rng, shop.length)].id,
        status,
        total: total.toFixed(2),
        currency: "EUR",
        createdAt: created,
        title: lineItems.map((x) => x.title).join("; "),
        lineItems,
        productIds: lineItems.map((x) => x.productId).join(","),
      });
    }
  }

  /** @type {{ id: string, sku: string, productId: string, warehouse: string, quantity: string }[]} */
  const inventory = [];
  let invSeq = 1;
  for (const prod of products) {
    const whCount = 2 + randInt(rng, 3);
    const usedWh = new Set();
    for (let w = 0; w < whCount; w++) {
      let wh = pick(rng, WAREHOUSES);
      let guard = 0;
      while (usedWh.has(wh) && guard++ < 10) wh = pick(rng, WAREHOUSES);
      usedWh.add(wh);
      inventory.push({
        id: `inv-${String(invSeq++).padStart(6, "0")}`,
        sku: prod.sku,
        productId: prod.id,
        warehouse: wh,
        quantity: String(randInt(rng, 501)),
      });
    }
  }

  return {
    seed,
    shop,
    products,
    customers,
    orders,
    inventory,
    other: {
      notes: "Workshop mock domain — arbitrary JSON.",
      catalog: "Generic retail product catalog (workshop stub).",
      generatedAt: new Date().toISOString(),
      counts: {
        shops: shop.length,
        customers: customers.length,
        orders: orders.length,
        products: products.length,
        inventory: inventory.length,
      },
    },
  };
}
