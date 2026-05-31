import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ensureToolingMockSeeded } from "../toolingMock/store.js";
import { simulateLogEvents } from "./simulator.js";
import { loadToolingRefsForLogs } from "./toolingRefs.js";
import { validateReadOnlySelect } from "./sqlSafety.js";
import { ensureLogPoolsDir, poolDbPath, sanitizePoolName } from "./paths.js";

const SCHEMA_VERSION = "1";
const MAX_SQL_ROWS = 500;

const DDL = `
CREATE TABLE IF NOT EXISTS pool_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  priority TEXT NOT NULL,
  message_key TEXT NOT NULL,
  message TEXT NOT NULL,
  param1 TEXT,
  param2 TEXT,
  param3 TEXT,
  entity_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);
CREATE INDEX IF NOT EXISTS idx_events_message_key ON events(message_key);
CREATE INDEX IF NOT EXISTS idx_events_param1 ON events(param1);
CREATE INDEX IF NOT EXISTS idx_events_param2 ON events(param2);
CREATE INDEX IF NOT EXISTS idx_events_param3 ON events(param3);
CREATE INDEX IF NOT EXISTS idx_events_entity_id ON events(entity_id);
`;

const INSERT_EVENT = `
INSERT INTO events (ts, priority, message_key, message, param1, param2, param3, entity_id)
VALUES (@ts, @priority, @message_key, @message, @param1, @param2, @param3, @entity_id)
`;

function setMeta(db, key, value) {
  db.prepare(
    `INSERT INTO pool_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function readMetaMap(db) {
  /** @type {Record<string, string>} */
  const out = {};
  const rows = db.prepare("SELECT key, value FROM pool_meta").all();
  for (const row of rows) {
    out[String(row.key)] = String(row.value);
  }
  return out;
}

/**
 * @returns {{ pools: { name: string, row_count: number, size_bytes: number, created_at: string | null, schema_version: string | null }[] }}
 */
export function listLogPools() {
  ensureLogPoolsDir();
  const dir = ensureLogPoolsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sqlite"));
  /** @type {{ name: string, row_count: number, size_bytes: number, created_at: string | null, schema_version: string | null }[]} */
  const pools = [];
  for (const file of files) {
    const name = file.replace(/\.sqlite$/, "");
    const full = path.join(dir, file);
    let row_count = 0;
    let created_at = null;
    let schema_version = null;
    try {
      const db = new Database(full, { readonly: true });
      const meta = readMetaMap(db);
      row_count = Number(meta.row_count || 0);
      created_at = meta.created_at || null;
      schema_version = meta.schema_version || null;
      db.close();
    } catch {
      row_count = 0;
    }
    pools.push({
      name,
      row_count,
      size_bytes: fs.statSync(full).size,
      created_at,
      schema_version,
    });
  }
  pools.sort((a, b) => a.name.localeCompare(b.name));
  return { pools };
}

/**
 * @param {string} poolName sanitized
 */
export function logPoolExists(poolName) {
  return fs.existsSync(poolDbPath(poolName));
}

/**
 * @param {object} raw
 */
export function generateLogPool(raw) {
  ensureToolingMockSeeded();
  const name = sanitizePoolName(raw.name);
  if (!name) {
    return { ok: false, error: "invalid_name", message: "Pool name must be alphanumeric (hyphens/underscores allowed)." };
  }

  const targetMb = Number(raw.target_size_mb ?? raw.targetSizeMb ?? 10);
  const targetBytes = Math.round(Math.max(1, Math.min(50, targetMb)) * 1024 * 1024);
  const scenarioPreset = String(raw.scenario_preset ?? raw.scenarioPreset ?? "shop-package-lifecycle").trim();
  const errorPathPercent = Number(raw.error_path_percent ?? raw.errorPathPercent ?? NaN);

  const dbPath = poolDbPath(name);
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);
  db.exec(DDL);
  const insert = db.prepare(INSERT_EVENT);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });

  const toolingRefs = loadToolingRefsForLogs();
  const sim = simulateLogEvents({
    scenarioPreset,
    targetBytes,
    errorPathPercent: Number.isFinite(errorPathPercent) ? errorPathPercent : undefined,
    seed: raw.seed != null ? Number(raw.seed) : undefined,
    toolingRefs,
    onBatch: (rows) => insertMany(rows),
  });

  const sizeBytes = fs.statSync(dbPath).size;
  const createdAt = new Date().toISOString();
  setMeta(db, "name", name);
  setMeta(db, "schema_version", SCHEMA_VERSION);
  setMeta(db, "created_at", createdAt);
  setMeta(db, "row_count", String(sim.rowCount));
  setMeta(db, "byte_size", String(sizeBytes));
  setMeta(db, "seed", String(sim.seed));
  setMeta(db, "config_json", JSON.stringify(sim.config));
  db.close();

  return {
    ok: true,
    name,
    row_count: sim.rowCount,
    size_bytes: sizeBytes,
    target_bytes: targetBytes,
    scenario_preset: scenarioPreset,
    seed: sim.seed,
    message_keys: sim.config.message_keys,
    overwritten: true,
  };
}

/**
 * @param {string} poolName sanitized
 */
export function getLogPoolSummary(poolName) {
  if (!logPoolExists(poolName)) {
    return { ok: false, error: "unknown_pool" };
  }
  const db = new Database(poolDbPath(poolName), { readonly: true });
  const meta = readMetaMap(db);
  const priorities = db
    .prepare(
      `SELECT priority, COUNT(*) AS c FROM events GROUP BY priority ORDER BY c DESC`,
    )
    .all();
  const topKeys = db
    .prepare(
      `SELECT message_key, COUNT(*) AS c FROM events GROUP BY message_key ORDER BY c DESC LIMIT 12`,
    )
    .all();
  db.close();
  return {
    ok: true,
    name: poolName,
    row_count: Number(meta.row_count || 0),
    size_bytes: Number(meta.byte_size || 0),
    created_at: meta.created_at || null,
    schema_version: meta.schema_version || SCHEMA_VERSION,
    priorities,
    top_message_keys: topKeys,
  };
}

/**
 * @param {string} poolName sanitized
 * @param {string} sql
 */
export function runLogPoolSql(poolName, sql) {
  if (!logPoolExists(poolName)) {
    return { ok: false, error: "unknown_pool", message: `Log pool "${poolName}" does not exist.` };
  }
  const checked = validateReadOnlySelect(sql);
  if (!checked.ok) {
    return { ok: false, error: checked.error, message: "Only a single read-only SELECT is allowed." };
  }

  const db = new Database(poolDbPath(poolName), { readonly: true });
  try {
    const stmt = db.prepare(checked.sql);
    if (!stmt.readonly) {
      return { ok: false, error: "not_readonly", message: "Statement is not read-only." };
    }
    const rows = [];
    for (const row of stmt.iterate()) {
      rows.push(row);
      if (rows.length > MAX_SQL_ROWS) break;
    }
    return {
      ok: true,
      row_count: rows.length,
      truncated: rows.length >= MAX_SQL_ROWS,
      rows,
    };
  } catch (e) {
    return {
      ok: false,
      error: "sql_error",
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    db.close();
  }
}

/**
 * @param {{ blocks: { role: string, typeId: string, values?: Record<string, string> }[] }} plan
 */
export function resolveAnalyzerPoolName(plan) {
  const block = plan.blocks.find((b) => b.role === "process" && b.typeId === "log-analyzer");
  if (!block) return null;
  const raw = String(block.values?.logPool ?? block.values?.log_pool ?? "").trim();
  return sanitizePoolName(raw) || null;
}
