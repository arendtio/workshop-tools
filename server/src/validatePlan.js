import { pipelinePlanSchema } from "./planSchema.js";
import { isKnownBlock, planUsesRealtime } from "./knownModules.js";

/** @typedef {{ code: string, message: string, path?: string }} PlanError */

/** @param {unknown} raw */
export function validatePlan(raw) {
  const parsed = pipelinePlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((e) => ({
        code: "SCHEMA",
        message: e.message,
        path: e.path.join("."),
      })),
    };
  }

  const plan = parsed.data;
  /** @type {PlanError[]} */
  const errors = [];

  /** @type {Map<string, number>} */
  const keyCounts = new Map();
  for (const b of plan.blocks) {
    const k = `${b.role}:${b.typeId}`;
    keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }
  for (const [k, count] of keyCounts) {
    if (count > 1) {
      errors.push({
        code: "DUPLICATE_MODULE",
        message: `Duplicate module "${k}" appears ${count} times (at most one per role and type).`,
        path: "blocks",
      });
    }
  }

  for (const b of plan.blocks) {
    if (!isKnownBlock(b.role, b.typeId)) {
      errors.push({
        code: "UNKNOWN_TYPE",
        message: `Unknown module type "${b.typeId}" for role "${b.role}".`,
        path: `blocks:${b.id}`,
      });
    }
  }

  if (plan.blocks.length === 0) {
    errors.push({
      code: "EMPTY_PIPELINE",
      message: "Pipeline has no modules.",
    });
  }

  const hasOutput = plan.blocks.some((b) => b.role === "output");
  if (!hasOutput) {
    errors.push({
      code: "NO_OUTPUT",
      message: "Add at least one output module before running.",
    });
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const mode = planUsesRealtime(plan.blocks) ? "realtime" : "static";
  return { ok: true, plan, mode };
}
