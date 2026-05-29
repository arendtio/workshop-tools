/** @type {readonly string[]} */
export const INPUT_TYPE_IDS = [
  "text",
  "image",
  "form",
  "dynamic-ui",
  "audio-rec",
  "audio-live",
];

/** @type {readonly string[]} */
export const PROCESS_TYPE_IDS = [
  "instruction",
  "vector-db",
  "tooling",
  "skills",
  "log-generator",
  "log-analyzer",
];

/** @type {readonly string[]} */
export const OUTPUT_TYPE_IDS = [
  "text",
  "image",
  "form",
  "dynamic-ui",
  "audio",
  "audio-live",
];

/** Types that imply a Realtime (WebRTC) workshop path when present. */
export const LIVE_INPUT_TYPES = new Set(["audio-live"]);
export const LIVE_OUTPUT_TYPES = new Set(["audio-live"]);

export function isKnownBlock(role, typeId) {
  if (role === "input") return INPUT_TYPE_IDS.includes(typeId);
  if (role === "process") return PROCESS_TYPE_IDS.includes(typeId);
  if (role === "output") return OUTPUT_TYPE_IDS.includes(typeId);
  return false;
}

export function planUsesRealtime(blocks) {
  for (const b of blocks) {
    if (b.role === "input" && LIVE_INPUT_TYPES.has(b.typeId)) return true;
    if (b.role === "output" && LIVE_OUTPUT_TYPES.has(b.typeId)) return true;
  }
  return false;
}
