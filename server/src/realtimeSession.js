import { planUsesRealtime } from "./knownModules.js";
import { buildFullRealtimeInstructions } from "./orchestrateRealtime.js";

const DEFAULT_REALTIME_MODEL = "gpt-4o-mini-realtime-preview";

/** @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan */
export function pickOutputModalities(plan) {
  const wantsAudio = plan.blocks.some((b) => b.role === "output" && b.typeId === "audio-live");
  return wantsAudio ? ["audio"] : ["text"];
}

/** @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan */
export function pickVoice(plan) {
  const out = plan.blocks.find((b) => b.role === "output" && b.typeId === "audio-live");
  const v = out && String(out.values?.voice ?? "").trim();
  if (v) return v;
  return "marin";
}

/** @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan */
export function pickTurnDetection(plan) {
  const liveIn = plan.blocks.find((b) => b.role === "input" && b.typeId === "audio-live");
  if (!liveIn) {
    return { type: "server_vad", create_response: true };
  }
  const tt = String(liveIn.values?.turnTaking ?? "vad");
  if (tt === "ptt") return null;
  return { type: "server_vad", create_response: true };
}

/**
 * @param {{ blocks: unknown[] }} plan
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function mintRealtimeClientSecret(plan, options = {}) {
  if (!planUsesRealtime(plan.blocks)) {
    const err = new Error("Plan does not use Realtime modules.");
    err.code = "NOT_REALTIME";
    throw err;
  }

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set.");
    err.code = "NO_API_KEY";
    throw err;
  }

  const base = (options.baseUrl ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = options.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  const instructions = buildFullRealtimeInstructions(plan);
  const voice = pickVoice(plan);
  const turn_detection = pickTurnDetection(plan);
  const output_modalities = pickOutputModalities(plan);

  const session = {
    type: "realtime",
    model,
    instructions,
    output_modalities,
    audio: {
      input: {},
      output: { voice },
    },
  };
  if (turn_detection === null) {
    session.audio.input.turn_detection = null;
  } else {
    session.audio.input.turn_detection = turn_detection;
  }

  const body = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session,
  };

  const url = `${base}/realtime/client_secrets`;
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
    const msg = data?.error?.message || text || `OpenAI HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    err.payload = data;
    throw err;
  }

  const value = data.value ?? data.client_secret?.value;
  const expires_at = data.expires_at ?? data.client_secret?.expires_at ?? null;
  return { value, expires_at, session: data.session ?? null, raw: data };
}
