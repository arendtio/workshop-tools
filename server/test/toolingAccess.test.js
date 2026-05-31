import { describe, expect, it } from "vitest";
import {
  buildToolingInstructionParagraph,
  formatToolingGrantsSummary,
  migrateLegacyToolingValues,
  parseToolingGrants,
} from "../src/toolingAccess.js";

describe("toolingAccess", () => {
  it("migrates legacy accessMode + serviceDomain", () => {
    const v = migrateLegacyToolingValues({ accessMode: "write", serviceDomain: "orders" });
    expect(v.svc_orders_read).toBe("1");
    expect(v.svc_orders_write).toBe("1");
    expect(v.svc_customers_read).toBe("0");
  });

  it("legacy shop grants both shop and products", () => {
    const grants = parseToolingGrants({ accessMode: "read", serviceDomain: "shop" });
    expect(grants.map((g) => g.id).sort()).toEqual(["products", "shop"]);
    expect(grants.every((g) => g.read && !g.write)).toBe(true);
  });

  it("write checkbox implies read in grants", () => {
    const grants = parseToolingGrants({
      svc_customers_read: "0",
      svc_customers_write: "1",
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].read).toBe(true);
    expect(grants[0].write).toBe(true);
  });

  it("formats summary and instructions for multiple domains", () => {
    const grants = parseToolingGrants({
      svc_customers_read: "1",
      svc_orders_read: "1",
      svc_orders_write: "1",
    });
    expect(formatToolingGrantsSummary(grants)).toContain("Kundendaten: Lesen");
    expect(formatToolingGrantsSummary(grants)).toContain("Auftragsdaten: Lesen + Schreiben");
    const text = buildToolingInstructionParagraph(grants);
    expect(text).toContain("customers");
    expect(text).toContain("read-only");
    expect(text).toContain("create, update");
  });
});
