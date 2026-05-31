import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeToolingDatabaseForTests } from "../src/toolingMock/store.js";
import { simulateLogEvents } from "../src/logPools/simulator.js";
import { loadToolingRefsForLogs } from "../src/logPools/toolingRefs.js";
import { generateLogPool, runLogPoolSql } from "../src/logPools/store.js";

describe("log pools tooling refs", () => {
  /** @type {string | undefined} */
  let logDir;
  /** @type {string | undefined} */
  let toolingDir;

  beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "wk-log-tooling-"));
    logDir = path.join(base, "logs");
    toolingDir = path.join(base, "tooling");
    fs.mkdirSync(logDir, { recursive: true });
    process.env.WORKSHOP_LOG_POOLS_DIR = logDir;
    process.env.WORKSHOP_TOOLING_MOCK_DIR = toolingDir;
    closeToolingDatabaseForTests();
  });

  afterEach(() => {
    closeToolingDatabaseForTests();
    if (logDir) {
      fs.rmSync(path.dirname(logDir), { recursive: true, force: true });
    }
    delete process.env.WORKSHOP_LOG_POOLS_DIR;
    delete process.env.WORKSHOP_TOOLING_MOCK_DIR;
    logDir = undefined;
    toolingDir = undefined;
  });

  it("loadToolingRefsForLogs returns shops, orders, and products", () => {
    const refs = loadToolingRefsForLogs();
    expect(refs).not.toBeNull();
    expect(refs.shops.length).toBeGreaterThan(1000);
    expect(refs.orders.length).toBeGreaterThan(500);
    expect(refs.products.length).toBeGreaterThan(40);
    expect(refs.shops[0].number).toMatch(/^\d{4}$/);
  });

  it("generated log messages use tooling shop and order ids", () => {
    const refs = loadToolingRefsForLogs();
    expect(refs).not.toBeNull();
    const gen = generateLogPool({
      name: "tooling-aligned",
      target_size_mb: 0.5,
      seed: 7,
    });
    expect(gen.ok).toBe(true);

    const sample = runLogPoolSql(
      "tooling-aligned",
      "SELECT message FROM events WHERE message LIKE '%Auftrag ord-%' LIMIT 5",
    );
    expect(sample.ok).toBe(true);
    if (sample.ok) {
      expect(sample.rows.length).toBeGreaterThan(0);
      expect(String(sample.rows[0].message)).toMatch(/ord-\d+/);
    }

    const shopSample = runLogPoolSql(
      "tooling-aligned",
      "SELECT message FROM events WHERE message LIKE '%Shop 1%' LIMIT 3",
    );
    expect(shopSample.ok).toBe(true);
    if (shopSample.ok && shopSample.rows.length) {
      expect(String(shopSample.rows[0].message)).toMatch(/Shop 1\d{3}/);
    }
  });

  it("generateLogPool seeds tooling sqlite before log generator-only use", () => {
    const dbFile = path.join(toolingDir, "workshop.sqlite");
    expect(fs.existsSync(dbFile)).toBe(false);
    const gen = generateLogPool({ name: "seed-via-log", target_size_mb: 0.2, seed: 3 });
    expect(gen.ok).toBe(true);
    expect(fs.existsSync(dbFile)).toBe(true);
    const refs = loadToolingRefsForLogs();
    expect(refs?.shops.length).toBeGreaterThan(1000);
  });

  it("simulator falls back when tooling refs missing", () => {
    /** @type {object[]} */
    const rows = [];
    const sim = simulateLogEvents({
      scenarioPreset: "shop-package-lifecycle",
      targetBytes: 50_000,
      seed: 1,
      toolingRefs: null,
      onBatch: (batch) => rows.push(...batch),
    });
    expect(sim.rowCount).toBeGreaterThan(10);
    expect(rows[0].message).toMatch(/Shop \d{4}/);
  });
});
