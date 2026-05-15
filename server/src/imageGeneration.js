/**
 * Workshop image generation uses `POST /v1/responses` with the `image_generation` tool
 * (see OpenAI Image Generation guide, May 2026). Legacy `dall-e-3` on `images/generations` is not used.
 */

/** Model for the Responses request (orchestrates tools; supports image inputs). */
const DEFAULT_RESPONSES_IMAGE_MODEL = "gpt-5.4-mini";

/** Engine passed to the `image_generation` tool (actual pixel generator). */
const DEFAULT_IMAGE_TOOL_ENGINE = "gpt-image-2";

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
export function planHasImageOutput(plan) {
  return plan.blocks.some((b) => b.role === "output" && b.typeId === "image");
}

/**
 * HTTPS image URLs from `input:image` blocks (URL mode) — attached as `input_image` for edits / references.
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @returns {string[]}
 */
export function collectHttpsInputImageUrls(plan) {
  /** @type {string[]} */
  const urls = [];
  for (const b of plan.blocks) {
    if (b.role !== "input" || b.typeId !== "image") continue;
    const src = String(b.values?.imageSource ?? "file");
    const u = String(b.values?.imageUrl ?? "").trim();
    if (src !== "url" || !u.startsWith("https://")) continue;
    try {
      // eslint-disable-next-line no-new
      new URL(u);
      urls.push(u);
    } catch {
      /* skip invalid */
    }
  }
  return urls;
}

/** Max `image_url` length per reference (data URL or https) on `/api/images/generate`. */
export const IMAGE_GENERATION_MAX_REFERENCE_URL_CHARS = 8_000_000;

/**
 * Client-supplied reference images (full-resolution file uploads as data URLs, or https URLs).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeReferenceImageUrls(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  for (const item of raw) {
    const u =
      typeof item === "string"
        ? item
        : isRecord(item) && typeof item.image_url === "string"
          ? item.image_url
          : isRecord(item) && typeof item.data_url === "string"
            ? item.data_url
            : "";
    const s = String(u).trim();
    if (!s) continue;
    if (s.startsWith("https://")) {
      try {
        // eslint-disable-next-line no-new
        new URL(s);
        if (s.length <= IMAGE_GENERATION_MAX_REFERENCE_URL_CHARS) out.push(s);
      } catch {
        /* skip */
      }
      continue;
    }
    if (s.startsWith("data:image/") && s.length <= IMAGE_GENERATION_MAX_REFERENCE_URL_CHARS) {
      out.push(s);
    }
  }
  return out;
}

/**
 * HTTPS URLs from the plan plus client reference payloads (deduped, plan URLs first).
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @param {string[]} [clientReferenceUrls]
 * @returns {string[]}
 */
export function collectReferenceImageUrlsForGeneration(plan, clientReferenceUrls = []) {
  const fromPlan = collectHttpsInputImageUrls(plan);
  const fromClient = normalizeReferenceImageUrls(clientReferenceUrls);
  const seen = new Set(fromPlan);
  const merged = [...fromPlan];
  for (const u of fromClient) {
    if (seen.has(u)) continue;
    seen.add(u);
    merged.push(u);
  }
  return merged;
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @returns {number}
 */
export function countInputImageBlocksForGeneration(plan) {
  return plan.blocks.filter((b) => b.role === "input" && b.typeId === "image").length;
}

/**
 * Maps workshop output:image size to values allowed on the `image_generation` tool (`size` field).
 * @param {string} raw
 * @returns {"1024x1024" | "1024x1536" | "1536x1024" | "auto"}
 */
export function mapPlanSizeToResponsesImageToolSize(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/×/g, "x");
  if (s === "1536x1024" || s === "1792x1024") return "1536x1024";
  if (s === "1024x1536" || s === "1024x1792") return "1024x1536";
  if (s === "auto") return "auto";
  return "1024x1024";
}

/**
 * Realtime `session.tools` entry — only included when `planHasImageOutput(plan)`.
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
export function buildWorkshopImageGenerationTool(plan) {
  const block = firstImageOutputBlock(plan);
  const inputImages = countInputImageBlocksForGeneration(plan);
  const httpsRefs = collectHttpsInputImageUrls(plan).length;
  const sizeHint = block ? mapPlanSizeToResponsesImageToolSize(String(block.values?.size ?? "1024x1024")) : "1024x1024";
  let desc =
    `Generate or edit an image and show it in the workshop image output (target size ${sizeHint}). ` +
    `The server uses the Responses API image tool (orchestration model ${process.env.OPENAI_IMAGE_RESPONSES_MODEL || DEFAULT_RESPONSES_IMAGE_MODEL}). `;
  if (inputImages > 0) {
    desc +=
      `This pipeline has ${inputImages} input:image module(s); reference image(s) from file upload (full resolution) or https URL are attached automatically when you call this tool. `;
  } else if (httpsRefs > 0) {
    desc += `This pipeline includes ${httpsRefs} HTTPS reference image URL(s) from input:image modules. `;
  }
  desc +=
    "Call only after the participant explicitly asks to generate or edit an image (spoken or written)—never on session start without such a request. Provide one clear prompt.";
  return {
    type: "function",
    name: "workshop_generate_image",
    description: desc,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What to generate or how to change the image (one self-contained instruction).",
        },
      },
      required: ["prompt"],
    },
  };
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @returns {{ role: string, typeId: string, values?: Record<string, string> } | null}
 */
export function firstImageOutputBlock(plan) {
  const b = plan.blocks.find((x) => x.role === "output" && x.typeId === "image");
  return b ?? null;
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Read the first completed `image_generation_call` from a Responses API JSON body.
 * @param {unknown} data
 * @returns {{ data_url: string, revised_prompt?: string }}
 */
export function extractImageFromResponsesApi(data) {
  if (!isRecord(data)) {
    const err = new Error("Invalid Responses API payload.");
    err.code = "NO_IMAGE_DATA";
    throw err;
  }
  const out = Array.isArray(data.output) ? data.output : [];
  for (const item of out) {
    if (!isRecord(item) || item.type !== "image_generation_call") continue;
    const st = String(item.status || "");
    if (st === "failed") {
      const em =
        isRecord(item.error) && typeof item.error.message === "string"
          ? item.error.message
          : "Image generation call failed.";
      const err = new Error(em);
      err.code = "IMAGE_GEN_CALL_FAILED";
      err.payload = item;
      throw err;
    }
    const raw = typeof item.result === "string" ? item.result.trim() : "";
    if (raw) {
      const revised = typeof item.revised_prompt === "string" ? item.revised_prompt : undefined;
      return { data_url: `data:image/png;base64,${raw}`, revised_prompt: revised };
    }
  }
  const err = new Error("Responses API returned no image_generation_call result.");
  err.code = "NO_IMAGE_DATA";
  err.payload = data;
  throw err;
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @param {string} prompt
 * @param {{
 *   apiKey?: string,
 *   baseUrl?: string,
 *   responsesModel?: string,
 *   imageToolModel?: string,
 *   fetchImpl?: typeof fetch,
 *   referenceImages?: unknown
 * }} [options]
 * @returns {Promise<{ data_url: string, revised_prompt?: string }>}
 */
export async function generateWorkshopImageFromPlan(plan, prompt, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const imgBlock = firstImageOutputBlock(plan);
  if (!imgBlock) {
    const err = new Error("Plan has no output:image block.");
    err.code = "NO_IMAGE_OUTPUT";
    throw err;
  }

  const p = String(prompt || "").trim();
  if (!p) {
    const err = new Error("Prompt is empty.");
    err.code = "EMPTY_PROMPT";
    throw err;
  }

  const base = (options.baseUrl ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const responsesModel =
    options.responsesModel ?? process.env.OPENAI_IMAGE_RESPONSES_MODEL ?? DEFAULT_RESPONSES_IMAGE_MODEL;
  const imageToolModel = options.imageToolModel ?? process.env.OPENAI_IMAGE_TOOL_MODEL ?? DEFAULT_IMAGE_TOOL_ENGINE;
  const fetchImpl = options.fetchImpl ?? fetch;

  const refUrls = collectReferenceImageUrlsForGeneration(plan, options.referenceImages);
  const intro = [
    "Workshop: generate one image for the pipeline image output card.",
    "",
    p,
  ];
  if (refUrls.length) {
    intro.push(
      "",
      `The pipeline includes ${refUrls.length} reference image(s) from input:image modules (attached as input_image parts, full resolution when uploaded as files).`,
    );
  }

  /** @type {{ type: string, text?: string, image_url?: string }[]} */
  const content = [{ type: "input_text", text: intro.join("\n") }];
  for (const u of refUrls) {
    content.push({ type: "input_image", image_url: u });
  }

  /** @type {Record<string, unknown>} */
  const imageTool = {
    type: "image_generation",
    action: "auto",
    quality: "auto",
    size: mapPlanSizeToResponsesImageToolSize(String(imgBlock.values?.size ?? "1024x1024")),
  };
  if (imageToolModel) {
    imageTool.model = imageToolModel;
  }

  const body = {
    model: responsesModel,
    input: [{ role: "user", content }],
    tools: [imageTool],
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

  const r = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) {
    const msg = isRecord(data) && isRecord(data.error) && typeof data.error.message === "string"
      ? data.error.message
      : text || `OpenAI HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    err.code = "OPENAI_IMAGE";
    err.payload = data;
    throw err;
  }

  return extractImageFromResponsesApi(data);
}
