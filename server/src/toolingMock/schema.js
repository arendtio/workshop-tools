/** Field documentation for workshop mock tooling (shown in UI + model instructions). */

export const TOOLING_DOMAIN_SCHEMAS = {
  customers: {
    label: "Kundendaten",
    idField: "id",
    idHint: "Kunden-ID, z. B. cust-000042 (keine separate „Kundennummer“).",
    fields: [
      { name: "id", type: "string", description: "Primärschlüssel cust-000001 …" },
      { name: "firstName", type: "string", db: "first_name", description: "Vorname" },
      { name: "lastName", type: "string", db: "last_name", description: "Nachname" },
      { name: "name", type: "string", description: "Vollständiger Name" },
      { name: "email", type: "string" },
      { name: "street", type: "string" },
      { name: "houseNumber", type: "string", db: "house_number" },
      { name: "zip", type: "string", description: "Postleitzahl" },
      { name: "ort", type: "string", db: "city", description: "Ort" },
      { name: "address", type: "string", description: "Formatierte Adresse" },
    ],
    listFilters: [
      "customer_id (cust-…)",
      "first_name / vorname",
      "last_name / nachname",
      "name_contains (Teil vom Vollnamen)",
      "zip, ort (alias city/stadt), email_contains",
      "sample: true (Vorschau erste N Zeilen, ohne Suchkriterium)",
    ],
  },
  orders: {
    label: "Auftragsdaten",
    idField: "id",
    fields: [
      { name: "id", type: "string", description: "ord-0000001 …" },
      { name: "customerId", type: "string", description: "Verknüpfung zum Kunden" },
      { name: "shopId", type: "string", description: "Shop-Nummer/Filiale des Auftrags" },
      { name: "status", type: "string" },
      { name: "total", type: "string" },
      { name: "createdAt", type: "string" },
      { name: "lineItems", type: "array", description: "Positionen mit productId, quantity, …" },
    ],
    listFilters: [
      "customer_id, order_id, shop_id, shop_number, status",
      "total_min, total_max, product_id, min_line_quantity",
      "created_from, created_to (YYYY-MM-DD)",
      "sample: true",
    ],
  },
  shop: {
    label: "Shops / Filialen",
    idField: "id",
    fields: [
      { name: "id", type: "string", description: "Vierstellige Nummer 1000–2000" },
      { name: "number", type: "string" },
      { name: "name", type: "string" },
      { name: "region", type: "string", description: "DE / AT" },
      { name: "status", type: "string" },
    ],
    listFilters: ["number, number_min, number_max, region, status, name_contains", "sample: true"],
  },
  products: {
    label: "Produktdaten",
    idField: "id",
    fields: [
      { name: "id", type: "string", description: "SKU-100001 …" },
      { name: "sku", type: "string" },
      { name: "title", type: "string" },
      { name: "price", type: "string" },
      { name: "category", type: "string" },
    ],
    listFilters: ["product_id, sku, category, title_contains, price_min, price_max", "sample: true"],
  },
  inventory: {
    label: "Lager / Bestand",
    idField: "id",
    fields: [
      { name: "id", type: "string" },
      { name: "productId", type: "string" },
      { name: "sku", type: "string" },
      { name: "warehouse", type: "string", description: "BER, HAM, MUC, …" },
      { name: "quantity", type: "string" },
    ],
    listFilters: [
      "inventory_id, product_id, sku, warehouse, quantity_min, quantity_max",
      "sample: true",
    ],
  },
  other: {
    label: "Sonstiges",
    description: "Einzelnes JSON-Objekt (Metadaten), list/get/update.",
    listFilters: [],
  },
};

/**
 * Markdown block for Realtime session instructions.
 */
export function buildToolingSchemaInstructionsMarkdown() {
  const lines = [
    "### Tooling mock — Datenmodell (Kurzreferenz)",
    "",
    "Kunden sind **nicht** einer Filiale zugeordnet; `shopId` steht nur auf **Aufträgen**.",
    "Kunden-ID = Feld `id` (cust-…). Suche nach Person: `filter.first_name` + `filter.last_name` (auch `vorname`/`nachname`).",
    "Vorschau ohne Kriterium: `filter: { \"sample\": true }`, `limit` bis 100.",
    "",
  ];
  for (const [domain, schema] of Object.entries(TOOLING_DOMAIN_SCHEMAS)) {
    lines.push(`**${schema.label}** (\`${domain}\`)`);
    if (schema.idHint) lines.push(`- ${schema.idHint}`);
    if (schema.fields) {
      lines.push(
        "- Felder: " +
          schema.fields.map((f) => `\`${f.name}\`${f.description ? ` (${f.description})` : ""}`).join(", "),
      );
    }
    if (schema.listFilters?.length) {
      lines.push(`- list-Filter: ${schema.listFilters.join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
