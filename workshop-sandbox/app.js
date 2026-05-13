/**
 * Workshop AI Sandbox — workbench UI mock-up (no backend).
 */

const INPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Typed or pasted text", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Upload or reference stills", live: false },
  { id: "audio-rec", code: "A·R", title: "Audio (recorded)", desc: "Captured clip or file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streaming microphone", live: true },
  { id: "video-live", code: "V·L", title: "Video (live)", desc: "Webcam / screen stream", live: true },
  { id: "video-rec", code: "V·R", title: "Video (recorded)", desc: "File-based video", live: false },
];

const PROCESS_TYPES = [
  { id: "instruction", code: "INS", title: "Instruction", desc: "Natural-language task or prompt", live: false },
  { id: "vector-db", code: "RAG", title: "Knowledge / vectors", desc: "Retrieval from a vector store", live: false },
  { id: "loop", code: "LP", title: "Loop / retry", desc: "Iterate until a condition is met", live: false },
  { id: "tooling", code: "TLS", title: "Tooling", desc: "APIs, code, external tools", live: false },
  { id: "skills", code: "SKL", title: "Skills / context", desc: "Bundled rules, docs, or skill packs", live: false },
];

const OUTPUT_TYPES = [
  { id: "text", code: "TXT", title: "Text", desc: "Structured or free-form reply", live: false },
  { id: "image", code: "IMG", title: "Image", desc: "Generated or edited visuals", live: false },
  { id: "audio", code: "AUD", title: "Audio", desc: "Speech or sound file", live: false },
  { id: "audio-live", code: "A·L", title: "Audio (live)", desc: "Streamed speech / playback", live: true },
  { id: "video", code: "VID", title: "Video", desc: "Rendered or composed video", live: false },
  { id: "video-live", code: "V·L", title: "Video (live)", desc: "Live composite or stream out", live: true },
];

const ROLE_LABEL = { input: "Input", process: "Processing", output: "Output" };

/**
 * Mock form fields per module type. Keys are `role:typeId`.
 * @type {Record<string, { defaults: Record<string, string>, fields: { key: string, label: string, type: 'text'|'textarea'|'number'|'select', placeholder?: string, rows?: number, options?: { value: string, label: string }[] }[] }>}
 */
const FORM_SCHEMA = {
  "input:text": {
    defaults: {
      content: "Summarize the workshop goals in two bullet points.",
    },
    fields: [
      {
        key: "content",
        label: "Text",
        type: "textarea",
        rows: 3,
        placeholder: "Your prompt or data",
      },
    ],
  },
  "input:image": {
    defaults: { sourceUrl: "https://example.com/mock/frame.jpg", altText: "Whiteboard sketch" },
    fields: [
      { key: "sourceUrl", label: "Image URL / path", type: "text", placeholder: "https://… or file reference" },
      { key: "altText", label: "Description / alt text", type: "text", placeholder: "For accessibility and retrieval" },
    ],
  },
  "input:audio-rec": {
    defaults: { fileName: "take-03.wav", durationSec: "12.4" },
    fields: [
      { key: "fileName", label: "Clip name", type: "text", placeholder: "Recorded or uploaded file" },
      { key: "durationSec", label: "Duration (seconds)", type: "number", placeholder: "e.g. 12.4" },
    ],
  },
  "input:audio-live": {
    defaults: { device: "default-mic", chunkMs: "320" },
    fields: [
      {
        key: "device",
        label: "Input device",
        type: "select",
        options: [
          { value: "default-mic", label: "Default microphone" },
          { value: "usb-01", label: "USB mic (mock)" },
          { value: "loopback", label: "System loopback (mock)" },
        ],
      },
      { key: "chunkMs", label: "Frame size (ms)", type: "number", placeholder: "e.g. 320" },
    ],
  },
  "input:video-live": {
    defaults: { source: "webcam-0", resolution: "640x480" },
    fields: [
      {
        key: "source",
        label: "Video source",
        type: "select",
        options: [
          { value: "webcam-0", label: "Webcam 0" },
          { value: "screen-1", label: "Screen share (mock)" },
        ],
      },
      { key: "resolution", label: "Target resolution", type: "text", placeholder: "640×480" },
    ],
  },
  "input:video-rec": {
    defaults: { fileName: "clip-h264.mp4", startOffsetSec: "0" },
    fields: [
      { key: "fileName", label: "File name", type: "text", placeholder: "Container on disk / URL" },
      { key: "startOffsetSec", label: "Start offset (sec)", type: "number", placeholder: "0" },
    ],
  },
  "process:instruction": {
    defaults: {
      system:
        "You are a concise assistant. Respect safety policies. Prefer bullet lists when comparing options.",
      user: "Explain how this pipeline would run end-to-end in one short paragraph.",
      temperature: "0.4",
    },
    fields: [
      {
        key: "system",
        label: "System",
        type: "textarea",
        rows: 2,
        placeholder: "Behavior, tone, constraints",
      },
      {
        key: "user",
        label: "Instructions",
        type: "textarea",
        rows: 2,
        placeholder: "What to do with the inputs",
      },
      { key: "temperature", label: "Temperature", type: "number", placeholder: "0–2" },
    ],
  },
  "process:vector-db": {
    defaults: { collection: "workshop-docs-v3", topK: "4", filterJson: '{"team":"sandbox"}' },
    fields: [
      { key: "collection", label: "Collection / index", type: "text", placeholder: "Vector collection id" },
      { key: "topK", label: "Top K", type: "number", placeholder: "e.g. 4" },
      { key: "filterJson", label: "Metadata filter (JSON)", type: "textarea", rows: 2, placeholder: '{"key":"value"}' },
    ],
  },
  "process:loop": {
    defaults: { maxIterations: "4", stopWhen: "Answer includes a numbered list." },
    fields: [
      { key: "maxIterations", label: "Max iterations", type: "number", placeholder: "e.g. 4" },
      {
        key: "stopWhen",
        label: "Stop condition (natural language)",
        type: "textarea",
        rows: 2,
        placeholder: "When should the loop exit?",
      },
    ],
  },
  "process:tooling": {
    defaults: { toolName: "http_json", endpoint: "https://api.example.com/v1/mock", timeoutMs: "800" },
    fields: [
      {
        key: "toolName",
        label: "Tool id",
        type: "select",
        options: [
          { value: "http_json", label: "HTTP JSON (mock)" },
          { value: "python_cell", label: "Python cell (mock)" },
          { value: "sql_readonly", label: "SQL read-only (mock)" },
        ],
      },
      { key: "endpoint", label: "Endpoint / resource", type: "text", placeholder: "URL or resource path" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "800" },
    ],
  },
  "process:skills": {
    defaults: { packId: "workshop-default", injectMode: "prepend" },
    fields: [
      { key: "packId", label: "Skill pack id", type: "text", placeholder: "Bundled rules / docs" },
      {
        key: "injectMode",
        label: "Injection mode",
        type: "select",
        options: [
          { value: "prepend", label: "Prepend to system" },
          { value: "append", label: "Append after instructions" },
          { value: "tool-only", label: "Tool-visible only (mock)" },
        ],
      },
    ],
  },
  "output:text": {
    defaults: { format: "markdown", maxTokens: "512" },
    fields: [
      {
        key: "format",
        label: "Format",
        type: "select",
        options: [
          { value: "markdown", label: "Markdown" },
          { value: "plain", label: "Plain text" },
          { value: "json", label: "JSON (mock)" },
        ],
      },
      { key: "maxTokens", label: "Max output tokens", type: "number", placeholder: "e.g. 512" },
    ],
  },
  "output:image": {
    defaults: { width: "512", height: "512", style: "flat illustration, soft light" },
    fields: [
      { key: "width", label: "Width (px)", type: "number", placeholder: "512" },
      { key: "height", label: "Height (px)", type: "number", placeholder: "512" },
      {
        key: "style",
        label: "Style / notes",
        type: "textarea",
        rows: 2,
        placeholder: "Hints for the image head",
      },
    ],
  },
  "output:audio": {
    defaults: { voice: "neutral-en", speed: "1.0" },
    fields: [
      {
        key: "voice",
        label: "Voice profile",
        type: "select",
        options: [
          { value: "neutral-en", label: "Neutral · EN" },
          { value: "warm-en", label: "Warm · EN" },
          { value: "de-de", label: "DE · mock" },
        ],
      },
      { key: "speed", label: "Playback speed", type: "text", placeholder: "1.0" },
    ],
  },
  "output:audio-live": {
    defaults: { transport: "websocket", bitrateKbps: "128" },
    fields: [
      {
        key: "transport",
        label: "Stream transport",
        type: "select",
        options: [
          { value: "websocket", label: "WebSocket (mock)" },
          { value: "webrtc", label: "WebRTC (mock)" },
        ],
      },
      { key: "bitrateKbps", label: "Target bitrate (kbps)", type: "number", placeholder: "128" },
    ],
  },
  "output:video": {
    defaults: { resolution: "1080p", fps: "30", durationSec: "12" },
    fields: [
      { key: "resolution", label: "Resolution", type: "text", placeholder: "1080p" },
      { key: "fps", label: "Frame rate", type: "number", placeholder: "30" },
      { key: "durationSec", label: "Duration (sec)", type: "number", placeholder: "12" },
    ],
  },
  "output:video-live": {
    defaults: { mixerLayout: "pip-right", encoder: "h264" },
    fields: [
      {
        key: "mixerLayout",
        label: "Compositor layout",
        type: "select",
        options: [
          { value: "pip-right", label: "Picture-in-picture · right" },
          { value: "grid-2", label: "Two-up grid" },
          { value: "full-cam", label: "Full camera" },
        ],
      },
      {
        key: "encoder",
        label: "Encoder",
        type: "select",
        options: [
          { value: "h264", label: "H.264 (mock)" },
          { value: "vp9", label: "VP9 (mock)" },
        ],
      },
    ],
  },
};

/** @type {Record<string, { detail: string, metric?: string }>} */
const MOCK_STEP = {
  "input:text": {
    detail: "Read workshop buffer (mock): pasted prompt + inline notes.",
    metric: "847 chars · UTF-8",
  },
  "input:image": {
    detail: "Decoded still frame from mock upload path.",
    metric: "1024×768 · sRGB · 2.1 MB",
  },
  "input:audio-rec": {
    detail: "Loaded clip into memory ring (no disk I/O in mock).",
    metric: "12.4 s · 44.1 kHz mono",
  },
  "input:audio-live": {
    detail: "Subscribed to fake mic stream; chunking for downstream STT.",
    metric: "320 ms frames · RMS −18 dBFS",
  },
  "input:video-live": {
    detail: "Webcam path idle — emitting placeholder keyframes only.",
    metric: "15 fps · 640×480 (mock)",
  },
  "input:video-rec": {
    detail: "Indexed container; seek table built for random access.",
    metric: "482 frames · H.264 · 24 fps",
  },
  "process:instruction": {
    detail: "Merged system + user instructions; pinned safety block (mock).",
    metric: "~1.2k tokens context",
  },
  "process:vector-db": {
    detail: "ANN search over embedded workshop docs (simulated scores).",
    metric: "3 hits · top 0.82",
  },
  "process:loop": {
    detail: "Evaluator: condition not met — would schedule another pass.",
    metric: "iteration 2 / 4 (cap)",
  },
  "process:tooling": {
    detail: "Called external tool shim; latency injected for realism.",
    metric: "POST /v1/mock-tool · 142 ms · 200",
  },
  "process:skills": {
    detail: "Injected skill pack snippets into working context.",
    metric: "4 files · ~12k tokens (mock)",
  },
  "output:text": {
    detail: "Synthesized reply channel; streaming disabled in mock.",
    metric: "412 tokens draft",
  },
  "output:image": {
    detail: "Rasterized latent to PNG via fake decoder.",
    metric: "512×512 · seed 9201",
  },
  "output:audio": {
    detail: "Rendered speech waveform to buffer (no playback here).",
    metric: "8.2 s · 24 kHz",
  },
  "output:audio-live": {
    detail: "Opened live audio sink — would push PCM to speakers.",
    metric: "chunked 20 ms",
  },
  "output:video": {
    detail: "Muxed video track with overlays (mock timeline only).",
    metric: "1080p · 30 fps · 12 s",
  },
  "output:video-live": {
    detail: "Composite preview stream — encoder waiting on frames.",
    metric: "WebRTC-like session (stub)",
  },
};

const state = {
  /** @type {{ id: string, role: 'input'|'process'|'output', typeId: string, values: Record<string, string>, runPreview?: string }[]} */
  blocks: [],
  /** Collapsible sections in the pipeline editor */
  sectionOpen: { input: true, process: true, output: true },
};

let idSeq = 0;

function uid() {
  idSeq += 1;
  return `b-${idSeq}`;
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
  return { id: uid(), role, typeId, values };
}

function addBlock(role, typeId) {
  state.blocks.push(createBlock(role, typeId));
  renderAll();
}

function removeBlock(id) {
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
    btn.addEventListener("click", () => addBlock(role, t.id));
    el.appendChild(btn);
  });
}

function renderMeta() {
  const inputs = state.blocks.filter((b) => b.role === "input").length;
  const proc = state.blocks.filter((b) => b.role === "process").length;
  const outs = state.blocks.filter((b) => b.role === "output").length;
  const meta = document.getElementById("workbench-meta");
  const n = state.blocks.length;
  meta.textContent =
    n === 0
      ? "Nothing in pipeline"
      : `${n} part${n === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output`;

  const multi = document.getElementById("multi-input-hint");
  multi.classList.toggle("visible", inputs > 1);
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
  rm.addEventListener("click", () => removeBlock(block.id));
  head.appendChild(rm);
  card.appendChild(head);

  const sk = formSchemaKey(block.role, block.typeId);
  const schema = FORM_SCHEMA[sk];

  if (!schema || !schema.fields.length) {
    const p = document.createElement("p");
    p.className = "module-card-fallback";
    p.textContent = "No fields for this type (mock).";
    card.appendChild(p);
    appendRunPreviewRow(block, card);
    container.appendChild(card);
    return;
  }

  const form = document.createElement("div");
  form.className = "module-card-fields";

  schema.fields.forEach((field) => {
    const wrap = document.createElement("div");
    wrap.className = "field field-compact";
    const fid = `f-${block.id}-${field.key}`;
    let val = block.values[field.key];
    if (val === undefined || val === null) val = "";

    const lab = document.createElement("label");
    lab.htmlFor = fid;
    lab.textContent = field.label;
    wrap.appendChild(lab);

    if (field.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.id = fid;
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
    } else {
      const inp = document.createElement("input");
      inp.id = fid;
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
  appendRunPreviewRow(block, card);
  container.appendChild(card);
}

function appendRunPreviewRow(block, card) {
  if (block.role !== "output") return;

  const wrap = document.createElement("div");
  wrap.className = "field field-compact field-run-preview";
  const lab = document.createElement("label");
  lab.textContent =
    block.typeId === "text" ? "Last run (mock)" : "Last run note (mock)";
  wrap.appendChild(lab);

  const ta = document.createElement("textarea");
  ta.className = "run-preview-inline";
  ta.readOnly = true;
  ta.rows = block.typeId === "text" ? 5 : 2;
  ta.placeholder =
    block.typeId === "text"
      ? "Run the pipeline to show a fabricated reply here."
      : "Run to refresh mock asset / stream summary.";
  ta.value = block.runPreview || "";
  wrap.appendChild(ta);
  card.appendChild(wrap);
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

function renderAll() {
  renderMeta();
  renderModuleEditor();
}

function applyPreset(presetId, silent) {
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
        { role: "input", typeId: "video-rec" },
        { role: "process", typeId: "instruction" },
        { role: "process", typeId: "skills" },
        { role: "process", typeId: "loop" },
        { role: "output", typeId: "text" },
        { role: "output", typeId: "image" },
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

function mockStepFor(block) {
  const key = `${block.role}:${block.typeId}`;
  return (
    MOCK_STEP[key] || {
      detail: "No specific mock copy for this pairing — placeholder activity only.",
      metric: "stub",
    }
  );
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
  const userInstr = instr ? String(instr.values.user || "").trim().slice(0, 160) : "";

  if (textOut) {
    lines.push("[assistant · mock]");
    lines.push("");
    if (snippet) {
      lines.push("Acknowledged input (excerpt):");
      lines.push(snippet + (String(textIn[0].values.content || "").length > 220 ? "…" : ""));
      lines.push("");
    }
    if (userInstr) {
      lines.push("Task (instruction module, excerpt):");
      lines.push(userInstr + (String(instr.values.user || "").length > 160 ? "…" : ""));
      lines.push("");
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

let runAnimTimers = [];

function clearRunAnimTimers() {
  runAnimTimers.forEach((id) => clearTimeout(id));
  runAnimTimers = [];
}

function setRunOpen(open) {
  const overlay = document.getElementById("run-overlay");
  overlay.hidden = !open;
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.classList.toggle("run-open", open);
  if (open) {
    document.getElementById("run-close").focus();
  } else {
    clearRunAnimTimers();
    document.getElementById("fab-run").focus();
  }
}

function openRunModal() {
  clearRunAnimTimers();
  const blocks = state.blocks.slice();
  const lede = document.getElementById("run-panel-lede");
  const summary = document.getElementById("run-summary");
  const stepsRoot = document.getElementById("run-steps");
  const preview = document.getElementById("run-preview");

  const inputs = blocks.filter((b) => b.role === "input").length;
  const proc = blocks.filter((b) => b.role === "process").length;
  const outs = blocks.filter((b) => b.role === "output").length;

  lede.textContent =
    "Fabricated trace in sheet order. The main view keeps inputs, processing, and outputs visible while this runs.";
  summary.textContent = `${blocks.length} part${blocks.length === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output · mock session`;

  stepsRoot.innerHTML = "";
  const previewStr = buildMockPreview(blocks);
  preview.textContent = previewStr;

  const statusEls = [];

  blocks.forEach((block, idx) => {
    const def = findDef(block.role, block.typeId);
    if (!def) return;
    const mock = mockStepFor(block);
    const li = document.createElement("li");
    li.className = "run-step";
    const roleClass = block.role === "input" ? "in" : block.role === "process" ? "mid" : "out";
    const roleShort = block.role === "input" ? "In" : block.role === "process" ? "Proc" : "Out";

    li.innerHTML = `
      <span class="run-step-num">${idx + 1}</span>
      <div class="run-step-head">
        <span class="run-step-role ${roleClass}">${escapeHtml(roleShort)}</span>
        <span class="run-step-title">${escapeHtml(def.title)}</span>
      </div>
      <p class="run-step-detail">${escapeHtml(mock.detail)}${
        mock.metric ? " · " + escapeHtml(mock.metric) : ""
      }</p>
      <div class="run-step-status pending" data-run-status>Pending</div>
    `;
    stepsRoot.appendChild(li);
    statusEls.push(li.querySelector("[data-run-status]"));
  });

  setRunOpen(true);

  let t = 120;
  statusEls.forEach((el) => {
    runAnimTimers.push(
      setTimeout(() => {
        el.textContent = "Running…";
        el.className = "run-step-status running";
      }, t)
    );
    t += 320;
    runAnimTimers.push(
      setTimeout(() => {
        el.textContent = "Done (mock)";
        el.className = "run-step-status done";
      }, t)
    );
    t += 220;
  });

  runAnimTimers.push(
    setTimeout(() => {
      injectRunPreviewIntoOutputs(previewStr);
      renderAll();
    }, t + 120)
  );
}

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
  state.blocks
    .filter((b) => b.role === "output")
    .forEach((b) => {
      b.runPreview = "[mock] Non-text output — see combined preview in the run sheet.";
    });
}

function closeRunModal() {
  setRunOpen(false);
}

function init() {
  renderPalette();

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset"), false));
  });

  document.getElementById("fab-run").addEventListener("click", () => {
    if (state.blocks.length === 0) {
      showToast("Pipeline is empty — add modules before a run would make sense.");
      return;
    }
    openRunModal();
  });

  document.getElementById("run-close").addEventListener("click", closeRunModal);
  document.getElementById("run-backdrop").addEventListener("click", closeRunModal);

  document.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("run-overlay");
    if (e.key === "Escape" && !overlay.hidden) {
      e.preventDefault();
      closeRunModal();
    }
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    state.blocks = [];
    renderAll();
    showToast("Pipeline cleared.");
  });

  applyPreset("text-prompt", true);

  if (location.hash === "#demo-shot") {
    injectRunPreviewIntoOutputs(buildMockPreview(state.blocks));
    renderAll();
  }
}

document.addEventListener("DOMContentLoaded", init);
