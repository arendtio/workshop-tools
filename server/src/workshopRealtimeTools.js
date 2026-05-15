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
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @returns {object[]}
 */
export function buildWorkshopRealtimeTools(plan) {
  /** @type {object[]} */
  const tools = [];
  if (planHasImageOutput(plan)) tools.push(buildWorkshopImageGenerationTool(plan));
  if (planHasSpeechFileOutput(plan)) tools.push(buildWorkshopSynthesizeSpeechTool(plan));
  if (planHasFormOutput(plan)) tools.push(buildWorkshopEmitFormValuesTool());
  if (planHasDynamicUiOutput(plan)) tools.push(buildWorkshopEmitDynamicUiTool());
  return tools;
}
