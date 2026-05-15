import { describe, expect, it } from "vitest";
import { buildFullRealtimeInstructions } from "../src/orchestrateRealtime.js";
import {
  buildRealtimePostConnectSession,
  mintRealtimeClientSecret,
  pickOutputModalities,
  pickTurnDetection,
  pickVoice,
} from "../src/realtimeSession.js";

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
    expect(
      pickOutputModalities({
        blocks: [
          { role: "output", typeId: "text", values: {} },
          { role: "output", typeId: "audio-live", values: {} },
        ],
      }),
    ).toEqual(["audio"]);
  });

  it("picks voice from output block", () => {
    expect(
      pickVoice({
        blocks: [{ role: "output", typeId: "audio-live", values: { voice: "sage" } }],
      }),
    ).toBe("sage");
  });

  it("uses semantic VAD (no server_vad idle_timeout path; PTT still mutes the mic in-browser)", () => {
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "ptt" } }],
      }),
    ).toMatchObject({ type: "semantic_vad", eagerness: "low", create_response: true });
    expect(
      pickTurnDetection({
        blocks: [{ role: "input", typeId: "audio-live", values: { turnTaking: "vad" } }],
      }),
    ).toMatchObject({ type: "semantic_vad", create_response: true });
  });
});

describe("buildRealtimePostConnectSession", () => {
  it("omits input turn_detection when there is no live microphone input", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "text", values: { content: "hi" } },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(session.audio.input.turn_detection).toBeNull();
    expect(session.audio.input.transcription).toBeUndefined();
  });

  it("enables input transcription for audio-rec without live mic", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "audio-rec", values: {} },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(session.audio.input.turn_detection).toBeNull();
    expect(session.audio.input.transcription).toMatchObject({ model: expect.any(String) });
  });

  it("includes input audio transcription when a live audio input is present", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "audio-live", values: {} },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(session.audio.input.transcription).toMatchObject({
      model: expect.any(String),
    });
  });

  it("includes instructions and modalities from the plan", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(String(session.instructions)).toContain("Configured workshop outputs");
    expect(session.output_modalities).toEqual(["text"]);
  });

  it("registers workshop_generate_image when output:image is present", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "text", values: { content: "hi" } },
        { role: "output", typeId: "text", values: {} },
        { role: "output", typeId: "image", values: { size: "1024x1024" } },
      ],
    });
    expect(session.tool_choice).toBe("auto");
    expect(Array.isArray(session.tools)).toBe(true);
    expect(session.tools?.map((t) => t.name)).toContain("workshop_generate_image");
  });

  it("registers speech + form + dynamic UI tools when those outputs exist", () => {
    const session = buildRealtimePostConnectSession({
      blocks: [
        { role: "input", typeId: "text", values: { content: "hi" } },
        { role: "output", typeId: "audio", values: { voice: "alloy" } },
        { role: "output", typeId: "form", values: {} },
        { role: "output", typeId: "dynamic-ui", values: {} },
      ],
    });
    expect(session.tool_choice).toBe("auto");
    const names = session.tools?.map((t) => t.name) ?? [];
    expect(names).toContain("workshop_synthesize_speech");
    expect(names).toContain("workshop_emit_form_values");
    expect(names).toContain("workshop_emit_dynamic_ui");
    expect(names).not.toContain("workshop_generate_image");
  });
});

describe("mintRealtimeClientSecret", () => {
  it("mints for text-only pipelines (no live audio modules)", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ value: "ek_text_only", expires_at: 2 }),
    });
    const out = await mintRealtimeClientSecret(
      {
        blocks: [
          { role: "input", typeId: "text", values: { content: "hi" } },
          { role: "output", typeId: "text", values: {} },
        ],
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.value).toBe("ek_text_only");
  });

  it("mints with minimal session (type + model only)", async () => {
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
    expect(body.session).toMatchObject({ type: "realtime", model: expect.any(String) });
    expect(Object.keys(body.session).sort()).toEqual(["model", "type"].sort());
    expect(body.session.instructions).toBeUndefined();
  });

  it("posts to OpenAI client_secrets and returns value", async () => {
    const fetchImpl = async (url, init) => {
      expect(String(url)).toContain("/realtime/client_secrets");
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      expect(body.session.type).toBe("realtime");
      expect(Object.keys(body.session).sort()).toEqual(["model", "type"].sort());
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
