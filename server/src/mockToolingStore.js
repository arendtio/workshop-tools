import { randomUUID } from "node:crypto";

const MAX_SESSIONS = 200;
/** @type {string[]} */
const fifo = [];
/** @type {Map<string, ReturnType<typeof cloneSeed>>} */
const sessions = new Map();

function cloneSeed() {
  return {
    customers: [
      { id: "cust-001", name: "Ada Beispiel", email: "ada@beispiel.de", city: "Berlin" },
      { id: "cust-002", name: "Ben Demo", email: "ben@beispiel.de", city: "Hamburg" },
      { id: "cust-003", name: "Cleo Test", email: "cleo@beispiel.de", city: "München" },
    ],
    orders: [
      { id: "ord-1001", customerId: "cust-001", total: "142.50", status: "paid", title: "Starter kit" },
      { id: "ord-1002", customerId: "cust-002", total: "89.00", status: "open", title: "Add-on pack" },
    ],
    shop: [
      { id: "sku-01", title: "Workshop deck", price: "49.00", stock: "12" },
      { id: "sku-02", title: "Facilitation kit", price: "129.00", stock: "4" },
    ],
    inventory: [
      { id: "inv-1", sku: "sku-01", warehouse: "HAM", quantity: "40" },
      { id: "inv-2", sku: "sku-02", warehouse: "BER", quantity: "15" },
    ],
    other: { notes: "Generic workshop stub domain — store arbitrary JSON here." },
  };
}

function evict() {
  while (fifo.length > MAX_SESSIONS) {
    const id = fifo.shift();
    if (id) sessions.delete(id);
  }
}

/**
 * @returns {string} new session id with seeded mock tables
 */
export function createMockToolingSession() {
  evict();
  const id = randomUUID();
  sessions.set(id, cloneSeed());
  fifo.push(id);
  return id;
}

/** @param {string} id */
export function hasMockToolingSession(id) {
  return sessions.has(String(id || ""));
}

/**
 * @param {string} sessionId
 * @param {{ domain?: string, operation?: string, id?: string, record?: unknown }} raw
 */
export function runMockToolingCall(sessionId, raw) {
  const sid = String(sessionId || "").trim();
  const db = sessions.get(sid);
  if (!db) {
    return { ok: false, error: "unknown_tooling_session", message: "Unknown or expired tooling mock session." };
  }

  const domain = String(raw.domain || "").trim();
  const operation = String(raw.operation || "list").trim().toLowerCase();
  const id = raw.id != null ? String(raw.id).trim() : "";

  const key =
    domain === "customers" || domain === "kundendaten"
      ? "customers"
      : domain === "orders" || domain === "auftragsdaten"
        ? "orders"
        : domain === "shop" || domain === "produktdaten"
          ? "shop"
          : domain === "inventory" || domain === "lager"
            ? "inventory"
            : domain === "other" || domain === "sonstiges"
              ? "other"
              : "";

  if (!key || !Object.prototype.hasOwnProperty.call(db, key)) {
    return { ok: false, error: "invalid_domain", message: `Unknown domain "${domain}".` };
  }

  if (key === "other") {
    if (operation === "list" || operation === "get") {
      return { ok: true, data: db.other };
    }
    if (operation === "update" || operation === "patch") {
      const rec = isRecord(raw.record) ? raw.record : {};
      Object.assign(db.other, rec);
      return { ok: true, data: db.other };
    }
    return { ok: false, error: "unsupported_operation", message: `Operation "${operation}" not supported for other.` };
  }

  /** @type {{ id: string }[]} */
  const arr = /** @type {{ id: string }[]} */ (db[key]);

  if (operation === "list") {
    return { ok: true, data: arr.map((x) => ({ ...x })) };
  }

  if (operation === "get") {
    if (!id) return { ok: false, error: "missing_id", message: "get requires id." };
    const row = arr.find((r) => String(r.id) === id);
    if (!row) return { ok: false, error: "not_found", message: `No row with id "${id}".` };
    return { ok: true, data: { ...row } };
  }

  if (operation === "create") {
    const rec = isRecord(raw.record) ? { ...raw.record } : {};
    const nid = String(rec.id || "").trim() || randomUUID();
    rec.id = nid;
    arr.push(/** @type {never} */ (rec));
    return { ok: true, data: { ...rec } };
  }

  if (operation === "update" || operation === "patch") {
    if (!id) return { ok: false, error: "missing_id", message: "update requires id." };
    const row = arr.find((r) => String(r.id) === id);
    if (!row) return { ok: false, error: "not_found", message: `No row with id "${id}".` };
    const rec = isRecord(raw.record) ? raw.record : {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "id") continue;
      /** @type {Record<string, unknown>} */ (row)[k] = v;
    }
    return { ok: true, data: { ...row } };
  }

  if (operation === "delete") {
    if (!id) return { ok: false, error: "missing_id", message: "delete requires id." };
    const ix = arr.findIndex((r) => String(r.id) === id);
    if (ix === -1) return { ok: false, error: "not_found", message: `No row with id "${id}".` };
    const [removed] = arr.splice(ix, 1);
    return { ok: true, data: { deleted: true, id, record: removed ? { ...removed } : null } };
  }

  return { ok: false, error: "unsupported_operation", message: `Operation "${operation}" not supported.` };
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
