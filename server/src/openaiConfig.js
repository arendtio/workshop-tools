import fs from "fs";

/**
 * Load `OPENAI_API_KEY` from `OPENAI_API_KEY_FILE` when the env var is unset
 * (Docker Compose / Swarm secrets mounted under `/run/secrets/...`).
 */
export function ensureOpenAiApiKeyLoaded() {
  if (String(process.env.OPENAI_API_KEY || "").trim()) return;
  const path = String(process.env.OPENAI_API_KEY_FILE || "").trim();
  if (!path) return;
  try {
    const key = fs.readFileSync(path, "utf8").trim();
    if (key) process.env.OPENAI_API_KEY = key;
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    console.warn(`Could not read OPENAI_API_KEY_FILE (${path}): ${msg}`);
  }
}
