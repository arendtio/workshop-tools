import fs from "node:fs";
import path from "node:path";
import {
  attachFileToVectorStore,
  createVectorStore,
  removeFileFromVectorStore,
  searchVectorStore,
  uploadOpenAiFile,
  waitForVectorStoreFile,
} from "./openaiVectorStore.js";
import {
  ensureKnowledgePoolsDir,
  knowledgePoolDir,
  knowledgePoolFilePath,
  knowledgePoolManifestPath,
  sanitizeKnowledgePoolName,
} from "./paths.js";

export const KNOWLEDGE_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Extensions OpenAI vector stores accept (see File Search supported files). */
export const KNOWLEDGE_ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "csv",
  "doc",
  "docx",
  "json",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
]);

/**
 * @param {string} filename
 */
export function isAllowedKnowledgeFilename(filename) {
  const ext = (String(filename).split(".").pop() || "").toLowerCase();
  return KNOWLEDGE_ALLOWED_EXTENSIONS.has(ext);
}

/**
 * @param {string} filename
 */
export function safeKnowledgeFilename(filename) {
  const base = path.basename(String(filename || "upload").trim()) || "upload";
  const cleaned = base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180);
  return cleaned || "upload.bin";
}

/**
 * @param {string} poolName sanitized
 */
function readManifest(poolName) {
  const p = knowledgePoolManifestPath(poolName);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} poolName sanitized
 * @param {object} manifest
 */
function writeManifest(poolName, manifest) {
  const dir = knowledgePoolDir(poolName);
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  fs.writeFileSync(knowledgePoolManifestPath(poolName), JSON.stringify(manifest, null, 2));
}

/**
 * @param {object | null} manifest
 */
export function knowledgePoolReady(manifest) {
  if (!manifest || !String(manifest.vector_store_id || "").trim()) return false;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  return files.some((f) => String(f.status || "") === "completed");
}

/**
 * @returns {{ pools: object[] }}
 */
export function listKnowledgePools() {
  ensureKnowledgePoolsDir();
  const root = ensureKnowledgePoolsDir();
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  /** @type {object[]} */
  const pools = [];
  for (const d of dirs) {
    const name = d.name;
    const manifest = readManifest(name);
    if (!manifest) continue;
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const completed = files.filter((f) => f.status === "completed").length;
    pools.push({
      name,
      vector_store_id: manifest.vector_store_id || null,
      file_count: files.length,
      indexed_count: completed,
      ready: knowledgePoolReady(manifest),
      updated_at: manifest.updated_at || manifest.created_at || null,
    });
  }
  pools.sort((a, b) => a.name.localeCompare(b.name));
  return { pools };
}

/**
 * @param {string} poolName sanitized
 */
export function getKnowledgePoolSummary(poolName) {
  const manifest = readManifest(poolName);
  if (!manifest) {
    return { ok: false, error: "unknown_pool", message: `Knowledge pool "${poolName}" does not exist.` };
  }
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  return {
    ok: true,
    name: poolName,
    vector_store_id: manifest.vector_store_id || null,
    ready: knowledgePoolReady(manifest),
    files: files.map((f) => ({
      filename: f.filename,
      size_bytes: f.size_bytes ?? null,
      status: f.status ?? "unknown",
      uploaded_at: f.uploaded_at ?? null,
    })),
    created_at: manifest.created_at || null,
    updated_at: manifest.updated_at || null,
  };
}

/**
 * @param {string} poolName sanitized
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
async function ensureVectorStoreForPool(poolName, options = {}) {
  let manifest = readManifest(poolName);
  if (!manifest) {
    manifest = {
      name: poolName,
      vector_store_id: null,
      created_at: new Date().toISOString(),
      updated_at: null,
      files: [],
    };
  }
  if (!manifest.vector_store_id) {
    const vs = await createVectorStore(`workshop-${poolName}`, options);
    manifest.vector_store_id = vs.id;
    manifest.updated_at = new Date().toISOString();
    writeManifest(poolName, manifest);
  }
  return manifest;
}

/**
 * @param {string} poolName sanitized
 * @param {string} filename original
 * @param {Buffer} buffer
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function uploadKnowledgePoolFile(poolName, filename, buffer, options = {}) {
  if (!isAllowedKnowledgeFilename(filename)) {
    return {
      ok: false,
      error: "unsupported_type",
      message: `File type not supported for knowledge indexing: ${filename}`,
    };
  }
  if (buffer.length > KNOWLEDGE_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "file_too_large",
      message: `File exceeds ${KNOWLEDGE_MAX_FILE_BYTES} bytes.`,
    };
  }

  const safeName = safeKnowledgeFilename(filename);
  const localPath = knowledgePoolFilePath(poolName, safeName);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);

  let manifest = await ensureVectorStoreForPool(poolName, options);
  const vectorStoreId = String(manifest.vector_store_id);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const existing = files.find((f) => f.filename === safeName);

  if (existing?.openai_file_id) {
    try {
      await removeFileFromVectorStore(vectorStoreId, existing.openai_file_id, options);
    } catch {
      /* best effort */
    }
  }

  const uploaded = await uploadOpenAiFile(buffer, safeName, options);
  const fileId = String(uploaded.id);
  await attachFileToVectorStore(vectorStoreId, fileId, options);
  const indexed = await waitForVectorStoreFile(vectorStoreId, fileId, options);

  const now = new Date().toISOString();
  const entry = {
    filename: safeName,
    original_name: filename,
    openai_file_id: fileId,
    size_bytes: buffer.length,
    status: String(indexed.status || "completed"),
    uploaded_at: now,
  };

  const nextFiles = files.filter((f) => f.filename !== safeName);
  nextFiles.push(entry);
  manifest = {
    ...manifest,
    files: nextFiles,
    updated_at: now,
  };
  if (!manifest.created_at) manifest.created_at = now;
  writeManifest(poolName, manifest);

  return {
    ok: true,
    pool: poolName,
    filename: safeName,
    vector_store_id: vectorStoreId,
    openai_file_id: fileId,
    status: entry.status,
    file_count: nextFiles.length,
    indexed_count: nextFiles.filter((f) => f.status === "completed").length,
  };
}

/**
 * @param {string} poolName sanitized
 * @param {string} query
 * @param {{ maxResults?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function searchKnowledgePool(poolName, query, options = {}) {
  const manifest = readManifest(poolName);
  if (!manifest) {
    return { ok: false, error: "unknown_pool", message: `Knowledge pool "${poolName}" does not exist.` };
  }
  if (!knowledgePoolReady(manifest)) {
    return {
      ok: false,
      error: "pool_not_ready",
      message: "Knowledge pool has no indexed files yet. Upload documents in the workbench first.",
    };
  }
  const q = String(query || "").trim();
  if (!q) {
    return { ok: false, error: "empty_query", message: "Missing search query." };
  }

  const raw = await searchVectorStore(String(manifest.vector_store_id), q, options);
  /** @type {object[]} */
  const hits = [];
  for (const row of raw.data || []) {
    const parts = Array.isArray(row.content) ? row.content.map((c) => c.text || "").filter(Boolean) : [];
    hits.push({
      filename: row.filename || null,
      file_id: row.file_id || null,
      score: row.score ?? null,
      text: parts.join("\n"),
    });
  }
  return {
    ok: true,
    pool: poolName,
    query: q,
    result_count: hits.length,
    results: hits,
  };
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
export function resolveKnowledgePoolName(plan) {
  const block = plan.blocks.find((b) => b.role === "process" && b.typeId === "vector-db");
  if (!block) return null;
  const raw = String(block.values?.knowledgePool ?? block.values?.knowledge_pool ?? "").trim();
  return sanitizeKnowledgePoolName(raw) || null;
}

/**
 * @param {string} poolName sanitized
 */
export function knowledgePoolExists(poolName) {
  return fs.existsSync(knowledgePoolManifestPath(poolName));
}
