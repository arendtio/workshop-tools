import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

export function getToolingMockDir() {
  const override = String(process.env.WORKSHOP_TOOLING_MOCK_DIR ?? "").trim();
  if (override) return path.resolve(override);
  return path.join(resolveRepoRoot(), "data", "tooling-mock");
}

export function ensureToolingMockDir() {
  const dir = getToolingMockDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function toolingDbPath() {
  return path.join(ensureToolingMockDir(), "workshop.sqlite");
}
