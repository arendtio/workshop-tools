/**
 * Workshop AI Sandbox — UI mock-up only (no backend).
 */

const INPUT_TYPES = [
  { id: "text", icon: "📝", title: "Text", desc: "Typed or pasted text", live: false },
  { id: "image", icon: "🖼️", title: "Image", desc: "Upload or reference stills", live: false },
  { id: "audio-rec", icon: "🎙️", title: "Audio (recorded)", desc: "Captured clip or file", live: false },
  { id: "audio-live", icon: "🔊", title: "Audio (live)", desc: "Streaming microphone", live: true },
  { id: "video-live", icon: "📹", title: "Video (live)", desc: "Webcam / screen stream", live: true },
  { id: "video-rec", icon: "🎬", title: "Video (recorded)", desc: "File-based video", live: false },
];

const PROCESS_TYPES = [
  { id: "instruction", icon: "✳️", title: "Instruction", desc: "Natural-language task or prompt", live: false },
  { id: "vector-db", icon: "🧠", title: "Knowledge / vectors", desc: "Retrieval from a vector store", live: false },
  { id: "loop", icon: "🔁", title: "Loop / retry", desc: "Iterate until a condition is met", live: false },
  { id: "tooling", icon: "🛠️", title: "Tooling", desc: "APIs, code, external tools", live: false },
  { id: "skills", icon: "📎", title: "Skills / context", desc: "Bundled rules, docs, or skill packs", live: false },
];

const OUTPUT_TYPES = [
  { id: "text", icon: "📄", title: "Text", desc: "Structured or free-form reply", live: false },
  { id: "image", icon: "🎨", title: "Image", desc: "Generated or edited visuals", live: false },
  { id: "audio", icon: "🔈", title: "Audio", desc: "Speech or sound file", live: false },
  { id: "audio-live", icon: "📡", title: "Audio (live)", desc: "Streamed speech / playback", live: true },
  { id: "video", icon: "🎞️", title: "Video", desc: "Rendered or composed video", live: false },
  { id: "video-live", icon: "📺", title: "Video (live)", desc: "Live composite or stream out", live: true },
];

const state = {
  inputs: [],
  process: [],
  outputs: [],
};

let modalLane = null;
let idSeq = 0;

function uid(prefix) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

function findDef(lane, id) {
  const list =
    lane === "input" ? INPUT_TYPES : lane === "process" ? PROCESS_TYPES : OUTPUT_TYPES;
  return list.find((t) => t.id === id);
}

function renderCards(lane, container) {
  container.innerHTML = "";
  const key = lane === "input" ? "inputs" : lane === "process" ? "process" : "outputs";
  const items = state[key];

  items.forEach((item) => {
    const def = findDef(lane, item.typeId);
    if (!def) return;

    const card = document.createElement("article");
    card.className = "card" + (def.live ? " live" : "");
    card.dataset.itemId = item.id;

    card.innerHTML = `
      <span class="icon" aria-hidden="true">${def.icon}</span>
      <div class="body">
        <span class="title">${escapeHtml(def.title)}</span>
        <span class="meta">${escapeHtml(def.desc)}</span>
      </div>
      <button type="button" class="remove" aria-label="Remove ${escapeHtml(def.title)}">×</button>
    `;

    card.querySelector(".remove").addEventListener("click", () => {
      state[key] = state[key].filter((x) => x.id !== item.id);
      renderAll();
    });

    container.appendChild(card);
  });

  const multi = document.getElementById("multi-input-hint");
  if (multi) {
    multi.classList.toggle("visible", lane === "input" && state.inputs.length > 1);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAll() {
  renderCards("input", document.getElementById("inputs-cards"));
  renderCards("process", document.getElementById("process-cards"));
  renderCards("output", document.getElementById("outputs-cards"));
}

function openModal(lane) {
  modalLane = lane;
  const backdrop = document.getElementById("modal-backdrop");
  const title = document.getElementById("modal-title");
  const subtitle = document.getElementById("modal-subtitle");
  const grid = document.getElementById("option-grid");

  const labels = {
    input: "Add input",
    process: "Add processing block",
    output: "Add output",
  };
  const subs = {
    input: "Combine multiple modalities (e.g. text + image).",
    process: "Stack how the model should think and act.",
    output: "Choose what participants should see or hear.",
  };

  title.textContent = labels[lane];
  subtitle.textContent = subs[lane];

  const types = lane === "input" ? INPUT_TYPES : lane === "process" ? PROCESS_TYPES : OUTPUT_TYPES;

  grid.innerHTML = "";
  types.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.innerHTML = `
      <span class="label">${t.icon} ${escapeHtml(t.title)}</span>
      <span class="desc">${escapeHtml(t.desc)}</span>
    `;
    btn.addEventListener("click", () => {
      const key = lane === "input" ? "inputs" : lane === "process" ? "process" : "outputs";
      state[key].push({ id: uid(key), typeId: t.id });
      closeModal();
      renderAll();
    });
    grid.appendChild(btn);
  });

  backdrop.classList.add("open");
  document.getElementById("modal-close").focus();
}

function closeModal() {
  modalLane = null;
  document.getElementById("modal-backdrop").classList.remove("open");
}

function applyPreset(presetId, silent) {
  state.inputs = [];
  state.process = [];
  state.outputs = [];

  const presets = {
    "text-prompt": {
      inputs: ["text"],
      process: ["instruction"],
      outputs: ["text"],
    },
    "vision": {
      inputs: ["image", "text"],
      process: ["instruction", "vector-db"],
      outputs: ["text"],
    },
    "live-audio": {
      inputs: ["audio-live"],
      process: ["instruction", "tooling"],
      outputs: ["text", "audio-live"],
    },
    "multimodal-out": {
      inputs: ["text", "video-rec"],
      process: ["instruction", "skills", "loop"],
      outputs: ["text", "image"],
    },
  };

  const p = presets[presetId];
  if (!p) return;

  p.inputs.forEach((typeId) => state.inputs.push({ id: uid("inputs"), typeId }));
  p.process.forEach((typeId) => state.process.push({ id: uid("process"), typeId }));
  p.outputs.forEach((typeId) => state.outputs.push({ id: uid("outputs"), typeId }));

  renderAll();
  if (!silent) {
    showToast("Loaded a starter layout. Edit freely — nothing runs yet.");
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
  document.getElementById("btn-add-input").addEventListener("click", () => openModal("input"));
  document.getElementById("btn-add-process").addEventListener("click", () => openModal("process"));
  document.getElementById("btn-add-output").addEventListener("click", () => openModal("output"));

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.getAttribute("data-preset"), false));
  });

  document.getElementById("btn-run-mock").addEventListener("click", () => {
    showToast("Preview only: wiring to real models comes in a later step.");
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    state.inputs = [];
    state.process = [];
    state.outputs = [];
    renderAll();
    showToast("Cleared the board.");
  });

  applyPreset("text-prompt", true);
}

document.addEventListener("DOMContentLoaded", init);
