/**
 * Design-time dynamic UI: natural-language prompt → HTML (+ output JSON Schema).
 * Uses `POST /v1/chat/completions` with JSON object response.
 */

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

const INPUT_SYSTEM = `You generate workshop **input** UI as a single JSON object (no markdown).
Return: { "html": "<fragment>" }

Rules for html:
- One self-contained HTML fragment (may include <style> and <script>).
- Every value control: \`data-wdui-path="key"\` and/or unique HTML \`name\`.
- Interactive elements that should notify the model: \`data-ws-handler="handlerId"\` on input/textarea/select (fires on input/change) or buttons/links (fires on click).
- Accessible labels; match the participant language in the prompt.
- No external network URLs in src/href unless the prompt requires them.`;

const OUTPUT_SYSTEM = `You generate workshop **output** UI as a single JSON object (no markdown).
Return: { "html": "<fragment>", "output_schema": { ...JSON Schema draft-07... } }

Rules for html:
- Fragment uses \`data-ws-bind="dot.path"\`, optional \`data-ws-bind-src\`, \`data-ws-bind-href\` for dynamic content from JSON.
- May include <style> and <script> for layout only (no fetching external data).
- Match the participant language in the prompt.

Rules for output_schema:
- Valid JSON Schema object (type object at root) listing every bind path the HTML needs.
- Use clear property names matching data-ws-bind paths (nested objects for dot paths).
- Include types and short descriptions so a processing model can emit conforming JSON via tool calls.`;

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
 * @param {string} role
 * @param {string} prompt
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, fetchImpl?: typeof fetch }} [options]
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
  const model = options.model ?? process.env.OPENAI_DYNAMIC_UI_MODEL ?? DEFAULT_CHAT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${base}/chat/completions`;
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENAI_SAFETY_IDENTIFIER) {
    headers["OpenAI-Safety-Identifier"] = process.env.OPENAI_SAFETY_IDENTIFIER;
  }

  const body = {
    model,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: r === "output" ? OUTPUT_SYSTEM : INPUT_SYSTEM },
      { role: "user", content: p },
    ],
  };

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

  const choice = isRecord(data) && Array.isArray(data.choices) ? data.choices[0] : null;
  const msg = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  const content = msg && typeof msg.content === "string" ? msg.content : "";
  const parsed = parseModelJson(content);
  const html = parsed.html.trim();

  if (r === "output") {
    const schema = parsed.output_schema;
    if (!isRecord(schema)) {
      const err = new Error("Model response missing output_schema for output role.");
      err.code = "INVALID_MODEL_JSON";
      throw err;
    }
    return { html, output_schema: schema };
  }

  return { html };
}
