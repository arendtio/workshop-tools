/**
 * Workshop AI Sandbox — workbench UI (static modules) plus optional Realtime run
 * when served from the workshop Node server on the same origin.
 */

const INPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Typed or pasted text", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Upload or reference stills", live: false },
  {
    id: "form",
    code: "FRM",
    title: "Form",
    desc: "Composer: build fields to collect participant input",
    live: false,
  },
  {
    id: "dynamic-ui",
    code: "UI",
    title: "UI (prompt)",
    desc: "Describe UI to render — sliders, matrix, charts, …",
    live: false,
  },
  { id: "audio-rec", code: "A·R", title: "Audio (recorded)", desc: "Captured clip or file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streaming microphone", live: true },
];

const PROCESS_TYPES = [
  { id: "instruction", code: "INS", title: "Instruction", desc: "System instruction and run limits", live: false },
  { id: "vector-db", code: "RAG", title: "Knowledge / vectors", desc: "Retrieval from a vector store", live: false },
  {
    id: "tooling",
    code: "TLS",
    title: "Tooling",
    desc: "Read/write workshop data scope (stub)",
    live: false,
  },
  { id: "skills", code: "SKL", title: "Skills / context", desc: "Platform-hosted skill presets", live: false },
];

const OUTPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Structured or free-form reply", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Generated or edited visuals", live: false },
  {
    id: "form",
    code: "FRM",
    title: "Form",
    desc: "Same composer — show mock AI-filled previews",
    live: false,
  },
  {
    id: "dynamic-ui",
    code: "UI",
    title: "UI (prompt)",
    desc: "Describe UI — edit prompt & resubmit for a fresh mock preview",
    live: false,
  },
  { id: "audio", code: "AUD", title: "Audio", desc: "Speech or sound file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streamed speech / playback", live: true },
];

/** Built-in example pipelines (minimal block list — defaults from `createBlock`). */
const BUILTIN_PRESETS = {
  "text-prompt": {
    label: "Text pipeline",
    blocks: [
      { role: "input", typeId: "text" },
      { role: "process", typeId: "instruction" },
      { role: "output", typeId: "text" },
    ],
  },
  vision: {
    label: "Vision + text",
    blocks: [
      { role: "input", typeId: "image" },
      { role: "input", typeId: "text" },
      { role: "process", typeId: "instruction" },
      { role: "process", typeId: "vector-db" },
      { role: "output", typeId: "text" },
    ],
  },
  "live-audio": {
    label: "Live audio",
    blocks: [
      { role: "input", typeId: "audio-live" },
      { role: "process", typeId: "instruction" },
      { role: "process", typeId: "tooling" },
      { role: "output", typeId: "text" },
      { role: "output", typeId: "audio-live" },
    ],
  },
  "multimodal-out": {
    label: "Multimodal output",
    blocks: [
      { role: "input", typeId: "text" },
      { role: "input", typeId: "image" },
      { role: "process", typeId: "instruction" },
      { role: "process", typeId: "skills" },
      { role: "output", typeId: "text" },
      { role: "output", typeId: "image" },
    ],
  },
  "form-ui-demo": {
    label: "Form + UI",
    blocks: [
      { role: "input", typeId: "form" },
      { role: "input", typeId: "dynamic-ui" },
      { role: "process", typeId: "instruction" },
      { role: "output", typeId: "text" },
      { role: "output", typeId: "form" },
      { role: "output", typeId: "dynamic-ui" },
    ],
  },
};

const LAYOUT_STORAGE_KEY = "workshop-sandbox-layouts-v1";
const DEFAULT_BUILTIN_PRESET_ID = "text-prompt";

const ROLE_LABEL = { input: "Input", process: "Processing", output: "Output" };

/** Voices documented for Speech / modal audio (`/v1/audio/speech`, chat `audio.voice`). */
const OPENAI_VOICE_SELECT_OPTIONS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
].map((v) => ({ value: v, label: v }));

/** @type {Map<string, MediaStream>} block id → active preview stream */
const blockMediaStreams = new Map();

/** @type {Map<string, { recorder: MediaRecorder, chunks: BlobPart[], statusEl: HTMLElement | null }>} */
const blockMediaRecorders = new Map();

/** Push-to-talk toggle: block id → mic unmuted (Realtime: syncs to track.enabled). */
const audioLivePttToggleState = new Map();

/**
 * Mock form fields per module type. Keys are `role:typeId`.
 * Field objects: type is one of text, textarea, number, select, segmented, dropzone, hint,
 * camera_preview, file, media_device, audio_record.
 * @type {Record<string, { apiMapping?: string, defaults: Record<string, string>, fields: object[] }>}
 */
const FORM_SCHEMA = {
  "input:text": {
    apiMapping:
      "Chat Completions / Responses — user text turns (`messages` / `input`). See Text generation guide.",
    defaults: {
      content: "Summarize the workshop goals in two bullet points.",
    },
    fields: [
      {
        key: "content",
        label: "Text for the model",
        type: "textarea",
        rows: 4,
        placeholder: "Prompt or raw text content",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Backend sends this string as a user message (or `input_text` in the Responses API).",
      },
    ],
  },
  "input:image": {
    apiMapping:
      "Chat Completions user content `image_url` (`url` + `detail`) or Responses `input_image` (`image_url` / `file_id`). Vision guide.",
    defaults: {
      imageSource: "file",
      imageUrl: "",
      uploadStub: "",
      scaleTo512: "1",
    },
    fields: [
      {
        key: "imageSource",
        label: "Source",
        type: "segmented",
        options: [
          { value: "file", label: "File" },
          { value: "url", label: "URL" },
        ],
      },
      {
        key: "uploadStub",
        label: "Upload image",
        type: "dropzone",
        accept: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
        dropLabel: "Drop image here or click to browse",
        showWhen: { key: "imageSource", is: "file" },
      },
      {
        key: "scaleTo512",
        label: "",
        type: "checkbox",
        checkboxLabel: "Auf maximal 512 Pixel skalieren",
        showWhen: { key: "imageSource", is: "file" },
      },
      {
        key: "imageUrl",
        label: "Image URL (https)",
        type: "text",
        placeholder: "https://…",
        showWhen: { key: "imageSource", is: "url" },
      },
    ],
  },
  "input:audio-rec": {
    apiMapping:
      "POST `/v1/audio/transcriptions` — multipart `file` + `model` (e.g. `gpt-4o-transcribe`, `whisper-1`). Speech-to-text guide.",
    defaults: {
      uploadStub: "",
      recordingStub: "",
    },
    fields: [
      {
        key: "uploadStub",
        label: "Audio file",
        type: "dropzone",
        accept: "audio/*,.mp3,.wav,.m4a,.webm,.mp4,.mpeg,.mpga",
        dropLabel: "Drop audio or browse",
      },
      {
        key: "recordingStub",
        label: "Or record from microphone",
        type: "audio_record",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Recording produces a blob your backend forwards as `file`; duration is derived automatically.",
      },
    ],
  },
  "input:audio-live": {
    apiMapping:
      "Live microphone capture for the workshop. Session type, transport, and speech models are chosen in your backend from the overall pipeline setup.",
    defaults: {
      device: "",
      turnTaking: "vad",
      pttStyle: "hold",
    },
    fields: [
      {
        key: "device",
        label: "Microphone",
        type: "media_device",
        kind: "audioinput",
      },
      {
        key: "turnTaking",
        label: "Turn-taking",
        type: "segmented",
        options: [
          { value: "vad", label: "Voice activity" },
          { value: "ptt", label: "Push-to-talk" },
        ],
      },
      {
        key: "pttStyle",
        label: "Push-to-talk mode",
        type: "segmented",
        options: [
          { value: "hold", label: "Hold button while speaking" },
          { value: "toggle", label: "Press to start / press again to stop" },
        ],
        showWhen: { key: "turnTaking", is: "ptt" },
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Browser workshops: capture audio client-side, stream to your backend, forward to OpenAI with an ephemeral client secret — never expose org API keys.",
      },
    ],
  },
  "process:instruction": {
    apiMapping:
      "Workshop: system instruction and run limits only — model, tokens, modalities, streaming, and voices are fixed server-side or via output modules.",
    defaults: {
      system:
        "You are a concise assistant. Respect safety policies. Prefer bullet lists when comparing options.",
      maxIterations: "4",
      stopWhen: "Answer includes a numbered list.",
    },
    fields: [
      {
        key: "system",
        label: "System instruction",
        type: "textarea",
        rows: 4,
        placeholder: "Behavior, tone, constraints for this workshop step",
      },
      { key: "maxIterations", label: "Max iterations (agent / retry loop)", type: "number", placeholder: "4" },
      {
        key: "stopWhen",
        label: "Stop condition (plain language)",
        type: "textarea",
        rows: 2,
        placeholder: "When should the run stop retrying? (Your backend evaluates this.)",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Reasoning effort and sampling live on the server; outputs are shaped by your output modules.",
      },
    ],
  },
  "process:vector-db": {
    apiMapping:
      "Upload files → Vector store + `file_search` (`vector_store_ids`) in the Responses API. End users only pick files; indexing stays server-side.",
    defaults: {
      knowledgeFiles: "",
    },
    fields: [
      {
        key: "knowledgeFiles",
        label: "Knowledge files",
        type: "dropzone",
        accept: ".pdf,.txt,.md,.markdown,.doc,.docx,.html,.csv,.png,.jpg,.jpeg,.webp,.gif",
        dropLabel: "Drop one or more files (PDF, text, Office, images …)",
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Your backend ingests these into a vector store / file search; participants do not manage collection IDs.",
      },
    ],
  },
  "process:tooling": {
    apiMapping:
      "Maps to Responses / Chat function tools or bespoke connectors server-side — this card holds workshop selections only.",
    defaults: {
      accessMode: "read",
      serviceDomain: "customers",
    },
    fields: [
      {
        key: "accessMode",
        label: "Vorgang",
        type: "select",
        options: [
          { value: "read", label: "Daten lesen" },
          { value: "write", label: "Daten schreiben" },
        ],
      },
      {
        key: "serviceDomain",
        label: "Service",
        type: "select",
        options: [
          { value: "customers", label: "Kundendaten" },
          { value: "orders", label: "Auftragsdaten" },
          { value: "shop", label: "Shop- & Produktdaten" },
          { value: "inventory", label: "Lager / Bestand" },
          { value: "other", label: "Sonstiges" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Stub-Werte für den Workshop; die echte Implementierung übersetzt Vorgang und Service in konkrete Endpunkte oder Tools.",
      },
    ],
  },
  "process:skills": {
    apiMapping:
      "Adds a platform-maintained skill / instruction preset (wired server-side to system or developer prompts). Optional today; no workshop file upload.",
    defaults: { skillPreset: "workshop-general" },
    fields: [
      {
        key: "skillPreset",
        label: "Skill pack",
        type: "select",
        options: [
          { value: "none", label: "— No skill pack —" },
          { value: "workshop-general", label: "Workshop · facilitation (default)" },
          { value: "workshop-writing", label: "Workshop · drafting & rewriting" },
          { value: "workshop-compliance", label: "Workshop · careful / policy-aware tone" },
          { value: "workshop-brief-de", label: "Workshop · concise German summaries" },
        ],
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Values are stubs for this demo; your backend maps each key to curated instructions.",
      },
    ],
  },
  "input:form": {
    apiMapping:
      "Structured collector — serialized to JSON / tool payloads on the backend. Composer is sandbox-only.",
    defaults: {},
    fields: [],
  },
  "input:dynamic-ui": {
    apiMapping:
      "Natural-language UI spec → rendered widgets in your host app (charts, sliders, matrices). Prompt + regen are UI-only mocks here.",
    defaults: {
      uiPrompt: "Drei Slider für Budget, Risiko und Zufriedenheit (je 0–100).",
    },
    fields: [],
  },
  "output:form": {
    apiMapping:
      "Structured presenter — e.g. model-populated defaults. Composer matches the Input form module.",
    defaults: {},
    fields: [],
  },
  "output:dynamic-ui": {
    apiMapping:
      "NL-driven UI on the output path — regenerate by editing prompt and submitting again.",
    defaults: {
      uiPrompt: "Ein Balkendiagramm mit vier Balken für Q1–Q4 (Demo-Zahlen).",
    },
    fields: [],
  },
  "output:text": {
    apiMapping:
      "Assistant reply in your host app — this card is a compact chat preview of upstream pipeline context (mock).",
    defaults: {},
    fields: [],
  },
  "output:image": {
    apiMapping:
      "Server: `POST /v1/responses` with the `image_generation` tool (orchestration model + reference URLs from input:image when HTTPS). Size is chosen from this block.",
    defaults: {
      size: "1024x1024",
    },
    fields: [
      {
        key: "size",
        label: "Size",
        type: "select",
        options: [
          { value: "1024x1024", label: "1024×1024" },
          { value: "1536x1024", label: "1536×1024 (landscape)" },
          { value: "1024x1536", label: "1024×1536 (portrait)" },
          { value: "auto", label: "auto (supported models)" },
        ],
      },
    ],
  },
  "output:audio": {
    apiMapping:
      "POST `/v1/audio/speech` — workshop picks voice only; model, speed, format, and copy come from processing / backend.",
    defaults: {
      voice: "alloy",
    },
    fields: [
      {
        key: "voice",
        label: "Voice",
        type: "select",
        options: OPENAI_VOICE_SELECT_OPTIONS,
      },
    ],
  },
  "output:audio-live": {
    apiMapping:
      "Realtime / streamed speech uses the same built-in voice names as TTS where applicable; transport (WebRTC vs WebSocket) is an implementation choice, not a workshop field.",
    defaults: {
      voice: "marin",
    },
    fields: [
      {
        key: "voice",
        label: "Voice",
        type: "select",
        options: OPENAI_VOICE_SELECT_OPTIONS,
      },
    ],
  },
};

const state = {
  /** @type {{ id: string, role: 'input'|'process'|'output', typeId: string, values: Record<string, string>, runPreview?: string, _transcriptLog?: { key: string, role: 'user'|'assistant'|'system', label: string, body: string }[], _textOutputShowSystem?: boolean, _runImageDataUrl?: string, _runImageGenerating?: boolean, _recordedAudioBlob?: Blob | null, _inputImageBlob?: Blob | null }[]} */
  blocks: [],
  /** Collapsible sections in the pipeline editor */
  sectionOpen: { input: true, process: true, output: true },
  /** Workshop run locks the palette while a Realtime session is active */
  running: false,
  /** @type {null | 'realtime'} */
  runMode: null,
};

/** @type {RTCPeerConnection | null} */
let realtimePeerConnection = null;
/** @type {MediaStream | null} */
let realtimeLocalStream = null;
/** @type {RTCDataChannel | null} */
let realtimeDataChannel = null;
/**
 * When true, a completed model `response.done` ends the run (pipelines without live mic input).
 * Live microphone pipelines stay running until the user stops them.
 */
let realtimeRunAutoStop = false;

/** Image tool `/api/images/generate` — linear progress bar target (UI estimate only). */
const IMAGE_GEN_PROGRESS_TARGET_MS = 70_000;
/** @type {ReturnType<typeof setInterval> | null} */
let imageGenProgressTimer = null;
let imageGenProgressStartedAt = 0;

/**
 * Explicit STUN helps Firefox/Chrome keep ICE consent refreshes working through NAT;
 * bare `new RTCPeerConnection()` relies on browser defaults and can hit “consent timed out” ~30s.
 * @type {{ urls: string }[]}
 */
const REALTIME_WEBRTC_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Ctrl-hold PTT engaged (hold mode); released on Ctrl keyup, blur, or run stop. */
let pttCtrlMicEngaged = false;
/** Sync handles from the last rendered audio-live PTT bar (keyboard shortcuts). */
let lastAudioLivePttUi = null;

function setRealtimeLocalMicEnabled(enabled) {
  if (!realtimeLocalStream) return;
  realtimeLocalStream.getAudioTracks().forEach((t) => {
    t.enabled = enabled;
  });
}

let idSeq = 0;

function uid() {
  idSeq += 1;
  return `b-${idSeq}`;
}

function serializePipelinePlan() {
  return {
    version: 1,
    blocks: state.blocks.map((b) => ({
      id: b.id,
      role: b.role,
      typeId: b.typeId,
      values: { ...(b.values || {}) },
      formItems: Array.isArray(b.formItems) ? b.formItems.map((it) => ({ ...it })) : undefined,
      dynamicUiCommitted: b.dynamicUiCommitted,
    })),
  };
}

/** @returns {boolean} */
function pipelineUsesLiveAudioModules() {
  return state.blocks.some(
    (b) =>
      (b.role === "input" && b.typeId === "audio-live") ||
      (b.role === "output" && b.typeId === "audio-live"),
  );
}

/** Live microphone input — keeps the run open until the user explicitly stops. */
function pipelineHasLiveAudioInput() {
  return state.blocks.some((b) => b.role === "input" && b.typeId === "audio-live");
}

const REALTIME_INPUT_AUDIO_MAX_BASE64_CHARS = 12_000_000;

/** Guard for `input_image` data URLs on the Realtime data channel (character count incl. prefix). */
const REALTIME_INPUT_IMAGE_MAX_DATA_URL_CHARS = 2_000_000;

/**
 * Target max encoded size when auto-scaling to 512 px (empirical Realtime data-channel limit ~10k chars).
 */
const REALTIME_INPUT_IMAGE_TARGET_512PX_DATA_URL_CHARS = 10_000;

/**
 * Target max encoded size for full multi-step compression (checkbox off).
 */
const REALTIME_INPUT_IMAGE_TARGET_MAX_DATA_URL_CHARS = 900_000;

/**
 * @param {AudioBuffer} ab
 * @returns {Float32Array}
 */
function float32MonoFromAudioBuffer(ab) {
  const n = ab.numberOfChannels;
  const len = ab.length;
  const out = new Float32Array(len);
  if (n === 1) {
    out.set(ab.getChannelData(0));
  } else {
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < n; c++) s += ab.getChannelData(c)[i];
      out[i] = s / n;
    }
  }
  return out;
}

/**
 * @param {Float32Array} input
 * @param {number} fromRate
 * @param {number} toRate
 */
function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const j = Math.floor(srcPos);
    const f = srcPos - j;
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/**
 * @param {Float32Array} f32
 * @returns {Uint8Array}
 */
function floatTo16BitPCM(f32) {
  const buf = new ArrayBuffer(f32.length * 2);
  const v = new DataView(buf);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    v.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/**
 * @param {Uint8Array} bytes
 */
function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

/**
 * Realtime `input_audio` defaults to PCM 16-bit 24kHz mono.
 * @param {Blob} blob
 */
async function blobToRealtimeInputAudioBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const mono = float32MonoFromAudioBuffer(audioBuffer);
    const resampled = resampleLinear(mono, audioBuffer.sampleRate, 24000);
    const pcm = floatTo16BitPCM(resampled);
    return uint8ToBase64(pcm);
  } finally {
    await ctx.close();
  }
}

/**
 * @param {RTCDataChannel} dc
 * @param {string} text
 */
function sendRealtimeUserTextItem(dc, text) {
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }),
  );
}

/**
 * @param {{ values?: Record<string, string> }} block
 * @returns {boolean}
 */
function imageInputScaleTo512Enabled(block) {
  const v = block.values?.scaleTo512;
  if (v === undefined || v === null || v === "") return true;
  return v === "1" || v === "true";
}

/**
 * Re-encode to JPEG and cap dimensions so `input_image` fits Realtime data-channel frames.
 * @param {Blob} blob
 * @param {{ scaleTo512?: boolean }} [options]
 * @returns {Promise<Blob>}
 */
async function compressImageBlobForRealtimeChannel(blob, options = {}) {
  if (!(blob instanceof Blob) || blob.size < 1) return blob;
  const scaleTo512 = !!options.scaleTo512;
  const sizeTarget = scaleTo512
    ? REALTIME_INPUT_IMAGE_TARGET_512PX_DATA_URL_CHARS
    : REALTIME_INPUT_IMAGE_TARGET_MAX_DATA_URL_CHARS;
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
  } catch (err) {
    console.warn("createImageBitmap failed; sending original blob (may be too large)", err);
    return blob;
  }
  try {
    const attempts = scaleTo512
      ? [
          { maxSide: 512, q: 0.72 },
          { maxSide: 512, q: 0.55 },
          { maxSide: 512, q: 0.4 },
        ]
      : [
          { maxSide: 1536, q: 0.82 },
          { maxSide: 1152, q: 0.74 },
          { maxSide: 896, q: 0.66 },
          { maxSide: 640, q: 0.58 },
        ];
    /** @type {Blob | null} */
    let smallest = null;
    let smallestLen = Infinity;
    for (const { maxSide, q } of attempts) {
      const w = bmp.width;
      const h = bmp.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(bmp, 0, 0, tw, th);
      const jpegBlob = await new Promise((res) => {
        canvas.toBlob((b) => res(b), "image/jpeg", q);
      });
      if (!(jpegBlob instanceof Blob) || jpegBlob.size < 1) continue;
      const du = await readBlobAsDataUrl(jpegBlob);
      if (du.length < smallestLen) {
        smallestLen = du.length;
        smallest = jpegBlob;
      }
      if (du.length <= sizeTarget) {
        return jpegBlob;
      }
    }
    return smallest instanceof Blob ? smallest : blob;
  } finally {
    bmp.close();
  }
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/**
 * Full-resolution references for `/api/images/generate` (not the 512 px Realtime preview).
 * @returns {Promise<{ block_id: string, image_url: string }[]>}
 */
async function collectInputImageReferencesForGeneration() {
  /** @type {{ block_id: string, image_url: string }[]} */
  const refs = [];
  for (const b of state.blocks) {
    if (b.role !== "input" || b.typeId !== "image") continue;
    const src = String(b.values?.imageSource ?? "file");
    if (src === "url") {
      const u = String(b.values?.imageUrl ?? "").trim();
      if (u.startsWith("https://")) refs.push({ block_id: b.id, image_url: u });
      continue;
    }
    const blob = b._inputImageBlob;
    if (!(blob instanceof Blob) || blob.size < 1) continue;
    try {
      const dataUrl = await readBlobAsDataUrl(blob);
      if (dataUrl.startsWith("data:image/")) {
        refs.push({ block_id: b.id, image_url: dataUrl });
      }
    } catch (err) {
      console.warn("Could not read input image for generation", b.id, err);
    }
  }
  return refs;
}

async function sendRealtimeInputImageBlock(dc, block) {
  const label = `Input · image (${block.id})`;
  const blob = block._inputImageBlob;
  if (!(blob instanceof Blob) || blob.size < 1) {
    sendRealtimeUserTextItem(
      dc,
      `${label}\n(No image file loaded in this browser session — choose a file in the image input module before Run.)`,
    );
    return;
  }

  const scale512 = imageInputScaleTo512Enabled(block);
  const inputText = `${label} (local file, attached as input_image)`;

  let dataUrl;
  try {
    const compressed = await compressImageBlobForRealtimeChannel(blob, { scaleTo512: scale512 });
    dataUrl = await readBlobAsDataUrl(compressed);
  } catch (err) {
    console.warn("Image read failed", err);
    showToast("Could not read image file.");
    sendRealtimeUserTextItem(dc, `${label}\n(Image read failed in the browser.)`);
    return;
  }

  if (!dataUrl.startsWith("data:image/")) {
    sendRealtimeUserTextItem(dc, `${label}\n(Selected file is not a supported image type.)`);
    return;
  }
  if (dataUrl.length > REALTIME_INPUT_IMAGE_MAX_DATA_URL_CHARS) {
    showToast("Image still too large after compression — use a smaller source or an HTTPS URL.");
    sendRealtimeUserTextItem(
      dc,
      `${label}\n(Image still too large after browser compression for the Realtime data channel.)`,
    );
    return;
  }
  if (dataUrl.length > REALTIME_INPUT_IMAGE_TARGET_512PX_DATA_URL_CHARS) {
    console.warn(
      `[workshop] Realtime input_image data URL is ${dataUrl.length} chars (>${REALTIME_INPUT_IMAGE_TARGET_512PX_DATA_URL_CHARS}); vision may fail on the data channel.`,
    );
  }

  const imageDetail = scale512 ? "low" : "auto";

  try {
    dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: inputText },
            { type: "input_image", image_url: dataUrl, detail: imageDetail },
          ],
        },
      }),
    );
  } catch (err) {
    console.warn("Realtime input_image send failed", err);
    showToast("Could not send image to Realtime (message too large or channel closed).");
    sendRealtimeUserTextItem(
      dc,
      `${label}\n(Image could not be sent on the data channel — try a smaller image or an HTTPS URL.)`,
    );
  }
}

/**
 * @param {RTCDataChannel} dc
 * @param {{ id: string, role: string, typeId: string, values: Record<string, string>, _recordedAudioBlob?: Blob | null }} block
 */
async function sendRealtimeAudioRecBlock(dc, block) {
  const label = `Input · audio-rec (${block.id})`;
  const blob = block._recordedAudioBlob;
  if (!blob || blob.size < 1) {
    sendRealtimeUserTextItem(
      dc,
      `${label}\n(No recorded or uploaded audio in this browser session — record or choose a file before Run.)`,
    );
    return;
  }
  let b64;
  try {
    b64 = await blobToRealtimeInputAudioBase64(blob);
  } catch (e) {
    console.warn("Could not encode audio for Realtime", e);
    showToast("Audio could not be decoded for Realtime — try WAV/MP3 or a shorter clip.");
    sendRealtimeUserTextItem(dc, `${label}\n(Audio decode failed in the browser.)`);
    return;
  }
  if (b64.length > REALTIME_INPUT_AUDIO_MAX_BASE64_CHARS) {
    showToast("Audio clip too large for Realtime — use a shorter recording.");
    sendRealtimeUserTextItem(dc, `${label}\n(Attached audio exceeded the browser size guard.)`);
    return;
  }
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `${label}\nUser audio is attached below as PCM 16-bit mono @ 24kHz (decoded in the browser from the recording or file).`,
          },
          { type: "input_audio", audio: b64 },
        ],
      },
    }),
  );
}

/**
 * Preserve pipeline input order: walk blocks and interleave `audio-rec` and file `input:image`
 * (client-attached bytes) with server bootstrap events.
 * @param {RTCDataChannel} dc
 * @param {object[]} bootstrapEvents
 */
async function mergeRealtimeBootstrapUserItems(dc, bootstrapEvents) {
  let bi = 0;
  for (const b of state.blocks) {
    if (b.role !== "input") continue;
    if (b.typeId === "audio-live") continue;
    if (b.typeId === "audio-rec") {
      await sendRealtimeAudioRecBlock(dc, b);
      continue;
    }
    if (b.typeId === "image" && String(b.values?.imageSource ?? "file") === "file") {
      await sendRealtimeInputImageBlock(dc, b);
      continue;
    }
    if (bi < bootstrapEvents.length) {
      try {
        dc.send(JSON.stringify(bootstrapEvents[bi]));
      } catch (err) {
        console.warn("Orchestration bootstrap send failed", err);
      }
      bi += 1;
    }
  }
  while (bi < bootstrapEvents.length) {
    try {
      dc.send(JSON.stringify(bootstrapEvents[bi]));
    } catch (err) {
      console.warn("Orchestration bootstrap tail send failed", err);
    }
    bi += 1;
  }
}

function releasePttCtrlHotkey() {
  if (!pttCtrlMicEngaged) return;
  pttCtrlMicEngaged = false;
  if (lastAudioLivePttUi?.mode === "hold" && typeof lastAudioLivePttUi.setHoldVisual === "function") {
    try {
      lastAudioLivePttUi.setHoldVisual(false);
    } catch (_) {
      /* ignore */
    }
  }
  setRealtimeLocalMicEnabled(false);
}

function isTypingInField(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

async function stopRealtimeRun() {
  stopImageGenerationProgressUi();
  releasePttCtrlHotkey();
  realtimeRunAutoStop = false;
  realtimeDataChannel = null;
  if (realtimeLocalStream) {
    realtimeLocalStream.getTracks().forEach((t) => t.stop());
    realtimeLocalStream = null;
  }
  if (realtimePeerConnection) {
    realtimePeerConnection.close();
    realtimePeerConnection = null;
  }
  state.running = false;
  state.runMode = null;
  updateRunChrome();
  lockPalette(false);
  renderAll();
}

async function startRealtimeRun() {
  if (state.running) return;
  const plan = serializePipelinePlan();
  try {
    let res = await fetch("/api/plan/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan),
    });
    const v = await res.json().catch(() => ({}));
    if (!res.ok || !v.valid) {
      const msg =
        (v.errors && v.errors.map((e) => e.message).join(" ")) || v.message || res.statusText || "Validation failed";
      showToast(`Validation failed: ${msg}`);
      return;
    }

    res = await fetch("/api/realtime/client-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.valid) {
      const msg =
        (data.errors && data.errors.map((e) => e.message).join(" ")) ||
        data.message ||
        res.statusText ||
        "Could not mint client secret";
      showToast(`Realtime: ${msg}`);
      return;
    }

    const token = data.client_secret && data.client_secret.value;
    if (!token) {
      showToast("Server returned no client secret.");
      return;
    }
    const callsUrl = data.realtime_calls_url;
    const bootstrapEvents =
      data.orchestration && Array.isArray(data.orchestration.client_events)
        ? data.orchestration.client_events
        : [];
    const postConnectSession = data.post_connect_session;
    if (!postConnectSession || typeof postConnectSession !== "object") {
      showToast("Server returned no Realtime session payload.");
      return;
    }

    realtimeRunAutoStop = !pipelineHasLiveAudioInput();
    stopImageGenerationProgressUi();
    for (const b of state.blocks) {
      if (b.role === "output" && b.typeId === "text") {
        b.runPreview = "";
        b._transcriptLog = [];
      }
      if (b.role === "output" && b.typeId === "image") {
        delete b._runImageDataUrl;
        delete b._runImageGenerating;
      }
    }
    seedTextOutputTranscriptLogsFromPipeline();

    const pc = new RTCPeerConnection({ iceServers: REALTIME_WEBRTC_ICE_SERVERS });
    realtimePeerConnection = pc;

    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    pc.ontrack = (ev) => {
      remoteAudio.srcObject = ev.streams[0];
    };

    if (state.blocks.some((b) => b.role === "input" && b.typeId === "audio-live")) {
      realtimeLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeLocalStream.getTracks().forEach((track) => pc.addTrack(track, realtimeLocalStream));
      const wantsPtt = state.blocks.some(
        (b) => b.role === "input" && b.typeId === "audio-live" && b.values.turnTaking === "ptt",
      );
      if (wantsPtt) {
        audioLivePttToggleState.clear();
        setRealtimeLocalMicEnabled(false);
      }
    } else {
      // OpenAI Realtime `/realtime/calls` rejects SDP offers without an audio m-line ("invalid_offer").
      pc.addTransceiver("audio", { direction: "recvonly" });
    }

    const dc = pc.createDataChannel("oai-events");
    realtimeDataChannel = dc;
    let postConnectFlushed = false;
    let sessionCreatedReceived = false;

    const flushPostConnect = () => {
      if (postConnectFlushed || !sessionCreatedReceived || dc.readyState !== "open") return;
      postConnectFlushed = true;
      try {
        dc.send(JSON.stringify({ type: "session.update", session: postConnectSession }));
      } catch (err) {
        console.warn("Realtime session.update send failed", err);
      }
      void (async () => {
        try {
          await mergeRealtimeBootstrapUserItems(dc, bootstrapEvents);
        } catch (e) {
          console.warn("Realtime bootstrap merge failed", e);
        }
        if (!pipelineHasLiveAudioInput()) {
          try {
            if (dc.readyState === "open") {
              dc.send(JSON.stringify({ type: "response.create" }));
            }
          } catch (err) {
            console.warn("Realtime response.create send failed", err);
          }
        }
      })();
    };

    dc.addEventListener("open", () => {
      flushPostConnect();
    });
    dc.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        handleRealtimeDataChannelMessage(ev.data);
        return;
      }
      if (msg && msg.type === "session.created") {
        sessionCreatedReceived = true;
        flushPostConnect();
      }
      handleRealtimeDataChannelMessage(ev.data);
    });

    state.running = true;
    state.runMode = "realtime";
    updateRunChrome();
    lockPalette(true);
    renderAll();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(callsUrl, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpRes.ok) {
      const t = await sdpRes.text();
      showToast(`Realtime handshake failed (${sdpRes.status}): ${t.slice(0, 140)}`);
      await stopRealtimeRun();
      return;
    }

    const answer = { type: "answer", sdp: await sdpRes.text() };
    await pc.setRemoteDescription(answer);

    showToast(
      pipelineHasLiveAudioInput()
        ? "Realtime session connected — click Running or Esc when you are done."
        : "Realtime session connected — the run will end automatically when the model response completes.",
    );
  } catch (e) {
    console.error(e);
    await stopRealtimeRun();
    const hint =
      e && e.name === "NotAllowedError"
        ? "Microphone permission denied."
        : e && e.message
          ? e.message
          : "Could not start Realtime. Serve the app from the workshop Node server on the same origin (see AGENTS.md).";
    showToast(hint);
  }
}

function findDef(role, typeId) {
  const list =
    role === "input" ? INPUT_TYPES : role === "process" ? PROCESS_TYPES : OUTPUT_TYPES;
  return list.find((t) => t.id === typeId);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formSchemaKey(role, typeId) {
  return `${role}:${typeId}`;
}

function createBlock(role, typeId) {
  const sk = formSchemaKey(role, typeId);
  const schema = FORM_SCHEMA[sk];
  const values = schema ? { ...schema.defaults } : {};
  /** @type {{ id: string, role: string, typeId: string, values: Record<string, string>, formItems?: object[], dynamicUiCommitted?: string }} */
  const block = { id: uid(), role, typeId, values };
  if (typeId === "form") {
    block.formItems = [];
  }
  if (typeId === "dynamic-ui") {
    block.dynamicUiCommitted = "";
  }
  return block;
}

function defaultBuiltinEntries() {
  return Object.keys(BUILTIN_PRESETS).map((presetId) => ({
    id: `e-bi-${presetId}`,
    kind: "builtin",
    presetId,
  }));
}

function migrateV1ToV2(data) {
  const customList = Array.isArray(data.layouts)
    ? data.layouts.filter((l) => l && typeof l.id === "string" && Array.isArray(l.blocks))
    : [];
  const entries = [];
  for (const presetId of Object.keys(BUILTIN_PRESETS)) {
    entries.push({ id: `e-bi-${presetId}`, kind: "builtin", presetId });
  }
  for (const l of customList) {
    entries.push({
      id: l.id,
      kind: "custom",
      name: typeof l.name === "string" ? l.name : "Untitled",
      savedAt: typeof l.savedAt === "string" ? l.savedAt : new Date().toISOString(),
      blocks: l.blocks,
    });
  }
  let favoriteEntryId = null;
  const fk = data.favoriteKey;
  if (typeof fk === "string") {
    if (fk.startsWith("builtin:")) {
      const pid = fk.slice("builtin:".length);
      if (BUILTIN_PRESETS[pid]) favoriteEntryId = `e-bi-${pid}`;
    } else if (fk.startsWith("custom:")) {
      const cid = fk.slice("custom:".length);
      if (customList.some((l) => l.id === cid)) favoriteEntryId = cid;
    }
  }
  return { version: 2, entries, favoriteEntryId };
}

function normalizeLayoutEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e.id !== "string" || !e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.kind === "builtin") {
      const presetId = typeof e.presetId === "string" ? e.presetId : "";
      if (!BUILTIN_PRESETS[presetId]) continue;
      out.push({ id: e.id, kind: "builtin", presetId });
    } else if (e.kind === "custom") {
      if (!Array.isArray(e.blocks)) continue;
      out.push({
        id: e.id,
        kind: "custom",
        name: typeof e.name === "string" ? e.name : "Untitled",
        savedAt: typeof e.savedAt === "string" ? e.savedAt : new Date().toISOString(),
        blocks: e.blocks,
      });
    }
  }
  return out;
}

function readLayoutListStore() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      return { entries: defaultBuiltinEntries(), favoriteEntryId: null };
    }
    const data = JSON.parse(raw);
    if (!data) {
      return { entries: defaultBuiltinEntries(), favoriteEntryId: null };
    }
    if (data.version === 1) {
      const migrated = migrateV1ToV2(data);
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(migrated));
      } catch (e) {
        console.warn("Could not persist migrated layout store", e);
      }
      return {
        entries: normalizeLayoutEntries(migrated.entries),
        favoriteEntryId: typeof migrated.favoriteEntryId === "string" ? migrated.favoriteEntryId : null,
      };
    }
    if (data.version === 2 && Array.isArray(data.entries)) {
      return {
        entries: normalizeLayoutEntries(data.entries),
        favoriteEntryId: typeof data.favoriteEntryId === "string" ? data.favoriteEntryId : null,
      };
    }
    return { entries: defaultBuiltinEntries(), favoriteEntryId: null };
  } catch {
    return { entries: defaultBuiltinEntries(), favoriteEntryId: null };
  }
}

function writeLayoutListStore(entries, favoriteEntryId) {
  const normalized = normalizeLayoutEntries(entries);
  const ids = new Set(normalized.map((e) => e.id));
  let fav = favoriteEntryId;
  if (fav && !ids.has(fav)) fav = null;
  try {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 2, entries: normalized, favoriteEntryId: fav }),
    );
  } catch (e) {
    console.warn("Could not save layouts to localStorage", e);
    showToast("Could not save — storage may be full or disabled.");
  }
}

function entryLabel(entry) {
  if (entry.kind === "builtin") {
    const def = BUILTIN_PRESETS[entry.presetId];
    return def ? def.label : entry.presetId;
  }
  return entry.name || "Untitled";
}

function applyEntry(entry, silent) {
  if (!entry) return false;
  if (entry.kind === "builtin") {
    if (!BUILTIN_PRESETS[entry.presetId]) return false;
    applyBuiltinPreset(entry.presetId, silent);
    return true;
  }
  if (entry.kind === "custom") {
    if (!Array.isArray(entry.blocks)) return false;
    if (!restorePipelineFromSnapshot(entry.blocks)) return false;
    if (!silent) showToast(`Loaded “${entry.name || "Saved layout"}”.`);
    return true;
  }
  return false;
}

function applyInitialPageLayout() {
  const { entries, favoriteEntryId } = readLayoutListStore();
  if (favoriteEntryId) {
    const fav = entries.find((e) => e.id === favoriteEntryId);
    if (fav && applyEntry(fav, true)) return;
  }
  if (entries.length) {
    if (applyEntry(entries[0], true)) return;
  }
  applyBuiltinPreset(DEFAULT_BUILTIN_PRESET_ID, true);
}

function renderExamplesSection() {
  const host = document.getElementById("examples-list");
  if (!host) return;
  host.innerHTML = "";
  const { entries, favoriteEntryId } = readLayoutListStore();

  if (!entries.length) {
    const wrap = document.createElement("div");
    wrap.className = "examples-empty-block";
    const p = document.createElement("p");
    p.className = "examples-empty";
    p.textContent = "No layouts in the list.";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "chip chip-restore";
    restore.textContent = "Restore default example layouts";
    restore.addEventListener("click", () => {
      writeLayoutListStore(defaultBuiltinEntries(), null);
      renderExamplesSection();
      showToast("Default example layouts restored.");
    });
    wrap.appendChild(p);
    wrap.appendChild(restore);
    host.appendChild(wrap);
    return;
  }

  for (const entry of entries) {
    const label = entryLabel(entry);
    const isFav = favoriteEntryId === entry.id;
    const row = document.createElement("div");
    row.className = "examples-item";
    row.setAttribute("role", "listitem");

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "chip examples-item-load";
    loadBtn.textContent = label;
    loadBtn.addEventListener("click", () => {
      if (!applyEntry(entry, false)) {
        showToast("That layout could not be loaded.");
        renderExamplesSection();
      }
    });

    row.appendChild(loadBtn);

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "examples-item-fav";
    favBtn.setAttribute("aria-label", isFav ? "Remove as startup layout" : "Set as startup layout");
    favBtn.title = isFav
      ? "Startup layout — loads when you open this page (click to clear)"
      : "Load this pipeline when you open the page";
    favBtn.textContent = "★";
    favBtn.classList.toggle("is-favorite", isFav);
    favBtn.addEventListener("click", () => {
      const cur = readLayoutListStore();
      const nextFav = cur.favoriteEntryId === entry.id ? null : entry.id;
      writeLayoutListStore(cur.entries, nextFav);
      renderExamplesSection();
      showToast(
        nextFav
          ? "Startup layout saved — this pipeline opens automatically next visit."
          : "Startup layout cleared — the first list item loads next time (or the text example if the list is empty).",
      );
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "examples-item-del";
    delBtn.setAttribute("aria-label", "Remove from list");
    delBtn.title = "Remove from list";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Remove “${label}” from the list?`)) return;
      const cur = readLayoutListStore();
      const nextFav = cur.favoriteEntryId === entry.id ? null : cur.favoriteEntryId;
      const nextEntries = cur.entries.filter((e) => e.id !== entry.id);
      writeLayoutListStore(nextEntries, nextFav);
      renderExamplesSection();
      showToast("Removed from list.");
    });

    row.appendChild(favBtn);
    row.appendChild(delBtn);
    host.appendChild(row);
  }
}

function saveCurrentPipelineToStore() {
  const namePrompt = () => {
    const d = new Date();
    const fallback = `Layout ${d.toLocaleString()}`;
    const entered = window.prompt("Name for this layout:", fallback);
    if (entered === null) return null;
    const t = entered.trim();
    return t || fallback;
  };
  const name = namePrompt();
  if (name === null) return;
  const cur = readLayoutListStore();
  const newEntry = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "custom",
    name,
    savedAt: new Date().toISOString(),
    blocks: serializePipelineSnapshot(state.blocks),
  };
  writeLayoutListStore([...cur.entries, newEntry], cur.favoriteEntryId);
  renderExamplesSection();
  showToast("Pipeline saved to this browser.");
}

/** @param {typeof state.blocks} blocks */
function serializePipelineSnapshot(blocks) {
  return blocks.map((b) => {
    const row = { role: b.role, typeId: b.typeId, values: { ...(b.values || {}) } };
    if (Array.isArray(b.formItems)) row.formItems = JSON.parse(JSON.stringify(b.formItems));
    if (b.dynamicUiCommitted != null) row.dynamicUiCommitted = String(b.dynamicUiCommitted);
    return row;
  });
}

function isValidRole(r) {
  return r === "input" || r === "process" || r === "output";
}

/** @param {ReturnType<typeof serializePipelineSnapshot>} rows */
function restorePipelineFromSnapshot(rows) {
  if (!Array.isArray(rows)) return false;
  for (const row of rows) {
    if (!row || !isValidRole(row.role) || typeof row.typeId !== "string" || !row.typeId.trim()) return false;
  }
  if (state.running) void stopRealtimeRun();
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  state.blocks = [];
  audioLivePttToggleState.clear();
  for (const row of rows) {
    const block = createBlock(row.role, row.typeId);
    if (row.values && typeof row.values === "object") {
      block.values = { ...block.values, ...row.values };
    }
    if (Array.isArray(row.formItems)) {
      block.formItems = JSON.parse(JSON.stringify(row.formItems));
    }
    if (row.dynamicUiCommitted != null) {
      block.dynamicUiCommitted = String(row.dynamicUiCommitted);
    }
    state.blocks.push(block);
  }
  renderAll();
  return true;
}

function applyBuiltinPreset(presetId, silent) {
  const p = BUILTIN_PRESETS[presetId];
  if (!p) return false;
  if (state.running) void stopRealtimeRun();
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  state.blocks = [];
  audioLivePttToggleState.clear();
  p.blocks.forEach((b) => {
    state.blocks.push(createBlock(b.role, b.typeId));
  });
  renderAll();
  if (!silent) {
    showToast("Example pipeline loaded — use Run (Node server + API key) for a live model.");
  }
  return true;
}

function stopBlockMedia(blockId) {
  const stream = blockMediaStreams.get(blockId);
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  blockMediaStreams.delete(blockId);
}

function stopBlockRecorder(blockId) {
  const entry = blockMediaRecorders.get(blockId);
  if (!entry) return;
  try {
    if (entry.recorder && entry.recorder.state !== "inactive") {
      entry.recorder.stop();
    }
  } catch (_) {
    /* ignore */
  }
  blockMediaRecorders.delete(blockId);
}

function stopBlockCapture(blockId) {
  stopBlockMedia(blockId);
  stopBlockRecorder(blockId);
}

function findBlock(role, typeId) {
  return state.blocks.find((b) => b.role === role && b.typeId === typeId);
}

function addBlock(role, typeId) {
  if (findBlock(role, typeId)) return;
  state.blocks.push(createBlock(role, typeId));
  renderAll();
}

function removeBlock(id) {
  stopBlockCapture(id);
  state.blocks = state.blocks.filter((b) => b.id !== id);
  renderAll();
}

function renderPalette() {
  fillPalette("palette-inputs", INPUT_TYPES, "input");
  fillPalette("palette-process", PROCESS_TYPES, "process");
  fillPalette("palette-output", OUTPUT_TYPES, "output");
  renderExamplesSection();
}

function fillPalette(containerId, types, role) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  types.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "part";
    btn.title = t.desc;
    btn.innerHTML = `<span class="pi" aria-hidden="true">${escapeHtml(t.code)}</span><span>${escapeHtml(t.title)}</span>`;
    const existing = findBlock(role, t.id);
    btn.classList.toggle("part-active", !!existing);
    btn.setAttribute("aria-pressed", existing ? "true" : "false");
    btn.addEventListener("click", () => {
      if (state.running) return;
      const hit = findBlock(role, t.id);
      if (hit) removeBlock(hit.id);
      else addBlock(role, t.id);
    });
    el.appendChild(btn);
  });
}

function renderMeta() {
  const inputs = state.blocks.filter((b) => b.role === "input").length;
  const proc = state.blocks.filter((b) => b.role === "process").length;
  const outs = state.blocks.filter((b) => b.role === "output").length;
  const meta = document.getElementById("workbench-meta");
  const n = state.blocks.length;
  let line =
    n === 0
      ? "Nothing in pipeline"
      : `${n} part${n === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output`;
  if (state.running && n > 0) {
    line += " · realtime run";
  }
  meta.textContent = line;

  const multi = document.getElementById("multi-input-hint");
  multi.classList.toggle("visible", inputs > 1);
}

function renderHintField(field, wrap) {
  const p = document.createElement("p");
  p.className = "field-hint";
  p.textContent = field.hint || "";
  wrap.appendChild(p);
}

function renderDropzoneField(field, block, disabled, wrap) {
  const values = block.values;
  const zone = document.createElement("div");
  zone.className = "dropzone" + (disabled ? " is-disabled" : "");
  zone.tabIndex = disabled ? -1 : 0;

  const labelRow = document.createElement("div");
  labelRow.className = "dropzone-label";
  labelRow.textContent = field.dropLabel || "Drop files or browse";
  zone.appendChild(labelRow);

  const sub = document.createElement("div");
  sub.className = "dropzone-sub";
  const name = values[field.key] || "";
  sub.textContent = name ? `Selected: ${name}` : "No file selected";
  zone.appendChild(sub);

  const inp = document.createElement("input");
  inp.type = "file";
  inp.className = "dropzone-input";
  if (field.accept) inp.accept = field.accept;
  inp.disabled = disabled;
  inp.addEventListener("change", () => {
    const f = inp.files && inp.files[0];
    values[field.key] = f ? f.name : "";
    sub.textContent = f ? `Selected: ${f.name}` : "No file selected";
    if (block.typeId === "audio-rec") {
      block._recordedAudioBlob = f || null;
    }
    if (block.typeId === "image") {
      block._inputImageBlob = f || null;
    }
  });

  /* File input already covers the zone (see `.dropzone-input { inset:0 }`); do not call `inp.click()` here or the picker opens twice. */

  function highlight(on) {
    zone.classList.toggle("is-dragover", on);
  }

  zone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    highlight(true);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    highlight(true);
  });
  zone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (!zone.contains(e.relatedTarget)) highlight(false);
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    highlight(false);
    if (disabled) return;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      values[field.key] = f.name;
      sub.textContent = `Selected: ${f.name}`;
      if (block.typeId === "audio-rec") {
        block._recordedAudioBlob = f;
      }
      if (block.typeId === "image") {
        block._inputImageBlob = f;
      }
    }
  });

  zone.appendChild(inp);
  wrap.appendChild(zone);
}

function renderSegmentedField(field, block, disabled, wrap) {
  const bar = document.createElement("div");
  bar.className = "field-segmented";
  bar.setAttribute("role", "tablist");
  (field.options || []).forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "segmented-opt" + (String(block.values[field.key]) === opt.value ? " is-active" : "");
    b.textContent = opt.label;
    b.disabled = disabled;
    b.addEventListener("click", (e) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      block.values[field.key] = opt.value;
      if (field.key === "imageSource" && block.typeId === "image" && opt.value === "url") {
        delete block._inputImageBlob;
      }
      renderAll();
    });
    bar.appendChild(b);
  });
  wrap.appendChild(bar);
}

async function fillMediaDeviceSelect(selectEl, kind) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const preserve = selectEl.value;
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind);
  } catch {
    return;
  }
  const def = document.createElement("option");
  def.value = "";
  def.textContent = kind === "audioinput" ? "Default microphone" : "Default camera";
  selectEl.innerHTML = "";
  selectEl.appendChild(def);
  devices.forEach((d) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || `${kind.replace("input", "")} (${d.deviceId.slice(0, 6)}…)`;
    selectEl.appendChild(o);
  });
  if (preserve && [...selectEl.options].some((o) => o.value === preserve)) {
    selectEl.value = preserve;
  }
}

function renderMediaDeviceField(field, block, disabled, wrap) {
  const row = document.createElement("div");
  row.className = "media-device-row";

  const sel = document.createElement("select");
  sel.disabled = disabled;
  const kind = field.kind === "videoinput" ? "videoinput" : "audioinput";

  sel.addEventListener("change", () => {
    block.values[field.key] = sel.value;
  });

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "media-device-refresh";
  refresh.textContent = "Refresh";
  refresh.disabled = disabled;
  refresh.addEventListener("click", async () => {
    await fillMediaDeviceSelect(sel, kind);
    showToast("Device list refreshed.");
  });

  row.appendChild(sel);
  row.appendChild(refresh);
  wrap.appendChild(row);

  fillMediaDeviceSelect(sel, kind).then(() => {
    const v = block.values[field.key] || "";
    if (v && [...sel.options].some((o) => o.value === v)) {
      sel.value = v;
    } else {
      block.values[field.key] = sel.value || "";
    }
  });
}

function renderAudioRecordField(field, block, disabled, wrap) {
  const row = document.createElement("div");
  row.className = "audio-recorder";

  const status = document.createElement("div");
  status.className = "audio-recorder-status";
  status.textContent = block.values[field.key] ? `Stored: ${block.values[field.key]}` : "No recording yet";

  const btnRow = document.createElement("div");
  btnRow.className = "audio-recorder-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "audio-recorder-btn";
  start.textContent = "Record";
  start.disabled = disabled;

  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "audio-recorder-btn audio-recorder-secondary";
  stop.textContent = "Stop";
  stop.disabled = true;

  const play = document.createElement("button");
  play.type = "button";
  play.className = "audio-recorder-btn audio-recorder-secondary";
  play.textContent = "Play";
  play.title = "Preview the clip stored for this run (same bytes as sent to Realtime)";
  play.disabled = disabled || !block._recordedAudioBlob || !!blockMediaRecorders.get(block.id);

  const audioPreview = document.createElement("audio");
  audioPreview.setAttribute("playsinline", "");
  audioPreview.preload = "none";
  audioPreview.className = "audio-recorder-preview-audio";
  let previewObjectUrl = null;

  audioPreview.addEventListener("ended", () => {
    revokePreviewUrl();
    audioPreview.removeAttribute("src");
  });
  audioPreview.addEventListener("error", () => {
    showToast("Audio preview failed to load in the browser.");
    revokePreviewUrl();
  });

  function revokePreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function syncPlayEnabled() {
    play.disabled =
      disabled || !block._recordedAudioBlob || !!blockMediaRecorders.get(block.id);
  }

  play.addEventListener("click", async () => {
    if (play.disabled || !block._recordedAudioBlob) return;
    try {
      revokePreviewUrl();
      audioPreview.pause();
      previewObjectUrl = URL.createObjectURL(block._recordedAudioBlob);
      audioPreview.src = previewObjectUrl;
      await audioPreview.play();
    } catch {
      showToast("Playback failed — this browser may not decode the clip format.");
    }
  });

  btnRow.appendChild(start);
  btnRow.appendChild(stop);
  btnRow.appendChild(play);
  row.appendChild(btnRow);
  row.appendChild(audioPreview);
  row.appendChild(status);

  start.addEventListener("click", async () => {
    if (disabled) return;
    stopBlockRecorder(block.id);
    revokePreviewUrl();
    audioPreview.removeAttribute("src");
    block.values[field.key] = "";
    block._recordedAudioBlob = null;
    syncPlayEnabled();
    status.textContent = "Requesting microphone…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      rec.addEventListener("dataavailable", (e) => {
        if (e.data.size) chunks.push(e.data);
      });
      rec.addEventListener("stop", () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunks.length) {
          const ext = mime && mime.includes("webm") ? "webm" : "m4a";
          const name = `recording-${Date.now()}.${ext}`;
          block.values[field.key] = name;
          block._recordedAudioBlob = new Blob(chunks, { type: mime || "audio/webm" });
          status.textContent = `Recorded: ${name} (attached on Run)`;
        } else {
          status.textContent = "Recording empty — try again.";
          block._recordedAudioBlob = null;
        }
        blockMediaRecorders.delete(block.id);
        start.disabled = disabled;
        stop.disabled = true;
        syncPlayEnabled();
      });
      rec.start(200);
      blockMediaRecorders.set(block.id, { recorder: rec, chunks, statusEl: status });
      start.disabled = true;
      stop.disabled = false;
      play.disabled = true;
    } catch {
      status.textContent = "Microphone not available or denied.";
      syncPlayEnabled();
    }
  });

  stop.addEventListener("click", () => {
    const entry = blockMediaRecorders.get(block.id);
    if (entry && entry.recorder && entry.recorder.state !== "inactive") {
      try {
        entry.recorder.stop();
      } catch (_) {
        /* ignore */
      }
    }
  });

  wrap.appendChild(row);
}

function renderCameraPreviewField(field, block, disabled, wrap) {
  const mode = field.mode === "video" ? "video" : "image";

  const row = document.createElement("div");
  row.className = "camera-preview";

  const video = document.createElement("video");
  video.className = "camera-preview-video";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  row.appendChild(video);

  const img = document.createElement("img");
  img.className = "camera-preview-snap";
  img.alt = "Captured frame preview";
  img.hidden = true;
  row.appendChild(img);

  const btnRow = document.createElement("div");
  btnRow.className = "camera-preview-actions";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "camera-preview-btn";
  start.textContent = mode === "video" ? "Open camera" : "Open camera";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "camera-preview-btn camera-preview-secondary";
  stop.textContent = "Stop";
  stop.disabled = true;
  const snap =
    mode === "image"
      ? (() => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "camera-preview-btn";
          b.textContent = "Capture still";
          b.disabled = true;
          return b;
        })()
      : null;

  btnRow.appendChild(start);
  if (snap) btnRow.appendChild(snap);
  btnRow.appendChild(stop);
  row.appendChild(btnRow);

  const note = document.createElement("p");
  note.className = "field-hint";
  note.textContent =
    mode === "video"
      ? "Preview only — no frames are uploaded from this mock-up."
      : "Capture stores a local preview only; a backend would sample frames for `image_url`.";
  row.appendChild(note);

  start.addEventListener("click", async () => {
    if (disabled) return;
    stopBlockMedia(block.id);
    img.hidden = true;
    try {
      const vdev = mode === "video" ? block.values.cameraDevice : "";
      const videoConstraint =
        mode === "video" && vdev ? { deviceId: { exact: vdev } } : { facingMode: "user" };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });
      blockMediaStreams.set(block.id, stream);
      video.srcObject = stream;
      await video.play();
      start.disabled = true;
      stop.disabled = false;
      if (snap) snap.disabled = false;
    } catch {
      note.textContent = "Camera permission denied or unavailable in this context.";
    }
  });

  stop.addEventListener("click", () => {
    stopBlockMedia(block.id);
    video.srcObject = null;
    start.disabled = disabled;
    stop.disabled = true;
    if (snap) snap.disabled = true;
  });

  if (snap) {
    snap.addEventListener("click", () => {
      if (!video.videoWidth) return;
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0);
      try {
        img.src = c.toDataURL("image/jpeg", 0.85);
        img.hidden = false;
      } catch {
        note.textContent = "Could not snapshot (canvas tainted or unsupported).";
      }
    });
  }

  wrap.appendChild(row);
}

/** @typedef {{ label: string, body: string, empty?: boolean }} ChatTurnPreview */

/** @typedef {{ systemParts: { label: string, body: string }[], userTurns: ChatTurnPreview[] }} ConversationSnapshot */

/**
 * Builds a lightweight view of upstream inputs & instructions for the text output card.
 * @returns {ConversationSnapshot}
 */
function gatherConversationSnapshotForTextOutput() {
  const blocks = state.blocks;

  /** @type {{ label: string, body: string }[]} */
  const systemParts = [];
  const inst = blocks.find((b) => b.role === "process" && b.typeId === "instruction");
  const sk = FORM_SCHEMA["process:skills"];

  if (inst) {
    const sysTxt = String(inst.values.system || "").trim();
    if (sysTxt) {
      systemParts.push({ label: "System", body: sysTxt });
    }
    const mi = String(inst.values.maxIterations || "").trim();
    const sw = String(inst.values.stopWhen || "").trim();
    if (mi || sw) {
      const parts = [];
      if (mi) parts.push(`Max iterations: ${mi}`);
      if (sw) parts.push(`Stop when: ${sw}`);
      systemParts.push({ label: "Run orchestration", body: parts.join("\n") });
    }
  }

  const skillBlock = blocks.find((b) => b.role === "process" && b.typeId === "skills");
  if (skillBlock && sk && String(skillBlock.values.skillPreset || "none") !== "none") {
    const fld = sk.fields.find((f) => f.key === "skillPreset");
    const pick = fld && fld.options && fld.options.find((o) => o.value === skillBlock.values.skillPreset);
    const labelTxt = pick ? pick.label : String(skillBlock.values.skillPreset || "");
    systemParts.push({
      label: "Skill pack",
      body: `${labelTxt} — curated by the platform (server-side).`,
    });
  }

  const know = blocks.find((b) => b.role === "process" && b.typeId === "vector-db");
  const doc = know && String(know.values.knowledgeFiles || "").trim();
  if (doc) {
    systemParts.push({ label: "Knowledge files", body: doc });
  }

  const toolBlock = blocks.find((b) => b.role === "process" && b.typeId === "tooling");
  const toolingSchema = FORM_SCHEMA["process:tooling"];
  if (toolBlock && toolingSchema) {
    const optLabel = (fieldKey, value) => {
      const fld = toolingSchema.fields.find((f) => f.key === fieldKey);
      const o = fld && fld.options && fld.options.find((x) => x.value === value);
      return o ? o.label : String(value || "");
    };
    const op = optLabel("accessMode", toolBlock.values.accessMode || "read");
    const dom = optLabel("serviceDomain", toolBlock.values.serviceDomain || "");
    systemParts.push({
      label: "Tooling",
      body: `${op} · ${dom}`,
    });
  }

  /** @type {ChatTurnPreview[]} */
  const userTurns = [];
  blocks
    .filter((b) => b.role === "input")
    .forEach((b) => {
      const idef = findDef("input", b.typeId);
      const partTitle = idef ? idef.title : b.typeId;
      let body = "";
      if (b.typeId === "text") {
        body = String(b.values.content || "").trim();
        userTurns.push({
          label: `Participant · ${partTitle}`,
          body: body || "(empty)",
          empty: !body,
        });
      } else if (b.typeId === "form") {
        const items = Array.isArray(b.formItems) ? b.formItems : [];
        const lines = items.map((it, i) => {
          const optEx = needsFormExtraOptions(it.typ) ? ` (${parseFormOptions(it.options).join("; ")})` : "";
          return `${i + 1}. [${it.typ}] ${it.label}${optEx}`;
        });
        body = lines.length ? lines.join("\n") : "(no fields defined)";
        userTurns.push({
          label: `Form blueprint · ${partTitle}`,
          body,
          empty: !lines.length,
        });
      } else if (b.typeId === "dynamic-ui") {
        const draft = String(b.values.uiPrompt || "").trim();
        const staged = String(b.dynamicUiCommitted || "").trim();
        body =
          draft || staged
            ? `${draft ? `Draft: ${draft}\n` : ""}${staged ? `Preview commits to: ${staged}` : ""}`.trim()
            : "(prompt empty)";
        userTurns.push({
          label: `UI brief · ${partTitle}`,
          body,
          empty: !(draft || staged),
        });
      } else if (b.typeId === "image") {
        const src = String(b.values.imageSource ?? "file");
        const url = String(b.values.imageUrl || "").trim();
        const stub = String(b.values.uploadStub || "").trim();
        const blob = b._inputImageBlob;
        if (src === "url") {
          body = url
            ? url.startsWith("https://")
              ? `Image URL (HTTPS): ${url}`
              : `Non-HTTPS URL (not sent to the model): ${url}`
            : "(empty URL)";
        } else {
          const ready = blob instanceof Blob && blob.size > 0;
          const scale512 = imageInputScaleTo512Enabled(b);
          body = ready
            ? `${stub || "image"} — ${blob.size} bytes${scale512 ? ", wird auf 512 px für Realtime skaliert" : ", wird für Realtime komprimiert"}`
            : stub
              ? `${stub} — pick the file again before Run if vision is missing`
              : "(no file selected)";
        }
        userTurns.push({
          label: `Input · ${partTitle}`,
          body,
          empty: src === "url" ? !url.startsWith("https://") : !(blob instanceof Blob && blob.size > 0),
        });
      } else {
        const url = b.values.imageUrl && String(b.values.imageUrl).trim();
        const up =
          (b.values.uploadStub && String(b.values.uploadStub)) ||
          (b.values.recordingStub && String(b.values.recordingStub)) ||
          (b.values.knowledgeFiles && String(b.values.knowledgeFiles));
        body = url || up || "(no file or URL)";
        userTurns.push({
          label: `Input · ${partTitle}`,
          body,
          empty: !(url || up),
        });
      }
    });

  return { systemParts, userTurns };
}

/**
 * @param {string} raw
 * @returns {{ label: string, body: string }[]}
 */
function parseRunPreviewSegments(raw) {
  const t = String(raw || "").trim();
  if (!t) return [];
  const out = [];
  const re = /(?:^|\n)── ([^─\n]+) ──\n([\s\S]*?)(?=\n── |$)/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const body = m[2].trim();
    if (body) out.push({ label: m[1].trim(), body });
  }
  return out;
}

/**
 * @param {string} label
 * @returns {"user" | "assistant"}
 */
function mapTranscriptLabelToBubbleRole(label) {
  const s = String(label || "").trim();
  if (s === "You (voice)") return "user";
  return "assistant";
}

/**
 * Ordered transcript lines for the text-output card (mirrors `runPreview` string format).
 * @param {{ _transcriptLog?: { key: string, role: string, label: string, body: string }[] }} block
 */
function ensureTranscriptLog(block) {
  if (!Array.isArray(block._transcriptLog)) block._transcriptLog = [];
  return block._transcriptLog;
}

/**
 * @param {{ runPreview?: string, _transcriptLog?: { key: string, role: string, label: string, body: string }[] }} block
 */
function rebuildRunPreviewFromLog(block) {
  const log = ensureTranscriptLog(block);
  if (!log.length) {
    block.runPreview = "";
    return;
  }
  block.runPreview = log
    .map((e) => `\n── ${e.label} ──\n${e.body}\n`)
    .join("")
    .replace(/^\n+/, "")
    .trimEnd();
}

/**
 * Tool and other system events in the text-output transcript (visible when “Show system messages” is on).
 * @param {string} label
 * @param {string} body
 * @param {string} dedupeKey
 */
function appendSystemTranscriptToTextOutputs(label, body, dedupeKey) {
  const text = String(body || "").trim();
  if (!text) return;
  const textTargets = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  if (!textTargets.length) return;
  const entry = { key: dedupeKey, role: /** @type {const} */ ("system"), label, body: text };
  for (const b of textTargets) {
    const log = ensureTranscriptLog(b);
    if (log.some((e) => e.key === dedupeKey)) continue;
    log.push({ ...entry });
    rebuildRunPreviewFromLog(b);
  }
  syncOutputTextChatFromState();
}

/** Seed visible user-side pipeline inputs once per run so the log matches the server bootstrap. */
function seedTextOutputTranscriptLogsFromPipeline() {
  const inputs = state.blocks.filter((b) => b.role === "input");
  const snap = gatherConversationSnapshotForTextOutput();
  const textOuts = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  if (!textOuts.length) return;

  /** @type {{ key: string, role: "user", label: string, body: string }[]} */
  const entries = [];
  for (let i = 0; i < snap.userTurns.length; i++) {
    const inp = inputs[i];
    if (!inp || inp.typeId === "audio-live") continue;
    const u = snap.userTurns[i];
    entries.push({
      key: `pipeline-seed:${inp.id}`,
      role: "user",
      label: u.label,
      body: u.body || "(empty)",
    });
  }

  for (const b of textOuts) {
    b._transcriptLog = entries.map((e) => ({ ...e }));
    rebuildRunPreviewFromLog(b);
  }
}

/**
 * @param {ConversationSnapshot} snap
 * @param {{ runPreview?: string, _transcriptLog?: { key: string, role: string, label: string, body: string }[], _textOutputShowSystem?: boolean }} block
 * @returns {{ role: "system" | "user" | "assistant", meta: string, body: string }[]}
 */
function transcriptRowsForTextOutputBlock(block, snap, showSystem) {
  /** @type {{ role: "system" | "user" | "assistant", meta: string, body: string }[]} */
  const rows = [];

  if (showSystem && snap.systemParts.length) {
    for (const p of snap.systemParts) {
      rows.push({ role: "system", meta: p.label, body: p.body });
    }
  }

  const log = Array.isArray(block._transcriptLog) ? block._transcriptLog : [];
  if (log.length > 0) {
    for (const e of log) {
      if (e.role === "system" && !showSystem) continue;
      const role = e.role === "user" ? "user" : e.role === "system" ? "system" : "assistant";
      rows.push({ role, meta: e.label, body: e.body });
    }
    return rows;
  }

  const rp = String(block.runPreview || "").trim();
  if (rp) {
    for (const seg of parseRunPreviewSegments(block.runPreview || "")) {
      rows.push({
        role: mapTranscriptLabelToBubbleRole(seg.label),
        meta: seg.label,
        body: seg.body,
      });
    }
    return rows;
  }

  return rows;
}

/**
 * @param {HTMLElement} el
 * @param {{ id: string, runPreview?: string, _textOutputShowSystem?: boolean, _transcriptLog?: { key: string, role: string, label: string, body: string }[] }} block
 */
function fillTextOutputChatStream(el, block) {
  el.innerHTML = "";
  const showSystem = !!block._textOutputShowSystem;
  const snap = gatherConversationSnapshotForTextOutput();
  const rows = transcriptRowsForTextOutputBlock(block, snap, showSystem);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "output-text-chat-empty";
    empty.textContent =
      state.running && state.runMode === "realtime" ? "Waiting for messages…" : "No messages yet.";
    el.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const wrap = document.createElement("div");
    wrap.className = `output-text-msg output-text-msg--${row.role}`;
    const meta = document.createElement("div");
    meta.className = "output-text-msg-meta";
    meta.textContent = row.meta;
    wrap.appendChild(meta);
    const bubble = document.createElement("div");
    bubble.className = "output-text-msg-bubble";
    bubble.textContent = row.body;
    wrap.appendChild(bubble);
    el.appendChild(wrap);
  }

  el.scrollTop = el.scrollHeight;
}

function renderOutputTextConversationPreview(block, card) {
  if (block._textOutputShowSystem === undefined) block._textOutputShowSystem = false;

  const root = document.createElement("div");
  root.className = "output-text-chat";

  const toolbar = document.createElement("div");
  toolbar.className = "output-text-chat-toolbar";

  const toggleLab = document.createElement("label");
  toggleLab.className = "output-text-chat-toggle";

  const toggleInp = document.createElement("input");
  toggleInp.type = "checkbox";
  toggleInp.checked = !!block._textOutputShowSystem;
  toggleInp.addEventListener("change", () => {
    block._textOutputShowSystem = toggleInp.checked;
    renderAll();
  });

  const toggleTxt = document.createElement("span");
  toggleTxt.textContent = "Show system messages";

  toggleLab.appendChild(toggleInp);
  toggleLab.appendChild(toggleTxt);
  toolbar.appendChild(toggleLab);
  root.appendChild(toolbar);

  const stream = document.createElement("div");
  stream.className = "output-text-chat-stream";
  stream.setAttribute("data-text-output-chat", block.id);
  fillTextOutputChatStream(stream, block);
  root.appendChild(stream);

  card.appendChild(root);
}

function renderOutputTextModule(block, card, schema) {
  renderOutputTextConversationPreview(block, card);
  if (!schema.fields.length) return;

  const form = document.createElement("div");
  form.className = "module-card-fields output-text-settings";

  const locked = state.running;
  schema.fields.forEach((field, fidx) => {
    if (field.type === "hint") {
      const wrap = document.createElement("div");
      wrap.className = "field field-compact";
      renderHintField(field, wrap);
      form.appendChild(wrap);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "field field-compact";
    const fid = `f-${block.id}-n${fidx}`;
    let val = block.values[field.key];
    if (val === undefined || val === null) val = "";

    if (field.label) {
      const lab = document.createElement("label");
      lab.htmlFor = fid;
      lab.textContent = field.label;
      wrap.appendChild(lab);
    }

    if (field.type === "select" && field.options) {
      const sel = document.createElement("select");
      sel.id = fid;
      sel.disabled = locked;
      field.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      const strVal = String(val);
      if (field.options.some((o) => o.value === strVal)) sel.value = strVal;
      else {
        sel.selectedIndex = 0;
        block.values[field.key] = sel.value;
      }
      sel.addEventListener("change", () => {
        block.values[field.key] = sel.value;
      });
      wrap.appendChild(sel);
    } else if (field.type === "number") {
      const inp = document.createElement("input");
      inp.id = fid;
      inp.type = "number";
      inp.disabled = locked;
      if (field.placeholder) inp.placeholder = field.placeholder;
      inp.value = String(val);
      inp.addEventListener("input", () => {
        block.values[field.key] = inp.value;
      });
      wrap.appendChild(inp);
    }
    form.appendChild(wrap);
  });

  card.appendChild(form);
}

function stopImageGenerationProgressUi() {
  if (imageGenProgressTimer != null) {
    clearInterval(imageGenProgressTimer);
    imageGenProgressTimer = null;
  }
  imageGenProgressStartedAt = 0;
  for (const b of state.blocks) {
    if (b.role === "output" && b.typeId === "image") {
      delete b._runImageGenerating;
    }
  }
}

function syncImageGenerationProgressFill() {
  if (!imageGenProgressStartedAt) return;
  const elapsed = Date.now() - imageGenProgressStartedAt;
  const pct = Math.min(100, (elapsed / IMAGE_GEN_PROGRESS_TARGET_MS) * 100);
  for (const el of document.querySelectorAll(".output-image-progress-fill")) {
    el.style.width = `${pct}%`;
    const track = el.parentElement;
    if (track && track.classList.contains("output-image-progress-track")) {
      track.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
  }
  if (pct >= 100 && imageGenProgressTimer != null) {
    clearInterval(imageGenProgressTimer);
    imageGenProgressTimer = null;
  }
}

function startImageGenerationProgressUi() {
  stopImageGenerationProgressUi();
  imageGenProgressStartedAt = Date.now();
  for (const b of state.blocks) {
    if (b.role === "output" && b.typeId === "image") {
      b._runImageGenerating = true;
    }
  }
  renderAll();
  imageGenProgressTimer = setInterval(syncImageGenerationProgressFill, 200);
  syncImageGenerationProgressFill();
}

/**
 * @param {HTMLElement} parent
 */
function appendImageGenerationProgress(parent) {
  const prog = document.createElement("div");
  prog.className = "output-image-progress";
  const progLabel = document.createElement("div");
  progLabel.className = "output-image-progress-label";
  progLabel.textContent = "Generating image…";
  const track = document.createElement("div");
  track.className = "output-image-progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", "0");
  track.setAttribute("aria-label", "Image generation progress");
  const fill = document.createElement("div");
  fill.className = "output-image-progress-fill";
  track.appendChild(fill);
  prog.appendChild(progLabel);
  prog.appendChild(track);
  const hint = document.createElement("div");
  hint.className = "output-image-progress-hint";
  hint.textContent = "Bar reaches 100% at ~70s (estimate).";
  prog.appendChild(hint);
  parent.appendChild(prog);
}

function appendImageOutputPlaceholder(block, card) {
  const stage = document.createElement("div");
  stage.className = "output-image-stage";

  const dataUrl = block._runImageDataUrl && String(block._runImageDataUrl).trim();
  const generating = !!block._runImageGenerating;

  if (generating) {
    appendImageGenerationProgress(stage);
  }

  if (dataUrl) {
    const wrap = document.createElement("div");
    wrap.className = "output-image-result-wrap" + (generating ? " is-regenerating" : "");
    const img = document.createElement("img");
    img.className = "output-image-result";
    img.alt = "Generated image";
    img.src = dataUrl;
    wrap.appendChild(img);
    if (!generating) {
      const cap = document.createElement("div");
      cap.className = "output-image-result-caption";
      cap.textContent = "Generated in this session (workshop_generate_image)";
      wrap.appendChild(cap);
    }
    stage.appendChild(wrap);
  }

  if (!dataUrl && !generating) {
    const ph = document.createElement("div");
    ph.className = "output-image-placeholder";

    const size = String(block.values.size || "1024x1024").trim();
    const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size);
    const maxPx = 200;
    if (m) {
      const iw = Number(m[1]);
      const ih = Number(m[2]);
      const scale = Math.min(maxPx / iw, maxPx / ih, 1);
      ph.style.width = `${Math.round(iw * scale)}px`;
      ph.style.height = `${Math.round(ih * scale)}px`;
    } else {
      ph.style.width = `${maxPx}px`;
      ph.style.minHeight = "160px";
    }

    const cap = document.createElement("span");
    cap.className = "output-image-placeholder-cap";
    cap.textContent = "Generated image";
    ph.appendChild(cap);

    const sub = document.createElement("span");
    sub.className = "output-image-placeholder-sub";
    sub.textContent = `${size} · ask the model to generate (Realtime tool)`;

    stage.appendChild(ph);
    stage.appendChild(sub);
  }

  card.appendChild(stage);
}

const FORM_BUILDER_FIELD_TYPES = [
  { value: "text", label: "Einzeiliges Textfeld" },
  { value: "textarea", label: "Mehrzeiliges Textfeld" },
  { value: "number", label: "Zahl" },
  { value: "email", label: "E-Mail" },
  { value: "select", label: "Auswahlliste" },
  { value: "radio", label: "Radio-Gruppe" },
  { value: "checkbox", label: "Checkbox" },
  { value: "button", label: "Schaltfläche" },
  { value: "submit", label: "Submit · Absenden" },
  { value: "reset", label: "Zurücksetzen" },
];

function needsFormExtraOptions(typ) {
  return typ === "radio" || typ === "select";
}

/**
 * Demo values for Output form previews (read-only).
 */
function mockFilledControlState(item, index) {
  const L = item.label || "";
  const l = L.toLowerCase();
  const typ = item.typ;
  if (typ === "checkbox") {
    if (/datenschutz|privacy|nutzungsbedingungen|akzeptieren/i.test(l)) return true;
    return index % 2 === 0;
  }
  if (/vorname|^name\b/i.test(l)) return "Lee Beispiel";
  if (/nachname/i.test(l)) return "Demonstrant";
  if (/e-?mail/i.test(l)) return "lee@beispiel.de";
  if (/telefon|phone|mobil/i.test(l)) return "+49 30 91234567";
  if (typ === "number") return String(27 + index * 11);
  if (/stadt|city|ort/i.test(l)) return "Hamburg";
  if (/plz|postleitzahl/i.test(l)) return "20095";
  if (typ === "textarea") return `Automatischer Fließtext für „${L || "Freitext"}“.`;
  return `Auto (${L || typ})`;
}

function parseFormOptions(optionsStr) {
  return String(optionsStr || "")
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Stub UI from keywords in `committedPrompt`.
 */
function renderDynamicUiPreview(host, committedPrompt, interactive, role) {
  host.innerHTML = "";
  host.className = "dynamic-ui-stage";

  const p = (committedPrompt || "").trim();
  if (!p) {
    const empty = document.createElement("div");
    empty.className = "dynamic-ui-placeholder";
    empty.textContent = "Noch keine Vorschau — Prompt eingeben und „Erzeugen / neu erzeugen“ wählen.";
    host.appendChild(empty);
    return;
  }

  const low = p.toLowerCase();
  let mode = "generic";
  if (/balken|bar chart|balkendiagramm|column chart/i.test(low)) mode = "bars";
  else if (/slider|schieberegler|\bregler\b/i.test(low)) mode = "sliders";
  else if (/matrix|gitter|raster|checkbox/i.test(low)) mode = "matrix";
  else if (/zeitachse|line chart|liniendiagramm|verlauf/i.test(low)) mode = "line";

  const cap = document.createElement("div");
  cap.className = "dynamic-ui-cap";
  cap.textContent = `Mock (${mode}) — ${interactive && role === "input" ? "interaktiv" : "Demonstration"}`;
  host.appendChild(cap);

  const body = document.createElement("div");
  body.className = "dynamic-ui-body";

  if (mode === "bars") {
    const bars = document.createElement("div");
    bars.className = "dyn-mock-chart dyn-mock-chart-bars";
    [68, 45, 92, 55].forEach((h, i) => {
      const col = document.createElement("div");
      col.className = "dyn-bar-col";
      const fill = document.createElement("div");
      fill.className = "dyn-bar-fill";
      fill.style.height = `${h}%`;
      fill.title = `Q${i + 1}`;
      const lab = document.createElement("span");
      lab.className = "dyn-bar-lab";
      lab.textContent = `Q${i + 1}`;
      col.appendChild(fill);
      col.appendChild(lab);
      bars.appendChild(col);
    });
    body.appendChild(bars);
  } else if (mode === "sliders") {
    const sliders = [
      ["Parameter A", "40"],
      ["Parameter B", "70"],
      ["Parameter C", "55"],
    ];
    sliders.forEach(([lbl]) => {
      const row = document.createElement("div");
      row.className = "dyn-slide-row";
      const lab = document.createElement("label");
      lab.className = "dyn-slide-label";
      lab.textContent = lbl;
      const rng = document.createElement("input");
      rng.type = "range";
      rng.min = "0";
      rng.max = "100";
      rng.value = "44";
      rng.disabled = !(interactive && role === "input");
      rng.className = "dyn-slide-input";
      const out = document.createElement("span");
      out.className = "dyn-slide-val";
      out.textContent = rng.value + "%";
      if (!rng.disabled) {
        rng.addEventListener("input", () => {
          out.textContent = rng.value + "%";
        });
      }
      row.appendChild(lab);
      row.appendChild(rng);
      row.appendChild(out);
      body.appendChild(row);
    });
  } else if (mode === "matrix") {
    const table = document.createElement("table");
    table.className = "dyn-mock-matrix";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["", "Kol. A", "Kol. B", "Kol. C"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tb = document.createElement("tbody");
    ["Zeile 1", "Zeile 2", "Zeile 3"].forEach((rw) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = rw;
      tr.appendChild(th);
      for (let c = 0; c < 3; c += 1) {
        const td = document.createElement("td");
        const cx = document.createElement("input");
        cx.type = "checkbox";
        cx.disabled = !interactive || role !== "input";
        cx.checked = !!(c + rw.length) % 2;
        td.appendChild(cx);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.appendChild(table);
  } else if (mode === "line") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 280 120");
    svg.className = "dyn-mock-line-svg";
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "#1a4f8a");
    poly.setAttribute("stroke-width", "3");
    poly.setAttribute("points", "10,90 70,55 140,72 210,38 268,62");
    svg.appendChild(poly);
    body.appendChild(svg);
  } else {
    const generic = document.createElement("div");
    generic.className = "dyn-mock-generic";
    const title = document.createElement("p");
    title.className = "dyn-mock-generic-title";
    title.textContent = "Freies UI‑Stub";
    const blk = document.createElement("p");
    blk.className = "dyn-mock-generic-body";
    const clipped = p.length > 260 ? `${p.slice(0, 260)}…` : p;
    blk.innerHTML =
      `Keine speziellen Schlüsselwörter erkannt — später wandelt euer Modell das Prompt in echte Oberfläche um.<br/>` +
      `<q>${escapeHtml(clipped)}</q>`;
    generic.appendChild(title);
    generic.appendChild(blk);
    body.appendChild(generic);
  }

  host.appendChild(body);
}

function appendFormLiveControl(host, item, index, locked, readonlyMock) {
  const rowWrap = document.createElement("div");
  rowWrap.className = "composer-form-field";

  const typ = item.typ;
  const fid = `${item.id || "fld"}-${index}`;

  if (typ === "button" || typ === "submit" || typ === "reset") {
    const b = document.createElement("button");
    b.type = typ === "submit" ? "submit" : typ === "reset" ? "reset" : "button";
    b.className =
      typ === "submit" ? "composer-form-el composer-form-submit" : "composer-form-el composer-form-btn";
    b.textContent = item.label || (typ === "submit" ? "Absenden" : typ === "reset" ? "Zurücksetzen" : "Aktion");
    b.disabled = locked;
    rowWrap.appendChild(b);
    host.appendChild(rowWrap);
    return;
  }

  const lab = document.createElement("label");
  lab.className = "composer-form-field-label";
  lab.htmlFor = fid;
  lab.textContent = item.label;

  if (typ === "textarea") {
    const ta = document.createElement("textarea");
    ta.id = fid;
    ta.className = "composer-form-el";
    ta.rows = 3;
    ta.disabled = locked;
    if (readonlyMock) {
      ta.value = String(mockFilledControlState(item, index));
      ta.readOnly = true;
    } else {
      ta.placeholder = "(Eingabe)";
      ta.value = "";
    }
    rowWrap.appendChild(lab);
    rowWrap.appendChild(ta);
    host.appendChild(rowWrap);
    return;
  }

  if (typ === "radio") {
    const opts = parseFormOptions(item.options);
    const lg = document.createElement("fieldset");
    lg.className = "composer-form-fs";
    const cap = document.createElement("legend");
    cap.textContent = item.label;
    lg.appendChild(cap);
    const mockPick = opts.length ? opts[Math.min(Math.max(index, 0), opts.length - 1)] : "";
    opts.forEach((opt) => {
      const rw = document.createElement("label");
      rw.className = "composer-form-radio-line";
      const rd = document.createElement("input");
      rd.type = "radio";
      rd.name = `rg-${item.id}-${index}`;
      rd.value = opt;
      rd.disabled = locked || readonlyMock;
      if (readonlyMock) rd.checked = opt === mockPick;
      rw.appendChild(rd);
      rw.appendChild(document.createTextNode(" " + opt));
      lg.appendChild(rw);
    });
    rowWrap.appendChild(lg);
    host.appendChild(rowWrap);
    return;
  }

  if (typ === "select") {
    const opts = parseFormOptions(item.options);
    rowWrap.className += " composer-form-field-stack";
    const sel = document.createElement("select");
    sel.id = fid;
    sel.className = "composer-form-el";
    sel.disabled = locked || readonlyMock;
    opts.forEach((o) => {
      const op = document.createElement("option");
      op.value = o;
      op.textContent = o;
      sel.appendChild(op);
    });
    if (opts.length) {
      sel.selectedIndex = readonlyMock ? Math.min(1, opts.length - 1) : 0;
    }
    rowWrap.appendChild(lab);
    rowWrap.appendChild(sel);
    host.appendChild(rowWrap);
    return;
  }

  if (typ === "checkbox") {
    const row = document.createElement("label");
    row.className = "composer-form-check-line";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = fid;
    cb.disabled = locked || readonlyMock;
    if (readonlyMock) cb.checked = !!mockFilledControlState(item, index);
    row.appendChild(cb);
    row.appendChild(document.createTextNode(" " + item.label));
    host.appendChild(row);
    return;
  }

  const inp = document.createElement("input");
  inp.className = "composer-form-el";
  inp.id = fid;
  inp.disabled = locked;
  if (typ === "number") inp.type = "number";
  else if (typ === "email") inp.type = "email";
  else inp.type = "text";

  if (readonlyMock) {
    inp.value = String(mockFilledControlState(item, index));
    inp.readOnly = true;
  } else {
    inp.placeholder = "…";
  }

  rowWrap.appendChild(lab);
  rowWrap.appendChild(inp);
  host.appendChild(rowWrap);
}

function renderFormComposerModule(block, card) {
  if (!Array.isArray(block.formItems)) block.formItems = [];

  const locked = state.running;
  const isOutput = block.role === "output";

  const body = document.createElement("div");
  body.className = "composer-form-module";

  const hint = document.createElement("p");
  hint.className = "composer-form-lede field-hint";
  hint.textContent = isOutput
    ? "Identisch zum Input-Form — hier mit demonstrierter Modellbefüllung."
    : "Felder zusammenbauen; unten zeigt sich die spätere Participant-Oberfläche.";

  const toolbar = document.createElement("div");
  toolbar.className = "composer-form-toolbar";

  const typeSel = document.createElement("select");
  typeSel.className = "composer-form-toolbar-type";
  typeSel.disabled = locked;
  FORM_BUILDER_FIELD_TYPES.forEach((o) => {
    const op = document.createElement("option");
    op.value = o.value;
    op.textContent = o.label;
    typeSel.appendChild(op);
  });

  const lblIn = document.createElement("input");
  lblIn.type = "text";
  lblIn.className = "composer-form-toolbar-label";
  lblIn.placeholder = "Label (z. B. Name, Datenschutz, Anrede…)";
  lblIn.disabled = locked;

  const optIn = document.createElement("input");
  optIn.type = "text";
  optIn.className = "composer-form-toolbar-options";
  optIn.placeholder = "Optionen (Radio/Liste): Herr, Frau, Divers …";
  optIn.disabled = locked;
  optIn.style.display = "none";

  function refreshOptVisibility() {
    optIn.style.display = needsFormExtraOptions(typeSel.value) ? "" : "none";
  }
  typeSel.addEventListener("change", refreshOptVisibility);
  refreshOptVisibility();

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "composer-form-add";
  addBtn.textContent = "Hinzufügen";
  addBtn.disabled = locked;

  addBtn.addEventListener("click", () => {
    const typ = typeSel.value;
    const labelTxt = lblIn.value.trim();
    const trivialBtn = typ === "submit" || typ === "reset" || typ === "button";
    if (!labelTxt && !trivialBtn) {
      showToast("Bitte ein Label eintragen.");
      return;
    }
    let opts = optIn.value.trim();
    if (needsFormExtraOptions(typ)) {
      if (!opts) {
        showToast("Für Auswahl oder Radio sind Optionen nötig (kommagetrennt).");
        return;
      }
    } else {
      opts = "";
    }
    const btnDefault =
      typ === "submit" ? "Absenden" : typ === "reset" ? "Zurücksetzen" : typ === "button" ? "Aktion" : "";
    block.formItems.push({
      id: `${block.id}_${uid().replace(/^b\-/, "")}`,
      typ,
      label: labelTxt || btnDefault,
      options: opts,
    });
    lblIn.value = "";
    optIn.value = "";
    renderAll();
  });

  toolbar.appendChild(typeSel);
  toolbar.appendChild(lblIn);
  toolbar.appendChild(optIn);
  toolbar.appendChild(addBtn);

  const listTitle = document.createElement("div");
  listTitle.className = "composer-form-subtitle";
  listTitle.textContent = "Felderliste";

  const list = document.createElement("div");
  list.className = "composer-form-rows";
  if (!block.formItems.length) {
    const emptyRow = document.createElement("div");
    emptyRow.className = "composer-form-empty-row";
    emptyRow.textContent = "Noch keine Felder.";
    list.appendChild(emptyRow);
  } else {
    block.formItems.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "composer-form-defined-row";
      const meta = FORM_BUILDER_FIELD_TYPES.find((f) => f.value === it.typ);
      const cap = document.createElement("span");
      cap.className = "composer-form-def-label";
      cap.textContent = needsFormExtraOptions(it.typ)
        ? `${it.label} · ${parseFormOptions(it.options).join(" / ") || "—"}`
        : it.label;

      const badge = document.createElement("span");
      badge.className = "composer-form-kind";
      badge.textContent = (meta && meta.label) || it.typ;

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "composer-form-remove";
      rm.textContent = "✕";
      rm.disabled = locked;
      rm.setAttribute("aria-label", `Zeile ${idx + 1} entfernen`);
      rm.addEventListener("click", () => {
        block.formItems.splice(idx, 1);
        renderAll();
      });

      row.appendChild(badge);
      row.appendChild(cap);
      row.appendChild(rm);
      list.appendChild(row);
    });
  }

  const prevTitle = document.createElement("div");
  prevTitle.className = "composer-form-subtitle";
  prevTitle.textContent = isOutput ? "Vorschau mit Demo-Befüllung" : "Live-Vorschau";

  const prevHost = document.createElement("div");
  prevHost.className = "composer-form-preview-shell";

  if (!block.formItems.length) {
    const emptyP = document.createElement("p");
    emptyP.className = "composer-form-preview-empty";
    emptyP.textContent = "(Hier erscheinen die zusammengeklickten Widgets)";
    prevHost.appendChild(emptyP);
  } else {
    const formEl = document.createElement("form");
    formEl.className = "composer-form-live";
    formEl.noValidate = true;
    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("Absenden nur Demo — kein Backend-Aufruf.");
    });

    block.formItems.forEach((it, i) =>
      appendFormLiveControl(formEl, it, i, locked, isOutput)
    );
    prevHost.appendChild(formEl);
  }

  body.appendChild(hint);
  body.appendChild(toolbar);
  body.appendChild(listTitle);
  body.appendChild(list);
  body.appendChild(prevTitle);
  body.appendChild(prevHost);

  const footHint = document.createElement("p");
  footHint.className = "field-hint";
  footHint.textContent =
    "Im echten Produkt wird die Liste als JSON/schema serialisiert; hier nur Gestaltungs- und Storytelling‑Helfer.";
  body.appendChild(footHint);

  card.appendChild(body);
}

function renderDynamicUiModule(block, card) {
  if (block.dynamicUiCommitted === undefined || block.dynamicUiCommitted === null) block.dynamicUiCommitted = "";

  const locked = state.running;
  const interactive = block.role === "input";

  const body = document.createElement("div");
  body.className = "dynamic-ui-module";

  const lbl = document.createElement("label");
  lbl.className = "dynamic-ui-prompt-label";
  lbl.textContent = "UI-Prompt bearbeiten";
  const ta = document.createElement("textarea");
  ta.className = "dynamic-ui-prompt-field";
  ta.rows = 4;
  ta.disabled = locked;
  ta.placeholder =
    block.role === "input"
      ? "Beispiel: Matrix mit Checkboxen für Nutzen, Aufwand, Risiko pro Idee …"
      : "Beispiel: Balkendiagramm mit vier Quartalswerten …";

  ta.value = String(block.values.uiPrompt ?? "");
  ta.addEventListener("input", () => {
    block.values.uiPrompt = ta.value;
  });

  const btns = document.createElement("div");
  btns.className = "dynamic-ui-actions";

  const gen = document.createElement("button");
  gen.type = "button";
  gen.className = "dynamic-ui-generate";
  gen.textContent = "Erzeugen / neu erzeugen";
  gen.disabled = locked;
  gen.addEventListener("click", () => {
    const txt = String(block.values.uiPrompt || "").trim();
    if (!txt) {
      showToast("Prompt ist leer.");
      return;
    }
    block.dynamicUiCommitted = txt;
    renderAll();
    showToast("Mock-Vorschau aktualisiert — Prompt weiter editierbar.");
  });

  btns.appendChild(gen);

  const prevTitle = document.createElement("div");
  prevTitle.className = "composer-form-subtitle";
  prevTitle.textContent = "Gerenderte Oberfläche (Mock)";

  const host = document.createElement("div");
  renderDynamicUiPreview(host, block.dynamicUiCommitted, interactive, block.role);

  body.appendChild(lbl);
  body.appendChild(ta);
  body.appendChild(btns);
  body.appendChild(prevTitle);
  body.appendChild(host);

  card.appendChild(body);
}

const PTT_ICON_MIC_LIVE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/><path d="M8 22h8"/></svg>`;

const PTT_ICON_MIC_MUTED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.84 18.84A8 8 0 0 1 5 15H3a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h1"/><path d="M10.37 10.37a5 5 0 0 0-1.17 3.13V15"/><path d="M15 15v-3a5 5 0 0 0-.91-2.84"/><path d="M9 9v-1a3 3 0 0 1 5.12-2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;

/**
 * Push-to-talk: toggles the outgoing Realtime mic track (`enabled`).
 */
function renderAudioLivePttBar(block, card) {
  const wrap = document.createElement("div");
  wrap.className = "ptt-live-bar";

  const title = document.createElement("div");
  title.className = "ptt-live-title";
  title.textContent = "Push-to-talk";

  const hint = document.createElement("p");
  hint.className = "field-hint ptt-live-hint";

  const running = state.running;
  const liveMic = state.runMode === "realtime" && realtimeLocalStream;
  const isHold = block.values.pttStyle !== "toggle";

  if (!running) {
    hint.textContent = isHold
      ? "Start a run to use the button. Hold while speaking."
      : "Start a run to use the button. Press to unmute the mic, press again to mute.";
  } else if (liveMic) {
    hint.textContent = isHold
      ? "Hold to unmute the microphone; release to mute again. While running, holding Ctrl does the same."
      : "Press to unmute the microphone; press again to mute. While running, Ctrl toggles the same way.";
  } else {
    hint.textContent =
      "Realtime is active but no microphone track is available yet — check permissions or wait for capture.";
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ptt-live-btn";
  btn.disabled = !running;
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", isHold ? "Hold to speak — microphone live while pressed" : "Push to talk — toggle microphone");
  const iconWrap = document.createElement("span");
  iconWrap.className = "ptt-live-btn-icon";
  const labelEl = document.createElement("span");
  labelEl.className = "ptt-live-btn-label";
  btn.appendChild(iconWrap);
  btn.appendChild(labelEl);

  const setIcon = (kind) => {
    iconWrap.innerHTML = kind === "live" ? PTT_ICON_MIC_LIVE : PTT_ICON_MIC_MUTED;
  };

  if (isHold) {
    const setHoldVisual = (transmitting) => {
      btn.classList.toggle("is-transmitting", transmitting);
      btn.setAttribute("aria-pressed", transmitting ? "true" : "false");
      if (transmitting) {
        setIcon("live");
        labelEl.textContent = "Live — speaking";
      } else {
        setIcon("muted");
        labelEl.textContent = "Hold to speak";
      }
    };
    setHoldVisual(false);
    if (running) {
      const release = () => {
        setHoldVisual(false);
        if (liveMic) setRealtimeLocalMicEnabled(false);
      };
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
        setHoldVisual(true);
        if (liveMic) setRealtimeLocalMicEnabled(true);
      });
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
    }
    lastAudioLivePttUi = { mode: "hold", setHoldVisual, liveMic };
  } else {
    const syncToggleUi = () => {
      const on = audioLivePttToggleState.get(block.id) === true;
      btn.classList.toggle("is-transmitting", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) {
        setIcon("live");
        labelEl.textContent = "Live — tap to mute";
      } else {
        setIcon("muted");
        labelEl.textContent = "Tap to unmute";
      }
      if (liveMic) setRealtimeLocalMicEnabled(on);
    };
    syncToggleUi();
    if (running) {
      btn.addEventListener("click", () => {
        audioLivePttToggleState.set(block.id, !audioLivePttToggleState.get(block.id));
        syncToggleUi();
      });
    }
    lastAudioLivePttUi = { mode: "toggle", syncToggle: syncToggleUi, blockId: block.id, liveMic };
  }

  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(btn);
  card.appendChild(wrap);
}

function renderModuleCard(block, container) {
  const def = findDef(block.role, block.typeId);
  if (!def) return;

  const card = document.createElement("article");
  card.className =
    "module-card role-" +
    block.role +
    (def.live ? " live" : "");
  card.dataset.blockId = block.id;

  const head = document.createElement("div");
  head.className = "module-card-head";
  head.innerHTML = `
    <span class="module-card-code">${escapeHtml(def.code)}</span>
    <span class="module-card-title">${escapeHtml(def.title)}</span>
  `;
  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "module-card-remove";
  rm.setAttribute("aria-label", `Remove ${def.title}`);
  rm.textContent = "×";
  rm.disabled = state.running;
  rm.classList.toggle("is-disabled", state.running);
  rm.addEventListener("click", () => removeBlock(block.id));
  head.appendChild(rm);
  card.appendChild(head);

  const sk = formSchemaKey(block.role, block.typeId);
  const schema = FORM_SCHEMA[sk];

  if (block.typeId === "form") {
    renderFormComposerModule(block, card);
    container.appendChild(card);
    return;
  }
  if (block.typeId === "dynamic-ui") {
    renderDynamicUiModule(block, card);
    container.appendChild(card);
    return;
  }

  if (block.role === "output" && block.typeId === "text" && schema) {
    renderOutputTextModule(block, card, schema);
    container.appendChild(card);
    return;
  }

  if (!schema || !schema.fields.length) {
    const p = document.createElement("p");
    p.className = "module-card-fallback";
    p.textContent = "No fields for this type (mock).";
    card.appendChild(p);
    container.appendChild(card);
    return;
  }

  const form = document.createElement("div");
  form.className = "module-card-fields";

  const locked = state.running;

  schema.fields.forEach((field, fidx) => {
    if (field.showWhen) {
      const cur = block.values[field.showWhen.key];
      if (cur !== field.showWhen.is) return;
    }

    const wrap = document.createElement("div");
    wrap.className = "field field-compact";
    const fid = `f-${block.id}-n${fidx}`;
    let val = block.values[field.key];
    if (val === undefined || val === null) val = "";

    if (field.type === "hint") {
      renderHintField(field, wrap);
      form.appendChild(wrap);
      return;
    }

    if (field.label && field.type !== "checkbox") {
      const lab = document.createElement("label");
      lab.htmlFor = fid;
      lab.textContent = field.label;
      wrap.appendChild(lab);
    }

    if (field.type === "segmented") {
      renderSegmentedField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }
    if (field.type === "media_device") {
      renderMediaDeviceField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }
    if (field.type === "audio_record") {
      renderAudioRecordField(field, block, locked, wrap);
      form.appendChild(wrap);
      return;
    }

    if (field.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.id = fid;
      ta.disabled = locked;
      ta.rows = field.rows ?? 2;
      if (field.placeholder) ta.placeholder = field.placeholder;
      ta.value = String(val);
      ta.addEventListener("input", () => {
        block.values[field.key] = ta.value;
      });
      wrap.appendChild(ta);
    } else if (field.type === "select" && field.options) {
      const sel = document.createElement("select");
      sel.id = fid;
      sel.disabled = locked;
      field.options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      const strVal = String(val);
      if (field.options.some((o) => o.value === strVal)) sel.value = strVal;
      else {
        sel.selectedIndex = 0;
        block.values[field.key] = sel.value;
      }
      sel.addEventListener("change", () => {
        block.values[field.key] = sel.value;
        if (field.key === "size" && block.role === "output" && block.typeId === "image") {
          renderAll();
        }
      });
      wrap.appendChild(sel);
    } else if (field.type === "checkbox") {
      wrap.classList.add("field-compact-checkbox");
      const row = document.createElement("label");
      row.className = "field-checkbox";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = fid;
      cb.disabled = locked;
      cb.checked = val === "1" || val === "true" || (val === "" && schema.defaults[field.key] === "1");
      cb.addEventListener("change", () => {
        block.values[field.key] = cb.checked ? "1" : "0";
      });
      const span = document.createElement("span");
      span.textContent = field.checkboxLabel || field.label || field.key;
      row.appendChild(cb);
      row.appendChild(span);
      wrap.appendChild(row);
    } else if (field.type === "dropzone") {
      renderDropzoneField(field, block, locked, wrap);
    } else if (field.type === "camera_preview") {
      renderCameraPreviewField(field, block, locked, wrap);
    } else if (field.type === "file") {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.id = fid;
      inp.disabled = locked;
      if (field.accept) inp.accept = field.accept;
      inp.addEventListener("change", () => {
        const f = inp.files && inp.files[0];
        block.values[field.key] = f ? f.name : "";
      });
      wrap.appendChild(inp);
    } else {
      const inp = document.createElement("input");
      inp.id = fid;
      inp.disabled = locked;
      inp.type = field.type === "number" ? "number" : "text";
      if (field.placeholder) inp.placeholder = field.placeholder;
      inp.value = String(val);
      inp.addEventListener("input", () => {
        block.values[field.key] = inp.value;
      });
      wrap.appendChild(inp);
    }

    form.appendChild(wrap);
  });

  card.appendChild(form);
  if (block.role === "input" && block.typeId === "audio-live" && block.values.turnTaking === "ptt") {
    renderAudioLivePttBar(block, card);
  }
  if (block.role === "output" && block.typeId === "image") {
    appendImageOutputPlaceholder(block, card);
  }
  container.appendChild(card);
}

function sendInputsBatch() {
  const inputs = state.blocks.filter((b) => b.role === "input");
  if (!inputs.length) {
    showToast("No input modules — add some from the library.");
    return;
  }
  showToast("Inputs submitted (mock). Your backend would send the current input state together.");
  if (state.running) {
    applyRunTick();
  }
}

function renderEditorSection(role, list, root) {
  const section = document.createElement("section");
  section.className = "editor-section";

  const details = document.createElement("details");
  details.className = "editor-section-details";
  details.open = state.sectionOpen[role];
  details.addEventListener("toggle", () => {
    state.sectionOpen[role] = details.open;
  });

  const summary = document.createElement("summary");
  summary.className = "editor-section-summary";
  const title = ROLE_LABEL[role];
  summary.innerHTML = `<span class="editor-section-title">${escapeHtml(title)}</span><span class="editor-section-badge">${list.length}</span>`;

  const grid = document.createElement("div");
  grid.className = "editor-grid";

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "editor-grid-empty";
    empty.textContent = `No ${title.toLowerCase()} modules — add from the library.`;
    grid.appendChild(empty);
  } else {
    list.forEach((block) => renderModuleCard(block, grid));
  }

  details.appendChild(summary);
  details.appendChild(grid);
  if (role === "input" && list.length) {
    const bar = document.createElement("div");
    bar.className = "input-section-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "input-send-btn";
    btn.textContent = "Send inputs";
    btn.disabled = state.running;
    btn.addEventListener("click", () => sendInputsBatch());
    const hint = document.createElement("p");
    hint.className = "input-section-actions-hint";
    hint.textContent =
      "Push updated inputs together (e.g. new text + image). Mock only — connect your backend.";
    bar.appendChild(btn);
    bar.appendChild(hint);
    details.appendChild(bar);
  }
  section.appendChild(details);
  root.appendChild(section);
}

function renderModuleEditor() {
  lastAudioLivePttUi = null;
  const root = document.getElementById("module-editor");
  root.innerHTML = "";

  if (!state.blocks.length) {
    const wrap = document.createElement("div");
    wrap.className = "module-editor-empty";
    wrap.innerHTML =
      "<p>Pipeline is empty.</p><p class=\"hint\">Add inputs, processing, and outputs from the library on the left.</p>";
    root.appendChild(wrap);
    return;
  }

  const inputs = state.blocks.filter((b) => b.role === "input");
  const procs = state.blocks.filter((b) => b.role === "process");
  const outs = state.blocks.filter((b) => b.role === "output");

  renderEditorSection("input", inputs, root);
  renderEditorSection("process", procs, root);
  renderEditorSection("output", outs, root);
}

/**
 * Append one transcript line to every text-output block (`_transcriptLog` + mirrored `runPreview`).
 * Lines stay in server event arrival order; we do not reorder (reordering broke e.g. intro then first user utterance).
 * @param {"user-voice" | "assistant-voice" | "assistant-text"} kind
 * @param {string} text
 * @param {Record<string, unknown>} [src] source Realtime event (ids for dedupe)
 */
function appendRealtimeTranscriptToTextOutputs(kind, text, src = {}) {
  const body = String(text || "").trim();
  if (!body) return;
  const label =
    kind === "user-voice"
      ? "You (voice)"
      : kind === "assistant-voice"
        ? "Assistant (voice)"
        : "Assistant (text)";
  const role = kind === "user-voice" ? "user" : "assistant";
  const msg = src && typeof src === "object" ? src : {};
  const itemId = String(/** @type {{ item_id?: string }} */ (msg).item_id || "").trim();
  const eventId = String(/** @type {{ event_id?: string }} */ (msg).event_id || "").trim();
  const outIdx = /** @type {{ output_index?: number }} */ (msg).output_index;
  const resp = msg.response && typeof msg.response === "object" ? msg.response : null;
  const responseId = resp && String(/** @type {{ id?: string }} */ (resp).id || "").trim();

  let dedupeKey;
  if (kind === "user-voice") {
    dedupeKey = `user-voice:${itemId || eventId || body.slice(0, 64)}`;
  } else if (kind === "assistant-voice") {
    dedupeKey = `assistant-voice:${itemId || `${responseId}:${outIdx ?? 0}`}`;
  } else {
    dedupeKey = `assistant-text:${responseId || eventId || body.slice(0, 80)}`;
  }

  const entry = { key: dedupeKey, role, label, body };
  const textTargets = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  if (!textTargets.length) return;

  for (const b of textTargets) {
    const log = ensureTranscriptLog(b);
    if (log.some((e) => e.key === dedupeKey)) continue;

    log.push({ ...entry });
    rebuildRunPreviewFromLog(b);
  }
  syncOutputTextChatFromState();
}

/**
 * After each `response.done`: run function-call tool chain for all sessions; auto-stop only when
 * `realtimeRunAutoStop` and the response had no tool calls to chain.
 * @param {Record<string, unknown>} msg
 */
async function handleRealtimeResponseDone(msg) {
  if (!state.running || state.runMode !== "realtime") return;
  const dc = realtimeDataChannel;
  if (!dc || dc.readyState !== "open") return;

  const resp = msg.response;
  if (!resp || typeof resp !== "object") {
    if (realtimeRunAutoStop) void stopRealtimeRun();
    return;
  }

  const status = /** @type {string} */ (resp.status);
  if (status === "failed" || status === "cancelled") {
    if (realtimeRunAutoStop) void stopRealtimeRun();
    return;
  }

  const output = Array.isArray(resp.output) ? resp.output : [];
  const functionCalls = output.filter((it) => it && typeof it === "object" && it.type === "function_call");

  if (functionCalls.length > 0) {
    try {
      for (const fc of functionCalls) {
        const callId = String(
          /** @type {{ call_id?: string, id?: string }} */ (fc).call_id ||
            /** @type {{ call_id?: string, id?: string }} */ (fc).id ||
            "",
        ).trim();
        if (!callId) continue;
        const name = String(/** @type {{ name?: string }} */ (fc).name || "").trim();
        /** @type {string} */
        let outStr;
        if (name === "workshop_generate_image") {
          let args = {};
          try {
            args = JSON.parse(String(/** @type {{ arguments?: string }} */ (fc).arguments || "{}"));
          } catch {
            args = {};
          }
          const prompt = String(args.prompt || "").trim();
          if (!prompt) {
            appendSystemTranscriptToTextOutputs(
              "Tool · workshop_generate_image",
              "Call skipped — no prompt in tool arguments.",
              `tool:${callId}:skip`,
            );
            outStr = JSON.stringify({ ok: false, error: "missing_prompt" });
          } else {
            appendSystemTranscriptToTextOutputs(
              "Tool · workshop_generate_image",
              `Calling image generation…\n\n${prompt}`,
              `tool:${callId}:start`,
            );
            startImageGenerationProgressUi();
            try {
              const reference_images = await collectInputImageReferencesForGeneration();
              const res = await fetch("/api/images/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  plan: serializePipelinePlan(),
                  prompt,
                  reference_images,
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.ok) {
                const detail = data.message || data.error || res.statusText || "request failed";
                appendSystemTranscriptToTextOutputs(
                  "Tool · workshop_generate_image",
                  `Failed: ${String(detail)}`,
                  `tool:${callId}:done`,
                );
                outStr = JSON.stringify({ ok: false, error: "image_request_failed", message: String(detail) });
                showToast(`Image tool: ${String(detail).slice(0, 160)}`);
              } else if (data.data_url) {
                state.blocks
                  .filter((b) => b.role === "output" && b.typeId === "image")
                  .forEach((b) => {
                    b._runImageDataUrl = data.data_url;
                  });
                const doneMsg = data.revised_prompt
                  ? `Completed — image shown in output.\n\nRevised prompt: ${data.revised_prompt}`
                  : "Completed — image shown in output.";
                appendSystemTranscriptToTextOutputs(
                  "Tool · workshop_generate_image",
                  doneMsg,
                  `tool:${callId}:done`,
                );
                outStr = JSON.stringify({
                  ok: true,
                  revised_prompt: data.revised_prompt || undefined,
                  message: "Image is shown in the workshop image output.",
                });
              } else {
                appendSystemTranscriptToTextOutputs(
                  "Tool · workshop_generate_image",
                  "Failed: server returned no image data.",
                  `tool:${callId}:done`,
                );
                outStr = JSON.stringify({ ok: false, error: "no_data_url" });
              }
            } finally {
              stopImageGenerationProgressUi();
            }
            renderAll();
          }
        } else {
          appendSystemTranscriptToTextOutputs(
            `Tool · ${name || "unknown"}`,
            "This tool is not wired in the workshop client yet.",
            `tool:${callId}:unwired`,
          );
          outStr = JSON.stringify({
            ok: false,
            error: "workshop_tool_not_wired",
            name,
            message:
              "This Realtime tool call is not executed in the browser yet. Implement it on the workshop server or extend the client runner.",
          });
        }
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: outStr,
            },
          }),
        );
      }
      dc.send(JSON.stringify({ type: "response.create" }));
    } catch (err) {
      console.warn("Realtime tool chain failed", err);
      stopImageGenerationProgressUi();
      void stopRealtimeRun();
    }
    return;
  }

  if (realtimeRunAutoStop) void stopRealtimeRun();
}

/**
 * Final assistant text comes from `response.done` only (also avoids duplicating `response.output_text.done`).
 * Assistant voice transcripts use `response.output_audio_transcript.done` only.
 * @param {Record<string, unknown>} msg
 */
function appendAssistantTextFromResponseDonePayload(msg) {
  const resp = msg.response;
  if (!resp || typeof resp !== "object" || !Array.isArray(resp.output)) return;
  const textParts = [];
  for (const item of resp.output) {
    if (!item || typeof item !== "object" || item.type !== "message" || item.role !== "assistant") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && part.type === "output_text" && part.text) {
        textParts.push(String(part.text).trim());
      }
    }
  }
  const combined = textParts.join("\n\n").trim();
  if (!combined) return;
  appendRealtimeTranscriptToTextOutputs("assistant-text", combined, msg);
}

function handleRealtimeDataChannelMessage(raw) {
  if (state.runMode !== "realtime" || !state.running) return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "error") {
    const err = msg.error && typeof msg.error === "object" ? msg.error : {};
    const m = String(/** @type {{ message?: string }} */ (err).message || msg.message || "").trim();
    console.warn("Realtime error event", msg);
    if (m) showToast(`Realtime: ${m.slice(0, 220)}`);
    return;
  }
  if (msg.type === "conversation.item.input_audio_transcription.completed" && msg.transcript) {
    appendRealtimeTranscriptToTextOutputs("user-voice", msg.transcript, msg);
    return;
  }
  if (msg.type === "response.output_audio_transcript.done" && msg.transcript) {
    appendRealtimeTranscriptToTextOutputs("assistant-voice", msg.transcript, msg);
    return;
  }
  if (msg.type === "response.done") {
    appendAssistantTextFromResponseDonePayload(msg);
    void handleRealtimeResponseDone(msg);
    return;
  }
}

function injectRunPreviewIntoOutputs(previewText) {
  const textTargets = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  const trimmed = previewText.trim();
  if (textTargets.length === 1) {
    textTargets[0].runPreview = trimmed;
    delete textTargets[0]._transcriptLog;
    return;
  }
  if (textTargets.length > 1) {
    textTargets.forEach((b) => {
      b.runPreview = trimmed;
      delete b._transcriptLog;
    });
    return;
  }
}

function syncOutputTextChatFromState() {
  state.blocks
    .filter((b) => b.role === "output" && b.typeId === "text")
    .forEach((b) => {
      const el = document.querySelector(`[data-text-output-chat="${b.id}"]`);
      if (el) fillTextOutputChatStream(el, b);
    });
}

function updateRunChrome() {
  const fab = document.getElementById("fab-run");
  if (!fab) return;
  const label = document.getElementById("fab-run-label");
  const play = fab.querySelector(".fab-run-icon-play");
  const busy = fab.querySelector(".fab-run-icon-busy");
  const running = state.running;
  fab.classList.toggle("is-running", running);
  if (label) label.textContent = running ? "Running" : "Run";
  fab.setAttribute("aria-pressed", running ? "true" : "false");
  fab.setAttribute(
    "aria-label",
    running
      ? pipelineHasLiveAudioInput()
        ? "Realtime session active — click to stop when you are done"
        : "Realtime run — click to stop, or wait for the model to finish"
      : "Validate plan and start Realtime (WebRTC)",
  );
  if (play) {
    play.style.display = running ? "none" : "";
    play.hidden = running;
  }
  if (busy) {
    busy.style.display = running ? "" : "none";
    busy.hidden = !running;
  }
  document.body.classList.toggle("pipeline-running", running);
  const st = document.getElementById("status-bar-text");
  if (st) {
    if (running && state.runMode === "realtime") {
      st.textContent = pipelineHasLiveAudioInput()
        ? "Realtime session — WebRTC to OpenAI. Click Running or Esc when you are done."
        : "Realtime session — WebRTC to OpenAI. The run ends automatically when the model response completes.";
    } else if (pipelineUsesLiveAudioModules()) {
      st.textContent =
        "Live-audio pipeline: Run validates the plan, then opens a Realtime WebRTC session when served from the workshop Node server (same origin).";
    } else {
      st.textContent =
        "Run validates the plan and opens a Realtime WebRTC session (same origin as this Node server). Serve from `cd server && npm start` — static file hosting has no API.";
    }
  }
}

function lockPalette(locked) {
  const pal = document.getElementById("palette");
  if (pal) pal.classList.toggle("palette-locked", locked);
  const clearBtn = document.getElementById("btn-clear");
  if (clearBtn) clearBtn.disabled = locked;
  const saveLay = document.getElementById("btn-save-custom-layout");
  if (saveLay) saveLay.disabled = locked;
}

function renderAll() {
  if (!state.blocks.length && state.running) {
    void stopRealtimeRun();
  }
  renderMeta();
  renderPalette();
  renderModuleEditor();
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("visible"), 3200);
}

async function toggleRunFromFab() {
  if (state.blocks.length === 0) {
    showToast("Pipeline is empty — add modules before a run would make sense.");
    return;
  }
  if (state.running) {
    await stopRealtimeRun();
    return;
  }
  await startRealtimeRun();
}

async function startRunFromHotkey() {
  if (state.running) return;
  if (state.blocks.length === 0) {
    showToast("Pipeline is empty — add modules before a run would make sense.");
    return;
  }
  await startRealtimeRun();
}

function init() {
  document.getElementById("btn-save-custom-layout").addEventListener("click", () => {
    saveCurrentPipelineToStore();
  });

  document.getElementById("fab-run").addEventListener("click", () => {
    void toggleRunFromFab();
  });

  document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape" && state.running) {
      e.preventDefault();
      void stopRealtimeRun();
      return;
    }

    if (isTypingInField(e.target)) return;

    if (e.altKey && e.key === "Enter" && !state.running) {
      e.preventDefault();
      await startRunFromHotkey();
      return;
    }

    if (!state.running || !lastAudioLivePttUi) return;
    const pttBlock = state.blocks.find(
      (b) => b.role === "input" && b.typeId === "audio-live" && b.values.turnTaking === "ptt",
    );
    if (!pttBlock) return;

    const isCtrl = e.code === "ControlLeft" || e.code === "ControlRight";
    if (!isCtrl || e.repeat) return;

    if (lastAudioLivePttUi.mode === "hold") {
      if (pttCtrlMicEngaged) return;
      pttCtrlMicEngaged = true;
      lastAudioLivePttUi.setHoldVisual(true);
      if (lastAudioLivePttUi.liveMic) setRealtimeLocalMicEnabled(true);
    } else {
      audioLivePttToggleState.set(pttBlock.id, !audioLivePttToggleState.get(pttBlock.id));
      lastAudioLivePttUi.syncToggle();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (!pttCtrlMicEngaged || !lastAudioLivePttUi || lastAudioLivePttUi.mode !== "hold") return;
    if (e.code !== "ControlLeft" && e.code !== "ControlRight") return;
    if (e.getModifierState("Control")) return;
    releasePttCtrlHotkey();
  });

  window.addEventListener("blur", () => {
    releasePttCtrlHotkey();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (state.running) void stopRealtimeRun();
    state.blocks.forEach((b) => stopBlockCapture(b.id));
    state.blocks = [];
    renderAll();
    showToast("Pipeline cleared.");
  });

  applyInitialPageLayout();
  updateRunChrome();

  if (location.hash === "#demo-shot") {
    injectRunPreviewIntoOutputs("[#demo-shot layout placeholder]");
    renderAll();
  }
}

document.addEventListener("DOMContentLoaded", init);
