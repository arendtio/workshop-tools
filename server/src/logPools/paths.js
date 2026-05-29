import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __logPoolsDirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  return path.resolve(__logPoolsDirname, "..", "..", "..");
}

const POOL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * @param {string} raw
 */
export function sanitizePoolName(raw) {
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

export function getLogPoolsDir() {
  const override = String(process.env.WORKSHOP_LOG_POOLS_DIR ?? "").trim();
  if (override) return path.resolve(override);
  return path.join(resolveRepoRoot(), "data", "log-pools");
}

export function ensureLogPoolsDir() {
  const dir = getLogPoolsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {string} poolName sanitized
 */
export function poolDbPath(poolName) {
  return path.join(ensureLogPoolsDir(), `${poolName}.sqlite`);
}
