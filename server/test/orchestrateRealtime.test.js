import { describe, expect, it } from "vitest";
import { buildFullRealtimeInstructions, buildRealtimeBootstrapClientEvents } from "../src/orchestrateRealtime.js";

describe("orchestrateRealtime", () => {
  it("includes vector and tooling context in instructions", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "process", typeId: "instruction", values: { system: "Base" } },
        {
          role: "process",
          typeId: "vector-db",
          values: { knowledgeFiles: "notes.pdf" },
        },
        {
          role: "process",
          typeId: "tooling",
          values: { accessMode: "read", serviceDomain: "orders" },
        },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(text).toContain("notes.pdf");
    expect(text).toContain("Auftragsdaten");
  });

  it("creates one bootstrap user item per non-live input in pipeline order", () => {
    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        { id: "i1", role: "input", typeId: "text", values: { content: "Hi" } },
        { id: "i2", role: "input", typeId: "audio-live", values: {} },
        { id: "o1", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("conversation.item.create");
    expect(events[0].item.content[0].text).toContain("Hi");
  });

  it("defers audio-rec input to the client (no bootstrap item)", () => {
    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        { id: "a", role: "input", typeId: "audio-rec", values: { uploadStub: "", recordingStub: "x.webm" } },
        { id: "o", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("defers file-based image input to the client (no bootstrap item)", () => {
    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        {
          id: "img",
          role: "input",
          typeId: "image",
          values: { imageSource: "file", uploadStub: "photo.jpg", imageUrl: "" },
        },
        { id: "o", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(events).toHaveLength(0);
  });

  it("tells the model to defer image tool until live user instructions", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
        { role: "input", typeId: "image", values: { imageSource: "file" } },
        { role: "output", typeId: "image", values: { size: "1024x1024" } },
      ],
    });
    expect(text).toContain("wait for the participant");
    expect(text).toContain("workshop_generate_image");
    expect(text).toContain("not at session start");
  });

  it("uses input_image for https image URLs", () => {
    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        {
          id: "img",
          role: "input",
          typeId: "image",
          values: { imageSource: "url", imageUrl: "https://example.com/x.png" },
        },
        { id: "o", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(events).toHaveLength(1);
    const content = events[0].item.content;
    expect(content.some((c) => c.type === "input_image")).toBe(true);
  });
});
