import { buildToolingSchemaInstructionsMarkdown } from "./toolingMock/schema.js";

/** @typedef {{ id: string, label: string, read: boolean, write: boolean }} ToolingGrant */

export const TOOLING_SERVICES = [
  { id: "customers", label: "Kundendaten" },
  { id: "orders", label: "Auftragsdaten" },
  { id: "shop", label: "Shop" },
  { id: "products", label: "Produktdaten" },
  { id: "inventory", label: "Lager / Bestand" },
  { id: "other", label: "Sonstiges" },
];

/**
 * @param {unknown} v
 */
function isFlag(v) {
  return v === "1" || v === "true";
}

/**
 * Legacy single domain + accessMode → per-service svc_* keys.
 * @param {Record<string, string> | undefined} values
 * @returns {Record<string, string>}
 */
export function migrateLegacyToolingValues(values = {}) {
  const v = { ...values };
  if (Object.keys(v).some((k) => k.startsWith("svc_"))) return v;

  const mode = String(v.accessMode || "").trim() || "read";
  const dom = String(v.serviceDomain || "").trim() || "customers";
  const write = mode === "write";

  for (const s of TOOLING_SERVICES) {
    v[`svc_${s.id}_read`] = "0";
    v[`svc_${s.id}_write`] = "0";
  }

  /** @type {string[]} */
  const targets =
    dom === "shop" ? ["shop", "products"] : TOOLING_SERVICES.some((s) => s.id === dom) ? [dom] : [];

  for (const id of targets) {
    v[`svc_${id}_read`] = "1";
    if (write) v[`svc_${id}_write`] = "1";
  }

  return v;
}

/**
 * @param {Record<string, string> | undefined} values
 * @returns {ToolingGrant[]}
 */
export function parseToolingGrants(values = {}) {
  const v = migrateLegacyToolingValues(values);
  /** @type {ToolingGrant[]} */
  const grants = [];
  for (const s of TOOLING_SERVICES) {
    const write = isFlag(v[`svc_${s.id}_write`]);
    const read = write || isFlag(v[`svc_${s.id}_read`]);
    if (read || write) grants.push({ id: s.id, label: s.label, read, write });
  }
  return grants;
}

/**
 * @param {ToolingGrant[]} grants
 */
export function formatToolingGrantsSummary(grants) {
  if (!grants.length) return "(kein Service ausgewählt)";
  return grants
    .map((g) => `${g.label}: ${g.write ? "Lesen + Schreiben" : "Lesen"}`)
    .join(" · ");
}

/**
 * @param {ToolingGrant[]} grants
 */
export function buildToolingInstructionParagraph(grants) {
  if (!grants.length) {
    return (
      "Tooling (workshop mock): **no data service selected** in the workbench — confirm with the participant which domains to use before calling `workshop_mock_tooling_call`. " +
      "Domains: customers, orders, shop, products, inventory, other (German UI labels map to the same ids)."
    );
  }

  const scopeLines = grants.map((g) => {
    const ops = g.write
      ? "read and write (list, get, create, update, patch, delete)"
      : "read-only (list, get only — do not create, update, or delete)";
    return `- **${g.label}** (\`${g.id}\`): ${ops}`;
  });

  return (
    "## Workshop: tooling mock (configured data access)\n\n" +
    scopeLines.join("\n") +
    "\n\n" +
    "The Realtime tool `workshop_mock_tooling_call` reads/writes a **shared SQLite database** on the server (`data/tooling-mock/`). For `list`, always pass `filter` (required) and `limit` (max 100). " +
    "Respect read-only vs write scopes per domain. German labels: Kundendaten→customers, Auftragsdaten→orders, Shop→shop, Produktdaten→products, Lager→inventory, Sonstiges→other. " +
    "Filter aliases: vorname→first_name, nachname→last_name, kundennummer→customer_id. " +
    "If form input values were provided in this session, use them for customer list filters. " +
    "Do not invent private production data.\n\n" +
    buildToolingSchemaInstructionsMarkdown()
  );
}
