import { describe, expect, it } from "vitest";
import { buildFullRealtimeInstructions } from "../src/orchestrateRealtime.js";
import { mintRealtimeClientSecret, pickOutputModalities, pickTurnDetection, pickVoice } from "../src/realtimeSession.js";

describe("realtimeSession helpers", () => {
  it("merges instruction and skill snippets via orchestration", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "process", typeId: "instruction", values: { system: "Hello" } },
        { role: "process", typeId: "skills", values: { skillPreset: "workshop-writing" } },
        { role: "output", typeId: "text", values: {} },
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

  it("keeps server VAD for push-to-talk (client mutes the mic)", () => {
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "ptt" } }],
      }),
    ).toMatchObject({ type: "server_vad", create_response: true });
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "vad" } }],
      }),
    ).toMatchObject({ type: "server_vad" });
  });
});

describe("mintRealtimeClientSecret", () => {
  it("enables input audio transcription when a live audio input is present", async () => {
    let body;
    const fetchImpl = async (url, init) => {
      body = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: "ek_test", expires_at: 1 }),
      };
    };
    await mintRealtimeClientSecret(
      {
        blocks: [
          { role: "input", typeId: "audio-live", values: {} },
          { role: "output", typeId: "text", values: {} },
        ],
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(body.session.audio.input.transcription).toMatchObject({
      model: expect.any(String),
    });
  });

  it("posts to OpenAI client_secrets and returns value", async () => {
    const fetchImpl = async (url, init) => {
      expect(String(url)).toContain("/realtime/client_secrets");
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body.session.type).toBe("realtime");
      expect(String(body.session.instructions)).toContain("Configured workshop outputs");
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
