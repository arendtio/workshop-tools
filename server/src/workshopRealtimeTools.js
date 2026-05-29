import { buildWorkshopImageGenerationTool, planHasImageOutput } from "./imageGeneration.js";
import { buildWorkshopSynthesizeSpeechTool, planHasSpeechFileOutput } from "./speechGeneration.js";
import {
  buildWorkshopLogPoolGenerateTool,
  buildWorkshopLogSqlTool,
  planHasLogAnalyzer,
  planHasLogGenerator,
} from "./logPoolTools.js";
import { logPoolExists, resolveAnalyzerPoolName } from "./logPools/store.js";

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
      "Update workshop **output:dynamic-ui** card(s). Primary payload: `ui_data` JSON matching the JSON Schema " +
      "from the participant's Erzeugen step (see session instructions). Optional: `ui_spec` (`html` overlay) if layout changes. " +
      "`ui_prompt` is legacy text only — prefer `ui_data`.",
    parameters: {
      type: "object",
      properties: {
        ui_prompt: {
          type: "string",
          description: "Optional HTML or short text pushed to the output preview.",
        },
        ui_spec: {
          type: "object",
          description: "Optional overlay; must include `html` string for the client to render.",
        },
        ui_data: {
          type: "object",
          description: "Optional JSON object applied to output previews (no server-side schema enforcement).",
        },
      },
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
      "Read the persisted dynamic-UI snapshot for this run: NL prompt, widget values the host synced, and `outputData` keyed by block id. " +
      "Participant handler events arrive as user messages whose JSON includes `detail.state` (full flat field map) when `input:dynamic-ui` uses `data-ws-handler`. " +
      `Session ${short}. Call before answering if you need current field values or merged output JSON.`,
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
      `Session ${short}. Typical keys: nlPrompt (string), widgets (object), outputData (object keyed by output block id).`,
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
  if (planHasLogGenerator(plan)) {
    tools.push(buildWorkshopLogPoolGenerateTool());
  }
  if (planHasLogAnalyzer(plan)) {
    const pool = resolveAnalyzerPoolName(plan);
    if (pool && logPoolExists(pool)) {
      tools.push(buildWorkshopLogSqlTool(pool));
    }
  }
  return tools;
}
