import { describe, expect, it, vi, afterEach } from "vitest";
import { generateWorkshopSpeechFromPlan, planHasSpeechFileOutput } from "../src/speechGeneration.js";

describe("speechGeneration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("detects file speech output vs live", () => {
    expect(planHasSpeechFileOutput({ blocks: [{ role: "output", typeId: "audio-live" }] })).toBe(false);
    expect(planHasSpeechFileOutput({ blocks: [{ role: "output", typeId: "audio" }] })).toBe(true);
  });

  it("POSTs to audio/speech and returns a data URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([10, 11]).buffer,
      })),
    );
    const out = await generateWorkshopSpeechFromPlan(
      {
        blocks: [{ role: "output", typeId: "audio", values: { voice: "alloy" } }],
      },
      "hi there",
      { apiKey: "sk-x", fetchImpl: fetch },
    );
    expect(out.data_url.startsWith("data:audio/mpeg;base64,")).toBe(true);
    expect(out.voice).toBe("alloy");
  });
});
