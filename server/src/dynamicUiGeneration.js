/**
 * Design-time dynamic UI: natural-language prompt → HTML (+ output JSON Schema).
 * Uses `POST /v1/responses` with strict JSON schema output.
 */

const DEFAULT_RESPONSES_MODEL = "gpt-5.4-mini";
const DEFAULT_REASONING_EFFORT = "low";

const INPUT_SYSTEM = `You generate workshop **input** UI as a single JSON object (no markdown).
Return: { "html": "<fragment>" }

Rules for html:
- One self-contained HTML fragment (may include <style> and <script>).
- Every value control: \`data-wdui-path="key"\` and/or unique HTML \`name\` so the workshop can **read and write values from outside** during a Realtime run (snapshots, Send inputs).
- Use empty or neutral defaults on controls (\`value=""\`, \`0\`, unchecked) — **do not** bake in participant-specific demo data that blocks external updates.
- The preview must look **complete and polished before any run data exists** (labels, spacing, min-heights; empty sliders/charts are fine).
- Charts and meters: render sensibly with no data yet (axes, labels, zero bars, placeholder track) — not broken or blank boxes.
- Interactive elements that should notify the model: \`data-ws-handler="handlerId"\` on input/textarea/select (fires on input/change) or buttons/links (fires on click).
- Accessible labels; match the participant language in the prompt.
- No external network URLs in src/href unless the prompt requires them.`;

const OUTPUT_SYSTEM = `You generate workshop **output** UI as a single JSON object (no markdown).
Return: { "html": "<fragment>", "output_schema": "<JSON string>" }
The output_schema field must be a **string** containing one valid JSON Schema (draft-07) object as JSON text (not a nested object in the outer response).

Rules for html:
- Fragment uses \`data-ws-bind="dot.path"\`, optional \`data-ws-bind-src\`, \`data-ws-bind-href\` for content filled **later** by processing (\`ui_data\` / tools) — not hardcoded final copy in the HTML.
- Initial markup must look **good with all binds empty or missing**: use CSS empty states, min-heights, neutral placeholders; never require pre-filled JSON to understand the layout.
- Charts, lists, and metrics: design for **empty datasets** first (structure + labels + zero/placeholder visuals), then bind paths update values at run time.
- May include <style> and <script> for layout only (no fetching external data).
- Match the participant language in the prompt.

Rules for output_schema:
- Valid JSON Schema object (type object at root) listing every bind path the HTML needs.
- Use clear property names matching data-ws-bind paths (nested objects for dot paths).
- Include types and short descriptions so a processing model can emit conforming JSON via tool calls.`;

/** @type {Record<string, unknown>} */
const INPUT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    html: { type: "string", minLength: 1 },
  },
  required: ["html"],
  additionalProperties: false,
};

/** @type {Record<string, unknown>} */
const OUTPUT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    html: { type: "string", minLength: 1 },
    output_schema: { type: "string", minLength: 2 },
  },
  required: ["html", "output_schema"],
  additionalProperties: false,
};

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {string} raw
 */
function parseModelJson(raw) {
  let t = String(raw ?? "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  if (fence) t = fence[1].trim();
  const data = JSON.parse(t);
  if (!isRecord(data) || typeof data.html !== "string" || !data.html.trim()) {
    const err = new Error("Model response missing non-empty html.");
    err.code = "INVALID_MODEL_JSON";
    throw err;
  }
  return data;
}

/**
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
function extractTextFromResponsesApi(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (!Array.isArray(data.output)) return "";
  /** @type {string[]} */
  const parts = [];
  for (const item of data.output) {
    if (!isRecord(item)) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (isRecord(c) && c.type === "output_text" && typeof c.text === "string") {
          parts.push(c.text);
        }
      }
    }
  }
  return parts.join("").trim();
}

/**
 * @param {string} role
 * @param {string} prompt
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, reasoningEffort?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ html: string, output_schema?: Record<string, unknown> }>}
 */
export async function generateDynamicUiFromPrompt(role, prompt, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const p = String(prompt ?? "").trim();
  if (!p) {
    const err = new Error("Prompt is empty.");
    err.code = "EMPTY_PROMPT";
    throw err;
  }

  const r = String(role ?? "").trim().toLowerCase();
  if (r !== "input" && r !== "output") {
    const err = new Error('role must be "input" or "output".');
    err.code = "INVALID_ROLE";
    throw err;
  }

  const base = (options.baseUrl ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = options.model ?? process.env.OPENAI_DYNAMIC_UI_MODEL ?? DEFAULT_RESPONSES_MODEL;
  const reasoningEffort =
    options.reasoningEffort ??
    process.env.OPENAI_DYNAMIC_UI_REASONING_EFFORT ??
    DEFAULT_REASONING_EFFORT;
  const fetchImpl = options.fetchImpl ?? fetch;

  const isOutput = r === "output";
  /** @type {Record<string, unknown>} */
  const body = {
    model,
    reasoning: { effort: reasoningEffort },
    input: [
      { role: "developer", content: isOutput ? OUTPUT_SYSTEM : INPUT_SYSTEM },
      { role: "user", content: p },
    ],
    text: {
      format: {
        type: "json_schema",
        name: isOutput ? "workshop_dynamic_ui_output" : "workshop_dynamic_ui_input",
        strict: true,
        schema: isOutput ? OUTPUT_RESPONSE_SCHEMA : INPUT_RESPONSE_SCHEMA,
      },
    },
    max_output_tokens: 32768,
  };

  const url = `${base}/responses`;
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_SAFETY_IDENTIFIER) {
    headers["OpenAI-Safety-Identifier"] = process.env.OPENAI_SAFETY_IDENTIFIER;
  }

  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
        ? data.error.message
        : `OpenAI HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = "OPENAI_DYNAMIC_UI";
    throw err;
  }

  if (isRecord(data) && data.status === "incomplete") {
    const err = new Error("Model response incomplete (max_output_tokens or reasoning budget).");
    err.code = "OPENAI_DYNAMIC_UI_INCOMPLETE";
    throw err;
  }

  const content = isRecord(data) ? extractTextFromResponsesApi(data) : "";
  if (!content) {
    const err = new Error("Model returned no text output.");
    err.code = "INVALID_MODEL_JSON";
    throw err;
  }

  const parsed = parseModelJson(content);
  const html = parsed.html.trim();

  if (r === "output") {
    let schema = parsed.output_schema;
    if (typeof schema === "string") {
      try {
        schema = JSON.parse(schema);
      } catch {
        const err = new Error("output_schema string is not valid JSON.");
        err.code = "INVALID_MODEL_JSON";
        throw err;
      }
    }
    if (!isRecord(schema)) {
      const err = new Error("Model response missing output_schema for output role.");
      err.code = "INVALID_MODEL_JSON";
      throw err;
    }
    return { html, output_schema: schema };
  }

  return { html };
}
