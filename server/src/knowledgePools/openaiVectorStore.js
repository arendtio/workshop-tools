/**
 * OpenAI Vector Store + Files API (no local text extraction — OpenAI indexes PDF, Office, etc.).
 */

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 90;

function apiBase() {
  return (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function authHeaders() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is not set.");
    err.code = "NO_API_KEY";
    throw err;
  }
  /** @type {Record<string, string>} */
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (process.env.OPENAI_SAFETY_IDENTIFIER) {
    headers["OpenAI-Safety-Identifier"] = process.env.OPENAI_SAFETY_IDENTIFIER;
  }
  return headers;
}

/**
 * @param {string} pathSuffix
 * @param {RequestInit} [init]
 */
async function openaiJson(pathSuffix, init = {}) {
  const fetchImpl = init.fetchImpl ?? fetch;
  const url = `${apiBase()}${pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`}`;
  /** @type {Record<string, string>} */
  const headers = { ...authHeaders(), "Content-Type": "application/json" };
  const r = await fetchImpl(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data?.error?.message || text || `OpenAI HTTP ${r.status}`;
    const err = new Error(msg);
    err.code = data?.error?.code || "OPENAI";
    err.status = r.status;
    throw err;
  }
  return data;
}

/**
 * @param {string} name
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function createVectorStore(name, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return openaiJson("/vector_stores", {
    method: "POST",
    body: JSON.stringify({ name }),
    fetchImpl,
  });
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function uploadOpenAiFile(buffer, filename, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", new Blob([buffer]), filename);
  const url = `${apiBase()}/files`;
  const r = await fetchImpl(url, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data?.error?.message || text || `OpenAI HTTP ${r.status}`;
    const err = new Error(msg);
    err.code = data?.error?.code || "OPENAI";
    err.status = r.status;
    throw err;
  }
  return data;
}

/**
 * @param {string} vectorStoreId
 * @param {string} fileId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function attachFileToVectorStore(vectorStoreId, fileId, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return openaiJson(`/vector_stores/${vectorStoreId}/files`, {
    method: "POST",
    body: JSON.stringify({ file_id: fileId }),
    fetchImpl,
  });
}

/**
 * @param {string} vectorStoreId
 * @param {string} fileId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function getVectorStoreFileStatus(vectorStoreId, fileId, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return openaiJson(`/vector_stores/${vectorStoreId}/files/${fileId}`, {
    method: "GET",
    fetchImpl,
  });
}

/**
 * @param {string} vectorStoreId
 * @param {string} fileId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function waitForVectorStoreFile(vectorStoreId, fileId, options = {}) {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const st = await getVectorStoreFileStatus(vectorStoreId, fileId, options);
    const status = String(st.status || "");
    if (status === "completed") return st;
    if (status === "failed" || status === "cancelled") {
      const err = new Error(`Vector store file indexing ${status}.`);
      err.code = "INDEX_FAILED";
      throw err;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  const err = new Error("Timed out waiting for vector store file indexing.");
  err.code = "INDEX_TIMEOUT";
  throw err;
}

/**
 * @param {string} vectorStoreId
 * @param {string} query
 * @param {{ maxResults?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function searchVectorStore(vectorStoreId, query, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const max = Math.max(1, Math.min(20, Number(options.maxResults ?? 8)));
  return openaiJson(`/vector_stores/${vectorStoreId}/search`, {
    method: "POST",
    body: JSON.stringify({
      query: String(query || "").trim(),
      max_num_results: max,
      rewrite_query: true,
    }),
    fetchImpl,
  });
}

/**
 * @param {string} vectorStoreId
 * @param {string} fileId
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function removeFileFromVectorStore(vectorStoreId, fileId, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${apiBase()}/vector_stores/${vectorStoreId}/files/${fileId}`;
  const r = await fetchImpl(url, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (r.status === 404) return { deleted: false };
  if (!r.ok) {
    const text = await r.text();
    const err = new Error(text || `OpenAI HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return { deleted: true };
}
