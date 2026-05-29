import { getScenarioPreset, messageCatalogByKey } from "./catalog.js";

/**
 * @param {string} template
 * @param {Record<string, string>} values
 */
export function formatLogMessage(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

/**
 * @typedef {"happy" | "scan_before_receipt" | "receipt_not_released" | "blocker_receipt"} PackagePath
 */

/**
 * @param {import("./catalog.js").LogMessageDef} def
 * @param {Record<string, string>} paramValues
 */
function eventRow(def, paramValues, entityId, ts) {
  const slots = def.params.slice(0, 3);
  return {
    ts,
    priority: def.priority,
    message_key: def.message_key,
    message: formatLogMessage(def.template, paramValues),
    param1: slots[0] ? (paramValues[slots[0]] ?? null) : null,
    param2: slots[1] ? (paramValues[slots[1]] ?? null) : null,
    param3: slots[2] ? (paramValues[slots[2]] ?? null) : null,
    entity_id: entityId,
  };
}

/**
 * @param {number} errorPathPercent 0–100
 * @param {() => number} rng01
 * @returns {PackagePath}
 */
function pickPackagePath(errorPathPercent, rng01) {
  const r = rng01() * 100;
  if (r >= errorPathPercent) return "happy";
  const sub = rng01();
  if (sub < 0.45) return "scan_before_receipt";
  if (sub < 0.85) return "receipt_not_released";
  return "blocker_receipt";
}

/**
 * @param {object} opts
 * @param {string} opts.scenarioPreset
 * @param {number} [opts.errorPathPercent]
 * @param {number} [opts.seed]
 * @param {number} [opts.targetBytes]
 * @param {(rows: object[]) => void} opts.onBatch
 * @returns {{ rowCount: number, seed: number, config: object }}
 */
export function simulateLogEvents(opts) {
  const preset = getScenarioPreset(opts.scenarioPreset);
  const catalog = messageCatalogByKey(preset.messages);
  const seed = typeof opts.seed === "number" ? opts.seed : Date.now() % 2147483647;
  let state = seed >>> 0;
  const rng01 = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const errorPathPercent = Math.min(
    100,
    Math.max(0, opts.errorPathPercent ?? preset.defaultErrorPathPercent),
  );
  const targetBytes = Math.max(1024 * 1024, opts.targetBytes ?? 10 * 1024 * 1024);

  let rowCount = 0;
  let approxBytes = 0;
  let packageSeq = 0;
  let clockMs = Date.UTC(2026, 4, 1, 6, 0, 0);

  const config = {
    scenario_preset: opts.scenarioPreset || "shop-package-lifecycle",
    error_path_percent: errorPathPercent,
    seed,
    target_bytes: targetBytes,
    message_keys: preset.messages.map((m) => m.message_key),
  };

  /** @type {object[]} */
  let batch = [];
  const flush = () => {
    if (!batch.length) return;
    opts.onBatch(batch);
    batch = [];
  };

  const push = (defKey, paramValues, entityId) => {
    const def = catalog.get(defKey);
    if (!def) return;
    const ts = new Date(clockMs).toISOString();
    clockMs += 40 + Math.floor(rng01() * 120);
    const row = eventRow(def, paramValues, entityId, ts);
    batch.push(row);
    rowCount += 1;
    approxBytes += JSON.stringify(row).length + 1;
    if (batch.length >= 2000) flush();
  };

  while (approxBytes < targetBytes) {
    packageSeq += 1;
    const packageId = `PKG-${100000 + packageSeq}`;
    const shopId = `SHOP-${1 + Math.floor(rng01() * 24)}`;
    const params = { package_id: packageId, shop_id: shopId };
    const path = pickPackagePath(errorPathPercent, rng01);

    push("delivery.arrived", params, packageId);

    if (path === "happy") {
      push("warehouse.goods_receipt.booked", params, packageId);
      push("warehouse.package.scanned", params, packageId);
      push("pickup.completed", params, packageId);
    } else if (path === "scan_before_receipt") {
      push("warehouse.scan.rejected_no_receipt", params, packageId);
      push("warehouse.goods_receipt.booked", params, packageId);
      push("warehouse.package.scanned", params, packageId);
    } else if (path === "receipt_not_released") {
      push("warehouse.receipt.rejected_not_released", params, packageId);
    } else {
      push("warehouse.goods_receipt.blocked_inventory", params, packageId);
    }
  }

  flush();
  return { rowCount, seed, config };
}
