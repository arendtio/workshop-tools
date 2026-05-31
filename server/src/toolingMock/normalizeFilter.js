/**
 * Map German / camelCase form labels to canonical filter keys (list operations).
 * @param {unknown} filter
 */
export function normalizeListFilter(filter) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return filter;
  const src = /** @type {Record<string, unknown>} */ (filter);
  /** @type {Record<string, unknown>} */
  const out = { ...src };

  const aliases = [
    ["vorname", "first_name"],
    ["nachname", "last_name"],
    ["firstName", "first_name"],
    ["lastName", "last_name"],
    ["kunden_id", "customer_id"],
    ["kundennummer", "customer_id"],
    ["kunde", "customer_id"],
    ["auftrag", "order_id"],
    ["auftrags_id", "order_id"],
    ["auftragsnummer", "order_id"],
    ["shopnummer", "shop_number"],
    ["filiale", "shop_number"],
    ["plz", "zip"],
    ["postleitzahl", "zip"],
    ["stadt", "city"],
    ["ort", "city"],
    ["produkt", "product_id"],
    ["produkt_id", "product_id"],
    ["vorschau", "sample"],
  ];

  for (const [from, to] of aliases) {
    if (out[from] != null && out[from] !== "" && (out[to] == null || out[to] === "")) {
      out[to] = out[from];
    }
  }

  if (out.name_contains == null && out.nameContains != null) {
    out.name_contains = out.nameContains;
  }

  return out;
}

/**
 * @param {unknown} filter
 */
export function isSampleListFilter(filter) {
  if (!filter || typeof filter !== "object") return false;
  const f = /** @type {Record<string, unknown>} */ (filter);
  return f.sample === true || f.sample === "true" || f.sample === 1 || f.sample === "1";
}
