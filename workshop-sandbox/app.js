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

const ROLE_LABEL = { input: "Input", process: "Process", output: "Output" };

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
  /** @type {{ id: string, role: 'input'|'process'|'output', typeId: string }[]} */
  blocks: [],
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

function addBlock(role, typeId) {
  state.blocks.push({ id: uid(), role, typeId });
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

function renderWorkbench() {
  const root = document.getElementById("workbench-cards");
  root.innerHTML = "";

  state.blocks.forEach((item) => {
    const def = findDef(item.role, item.typeId);
    if (!def) return;

    const card = document.createElement("article");
    card.className =
      "card role-" +
      (item.role === "input" ? "input" : item.role === "process" ? "process" : "output") +
      (def.live ? " live" : "");
    card.dataset.itemId = item.id;

    card.innerHTML = `
      <span class="role-pill">${escapeHtml(ROLE_LABEL[item.role])}</span>
      <span class="icon" aria-hidden="true">${escapeHtml(def.code)}</span>
      <div class="body">
        <span class="title">${escapeHtml(def.title)}</span>
        <span class="meta">${escapeHtml(def.desc)}</span>
      </div>
      <button type="button" class="remove" aria-label="Remove ${escapeHtml(def.title)}">×</button>
    `;

    card.querySelector(".remove").addEventListener("click", () => {
      state.blocks = state.blocks.filter((x) => x.id !== item.id);
      renderAll();
    });

    root.appendChild(card);
  });

  const inputs = state.blocks.filter((b) => b.role === "input").length;
  const proc = state.blocks.filter((b) => b.role === "process").length;
  const outs = state.blocks.filter((b) => b.role === "output").length;
  const meta = document.getElementById("workbench-meta");
  const n = state.blocks.length;
  meta.textContent =
    n === 0
      ? "Nothing placed"
      : `${n} part${n === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output`;

  const multi = document.getElementById("multi-input-hint");
  multi.classList.toggle("visible", inputs > 1);
}

function renderAll() {
  renderWorkbench();
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

  p.blocks.forEach((b) => state.blocks.push({ id: uid(), role: b.role, typeId: b.typeId }));

  renderAll();
  if (!silent) {
    showToast("Example sheet loaded — change anything, nothing executes yet.");
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
  const textOut = blocks.filter((b) => b.role === "output" && b.typeId === "text");
  const anyOut = blocks.some((b) => b.role === "output");

  if (textOut.length) {
    lines.push(
      "[assistant · mock]\n\nHere is a fabricated reply that shows how a text output would land in the run panel. " +
        "In a real run this would reflect your inputs, retrieval, and tools.\n\n" +
        "- Summary: pipeline executed in simulated order.\n" +
        "- Confidence: illustrative only (no model).\n" +
        "- Next: wire edges between parts to drive real execution order."
    );
  } else if (anyOut) {
    lines.push(
      "[run preview · mock]\n\nThis sheet has non-text outputs only. A full runner would show waveforms, image tiles, or stream panes here."
    );
  } else {
    lines.push(
      "[run preview · mock]\n\nNo output modules on the sheet — add at least one output to see a richer preview stub."
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
    document.getElementById("btn-run-mock").focus();
  }
}

function openRunModal() {
  clearRunAnimTimers();
  const blocks = state.blocks.slice();
  const overlay = document.getElementById("run-overlay");
  const lede = document.getElementById("run-panel-lede");
  const summary = document.getElementById("run-summary");
  const stepsRoot = document.getElementById("run-steps");
  const preview = document.getElementById("run-preview");

  const inputs = blocks.filter((b) => b.role === "input").length;
  const proc = blocks.filter((b) => b.role === "process").length;
  const outs = blocks.filter((b) => b.role === "output").length;

  lede.textContent =
    "Fabricated execution trace for each part on the sheet. Order follows placement; real wiring would reorder this.";
  summary.textContent = `${blocks.length} part${blocks.length === 1 ? "" : "s"} · ${inputs} input · ${proc} process · ${outs} output · mock session`;

  stepsRoot.innerHTML = "";
  preview.textContent = buildMockPreview(blocks);

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
}

function closeRunModal() {
  setRunOpen(false);
}

function init() {
  renderPalette();

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset"), false));
  });

  document.getElementById("btn-run-mock").addEventListener("click", () => {
    if (state.blocks.length === 0) {
      showToast("Sheet is empty — add parts before a real run would make sense.");
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
    showToast("Sheet cleared.");
  });

  applyPreset("text-prompt", true);
}

document.addEventListener("DOMContentLoaded", init);
