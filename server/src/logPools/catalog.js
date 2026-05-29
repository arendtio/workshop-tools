/** @typedef {{ message_key: string, priority: string, template: string, params: string[] }} LogMessageDef */

/** @type {readonly LogMessageDef[]} */
export const SHOP_PACKAGE_LIFECYCLE_MESSAGES = [
  {
    message_key: "delivery.arrived",
    priority: "info",
    template: "Paket {package_id} im Shop {shop_id} eingetroffen.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "warehouse.goods_receipt.booked",
    priority: "info",
    template: "Wareneingang gebucht für Paket {package_id} in Shop {shop_id}.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "warehouse.package.scanned",
    priority: "info",
    template: "Paket {package_id} in Shop {shop_id} gescannt.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "pickup.completed",
    priority: "info",
    template: "Paket {package_id} in Shop {shop_id} als abgeholt markiert.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "warehouse.scan.rejected_no_receipt",
    priority: "error",
    template: "Scan abgelehnt: Paket {package_id} — kein Wareneingang in Shop {shop_id}.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "warehouse.receipt.rejected_not_released",
    priority: "error",
    template:
      "Wareneingang abgelehnt: Paket {package_id} in Shop {shop_id} — Packstück noch nicht zur Buchung freigegeben.",
    params: ["package_id", "shop_id"],
  },
  {
    message_key: "warehouse.goods_receipt.blocked_inventory",
    priority: "blocker",
    template: "Blocker: Inventur-Sperre für Shop {shop_id}, Paket {package_id} nicht buchbar.",
    params: ["shop_id", "package_id"],
  },
];

/** @type {Record<string, { messages: LogMessageDef[], defaultErrorPathPercent: number }>} */
export const SCENARIO_PRESETS = {
  "shop-package-lifecycle": {
    messages: SHOP_PACKAGE_LIFECYCLE_MESSAGES,
    defaultErrorPathPercent: 30,
  },
};

/**
 * @param {string} presetId
 */
export function getScenarioPreset(presetId) {
  const id = String(presetId || "shop-package-lifecycle").trim();
  return SCENARIO_PRESETS[id] ?? SCENARIO_PRESETS["shop-package-lifecycle"];
}

/**
 * @param {LogMessageDef[]} messages
 */
export function messageCatalogByKey(messages) {
  /** @type {Map<string, LogMessageDef>} */
  const map = new Map();
  for (const m of messages) {
    map.set(m.message_key, m);
  }
  return map;
}
