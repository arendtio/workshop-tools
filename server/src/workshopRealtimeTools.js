import { buildWorkshopImageGenerationTool, planHasImageOutput } from "./imageGeneration.js";
import { buildWorkshopSynthesizeSpeechTool, planHasSpeechFileOutput } from "./speechGeneration.js";
import {
  buildWorkshopLogPoolGenerateTool,
  buildWorkshopLogSqlTool,
  planHasLogAnalyzer,
  planHasLogGenerator,
} from "./logPoolTools.js";
import { buildWorkshopKnowledgeSearchTool, planHasVectorDb } from "./knowledgePoolTools.js";
import {
  getKnowledgePoolSummary,
  resolveKnowledgePoolName,
} from "./knowledgePools/store.js";
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

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasVideoLiveInput(plan) {
  return plan.blocks.some((b) => b.role === "input" && b.typeId === "video-live");
}

export function buildWorkshopVideoLiveWatchTool() {
  return {
    type: "function",
    name: "workshop_video_live_watch",
    description:
      "Enable or disable proactive monitoring of the workshop **input:video-live** stream (camera or screen). " +
      "While enabled, each **changed** frame (hash dedup) triggers a model turn where you may speak about relevant visual changes. " +
      "Call with `{ enabled: true, reason?: string }` when the participant asks you to watch the stream or you need ongoing vision updates. " +
      "Call `{ enabled: false }` when monitoring should stop. Frames are still sent silently when disabled.",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true = start/continue watch mode; false = stop proactive frame responses.",
        },
        reason: {
          type: "string",
          description:
            "Optional short note what to watch for (e.g. error dialogs, new chat messages). Stored for subsequent frame turns.",
        },
      },
      required: ["enabled"],
    },
  };
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

const TOOLING_FILTER_SCHEMA = {
  type: "object",
  description:
    "Required for operation=list — at least one criterion, OR sample:true for a preview (first N rows). " +
    "Customers: first_name + last_name (aliases vorname, nachname, firstName, lastName), customer_id, name_contains, sample. " +
    "Orders: customer_id, status, total_min/max, product_id, min_line_quantity, sample, … " +
    "Shop: number, number_min/max, region, status. " +
    "Products: category, sku, title_contains, price_min/max. " +
    "Inventory: product_id, warehouse, quantity_min/max.",
  properties: {
    customer_id: { type: "string" },
    order_id: { type: "string" },
    shop_id: { type: "string" },
    shop_number: { type: "string" },
    product_id: { type: "string" },
    inventory_id: { type: "string" },
    sku: { type: "string" },
    status: { type: "string" },
    region: { type: "string" },
    number: { type: "string", description: "Shop four-digit number (e.g. 1042)." },
    number_min: { type: "number" },
    number_max: { type: "number" },
    zip: { type: "string" },
    ort: { type: "string", description: "Ort (Wohnort); alias city / stadt." },
    category: { type: "string" },
    warehouse: { type: "string" },
    total_min: { type: "number" },
    total_max: { type: "number" },
    price_min: { type: "number" },
    price_max: { type: "number" },
    quantity_min: { type: "number" },
    quantity_max: { type: "number" },
    min_line_quantity: { type: "number", description: "Orders with any line qty >= this value." },
    created_from: { type: "string", description: "ISO date YYYY-MM-DD." },
    created_to: { type: "string", description: "ISO date YYYY-MM-DD." },
    first_name: { type: "string", description: "Customer first name (Vorname)." },
    last_name: { type: "string", description: "Customer last name (Nachname)." },
    vorname: { type: "string", description: "Alias for first_name." },
    nachname: { type: "string", description: "Alias for last_name." },
    name_contains: { type: "string", description: "Substring of full customer name." },
    title_contains: { type: "string" },
    email_contains: { type: "string" },
    sample: {
      type: "boolean",
      description: "If true, return first `limit` rows without other criteria (preview only).",
    },
    offset: { type: "integer", minimum: 0, description: "Pagination offset (default 0)." },
  },
  additionalProperties: false,
};

/** @param {{ toolingMockReady?: boolean }} _plan */
export function buildWorkshopMockToolingCallTool(_plan) {
  return {
    type: "function",
    name: "workshop_mock_tooling_call",
    description:
      "Workshop **mock** ERP data (SQLite on server, shared across runs): shops 1000–2000, ~800 customers, orders, products, inventory. " +
      "**list** requires `filter` with at least one field, or `{ sample: true }` for a preview. Customer search: `first_name` + `last_name` (German: vorname/nachname). Cap `limit` at 100. " +
      "create / update / patch / delete respect workshop read-write scopes. " +
      "Domains: customers, orders, shop, products, inventory, other.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: ["customers", "orders", "shop", "products", "inventory", "other"],
        },
        operation: {
          type: "string",
          enum: ["list", "get", "create", "update", "patch", "delete"],
        },
        filter: TOOLING_FILTER_SCHEMA,
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max rows for list (default 100).",
        },
        id: { type: "string", description: "Row id for get / update / delete." },
        record: {
          type: "object",
          description: "Payload for create or update.",
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
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[], toolingMockReady?: boolean, dynamicUiSessionId?: string }} plan
 * @returns {object[]}
 */
export function buildWorkshopRealtimeTools(plan) {
  /** @type {object[]} */
  const tools = [];
  if (planHasImageOutput(plan)) tools.push(buildWorkshopImageGenerationTool(plan));
  if (planHasSpeechFileOutput(plan)) tools.push(buildWorkshopSynthesizeSpeechTool(plan));
  if (planHasFormOutput(plan)) tools.push(buildWorkshopEmitFormValuesTool());
  if (planHasDynamicUiOutput(plan)) tools.push(buildWorkshopEmitDynamicUiTool());

  if (planHasProcessTooling(plan) && plan.toolingMockReady) {
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
  if (planHasVectorDb(plan)) {
    const pool = resolveKnowledgePoolName(plan);
    if (pool) {
      const summary = getKnowledgePoolSummary(pool);
      if (summary.ok && summary.ready && summary.vector_store_id) {
        tools.push(buildWorkshopKnowledgeSearchTool(pool, summary.vector_store_id));
      }
    }
  }
  if (planHasVideoLiveInput(plan)) {
    tools.push(buildWorkshopVideoLiveWatchTool());
  }
  return tools;
}
