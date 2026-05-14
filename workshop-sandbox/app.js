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

/** Push-to-talk toggle: block id → mic “open” (mock UI only). */
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
        key: "imageUrl",
        label: "Image URL (https)",
        type: "text",
        placeholder: "https://…",
        showWhen: { key: "imageSource", is: "url" },
      },
      {
        key: "_hint",
        label: "",
        type: "hint",
        hint: "Workshop: most people upload a file; your backend maps it to `image_url` or a hosted URL.",
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
      "POST `/v1/images/generations` — size and other parameters are chosen server-side; this block keeps workshop framing only.",
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
  /** @type {{ id: string, role: 'input'|'process'|'output', typeId: string, values: Record<string, string>, runPreview?: string }[]} */
  blocks: [],
  /** Collapsible sections in the pipeline editor */
  sectionOpen: { input: true, process: true, output: true },
  /** Continuous mock run (no modal) */
  running: false,
  /** @type {null | 'mock' | 'realtime'} */
  runMode: null,
};

/** @type {RTCPeerConnection | null} */
let realtimePeerConnection = null;
/** @type {MediaStream | null} */
let realtimeLocalStream = null;

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

function pipelineNeedsRealtime() {
  return state.blocks.some(
    (b) =>
      (b.role === "input" && b.typeId === "audio-live") ||
      (b.role === "output" && b.typeId === "audio-live"),
  );
}

async function stopRealtimeRun() {
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

    const pc = new RTCPeerConnection();
    realtimePeerConnection = pc;

    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    pc.ontrack = (ev) => {
      remoteAudio.srcObject = ev.streams[0];
    };

    if (state.blocks.some((b) => b.role === "input" && b.typeId === "audio-live")) {
      realtimeLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeLocalStream.getTracks().forEach((track) => pc.addTrack(track, realtimeLocalStream));
    }

    const dc = pc.createDataChannel("oai-events");
    if (bootstrapEvents.length) {
      dc.addEventListener(
        "open",
        () => {
          for (const ev of bootstrapEvents) {
            try {
              dc.send(JSON.stringify(ev));
            } catch (err) {
              console.warn("Orchestration bootstrap send failed", err);
            }
          }
        },
        { once: true },
      );
    }
    dc.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && msg.type === "error") {
          console.warn("Realtime error event", msg);
        }
      } catch (_) {
        /* ignore */
      }
    });

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

    state.running = true;
    state.runMode = "realtime";
    updateRunChrome();
    lockPalette(true);
    renderAll();
    showToast("Realtime session connected — click Running or Esc to stop.");
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
    line += state.runMode === "realtime" ? " · realtime run" : " · mock run active";
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

function renderDropzoneField(field, blockId, values, disabled, wrap) {
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
  });

  zone.addEventListener("click", () => {
    if (!disabled) inp.click();
  });

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

  btnRow.appendChild(start);
  btnRow.appendChild(stop);
  row.appendChild(btnRow);
  row.appendChild(status);

  start.addEventListener("click", async () => {
    if (disabled) return;
    stopBlockRecorder(block.id);
    block.values[field.key] = "";
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
          status.textContent = `Recorded: ${name} (blob kept locally for your backend)`;
        } else {
          status.textContent = "Recording empty — try again.";
        }
        blockMediaRecorders.delete(block.id);
        start.disabled = disabled;
        stop.disabled = true;
      });
      rec.start(200);
      blockMediaRecorders.set(block.id, { recorder: rec, chunks, statusEl: status });
      start.disabled = true;
      stop.disabled = false;
    } catch {
      status.textContent = "Microphone not available or denied.";
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

function chatTagAbbrev(label) {
  const s = String(label || "").trim();
  if (!s) return "·";
  const u = s.toUpperCase();
  if (u.length <= 4) return u;
  return `${u.slice(0, 3)}…`;
}

function appendChatBubble(roleClass, tagText, tagTitle, bodyText) {
  const row = document.createElement("div");
  row.className = "output-chat-row output-chat-row-" + roleClass;
  const tag = document.createElement("span");
  tag.className = "output-chat-role";
  tag.textContent = tagText;
  tag.title = tagTitle;
  const bubble = document.createElement("div");
  bubble.className = "output-chat-bubble";
  const pre = document.createElement("pre");
  pre.className = "output-chat-body";
  pre.textContent = bodyText || "(empty)";
  bubble.appendChild(pre);
  row.appendChild(tag);
  row.appendChild(bubble);
  return row;
}

function renderOutputTextConversationPreview(block, card) {
  const snap = gatherConversationSnapshotForTextOutput();
  const thread = document.createElement("div");
  thread.className = "output-chat-thread output-chat-thread--compact";

  const lead = document.createElement("div");
  lead.className = "output-chat-lede";
  lead.textContent = "Chat preview (mock)";
  thread.appendChild(lead);

  if (!snap.systemParts.length) {
    thread.appendChild(appendChatBubble("system", "—", "System", "(no system instructions yet)"));
  } else {
    snap.systemParts.forEach((part) => {
      thread.appendChild(appendChatBubble("system", chatTagAbbrev(part.label), part.label, part.body));
    });
  }

  if (!snap.userTurns.length) {
    thread.appendChild(appendChatBubble("user", "—", "User inputs", "(add input modules)"));
  } else {
    snap.userTurns.forEach((row) => {
      thread.appendChild(appendChatBubble("user", chatTagAbbrev(row.label), row.label, row.body));
    });
  }

  const asstRow = document.createElement("div");
  asstRow.className = "output-chat-row output-chat-row-assistant";
  const tag = document.createElement("span");
  tag.className = "output-chat-role";
  tag.textContent = "OUT";
  tag.title = "Assistant reply";
  const bubble = document.createElement("div");
  bubble.className = "output-chat-bubble output-chat-bubble-assistant";

  const ta = document.createElement("textarea");
  ta.className = "run-preview-inline output-chat-assistant-ta";
  ta.readOnly = true;
  ta.setAttribute("data-run-preview-block", block.id);
  ta.rows = 5;
  ta.placeholder = "Run the pipeline to simulate a reply here.";
  ta.value = block.runPreview || "";
  bubble.appendChild(ta);

  asstRow.appendChild(tag);
  asstRow.appendChild(bubble);
  thread.appendChild(asstRow);

  card.appendChild(thread);
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

function appendImageOutputPlaceholder(block, card) {
  const stage = document.createElement("div");
  stage.className = "output-image-stage";

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
  sub.textContent = `${size} · preview after run`;

  stage.appendChild(ph);
  stage.appendChild(sub);
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

/**
 * Mock push-to-talk: control stays disabled until a pipeline run is active.
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
  const isHold = block.values.pttStyle !== "toggle";

  if (!running) {
    hint.textContent = isHold
      ? "Start a run to use the button. Then hold it while you speak (mock — no audio is sent)."
      : "Start a run to use the button. Then press to open the mic and press again to close (mock — no audio is sent).";
  } else {
    hint.textContent = isHold
      ? "Hold while speaking. Release to stop (mock)."
      : "Press once to open the mic, press again to close (mock).";
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ptt-live-btn";
  btn.disabled = !running;

  if (isHold) {
    btn.textContent = "Hold to speak";
    if (running) {
      const release = () => {
        btn.classList.remove("is-transmitting");
      };
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
        btn.classList.add("is-transmitting");
      });
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
    }
  } else {
    const syncToggleUi = () => {
      const on = audioLivePttToggleState.get(block.id) === true;
      btn.textContent = on ? "Stop speaking" : "Start speaking";
      btn.classList.toggle("is-transmitting", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    };
    syncToggleUi();
    if (running) {
      btn.addEventListener("click", () => {
        audioLivePttToggleState.set(block.id, !audioLivePttToggleState.get(block.id));
        syncToggleUi();
      });
    }
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

  if (schema && schema.apiMapping) {
    const mapEl = document.createElement("p");
    mapEl.className = "module-api-mapping";
    mapEl.innerHTML = `<span class="module-api-mapping-k">API note</span> ${escapeHtml(schema.apiMapping)}`;
    card.appendChild(mapEl);
  }

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

    if (field.label) {
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
    } else if (field.type === "dropzone") {
      renderDropzoneField(field, block.id, block.values, locked, wrap);
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

let mockRunInterval = null;

function injectRunPreviewIntoOutputs(previewText) {
  const textTargets = state.blocks.filter((b) => b.role === "output" && b.typeId === "text");
  if (textTargets.length === 1) {
    textTargets[0].runPreview = previewText.trim();
    return;
  }
  if (textTargets.length > 1) {
    const share =
      previewText.trim().split("\n\n")[0] +
      "\n\n(mock: multiple text outputs — showing same preview in each for now)";
    textTargets.forEach((b) => {
      b.runPreview = share;
    });
    return;
  }
}

function syncOutputPreviewFieldsFromState() {
  state.blocks
    .filter((b) => b.role === "output" && b.typeId === "text")
    .forEach((b) => {
      const el = document.querySelector(`textarea[data-run-preview-block="${b.id}"]`);
      if (el) el.value = b.runPreview || "";
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
      ? state.runMode === "realtime"
        ? "Realtime session active — click to stop"
        : "Mock pipeline is running — click to stop"
      : pipelineNeedsRealtime()
        ? "Validate plan and start Realtime (WebRTC)"
        : "Start mock pipeline run",
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
      st.textContent =
        "Realtime session — WebRTC to OpenAI using an ephemeral client secret from this origin. Click Running or Esc to end.";
    } else if (running) {
      st.textContent =
        "Mock run active — edit fields in place; library locked. Click Running or Esc to end.";
    } else if (pipelineNeedsRealtime()) {
      st.textContent =
        "Live-audio pipeline: Run validates the plan, then opens a Realtime WebRTC session when served from the workshop Node server (same origin).";
    } else {
      st.textContent =
        "Run starts a continuous mock loop (no popup). Outputs refresh on a timer; stop anytime. No real models.";
    }
  }
}

function lockPalette(locked) {
  const pal = document.getElementById("palette");
  if (pal) pal.classList.toggle("palette-locked", locked);
  const clearBtn = document.getElementById("btn-clear");
  if (clearBtn) clearBtn.disabled = locked;
}

function applyRunTick() {
  injectRunPreviewIntoOutputs(buildMockPreview(state.blocks));
  syncOutputPreviewFieldsFromState();
}

function startMockRun() {
  if (state.running || !state.blocks.length) return;
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  audioLivePttToggleState.clear();
  state.running = true;
  state.runMode = "mock";
  updateRunChrome();
  lockPalette(true);
  renderAll();
  applyRunTick();
  mockRunInterval = setInterval(applyRunTick, 2600);
}

function stopMockRun() {
  if (!state.running) return;
  state.running = false;
  state.runMode = null;
  audioLivePttToggleState.clear();
  if (mockRunInterval) {
    clearInterval(mockRunInterval);
    mockRunInterval = null;
  }
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  updateRunChrome();
  lockPalette(false);
  renderAll();
}

function renderAll() {
  if (!state.blocks.length && state.running) {
    if (state.runMode === "realtime") void stopRealtimeRun();
    else stopMockRun();
  }
  renderMeta();
  renderPalette();
  renderModuleEditor();
}

function applyPreset(presetId, silent) {
  if (state.running) {
    if (state.runMode === "realtime") void stopRealtimeRun();
    else stopMockRun();
  }
  state.blocks.forEach((b) => stopBlockCapture(b.id));
  state.blocks = [];

  const presets = {
    "text-prompt": {
      blocks: [
        { role: "input", typeId: "text" },
        { role: "process", typeId: "instruction" },
        { role: "output", typeId: "text" },
      ],
    },
    vision: {
      blocks: [
        { role: "input", typeId: "image" },
        { role: "input", typeId: "text" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "vector-db" },
        { role: "output", typeId: "text" },
      ],
    },
    "live-audio": {
      blocks: [
        { role: "input", typeId: "audio-live" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "tooling" },
        { role: "output", typeId: "text" },
        { role: "output", typeId: "audio-live" },
      ],
    },
    "multimodal-out": {
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

  const p = presets[presetId];
  if (!p) return;

  p.blocks.forEach((b) => {
    state.blocks.push(createBlock(b.role, b.typeId));
  });

  renderAll();
  if (!silent) {
    showToast("Example pipeline loaded — forms are editable; nothing executes for real.");
  }
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("visible"), 3200);
}

function buildMockPreview(blocks) {
  const lines = [];
  const textOut = blocks.some((b) => b.role === "output" && b.typeId === "text");
  const textIn = blocks.filter((b) => b.role === "input" && b.typeId === "text");
  const snippet = textIn.length
    ? String(textIn[0].values.content || "")
        .trim()
        .slice(0, 220)
    : "";

  const instr = blocks.find((b) => b.role === "process" && b.typeId === "instruction");
  const sysBrief = instr ? String(instr.values.system || "").trim().slice(0, 160) : "";

  if (textOut) {
    lines.push("[assistant · mock]");
    lines.push("");
    if (snippet) {
      lines.push("Acknowledged input (excerpt):");
      lines.push(snippet + (String(textIn[0].values.content || "").length > 220 ? "…" : ""));
      lines.push("");
    }
    if (sysBrief) {
      lines.push("System instruction (excerpt):");
      lines.push(sysBrief + (String(instr.values.system || "").length > 160 ? "…" : ""));
      lines.push("");
    }
    if (instr) {
      const mi = String(instr.values.maxIterations || "").trim();
      const swFull = String(instr.values.stopWhen || "");
      const sw = swFull.trim().slice(0, 120);
      if (mi || sw) {
        lines.push("Retry / loop (instruction module):");
        if (mi) lines.push(`- max iterations: ${mi}`);
        if (sw) lines.push(`- stop when: ${sw}${swFull.length > 120 ? "…" : ""}`);
        lines.push("");
      }
    }
    lines.push(
      "Here is a fabricated reply. A real run would use your form values, retrieval, and tools end-to-end."
    );
    lines.push("");
    lines.push("- Summary: simulated pass over the pipeline.");
    lines.push("- Confidence: illustrative only (no model).");
  } else if (blocks.some((b) => b.role === "output")) {
    lines.push(
      "[run preview · mock]\n\nThis pipeline has non-text outputs only. A full runner would show waveforms, image tiles, or stream panes here."
    );
  } else {
    lines.push(
      "[run preview · mock]\n\nNo output modules — add at least one output to see a richer preview stub."
    );
  }

  lines.push("");
  lines.push("— Fabricated telemetry —");
  lines.push(`session: mock-${Math.random().toString(36).slice(2, 10)}`);
  lines.push(`latency total: ${(180 + blocks.length * 95 + Math.floor(Math.random() * 120)).toFixed(0)} ms (fake)`);
  return lines.join("\n");
}

function init() {
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset"), false));
  });

  document.getElementById("fab-run").addEventListener("click", async () => {
    if (state.blocks.length === 0) {
      showToast("Pipeline is empty — add modules before a run would make sense.");
      return;
    }
    if (state.running) {
      if (state.runMode === "realtime") await stopRealtimeRun();
      else stopMockRun();
      return;
    }
    if (pipelineNeedsRealtime()) {
      await startRealtimeRun();
    } else {
      startMockRun();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.running) {
      e.preventDefault();
      if (state.runMode === "realtime") void stopRealtimeRun();
      else stopMockRun();
    }
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (state.running) {
      if (state.runMode === "realtime") void stopRealtimeRun();
      else stopMockRun();
    }
    state.blocks.forEach((b) => stopBlockCapture(b.id));
    state.blocks = [];
    renderAll();
    showToast("Pipeline cleared.");
  });

  applyPreset("text-prompt", true);
  updateRunChrome();

  if (location.hash === "#demo-shot") {
    injectRunPreviewIntoOutputs(buildMockPreview(state.blocks));
    renderAll();
  }
}

document.addEventListener("DOMContentLoaded", init);
