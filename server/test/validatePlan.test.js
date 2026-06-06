import { describe, expect, it } from "vitest";
import { validatePlan } from "../src/validatePlan.js";

describe("validatePlan", () => {
  it("rejects empty pipeline", () => {
    const r = validatePlan({ version: 1, blocks: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === "EMPTY_PIPELINE")).toBe(true);
    }
  });

  it("rejects unknown module types", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "text", values: {} },
        { id: "2", role: "output", typeId: "text", values: {} },
        { id: "3", role: "input", typeId: "not-a-type", values: {} },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate role+type pairs", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "text", values: {} },
        { id: "2", role: "input", typeId: "text", values: {} },
        { id: "3", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === "DUPLICATE_MODULE")).toBe(true);
    }
  });

  it("accepts a simple text pipeline as static", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "text", values: { content: "hi" } },
        { id: "2", role: "process", typeId: "instruction", values: { system: "Be brief." } },
        { id: "3", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("static");
  });

  it("accepts optional workshop session ids on the plan", () => {
    const r = validatePlan({
      version: 1,
      toolingMockReady: true,
      toolingMockSessionId: "tm-1",
      dynamicUiSessionId: "du-1",
      blocks: [
        { id: "1", role: "input", typeId: "text", values: { content: "hi" } },
        { id: "2", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.toolingMockReady).toBe(true);
      expect(r.plan.toolingMockSessionId).toBe("tm-1");
      expect(r.plan.dynamicUiSessionId).toBe("du-1");
    }
  });

  it("marks live audio pipelines as realtime", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
        { id: "2", role: "process", typeId: "instruction", values: { system: "x" } },
        { id: "3", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("realtime");
  });

  it("marks live video input pipelines as realtime", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "video-live", values: { videoSource: "display", frameRate: "1" } },
        { id: "2", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("realtime");
  });

  it("marks live audio output-only pipelines as realtime", () => {
    const r = validatePlan({
      version: 1,
      blocks: [
        { id: "1", role: "input", typeId: "text", values: { content: "hi" } },
        { id: "2", role: "output", typeId: "audio-live", values: { voice: "marin" } },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("realtime");
  });
});
