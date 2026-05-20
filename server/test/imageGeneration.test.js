import { describe, expect, it, vi } from "vitest";
import {
  buildWorkshopImageGenerationTool,
  collectHttpsInputImageUrls,
  collectReferenceImageUrlsForGeneration,
  extractImageFromResponsesApi,
  generateWorkshopImageFromPlan,
  mapPlanSizeToResponsesImageToolSize,
  normalizeReferenceImageUrls,
  planHasImageOutput,
} from "../src/imageGeneration.js";

describe("imageGeneration helpers", () => {
  it("planHasImageOutput", () => {
    expect(planHasImageOutput({ blocks: [{ role: "output", typeId: "text", values: {} }] })).toBe(false);
    expect(planHasImageOutput({ blocks: [{ role: "output", typeId: "image", values: {} }] })).toBe(true);
  });

  it("mapPlanSizeToResponsesImageToolSize maps workshop hints to tool sizes", () => {
    expect(mapPlanSizeToResponsesImageToolSize("1024x1024")).toBe("1024x1024");
    expect(mapPlanSizeToResponsesImageToolSize("1536x1024")).toBe("1536x1024");
    expect(mapPlanSizeToResponsesImageToolSize("1792x1024")).toBe("1536x1024");
    expect(mapPlanSizeToResponsesImageToolSize("1024x1536")).toBe("1024x1536");
    expect(mapPlanSizeToResponsesImageToolSize("1024x1792")).toBe("1024x1536");
    expect(mapPlanSizeToResponsesImageToolSize("auto")).toBe("auto");
  });

  it("collectHttpsInputImageUrls only collects url-mode https", () => {
    expect(
      collectHttpsInputImageUrls({
        blocks: [
          { role: "input", typeId: "image", values: { imageSource: "file", imageUrl: "" } },
          { role: "input", typeId: "image", values: { imageSource: "url", imageUrl: "http://insecure/x" } },
          { role: "input", typeId: "image", values: { imageSource: "url", imageUrl: "https://ok.example/a.png" } },
        ],
      }),
    ).toEqual(["https://ok.example/a.png"]);
  });

  it("extractImageFromResponsesApi reads image_generation_call", () => {
    const out = extractImageFromResponsesApi({
      output: [
        { type: "message", id: "m1" },
        {
          type: "image_generation_call",
          status: "completed",
          result: "Zm9vYmFy",
          revised_prompt: "rev",
        },
      ],
    });
    expect(out.data_url.startsWith("data:image/png;base64,")).toBe(true);
    expect(out.revised_prompt).toBe("rev");
  });

  it("normalizeReferenceImageUrls accepts data URLs and https", () => {
    expect(
      normalizeReferenceImageUrls([
        { image_url: "https://cdn.example/a.png" },
        { data_url: "data:image/jpeg;base64,abc" },
        "http://bad",
      ]),
    ).toEqual(["https://cdn.example/a.png", "data:image/jpeg;base64,abc"]);
  });

  it("collectReferenceImageUrlsForGeneration merges plan https and client data URLs", () => {
    const merged = collectReferenceImageUrlsForGeneration(
      {
        blocks: [
          { role: "input", typeId: "image", values: { imageSource: "url", imageUrl: "https://plan.example/p.png" } },
        ],
      },
      [{ image_url: "data:image/png;base64,xx" }],
    );
    expect(merged).toEqual(["https://plan.example/p.png", "data:image/png;base64,xx"]);
  });

  it("buildWorkshopImageGenerationTool names workshop_generate_image", () => {
    const tool = buildWorkshopImageGenerationTool({
      blocks: [{ role: "output", typeId: "image", values: { size: "1024x1536" } }],
    });
    expect(tool.type).toBe("function");
    expect(tool.name).toBe("workshop_generate_image");
    expect(String(tool.description)).toContain("1024x1536");
  });

  it("generateWorkshopImageFromPlan posts to /v1/responses with image_generation tool", async () => {
    let postedUrl;
    let posted;
    const fetchImpl = vi.fn(async (url, init) => {
      postedUrl = String(url);
      posted = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            output: [
              {
                type: "image_generation_call",
                status: "completed",
                result: "Zm9vYmFy",
                revised_prompt: "revised",
              },
            ],
          }),
      };
    });
    const plan = {
      blocks: [
        {
          role: "input",
          typeId: "image",
          values: { imageSource: "url", imageUrl: "https://cdn.example/ref.png" },
        },
        { role: "output", typeId: "image", values: { size: "1024x1024" } },
      ],
    };
    const out = await generateWorkshopImageFromPlan(plan, "a red circle", {
      apiKey: "sk-test",
      fetchImpl,
      responsesModel: "gpt-5.4-mini",
      imageToolModel: "gpt-image-2",
    });
    expect(postedUrl).toContain("/responses");
    expect(posted.model).toBe("gpt-5.4-mini");
    expect(posted.tools?.[0]?.type).toBe("image_generation");
    expect(posted.tools?.[0]?.model).toBe("gpt-image-2");
    expect(posted.tools?.[0]?.quality).toBe("low");
    expect(posted.response_format).toBeUndefined();
    const userContent = posted.input?.[0]?.content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent.some((c) => c.type === "input_text")).toBe(true);
    expect(userContent.some((c) => c.type === "input_image" && c.image_url === "https://cdn.example/ref.png")).toBe(
      true,
    );
    expect(out.data_url.startsWith("data:image/png;base64,")).toBe(true);
    expect(out.revised_prompt).toBe("revised");
  });

  it("generateWorkshopImageFromPlan attaches client reference data URLs", async () => {
    let posted;
    const fetchImpl = vi.fn(async (_url, init) => {
      posted = JSON.parse(String(init.body));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            output: [{ type: "image_generation_call", status: "completed", result: "eQ==" }],
          }),
      };
    });
    await generateWorkshopImageFromPlan(
      { blocks: [{ role: "output", typeId: "image", values: { size: "1024x1024" } }] },
      "edit: add sunset",
      {
        apiKey: "sk-test",
        fetchImpl,
        referenceImages: [{ block_id: "i1", image_url: "data:image/png;base64,QUJD" }],
      },
    );
    const content = posted.input?.[0]?.content;
    expect(content.some((c) => c.type === "input_image" && c.image_url === "data:image/png;base64,QUJD")).toBe(true);
  });
});
