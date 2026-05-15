import { buildWorkshopImageGenerationTool, planHasImageOutput } from "./imageGeneration.js";
import { buildWorkshopSynthesizeSpeechTool, planHasSpeechFileOutput } from "./speechGeneration.js";

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasFormOutput(plan) {
  return plan.blocks.some((b) => b.role === "output" && b.typeId === "form");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasDynamicUiOutput(plan) {
  return plan.blocks.some((b) => b.role === "output" && b.typeId === "dynamic-ui");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasProcessTooling(plan) {
  return plan.blocks.some((b) => b.role === "process" && b.typeId === "tooling");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planUsesDynamicUiModule(plan) {
  return plan.blocks.some((b) => b.typeId === "dynamic-ui");
}

export function buildWorkshopEmitFormValuesTool() {
  return {
    type: "function",
    name: "workshop_emit_form_values",
    description:
      "Populate workshop **output:form** card(s) with final values. Use one object per field; " +
      "`label` must match a field label from the output form blueprint in the session context.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Field label from the configured form" },
              value: {
                type: "string",
                description: 'String value (checkboxes: "true" / "false")',
              },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["fields"],
    },
  };
}

export function buildWorkshopEmitDynamicUiTool() {
  return {
    type: "function",
    name: "workshop_emit_dynamic_ui",
    description:
      "Refresh workshop **output:dynamic-ui** card(s) with a natural-language UI specification; " +
      "the client renders a lightweight preview from keywords (bars, matrix, line chart, sliders).",
    parameters: {
      type: "object",
      properties: {
        ui_prompt: {
          type: "string",
          description: "NL UI spec for the dynamic UI output (any language).",
        },
      },
      required: ["ui_prompt"],
    },
  };
}

/**
 * @param {{ toolingMockSessionId?: string }} plan
 */
export function buildWorkshopMockToolingCallTool(plan) {
  const sid = String(plan.toolingMockSessionId || "").trim();
  const short = sid ? `${sid.slice(0, 8)}…` : "(missing)";
  return {
    type: "function",
    name: "workshop_mock_tooling_call",
    description:
      "Workshop **mock** data plane (customers, orders, shop, inventory, other). " +
      `All calls for this run share persisted in-memory state (session ${short}). ` +
      "Operations: list; get (needs id); create (record object, optional id field); update or patch (needs id + record); delete (needs id). " +
      "German UI labels map to the same domains (Kundendaten→customers, Auftragsdaten→orders, …).",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: ["customers", "orders", "shop", "inventory", "other"],
          description: "Mock dataset partition.",
        },
        operation: {
          type: "string",
          enum: ["list", "get", "create", "update", "patch", "delete"],
        },
        id: { type: "string", description: "Row id for get / update / delete." },
        record: {
          type: "object",
          description: "Payload for create or update (arbitrary string fields).",
          additionalProperties: true,
        },
      },
      required: ["domain", "operation"],
    },
  };
}

/**
 * @param {{ dynamicUiSessionId?: string }} plan
 */
export function buildWorkshopDynamicUiReadStateTool(plan) {
  const sid = String(plan.dynamicUiSessionId || "").trim();
  const short = sid ? `${sid.slice(0, 8)}…` : "(missing)";
  return {
    type: "function",
    name: "workshop_dynamic_ui_read_state",
    description:
      "Read the persisted dynamic-UI snapshot for this run: latest NL prompt plus widget values the host synced. " +
      `Session ${short}. Call before answering if you need current slider/checkbox values from the participant.`,
    parameters: {
      type: "object",
      properties: {},
    },
  };
}

/**
 * @param {{ dynamicUiSessionId?: string }} plan
 */
export function buildWorkshopDynamicUiApplyDataTool(plan) {
  const sid = String(plan.dynamicUiSessionId || "").trim();
  const short = sid ? `${sid.slice(0, 8)}…` : "(missing)";
  return {
    type: "function",
    name: "workshop_dynamic_ui_apply_data",
    description:
      "Merge JSON into the dynamic UI session so the next read_state reflects it. " +
      `Session ${short}. Typical keys: nlPrompt (string), widgets (object of string keys to string/number/boolean values).`,
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: "Merge payload (nlPrompt, widgets, …).",
          additionalProperties: true,
        },
      },
      required: ["data"],
    },
  };
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[], toolingMockSessionId?: string, dynamicUiSessionId?: string }} plan
 * @returns {object[]}
 */
export function buildWorkshopRealtimeTools(plan) {
  /** @type {object[]} */
  const tools = [];
  if (planHasImageOutput(plan)) tools.push(buildWorkshopImageGenerationTool(plan));
  if (planHasSpeechFileOutput(plan)) tools.push(buildWorkshopSynthesizeSpeechTool(plan));
  if (planHasFormOutput(plan)) tools.push(buildWorkshopEmitFormValuesTool());
  if (planHasDynamicUiOutput(plan)) tools.push(buildWorkshopEmitDynamicUiTool());

  if (planHasProcessTooling(plan) && String(plan.toolingMockSessionId || "").trim()) {
    tools.push(buildWorkshopMockToolingCallTool(plan));
  }
  if (planUsesDynamicUiModule(plan) && String(plan.dynamicUiSessionId || "").trim()) {
    tools.push(buildWorkshopDynamicUiReadStateTool(plan));
    tools.push(buildWorkshopDynamicUiApplyDataTool(plan));
  }
  return tools;
}
