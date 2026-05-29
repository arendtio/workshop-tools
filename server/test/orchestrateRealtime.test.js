import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFullRealtimeInstructions,
  buildRealtimeBootstrapClientEvents,
  DYNAMIC_UI_INPUT_PLATFORM_CONTRACT,
} from "../src/orchestrateRealtime.js";

describe("orchestrateRealtime", () => {
  it("includes log generator and analyzer guidance", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "process", typeId: "log-generator", values: { defaultPoolName: "shop-demo" } },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(text).toContain("workshop_log_pool_generate");
    expect(text).toContain("shop-demo");
  });

  it("includes vector and tooling context in instructions", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wk-orch-"));
    process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR = tmpDir;
    const poolDir = path.join(tmpDir, "notes");
    fs.mkdirSync(poolDir, { recursive: true });
    fs.writeFileSync(
      path.join(poolDir, "manifest.json"),
      JSON.stringify({
        name: "notes",
        vector_store_id: "vs_abc",
        created_at: "2026-01-01T00:00:00.000Z",
        files: [{ filename: "notes.pdf", status: "completed" }],
      }),
    );

    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "process", typeId: "instruction", values: { system: "Base" } },
        {
          role: "process",
          typeId: "vector-db",
          values: { knowledgePool: "notes", knowledgeFileList: "notes.pdf" },
        },
        {
          role: "process",
          typeId: "tooling",
          values: { accessMode: "read", serviceDomain: "orders" },
        },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(text).toContain("notes");
    expect(text).toContain("notes.pdf");
    expect(text).toContain("workshop_knowledge_search");
    expect(text).toContain("Auftragsdaten");

    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.WORKSHOP_KNOWLEDGE_POOLS_DIR;
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

  it("appends dynamic UI platform contract to instructions when input dynamic-ui exists", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "input", typeId: "dynamic-ui", values: {}, dynamicUiCommitted: "" },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(text).toContain("data-ws-handler");
    expect(text).toContain("detail.state");
    expect(DYNAMIC_UI_INPUT_PLATFORM_CONTRACT.length).toBeGreaterThan(80);
  });

  it("omits dynamic UI platform contract without input dynamic-ui", () => {
    const text = buildFullRealtimeInstructions({
      blocks: [
        { role: "input", typeId: "text", values: { content: "hi" } },
        { role: "output", typeId: "text", values: {} },
      ],
    });
    expect(text).not.toContain("input module `dynamic-ui`");
  });

  it("includes dynamic UI platform contract in bootstrap for dynamic-ui input", () => {
    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        {
          id: "du1",
          role: "input",
          typeId: "dynamic-ui",
          values: { uiPrompt: "sliders" },
          dynamicUiCommitted: "<p>x</p>",
        },
        { id: "o", role: "output", typeId: "text", values: {} },
      ],
    });
    expect(events).toHaveLength(1);
    const t = events[0].item.content[0].text;
    expect(t).toContain("Natural-language design:");
    expect(t).toContain("data-ws-handler");
  });

  it("includes output dynamic-ui schema in instructions and bootstrap", () => {
    const schema = { type: "object", properties: { title: { type: "string" } } };
    const text = buildFullRealtimeInstructions({
      blocks: [
        { id: "out1", role: "output", typeId: "dynamic-ui", values: {}, dynamicUiOutputSchema: schema },
      ],
    });
    expect(text).toContain("required `ui_data` shape");
    expect(text).toContain('"title"');

    const events = buildRealtimeBootstrapClientEvents({
      blocks: [
        {
          id: "out1",
          role: "output",
          typeId: "dynamic-ui",
          values: { uiPrompt: "show a title" },
          dynamicUiCommitted: '<h3 data-ws-bind="title"></h3>',
          dynamicUiOutputSchema: schema,
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].item.content[0].text).toContain("workshop_emit_dynamic_ui");
  });
});
