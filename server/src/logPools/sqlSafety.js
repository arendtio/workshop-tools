const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ATTACH|DETACH|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|VACUUM|REINDEX)\b/i;

/**
 * @param {string} sql
 * @returns {{ ok: true, sql: string } | { ok: false, error: string }}
 */
export function validateReadOnlySelect(sql) {
  const raw = String(sql ?? "").trim();
  if (!raw) {
    return { ok: false, error: "empty_sql" };
  }
  if (raw.includes(";")) {
    return { ok: false, error: "multiple_statements" };
  }
  if (!/^\s*SELECT\b/i.test(raw)) {
    return { ok: false, error: "select_only" };
  }
  if (FORBIDDEN.test(raw)) {
    return { ok: false, error: "forbidden_keyword" };
  }
  return { ok: true, sql: raw };
}
