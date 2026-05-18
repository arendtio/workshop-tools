import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDynamicUiFromPrompt } from "../src/dynamicUiGeneration.js";

describe("generateDynamicUiFromPrompt", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("rejects empty prompt", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    await expect(generateDynamicUiFromPrompt("input", "  ")).rejects.toMatchObject({
      code: "EMPTY_PROMPT",
    });
  });

  it("parses input HTML from chat completion", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ html: "<p>Hi</p>" }) } }],
          }),
      })),
    );

    const out = await generateDynamicUiFromPrompt("input", "three sliders 0-100");
    expect(out.html).toBe("<p>Hi</p>");
    expect(out.output_schema).toBeUndefined();
  });

  it("requires output_schema for output role", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ html: "<h3></h3>" }) } }],
          }),
      })),
    );

    await expect(generateDynamicUiFromPrompt("output", "show title")).rejects.toMatchObject({
      code: "INVALID_MODEL_JSON",
    });
  });

  it("returns html and schema for output role", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    html: '<h3 data-ws-bind="title"></h3>',
                    output_schema: { type: "object", properties: { title: { type: "string" } } },
                  }),
                },
              },
            ],
          }),
      })),
    );

    const out = await generateDynamicUiFromPrompt("output", "title heading");
    expect(out.html).toContain("data-ws-bind");
    expect(out.output_schema).toEqual({ type: "object", properties: { title: { type: "string" } } });
  });
});
