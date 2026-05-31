export const LIST_LIMIT_DEFAULT = 100;
export const LIST_LIMIT_MAX = 100;

/**
 * @param {unknown} raw
 */
export function parseListLimit(raw) {
  const n = Number(
    raw != null && typeof raw === "object" && "limit" in raw ? /** @type {{ limit?: unknown }} */ (raw).limit : raw,
  );
  if (!Number.isFinite(n)) return LIST_LIMIT_DEFAULT;
  return Math.max(1, Math.min(LIST_LIMIT_MAX, Math.floor(n)));
}

/**
 * @param {unknown} filter
 */
export function parseListOffset(filter) {
  if (!filter || typeof filter !== "object") return 0;
  const n = Number(/** @type {{ offset?: unknown }} */ (filter).offset);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * @param {unknown} filter
 * @param {readonly string[]} keys
 */
export function filterHasAny(filter, keys) {
  if (!filter || typeof filter !== "object") return false;
  const f = /** @type {Record<string, unknown>} */ (filter);
  if (f.sample === true || f.sample === "true" || f.sample === 1 || f.sample === "1") return true;
  return keys.some((k) => {
    const v = f[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

/**
 * @param {unknown} v
 */
export function strVal(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function numVal(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
