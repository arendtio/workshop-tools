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
    showToast("Stub run: later this would execute the sheet. Still mock-only.");
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    state.blocks = [];
    renderAll();
    showToast("Sheet cleared.");
  });

  applyPreset("text-prompt", true);
}

document.addEventListener("DOMContentLoaded", init);
