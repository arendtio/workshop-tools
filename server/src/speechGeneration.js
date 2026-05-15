/**
 * Non-live `output:audio` — speech file via OpenAI `POST /v1/audio/speech`.
 */

const DEFAULT_SPEECH_MODEL = "tts-1";

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
export function planHasSpeechFileOutput(plan) {
  return plan.blocks.some((b) => b.role === "output" && b.typeId === "audio");
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @returns {{ role: string, typeId: string, values?: Record<string, string> } | null}
 */
export function firstSpeechFileOutputBlock(plan) {
  const b = plan.blocks.find((x) => x.role === "output" && x.typeId === "audio");
  return b ?? null;
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
export function buildWorkshopSynthesizeSpeechTool(plan) {
  const block = firstSpeechFileOutputBlock(plan);
  const voice = block ? String(block.values?.voice ?? "alloy").trim() || "alloy" : "alloy";
  return {
    type: "function",
    name: "workshop_synthesize_speech",
    description:
      "Create spoken audio from plain text and play it in the workshop **output:audio** card. " +
      `Voice preference from the plan: "${voice}". ` +
      "Call only after the participant explicitly asks for TTS, spoken summary, or audio output (not on session start without such a request). " +
      "Keep `input` under about 4000 characters.",
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: "Exact spoken text (plain text, no SSML).",
        },
      },
      required: ["input"],
    },
  };
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 * @param {string} inputText
 * @param {{ apiKey?: string, baseUrl?: string, fetchImpl?: typeof fetch, model?: string }} [options]
 * @returns {Promise<{ data_url: string, voice: string, model: string }>}
 */
export async function generateWorkshopSpeechFromPlan(plan, inputText, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const blk = firstSpeechFileOutputBlock(plan);
  if (!blk) {
    const err = new Error("Plan has no output:audio (file speech) block.");
    err.code = "NO_SPEECH_OUTPUT";
    throw err;
  }

  let input = String(inputText ?? "").trim();
  if (!input) {
    const err = new Error("TTS input is empty.");
    err.code = "EMPTY_TTS_INPUT";
    throw err;
  }
  if (input.length > 4096) input = input.slice(0, 4096);

  const voice = String(blk.values?.voice ?? "alloy").trim() || "alloy";
  const model = options.model ?? process.env.OPENAI_SPEECH_MODEL ?? DEFAULT_SPEECH_MODEL;
  const base = (options.baseUrl ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${base}/audio/speech`;
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
    input,
    voice,
    response_format: "mp3",
  };

  const r = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok) {
    let msg = `OpenAI HTTP ${r.status}`;
    try {
      const txt = buf.toString("utf8");
      const data = JSON.parse(txt);
      if (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string") {
        msg = data.error.message;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    err.status = r.status;
    err.code = "OPENAI_SPEECH";
    throw err;
  }

  const b64 = buf.toString("base64");
  return { data_url: `data:audio/mpeg;base64,${b64}`, voice, model };
}
