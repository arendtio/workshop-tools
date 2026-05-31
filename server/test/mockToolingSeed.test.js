import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MOCK_TOOLING_SEED_CONFIG } from "../src/mockToolingSeed/build.js";
import { closeToolingDatabaseForTests, runToolingMockCall } from "../src/toolingMock/store.js";

describe("mockToolingSeed", () => {
  /** @type {string | undefined} */
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-tooling-"));
    process.env.WORKSHOP_TOOLING_MOCK_DIR = tmpDir;
    closeToolingDatabaseForTests();
  });

  afterEach(() => {
    closeToolingDatabaseForTests();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.WORKSHOP_TOOLING_MOCK_DIR;
  });

  it("seeds SQLite with shops 1000–2000 and linked data", () => {
    const shops = runToolingMockCall({
      domain: "shop",
      operation: "list",
      filter: { number_min: 1000, number_max: 1002 },
      limit: 10,
    });
    expect(shops.ok).toBe(true);
    expect(shops.data).toHaveLength(3);

    const noFilter = runToolingMockCall({ domain: "orders", operation: "list", filter: {} });
    expect(noFilter.ok).toBe(false);
    expect(noFilter.error).toBe("filter_required");

    const cust = runToolingMockCall({
      domain: "customers",
      operation: "list",
      filter: { zip: shops.data[0] ? "10115" : "00000" },
      limit: 5,
    });
    if (cust.ok && cust.data.length) {
      expect(cust.data[0].address).toMatch(/\d{5}/);
    }

    const orders = runToolingMockCall({
      domain: "orders",
      operation: "list",
      filter: { customer_id: "cust-000001" },
      limit: 20,
    });
    expect(orders.ok).toBe(true);
    expect(orders.data.length).toBeGreaterThanOrEqual(1);
    expect(orders.data.length).toBeLessThanOrEqual(20);
  });

  it("caps list at 100 rows", () => {
    const out = runToolingMockCall({
      domain: "shop",
      operation: "list",
      filter: { number_min: 1000, number_max: 2000 },
      limit: 500,
    });
    expect(out.ok).toBe(true);
    expect(out.data.length).toBeLessThanOrEqual(100);
  });

  it("persists updates across calls", () => {
    const listed = runToolingMockCall({
      domain: "customers",
      operation: "list",
      filter: { customer_id: "cust-000001" },
    });
    expect(listed.ok).toBe(true);
    const id = listed.data[0].id;
    runToolingMockCall({
      domain: "customers",
      operation: "update",
      id,
      record: { ort: "Köln" },
    });
    const got = runToolingMockCall({ domain: "customers", operation: "get", id });
    expect(got.data.ort).toBe("Köln");
  });

  it("seed config matches expected volume", () => {
    expect(MOCK_TOOLING_SEED_CONFIG.shopNumberMax - MOCK_TOOLING_SEED_CONFIG.shopNumberMin + 1).toBe(
      1001,
    );
    expect(MOCK_TOOLING_SEED_CONFIG.customerCount).toBe(800);
  });
});
