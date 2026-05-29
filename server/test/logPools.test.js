import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizePoolName } from "../src/logPools/paths.js";
import { validateReadOnlySelect } from "../src/logPools/sqlSafety.js";
import { generateLogPool, listLogPools, runLogPoolSql } from "../src/logPools/store.js";

describe("log pools", () => {
  /** @type {string | undefined} */
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.WORKSHOP_LOG_POOLS_DIR;
      tmpDir = undefined;
    }
  });

  function useTmpDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workshop-log-pools-"));
    process.env.WORKSHOP_LOG_POOLS_DIR = tmpDir;
  }

  it("sanitizes pool names", () => {
    expect(sanitizePoolName("Shop Demo")).toBe("shop-demo");
    expect(sanitizePoolName("!!!")).toBeNull();
  });

  it("rejects unsafe SQL", () => {
    expect(validateReadOnlySelect("SELECT 1").ok).toBe(true);
    expect(validateReadOnlySelect("DELETE FROM events").ok).toBe(false);
    expect(validateReadOnlySelect("SELECT 1; DROP TABLE events").ok).toBe(false);
  });

  it("generates, lists, overwrites, and queries a pool", () => {
    useTmpDir();
    const small = generateLogPool({
      name: "test-pool",
      target_size_mb: 1,
      scenario_preset: "shop-package-lifecycle",
      error_path_percent: 25,
      seed: 42,
    });
    expect(small.ok).toBe(true);
    if (!small.ok) return;
    expect(small.row_count).toBeGreaterThan(1000);
    expect(small.size_bytes).toBeGreaterThan(500_000);

    const listed = listLogPools();
    expect(listed.pools.some((p) => p.name === "test-pool")).toBe(true);

    const q = runLogPoolSql("test-pool", "SELECT priority, COUNT(*) AS c FROM events GROUP BY priority");
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.rows.length).toBeGreaterThan(0);
    }

    const again = generateLogPool({ name: "test-pool", target_size_mb: 1, seed: 99 });
    expect(again.ok).toBe(true);
    const listed2 = listLogPools();
    expect(listed2.pools.filter((p) => p.name === "test-pool")).toHaveLength(1);
  });
});
