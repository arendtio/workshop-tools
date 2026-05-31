/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasLogGenerator(plan) {
  return plan.blocks.some((b) => b.role === "process" && b.typeId === "log-generator");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasLogAnalyzer(plan) {
  return plan.blocks.some((b) => b.role === "process" && b.typeId === "log-analyzer");
}

export function buildWorkshopLogPoolGenerateTool() {
  return {
    type: "function",
    name: "workshop_log_pool_generate",
    description:
      "Create or **overwrite** a workshop log pool (SQLite on the server, typically ~10 MB — too large for context). " +
      "Use after the participant asks you to generate a business log. Returns metadata only (row count, size, message keys), never full log rows. " +
      "Scenario `shop-package-lifecycle` simulates shop delivery, goods receipt, scan, pickup, and error paths. " +
      "Shop numbers (1000–2000), order ids, customer ids, and product ids are taken from the shared tooling mock database when available.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique pool name (letters, digits, hyphen, underscore). Overwrites an existing pool with the same name.",
        },
        target_size_mb: {
          type: "number",
          description: "Target size in megabytes (1–50). Default 10.",
        },
        scenario_preset: {
          type: "string",
          enum: ["shop-package-lifecycle"],
          description: "Built-in business scenario and message catalog.",
        },
        error_path_percent: {
          type: "number",
          description: "Share of packages that take an error branch (0–100). Default ~30 for the shop preset.",
        },
        seed: {
          type: "number",
          description: "Optional RNG seed for reproducible generation.",
        },
      },
      required: ["name"],
    },
  };
}

/**
 * @param {string} poolName
 */
export function buildWorkshopLogSqlTool(poolName) {
  const label = poolName || "(not configured)";
  return {
    type: "function",
    name: "workshop_log_sql",
    description:
      `Run a **read-only** SQL SELECT on log pool **${label}** (SQLite table \`events\`: ` +
      "`id`, `ts`, `priority`, `message_key`, `message`, `param1`, `param2`, `param3`, `entity_id`). " +
      "Never load the full log into your answer — query and aggregate. At most 500 rows returned per call.",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "Single SELECT statement (no semicolon). Example: SELECT COUNT(*) FROM events WHERE priority = 'error'",
        },
      },
      required: ["sql"],
    },
  };
}
