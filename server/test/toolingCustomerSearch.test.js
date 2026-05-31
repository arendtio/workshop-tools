import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeToolingDatabaseForTests, runToolingMockCall } from "../src/toolingMock/store.js";

describe("tooling customer search", () => {
  /** @type {string | undefined} */
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-tooling-search-"));
    process.env.WORKSHOP_TOOLING_MOCK_DIR = tmpDir;
    closeToolingDatabaseForTests();
  });

  afterEach(() => {
    closeToolingDatabaseForTests();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.WORKSHOP_TOOLING_MOCK_DIR;
  });

  it("finds customer by German vorname/nachname aliases", () => {
    const sample = runToolingMockCall({
      domain: "customers",
      operation: "list",
      filter: { sample: true },
      limit: 1,
    });
    expect(sample.ok).toBe(true);
    const ref = sample.data[0];

    const hit = runToolingMockCall({
      domain: "customers",
      operation: "list",
      filter: { vorname: ref.firstName, nachname: ref.lastName },
    });
    expect(hit.ok).toBe(true);
    expect(hit.data.some((c) => c.id === ref.id)).toBe(true);
  });

  it("customer rows have no shop assignment", () => {
    const rows = runToolingMockCall({
      domain: "customers",
      operation: "list",
      filter: { sample: true },
      limit: 5,
    });
    expect(rows.ok).toBe(true);
    for (const c of rows.data) {
      expect(c.shopId).toBeUndefined();
      expect(c.shopNumber).toBeUndefined();
    }
  });
});
