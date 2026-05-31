import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { filterHasAny, numVal, parseListLimit, parseListOffset, strVal } from "./filters.js";
import { isSampleListFilter, normalizeListFilter } from "./normalizeFilter.js";
import { toolingDbPath } from "./paths.js";
import { applyToolingSchema, seedToolingDatabaseIfEmpty, TOOLING_SEED_VERSION } from "./seed.js";

/** @type {import("better-sqlite3").Database | null} */
let dbSingleton = null;

const DOMAIN_KEYS = {
  customers: "customers",
  kundendaten: "customers",
  orders: "orders",
  auftragsdaten: "orders",
  shop: "shop",
  products: "products",
  produktdaten: "products",
  produkt: "products",
  inventory: "inventory",
  lager: "inventory",
  other: "other",
  sonstiges: "other",
};

const FILTER_KEYS = {
  shop: ["number", "number_min", "number_max", "region", "status", "name_contains", "sample"],
  customers: [
    "customer_id",
    "first_name",
    "last_name",
    "zip",
    "ort",
    "city",
    "email_contains",
    "name_contains",
    "sample",
  ],
  products: ["product_id", "sku", "category", "title_contains", "price_min", "price_max", "sample"],
  orders: [
    "order_id",
    "customer_id",
    "shop_id",
    "shop_number",
    "status",
    "total_min",
    "total_max",
    "created_from",
    "created_to",
    "product_id",
    "min_line_quantity",
    "sample",
  ],
  inventory: ["inventory_id", "product_id", "sku", "warehouse", "quantity_min", "quantity_max", "sample"],
};

/**
 * Open tooling SQLite and run the one-time seed if `workshop.sqlite` is still empty.
 * Idempotent — safe from tooling APIs, log generator, or client-secret (whichever runs first).
 * @returns {{ ready: boolean, newlySeeded: boolean, path: string }}
 */
export function ensureToolingMockSeeded() {
  const dbPath = toolingDbPath();
  let newlySeeded = false;
  if (!dbSingleton) {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    applyToolingSchema(db);
    newlySeeded = seedToolingDatabaseIfEmpty(db);
    dbSingleton = db;
  } else {
    newlySeeded = seedToolingDatabaseIfEmpty(dbSingleton);
  }
  const row = dbSingleton.prepare("SELECT value FROM tooling_meta WHERE key = 'seed_version'").get();
  return {
    ready: Boolean(row && String(row.value) === TOOLING_SEED_VERSION),
    newlySeeded,
    path: dbPath,
  };
}

/**
 * @returns {import("better-sqlite3").Database}
 */
export function getToolingDatabase() {
  ensureToolingMockSeeded();
  return /** @type {import("better-sqlite3").Database} */ (dbSingleton);
}

/** @deprecated Prefer ensureToolingMockSeeded */
export function ensureToolingMockDatabase() {
  ensureToolingMockSeeded();
}

/**
 * @param {string} domain
 */
function resolveDomainKey(domain) {
  return DOMAIN_KEYS[String(domain || "").trim()] || "";
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {Record<string, unknown>} row
 */
function rowShop(row) {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    region: row.region,
    status: row.status,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function rowCustomer(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    street: row.street,
    houseNumber: row.house_number,
    zip: row.zip,
    ort: row.city,
    address: row.address,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function rowProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    price: Number(row.price).toFixed(2),
    category: row.category,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function rowInventory(row) {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    warehouse: row.warehouse,
    quantity: String(row.quantity),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function rowOrder(row) {
  let lineItems = [];
  try {
    lineItems = JSON.parse(String(row.line_items_json || "[]"));
  } catch {
    lineItems = [];
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    shopId: row.shop_id,
    status: row.status,
    total: Number(row.total).toFixed(2),
    currency: row.currency,
    createdAt: row.created_at,
    title: row.title,
    productIds: row.product_ids,
    lineItems,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function readOther(db) {
  const row = db.prepare("SELECT value FROM tooling_meta WHERE key = 'other_json'").get();
  if (!row) return { notes: "Workshop mock — not seeded yet." };
  try {
    return JSON.parse(String(row.value));
  } catch {
    return { notes: "Workshop mock — invalid other_json." };
  }
}

/**
 * @param {string} key
 * @param {unknown} filter
 * @param {number} limit
 * @param {number} offset
 */
function listShops(db, filter, limit, offset) {
  if (isSampleListFilter(filter)) {
    return listSampleRows(db, "shops", "CAST(number AS INTEGER)", limit, offset, rowShop);
  }
  if (!filterHasAny(filter, FILTER_KEYS.shop)) {
    return { ok: false, error: "filter_required", message: "list on shop requires filter (e.g. number, region, status)." };
  }
  const f = /** @type {Record<string, unknown>} */ (filter);
  const where = [];
  const params = {};
  const num = strVal(f.number);
  if (num) {
    where.push("number = @number");
    params.number = num;
  }
  const nMin = numVal(f.number_min);
  if (nMin != null) {
    where.push("CAST(number AS INTEGER) >= @number_min");
    params.number_min = nMin;
  }
  const nMax = numVal(f.number_max);
  if (nMax != null) {
    where.push("CAST(number AS INTEGER) <= @number_max");
    params.number_max = nMax;
  }
  const region = strVal(f.region);
  if (region) {
    where.push("region = @region");
    params.region = region;
  }
  const status = strVal(f.status);
  if (status) {
    where.push("status = @status");
    params.status = status;
  }
  const nameLike = strVal(f.name_contains);
  if (nameLike) {
    where.push("name LIKE @name_like ESCAPE '\\'");
    params.name_like = `%${nameLike.replace(/[%_\\]/g, "\\$&")}%`;
  }
  const sql = `SELECT * FROM shops WHERE ${where.join(" AND ")} ORDER BY CAST(number AS INTEGER) LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  return { ok: true, data: rows.map((r) => rowShop(/** @type {Record<string, unknown>} */ (r))), limit, offset };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} table
 * @param {string} orderBy
 * @param {number} limit
 * @param {number} offset
 * @param {(row: Record<string, unknown>) => object} mapRow
 */
function listSampleRows(db, table, orderBy, limit, offset, mapRow) {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`).all({
    limit,
    offset,
  });
  return {
    ok: true,
    data: rows.map((r) => mapRow(/** @type {Record<string, unknown>} */ (r))),
    limit,
    offset,
    sample: true,
  };
}

function listCustomers(db, filter, limit, offset) {
  if (isSampleListFilter(filter)) {
    return listSampleRows(db, "customers", "id", limit, offset, rowCustomer);
  }
  if (!filterHasAny(filter, FILTER_KEYS.customers)) {
    return {
      ok: false,
      error: "filter_required",
      message:
        "list on customers requires filter (e.g. first_name + last_name, customer_id, name_contains, or sample: true).",
    };
  }
  const f = /** @type {Record<string, unknown>} */ (filter);
  const where = [];
  const params = {};
  const cid = strVal(f.customer_id);
  if (cid) {
    where.push("id = @customer_id");
    params.customer_id = cid;
  }
  const fn = strVal(f.first_name);
  if (fn) {
    where.push("first_name LIKE @first_name_like ESCAPE '\\' COLLATE NOCASE");
    params.first_name_like = fn.replace(/[%_\\]/g, "\\$&");
  }
  const ln = strVal(f.last_name);
  if (ln) {
    where.push("last_name LIKE @last_name_like ESCAPE '\\' COLLATE NOCASE");
    params.last_name_like = ln.replace(/[%_\\]/g, "\\$&");
  }
  const zip = strVal(f.zip);
  if (zip) {
    where.push("zip = @zip");
    params.zip = zip;
  }
  const ort = strVal(f.ort) || strVal(f.city);
  if (ort) {
    where.push("city = @city");
    params.city = ort;
  }
  const emailLike = strVal(f.email_contains);
  if (emailLike) {
    where.push("email LIKE @email_like ESCAPE '\\'");
    params.email_like = `%${emailLike.replace(/[%_\\]/g, "\\$&")}%`;
  }
  const nameLike = strVal(f.name_contains);
  if (nameLike) {
    where.push("name LIKE @name_like ESCAPE '\\'");
    params.name_like = `%${nameLike.replace(/[%_\\]/g, "\\$&")}%`;
  }
  const sql = `SELECT * FROM customers WHERE ${where.join(" AND ")} ORDER BY id LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  return {
    ok: true,
    data: rows.map((r) => rowCustomer(/** @type {Record<string, unknown>} */ (r))),
    limit,
    offset,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function listProducts(db, filter, limit, offset) {
  if (isSampleListFilter(filter)) {
    return listSampleRows(db, "products", "id", limit, offset, rowProduct);
  }
  if (!filterHasAny(filter, FILTER_KEYS.products)) {
    return {
      ok: false,
      error: "filter_required",
      message: "list on products requires filter (e.g. category, sku, title_contains).",
    };
  }
  const f = /** @type {Record<string, unknown>} */ (filter);
  const where = [];
  const params = {};
  const pid = strVal(f.product_id);
  if (pid) {
    where.push("(id = @product_id OR sku = @product_id)");
    params.product_id = pid;
  }
  const sku = strVal(f.sku);
  if (sku) {
    where.push("sku = @sku");
    params.sku = sku;
  }
  const cat = strVal(f.category);
  if (cat) {
    where.push("category = @category");
    params.category = cat;
  }
  const titleLike = strVal(f.title_contains);
  if (titleLike) {
    where.push("title LIKE @title_like ESCAPE '\\'");
    params.title_like = `%${titleLike.replace(/[%_\\]/g, "\\$&")}%`;
  }
  const pMin = numVal(f.price_min);
  if (pMin != null) {
    where.push("price >= @price_min");
    params.price_min = pMin;
  }
  const pMax = numVal(f.price_max);
  if (pMax != null) {
    where.push("price <= @price_max");
    params.price_max = pMax;
  }
  const sql = `SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY id LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  return {
    ok: true,
    data: rows.map((r) => rowProduct(/** @type {Record<string, unknown>} */ (r))),
    limit,
    offset,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function listInventory(db, filter, limit, offset) {
  if (isSampleListFilter(filter)) {
    return listSampleRows(db, "inventory", "id", limit, offset, rowInventory);
  }
  if (!filterHasAny(filter, FILTER_KEYS.inventory)) {
    return {
      ok: false,
      error: "filter_required",
      message: "list on inventory requires filter (e.g. product_id, warehouse, sku).",
    };
  }
  const f = /** @type {Record<string, unknown>} */ (filter);
  const where = [];
  const params = {};
  const iid = strVal(f.inventory_id);
  if (iid) {
    where.push("id = @inventory_id");
    params.inventory_id = iid;
  }
  const pid = strVal(f.product_id);
  if (pid) {
    where.push("(product_id = @product_id OR sku = @product_id)");
    params.product_id = pid;
  }
  const sku = strVal(f.sku);
  if (sku) {
    where.push("sku = @sku");
    params.sku = sku;
  }
  const wh = strVal(f.warehouse);
  if (wh) {
    where.push("warehouse = @warehouse");
    params.warehouse = wh;
  }
  const qMin = numVal(f.quantity_min);
  if (qMin != null) {
    where.push("quantity >= @quantity_min");
    params.quantity_min = qMin;
  }
  const qMax = numVal(f.quantity_max);
  if (qMax != null) {
    where.push("quantity <= @quantity_max");
    params.quantity_max = qMax;
  }
  const sql = `SELECT * FROM inventory WHERE ${where.join(" AND ")} ORDER BY id LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  return {
    ok: true,
    data: rows.map((r) => rowInventory(/** @type {Record<string, unknown>} */ (r))),
    limit,
    offset,
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function listOrders(db, filter, limit, offset) {
  if (isSampleListFilter(filter)) {
    return listSampleRows(db, "orders", "created_at DESC, id", limit, offset, rowOrder);
  }
  if (!filterHasAny(filter, FILTER_KEYS.orders)) {
    return {
      ok: false,
      error: "filter_required",
      message:
        "list on orders requires filter (e.g. customer_id, status, total_min, product_id, min_line_quantity).",
    };
  }
  const f = /** @type {Record<string, unknown>} */ (filter);
  const where = [];
  const params = {};
  const oid = strVal(f.order_id);
  if (oid) {
    where.push("id = @order_id");
    params.order_id = oid;
  }
  const cid = strVal(f.customer_id);
  if (cid) {
    where.push("customer_id = @customer_id");
    params.customer_id = cid;
  }
  const shopId = strVal(f.shop_id);
  if (shopId) {
    where.push("shop_id = @shop_id");
    params.shop_id = shopId;
  }
  const shopNum = strVal(f.shop_number);
  if (shopNum) {
    where.push(
      "shop_id IN (SELECT id FROM shops WHERE number = @shop_number) OR shop_id = @shop_number",
    );
    params.shop_number = shopNum;
  }
  const status = strVal(f.status);
  if (status) {
    where.push("status = @status");
    params.status = status;
  }
  const tMin = numVal(f.total_min);
  if (tMin != null) {
    where.push("total >= @total_min");
    params.total_min = tMin;
  }
  const tMax = numVal(f.total_max);
  if (tMax != null) {
    where.push("total <= @total_max");
    params.total_max = tMax;
  }
  const from = strVal(f.created_from);
  if (from) {
    where.push("created_at >= @created_from");
    params.created_from = from;
  }
  const to = strVal(f.created_to);
  if (to) {
    where.push("created_at <= @created_to");
    params.created_to = to;
  }
  const productId = strVal(f.product_id);
  if (productId) {
    where.push("(product_ids LIKE @product_like OR line_items_json LIKE @product_like)");
    params.product_like = `%${productId}%`;
  }
  const minQty = numVal(f.min_line_quantity);
  if (minQty != null) {
    where.push(`EXISTS (
      SELECT 1 FROM json_each(orders.line_items_json) AS li
      WHERE CAST(json_extract(li.value, '$.quantity') AS INTEGER) >= @min_line_quantity
    )`);
    params.min_line_quantity = minQty;
  }
  const sql = `SELECT * FROM orders WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all({ ...params, limit, offset });
  return {
    ok: true,
    data: rows.map((r) => rowOrder(/** @type {Record<string, unknown>} */ (r))),
    limit,
    offset,
  };
}

/**
 * @param {{ domain?: string, operation?: string, id?: string, record?: unknown, filter?: unknown, limit?: unknown, offset?: unknown }} raw
 */
export function runToolingMockCall(raw) {
  const db = getToolingDatabase();
  const key = resolveDomainKey(raw.domain);
  const operation = String(raw.operation || "list").trim().toLowerCase();
  const id = raw.id != null ? String(raw.id).trim() : "";

  if (!key) {
    return { ok: false, error: "invalid_domain", message: `Unknown domain "${raw.domain}".` };
  }

  if (key === "other") {
    const other = readOther(db);
    if (operation === "list" || operation === "get") {
      return { ok: true, data: other };
    }
    if (operation === "update" || operation === "patch") {
      const rec = isRecord(raw.record) ? raw.record : {};
      const merged = { ...other, ...rec };
      db.prepare(
        `INSERT INTO tooling_meta (key, value) VALUES ('other_json', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(JSON.stringify(merged));
      return { ok: true, data: merged };
    }
    return { ok: false, error: "unsupported_operation", message: `Operation "${operation}" not supported for other.` };
  }

  if (operation === "list") {
    let filter = normalizeListFilter(raw.filter);
    if (!filter || typeof filter !== "object") {
      return {
        ok: false,
        error: "filter_required",
        message:
          "list requires a filter object (e.g. first_name + last_name for customers, or sample: true for a preview).",
      };
    }
    const limit = parseListLimit(raw.limit ?? filter);
    const offset = parseListOffset(filter);
    if (key === "shop") return listShops(db, filter, limit, offset);
    if (key === "customers") return listCustomers(db, filter, limit, offset);
    if (key === "products") return listProducts(db, filter, limit, offset);
    if (key === "inventory") return listInventory(db, filter, limit, offset);
    if (key === "orders") return listOrders(db, filter, limit, offset);
  }

  if (operation === "get") {
    if (!id) return { ok: false, error: "missing_id", message: "get requires id." };
    const table = key;
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return { ok: false, error: "not_found", message: `No row with id "${id}".` };
    const r = /** @type {Record<string, unknown>} */ (row);
    if (key === "shop") return { ok: true, data: rowShop(r) };
    if (key === "customers") return { ok: true, data: rowCustomer(r) };
    if (key === "products") return { ok: true, data: rowProduct(r) };
    if (key === "inventory") return { ok: true, data: rowInventory(r) };
    if (key === "orders") return { ok: true, data: rowOrder(r) };
  }

  if (operation === "create") {
    const rec = isRecord(raw.record) ? { ...raw.record } : {};
    const nid = strVal(rec.id) || randomUUID();
    if (key === "shop") {
      db.prepare(
        "INSERT INTO shops (id, number, name, region, status) VALUES (?, ?, ?, ?, ?)",
      ).run(nid, strVal(rec.number) || nid, strVal(rec.name) || nid, strVal(rec.region) || "DE", strVal(rec.status) || "active");
      const row = db.prepare("SELECT * FROM shops WHERE id = ?").get(nid);
      return { ok: true, data: rowShop(/** @type {Record<string, unknown>} */ (row)) };
    }
    if (key === "customers") {
      const firstName = strVal(rec.firstName) || strVal(rec.first_name);
      const lastName = strVal(rec.lastName) || strVal(rec.last_name);
      db.prepare(`
        INSERT INTO customers (id, first_name, last_name, name, email, street, house_number, zip, city, address, shop_id, shop_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      `).run(
        nid,
        firstName,
        lastName,
        strVal(rec.name) || `${firstName} ${lastName}`.trim() || nid,
        strVal(rec.email),
        strVal(rec.street),
        strVal(rec.houseNumber) || strVal(rec.house_number),
        strVal(rec.zip),
        strVal(rec.ort) || strVal(rec.city),
        strVal(rec.address),
      );
      const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(nid);
      return { ok: true, data: rowCustomer(/** @type {Record<string, unknown>} */ (row)) };
    }
    if (key === "products") {
      db.prepare("INSERT INTO products (id, sku, title, price, category) VALUES (?, ?, ?, ?, ?)").run(
        nid,
        strVal(rec.sku) || nid,
        strVal(rec.title) || nid,
        numVal(rec.price) ?? 0,
        strVal(rec.category) || null,
      );
      const row = db.prepare("SELECT * FROM products WHERE id = ?").get(nid);
      return { ok: true, data: rowProduct(/** @type {Record<string, unknown>} */ (row)) };
    }
    if (key === "inventory") {
      db.prepare(
        "INSERT INTO inventory (id, product_id, sku, warehouse, quantity) VALUES (?, ?, ?, ?, ?)",
      ).run(
        nid,
        strVal(rec.productId) || strVal(rec.product_id),
        strVal(rec.sku),
        strVal(rec.warehouse) || "BER",
        numVal(rec.quantity) ?? 0,
      );
      const row = db.prepare("SELECT * FROM inventory WHERE id = ?").get(nid);
      return { ok: true, data: rowInventory(/** @type {Record<string, unknown>} */ (row)) };
    }
    if (key === "orders") {
      const lineItems = Array.isArray(rec.lineItems) ? rec.lineItems : [];
      db.prepare(`
        INSERT INTO orders (id, customer_id, shop_id, status, total, currency, created_at, title, product_ids, line_items_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nid,
        strVal(rec.customerId) || strVal(rec.customer_id),
        strVal(rec.shopId) || strVal(rec.shop_id),
        strVal(rec.status) || "open",
        numVal(rec.total) ?? 0,
        strVal(rec.currency) || "EUR",
        strVal(rec.createdAt) || strVal(rec.created_at) || new Date().toISOString().slice(0, 10),
        strVal(rec.title),
        strVal(rec.productIds) || strVal(rec.product_ids),
        JSON.stringify(lineItems),
      );
      const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(nid);
      return { ok: true, data: rowOrder(/** @type {Record<string, unknown>} */ (row)) };
    }
  }

  if (operation === "update" || operation === "patch") {
    if (!id) return { ok: false, error: "missing_id", message: "update requires id." };
    const rec = isRecord(raw.record) ? raw.record : {};
    const table = key;
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return { ok: false, error: "not_found", message: `No row with id "${id}".` };

    if (key === "shop") {
      const cur = rowShop(/** @type {Record<string, unknown>} */ (existing));
      const next = { ...cur, ...rec, id };
      db.prepare("UPDATE shops SET number = ?, name = ?, region = ?, status = ? WHERE id = ?").run(
        strVal(next.number) || next.id,
        strVal(next.name),
        strVal(next.region),
        strVal(next.status),
        id,
      );
    } else if (key === "customers") {
      const cur = rowCustomer(/** @type {Record<string, unknown>} */ (existing));
      const next = { ...cur, ...rec, id };
      db.prepare(`
        UPDATE customers SET first_name = ?, last_name = ?, name = ?, email = ?, street = ?, house_number = ?,
          zip = ?, city = ?, address = ? WHERE id = ?
      `).run(
        next.firstName,
        next.lastName,
        next.name,
        next.email,
        next.street,
        next.houseNumber,
        next.zip,
        strVal(rec.ort) || strVal(rec.city) || next.ort,
        next.address,
        id,
      );
    } else if (key === "products") {
      const cur = rowProduct(/** @type {Record<string, unknown>} */ (existing));
      const next = { ...cur, ...rec, id };
      db.prepare("UPDATE products SET sku = ?, title = ?, price = ?, category = ? WHERE id = ?").run(
        next.sku,
        next.title,
        numVal(next.price) ?? Number(cur.price),
        next.category,
        id,
      );
    } else if (key === "inventory") {
      const cur = rowInventory(/** @type {Record<string, unknown>} */ (existing));
      const next = { ...cur, ...rec, id };
      db.prepare("UPDATE inventory SET product_id = ?, sku = ?, warehouse = ?, quantity = ? WHERE id = ?").run(
        next.productId,
        next.sku,
        next.warehouse,
        numVal(next.quantity) ?? Number(cur.quantity),
        id,
      );
    } else if (key === "orders") {
      const cur = rowOrder(/** @type {Record<string, unknown>} */ (existing));
      const next = { ...cur, ...rec, id };
      db.prepare(`
        UPDATE orders SET customer_id = ?, shop_id = ?, status = ?, total = ?, currency = ?, created_at = ?,
          title = ?, product_ids = ?, line_items_json = ? WHERE id = ?
      `).run(
        next.customerId,
        next.shopId,
        next.status,
        numVal(next.total) ?? Number(cur.total),
        next.currency,
        next.createdAt,
        next.title,
        next.productIds,
        JSON.stringify(next.lineItems ?? cur.lineItems),
        id,
      );
    }

    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    const r = /** @type {Record<string, unknown>} */ (row);
    if (key === "shop") return { ok: true, data: rowShop(r) };
    if (key === "customers") return { ok: true, data: rowCustomer(r) };
    if (key === "products") return { ok: true, data: rowProduct(r) };
    if (key === "inventory") return { ok: true, data: rowInventory(r) };
    return { ok: true, data: rowOrder(r) };
  }

  if (operation === "delete") {
    if (!id) return { ok: false, error: "missing_id", message: "delete requires id." };
    const table = key;
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return { ok: false, error: "not_found", message: `No row with id "${id}".` };
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    const r = /** @type {Record<string, unknown>} */ (row);
    let data;
    if (key === "shop") data = rowShop(r);
    else if (key === "customers") data = rowCustomer(r);
    else if (key === "products") data = rowProduct(r);
    else if (key === "inventory") data = rowInventory(r);
    else data = rowOrder(r);
    return { ok: true, data: { deleted: true, id, record: data } };
  }

  return { ok: false, error: "unsupported_operation", message: `Operation "${operation}" not supported.` };
}

/** @param {import("better-sqlite3").Database | null} db */
export function closeToolingDatabaseForTests(db = dbSingleton) {
  if (db) {
    db.close();
  }
  if (db === dbSingleton) dbSingleton = null;
}
