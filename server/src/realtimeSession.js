import { buildFullRealtimeInstructions } from "./orchestrateRealtime.js";

/** GA Realtime model for WebRTC (`POST /v1/realtime/calls`); override via `OPENAI_REALTIME_MODEL`. */
const DEFAULT_REALTIME_MODEL = "gpt-realtime-mini";

/** @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan */
export function pickOutputModalities(plan) {
  // Realtime WebRTC session allows only ["text"] or ["audio"], not both (API error invalid modalities).
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

/**
 * Semantic VAD matches stable browser WebRTC clients; PTT still gates capture via
 * `MediaStreamTrack.enabled`.
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} _plan
 */
export function pickTurnDetection(_plan) {
  return { type: "semantic_vad", eagerness: "low", create_response: true };
}

/**
 * Full `session` object for a client `session.update` after `session.created` (WebRTC).
 * Minting `client_secrets` with only `{ type, model }` avoids baking config into the token.
 *
 * @param {{ blocks: unknown[] }} plan
 * @param {{ model?: string }} [options]
 */
export function buildRealtimePostConnectSession(plan, options = {}) {
  const model = options.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
  const instructions = buildFullRealtimeInstructions(plan);
  const voice = pickVoice(plan);
  const output_modalities = pickOutputModalities(plan);

  const hasLiveAudioIn = plan.blocks.some((b) => b.role === "input" && b.typeId === "audio-live");
  const wantsInputTranscription = plan.blocks.some(
    (b) => b.role === "input" && (b.typeId === "audio-live" || b.typeId === "audio-rec"),
  );
  const turn_detection = hasLiveAudioIn ? pickTurnDetection(plan) : null;
  /** @type {Record<string, unknown>} */
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
  if (wantsInputTranscription) {
    session.audio.input.transcription = {
      model: process.env.OPENAI_REALTIME_INPUT_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    };
  }
  if (turn_detection === null) {
    session.audio.input.turn_detection = null;
  } else {
    session.audio.input.turn_detection = turn_detection;
  }
  return session;
}

/**
 * @param {{ blocks: unknown[] }} plan
 * @param {{ apiKey?: string, baseUrl?: string, model?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function mintRealtimeClientSecret(plan, options = {}) {
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

  const body = {
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model,
    },
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
