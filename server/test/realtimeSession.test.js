import { describe, expect, it } from "vitest";
import {
  buildRealtimeInstructions,
  mintRealtimeClientSecret,
  pickOutputModalities,
  pickTurnDetection,
  pickVoice,
} from "../src/realtimeSession.js";

describe("realtimeSession helpers", () => {
  it("merges instruction and skill snippets", () => {
    const text = buildRealtimeInstructions({
      blocks: [
        { role: "process", typeId: "instruction", values: { system: "Hello" } },
        { role: "process", typeId: "skills", values: { skillPreset: "workshop-writing" } },
      ],
    });
    expect(text).toContain("Hello");
    expect(text.toLowerCase()).toContain("writing");
  });

  it("picks audio modality when audio-live output exists", () => {
    expect(
      pickOutputModalities({
        blocks: [{ role: "output", typeId: "audio-live", values: {} }],
      }),
    ).toEqual(["audio"]);
    expect(
      pickOutputModalities({
        blocks: [{ role: "output", typeId: "text", values: {} }],
      }),
    ).toEqual(["text"]);
  });

  it("picks voice from output block", () => {
    expect(
      pickVoice({
        blocks: [{ role: "output", typeId: "audio-live", values: { voice: "sage" } }],
      }),
    ).toBe("sage");
  });

  it("disables server VAD for push-to-talk", () => {
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "ptt" } }],
      }),
    ).toBeNull();
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "vad" } }],
      }),
    ).toMatchObject({ type: "server_vad" });
  });
});

describe("mintRealtimeClientSecret", () => {
  it("posts to OpenAI client_secrets and returns value", async () => {
    const fetchImpl = async (url, init) => {
      expect(String(url)).toContain("/realtime/client_secrets");
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body.session.type).toBe("realtime");
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            value: "ek_test_123",
            expires_at: 999,
          }),
      };
    };

    const out = await mintRealtimeClientSecret(
      {
        blocks: [
          { role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
          { role: "output", typeId: "text", values: {} },
        ],
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.value).toBe("ek_test_123");
    expect(out.expires_at).toBe(999);
  });
});
