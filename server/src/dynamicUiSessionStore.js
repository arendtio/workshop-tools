import { randomUUID } from "node:crypto";

const MAX_SESSIONS = 200;
/** @type {string[]} */
const fifo = [];
/** @type {Map<string, { widgets: Record<string, unknown>, nlPrompt: string, outputData: Record<string, unknown> }>} */
const sessions = new Map();

function evict() {
  while (fifo.length > MAX_SESSIONS) {
    const id = fifo.shift();
    if (id) sessions.delete(id);
  }
}

function emptyState() {
  return { widgets: {}, nlPrompt: "", outputData: {} };
}

/**
 * @returns {string}
 */
export function createDynamicUiSession() {
  evict();
  const id = randomUUID();
  sessions.set(id, emptyState());
  fifo.push(id);
  return id;
}

/** @param {string} id */
export function hasDynamicUiSession(id) {
  return sessions.has(String(id || ""));
}

/**
 * @param {string} sessionId
 * @param {unknown} patch
 */
export function patchDynamicUiSession(sessionId, patch) {
  const sid = String(sessionId || "").trim();
  if (!sessions.has(sid)) {
    return { ok: false, error: "unknown_session" };
  }
  const cur = sessions.get(sid);
  if (!cur) return { ok: false, error: "unknown_session" };
  deepMerge(cur, patch);
  return { ok: true, state: snapshot(cur) };
}

/**
 * @param {string} sessionId
 */
export function readDynamicUiSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sessions.has(sid)) {
    return { ok: false, error: "unknown_session" };
  }
  const cur = sessions.get(sid);
  if (!cur) return { ok: false, error: "unknown_session" };
  return { ok: true, state: snapshot(cur) };
}

/**
 * @param {{ widgets: Record<string, unknown>, nlPrompt: string }} s
 */
function snapshot(s) {
  return {
    nlPrompt: String(s.nlPrompt || ""),
    widgets: { ...s.widgets },
    outputData: { ...s.outputData },
  };
}

/**
 * @param {Record<string, unknown>} target
 * @param {unknown} patch
 */
function deepMerge(target, patch) {
  if (!isRecord(patch)) return;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "widgets" && isRecord(v) && isRecord(target.widgets)) {
      for (const [wk, wv] of Object.entries(v)) {
        target.widgets[wk] = wv;
      }
      continue;
    }
    if (k === "outputData" && isRecord(v) && isRecord(target.outputData)) {
      for (const [bk, bv] of Object.entries(v)) {
        target.outputData[bk] = bv;
      }
      continue;
    }
    if (isRecord(v) && isRecord(target[k])) {
      deepMerge(/** @type {Record<string, unknown>} */ (target[k]), v);
    } else {
      target[k] = v;
    }
  }
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
