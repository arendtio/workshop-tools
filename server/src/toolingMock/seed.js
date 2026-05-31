import Database from "better-sqlite3";
import { buildMockToolingSeed } from "../mockToolingSeed/build.js";

export const TOOLING_SEED_VERSION = "2";

const DDL = `
CREATE TABLE IF NOT EXISTS tooling_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_shops_number ON shops(number);
CREATE INDEX IF NOT EXISTS idx_shops_region ON shops(region);
CREATE INDEX IF NOT EXISTS idx_shops_status ON shops(status);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  name TEXT NOT NULL,
  email TEXT,
  street TEXT,
  house_number TEXT,
  zip TEXT,
  city TEXT,
  address TEXT,
  shop_id TEXT,
  shop_number TEXT
);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_shop_number ON customers(shop_number);
CREATE INDEX IF NOT EXISTS idx_customers_zip ON customers(zip);
CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  warehouse TEXT NOT NULL,
  quantity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_wh ON inventory(warehouse);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  shop_id TEXT,
  status TEXT NOT NULL,
  total REAL NOT NULL,
  currency TEXT,
  created_at TEXT,
  title TEXT,
  product_ids TEXT,
  line_items_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_total ON orders(total);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
`;

/**
 * @param {import("better-sqlite3").Database} db
 */
export function applyToolingSchema(db) {
  db.exec(DDL);
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function seedToolingDatabaseIfEmpty(db) {
  const row = db.prepare("SELECT value FROM tooling_meta WHERE key = 'seed_version'").get();
  if (row && String(row.value) === TOOLING_SEED_VERSION) return false;

  const data = buildMockToolingSeed({ seed: 42 });

  const seedTx = db.transaction(() => {
    db.exec(`
      DELETE FROM inventory;
      DELETE FROM orders;
      DELETE FROM customers;
      DELETE FROM products;
      DELETE FROM shops;
      DELETE FROM tooling_meta;
    `);

    const insShop = db.prepare(
      "INSERT INTO shops (id, number, name, region, status) VALUES (@id, @number, @name, @region, @status)",
    );
    for (const s of data.shop) {
      insShop.run(s);
    }

    const insProd = db.prepare(
      "INSERT INTO products (id, sku, title, price, category) VALUES (@id, @sku, @title, @price, @category)",
    );
    for (const p of data.products) {
      insProd.run({
        id: p.id,
        sku: p.sku,
        title: p.title,
        price: Number.parseFloat(p.price),
        category: p.category,
      });
    }

    const insCust = db.prepare(`
      INSERT INTO customers (
        id, first_name, last_name, name, email, street, house_number, zip, city, address, shop_id, shop_number
      ) VALUES (
        @id, @firstName, @lastName, @name, @email, @street, @houseNumber, @zip, @city, @address, NULL, NULL
      )`);
    for (const c of data.customers) {
      insCust.run(c);
    }

    const insOrd = db.prepare(`
      INSERT INTO orders (
        id, customer_id, shop_id, status, total, currency, created_at, title, product_ids, line_items_json
      ) VALUES (
        @id, @customerId, @shopId, @status, @total, @currency, @createdAt, @title, @productIds, @lineItemsJson
      )`);
    for (const o of data.orders) {
      insOrd.run({
        id: o.id,
        customerId: o.customerId,
        shopId: o.shopId,
        status: o.status,
        total: Number.parseFloat(o.total),
        currency: o.currency,
        createdAt: o.createdAt,
        title: o.title,
        productIds: o.productIds,
        lineItemsJson: JSON.stringify(o.lineItems),
      });
    }

    const insInv = db.prepare(
      "INSERT INTO inventory (id, product_id, sku, warehouse, quantity) VALUES (@id, @productId, @sku, @warehouse, @quantity)",
    );
    for (const i of data.inventory) {
      insInv.run({
        id: i.id,
        productId: i.productId,
        sku: i.sku,
        warehouse: i.warehouse,
        quantity: Number.parseInt(String(i.quantity), 10) || 0,
      });
    }

    db.prepare(
      `INSERT INTO tooling_meta (key, value) VALUES ('seed_version', ?), ('seeded_at', ?), ('other_json', ?)`,
    ).run(TOOLING_SEED_VERSION, new Date().toISOString(), JSON.stringify(data.other));
  });

  seedTx();
  return true;
}
