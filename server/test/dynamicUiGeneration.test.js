import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDynamicUiFromPrompt } from "../src/dynamicUiGeneration.js";

function mockResponsesFetch(payload) {
  return vi.fn(async (url, init) => {
    expect(String(url)).toContain("/responses");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text?.format?.type).toBe("json_schema");
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    };
  });
}

describe("generateDynamicUiFromPrompt", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_DYNAMIC_UI_MODEL;
    delete process.env.OPENAI_DYNAMIC_UI_REASONING_EFFORT;
    vi.unstubAllGlobals();
  });

  it("rejects empty prompt", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    await expect(generateDynamicUiFromPrompt("input", "  ")).rejects.toMatchObject({
      code: "EMPTY_PROMPT",
    });
  });

  it("parses input HTML from Responses API", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      mockResponsesFetch({
        output_text: JSON.stringify({ html: "<p>Hi</p>" }),
      }),
    );

    const out = await generateDynamicUiFromPrompt("input", "three sliders 0-100");
    expect(out.html).toBe("<p>Hi</p>");
    expect(out.output_schema).toBeUndefined();
  });

  it("requires output_schema for output role", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      mockResponsesFetch({
        output_text: JSON.stringify({ html: "<h3></h3>" }),
      }),
    );

    await expect(generateDynamicUiFromPrompt("output", "show title")).rejects.toMatchObject({
      code: "INVALID_MODEL_JSON",
    });
  });

  it("returns html and schema for output role", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      mockResponsesFetch({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  html: '<h3 data-ws-bind="title"></h3>',
                  output_schema: JSON.stringify({
                    type: "object",
                    properties: { title: { type: "string" } },
                  }),
                }),
              },
            ],
          },
        ],
      }),
    );

    const out = await generateDynamicUiFromPrompt("output", "title heading");
    expect(out.html).toContain("data-ws-bind");
    expect(out.output_schema).toEqual({ type: "object", properties: { title: { type: "string" } } });
  });

  it("honors OPENAI_DYNAMIC_UI_MODEL and reasoning env overrides", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_DYNAMIC_UI_MODEL = "gpt-5.5-pro";
    process.env.OPENAI_DYNAMIC_UI_REASONING_EFFORT = "medium";
    const fetchMock = vi.fn(async (url, init) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gpt-5.5-pro");
      expect(body.reasoning).toEqual({ effort: "medium" });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ output_text: JSON.stringify({ html: "<p>x</p>" }) }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateDynamicUiFromPrompt("input", "hello");
    expect(fetchMock).toHaveBeenCalled();
  });
});
