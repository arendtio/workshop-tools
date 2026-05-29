import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

const POOL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/** @param {string} raw */
export function sanitizeKnowledgePoolName(raw) {
  const name = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  if (!name || !POOL_NAME_RE.test(name)) {
    return null;
  }
  return name;
}

export function getKnowledgePoolsDir() {
  const override = String(process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR ?? "").trim();
  if (override) return path.resolve(override);
  return path.join(resolveRepoRoot(), "data", "knowledge-pools");
}

export function ensureKnowledgePoolsDir() {
  const dir = getKnowledgePoolsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** @param {string} poolName sanitized */
export function knowledgePoolDir(poolName) {
  return path.join(ensureKnowledgePoolsDir(), poolName);
}

/** @param {string} poolName sanitized */
export function knowledgePoolManifestPath(poolName) {
  return path.join(knowledgePoolDir(poolName), "manifest.json");
}

/** @param {string} poolName sanitized @param {string} safeFilename */
export function knowledgePoolFilePath(poolName, safeFilename) {
  return path.join(knowledgePoolDir(poolName), "files", safeFilename);
}
