import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMockToolingSession } from "../src/mockToolingStore.js";
import { createDynamicUiSession } from "../src/dynamicUiSessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "..", "..", "workshop-sandbox");

describe("HTTP API", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("GET /api/log-pools lists empty or existing pools", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app).get("/api/log-pools");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.pools)).toBe(true);
  });

  it("GET /api/knowledge-pools lists empty or existing pools", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app).get("/api/knowledge-pools");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.pools)).toBe(true);
  });

  it("POST /api/knowledge-pools/search requires API key", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/knowledge-pools/search")
      .send({ pool: "demo", query: "test" });
    expect(res.status).toBe(503);
  });

  it("POST /api/knowledge-pools/upload accepts multipart file", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        const u = String(url);
        if (u.includes("/vector_stores") && init?.method === "POST" && !u.includes("/search") && !u.includes("/files")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "vs_http_1" }) };
        }
        if (u.includes("/files") && init?.method === "POST") {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "file_http_1" }) };
        }
        if (u.includes("/vector_stores/vs_http_1/files") && init?.method === "POST") {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "file_http_1", status: "in_progress" }) };
        }
        if (u.includes("/vector_stores/vs_http_1/files/file_http_1") && (!init?.method || init.method === "GET")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ id: "file_http_1", status: "completed" }) };
        }
        if (u.includes("/vector_stores/vs_http_1/files/file_http_1") && init?.method === "DELETE") {
          return { ok: true, status: 200, text: async () => "{}" };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/knowledge-pools/upload")
      .field("pool", "http-upload")
      .attach("file", Buffer.from("hello knowledge"), "notes.txt");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.filename).toBe("notes.txt");
  });

  it("GET /api/health", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/plan/validate rejects invalid plans", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app).post("/api/plan/validate").send({ version: 1, blocks: [] });
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
  });

  it("POST /api/realtime/client-secret allows text-only pipelines when OpenAI succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: "ek_from_openai", expires_at: 123 }),
      })),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/realtime/client-secret")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "1", role: "input", typeId: "text", values: {} },
            { id: "2", role: "output", typeId: "text", values: {} },
          ],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.client_secret.value).toBe("ek_from_openai");
    expect(res.body.post_connect_session?.audio?.input?.turn_detection).toBeNull();
  });

  it("POST /api/realtime/client-secret returns 503 without API key", async () => {
    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/realtime/client-secret")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "1", role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
            { id: "2", role: "output", typeId: "text", values: {} },
          ],
        },
      });
    expect(res.status).toBe(503);
  });

  it("POST /api/realtime/client-secret returns client_secret when OpenAI succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ value: "ek_from_openai", expires_at: 123 }),
      })),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/realtime/client-secret")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "1", role: "input", typeId: "audio-live", values: { turnTaking: "vad" } },
            { id: "2", role: "output", typeId: "text", values: {} },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.client_secret.value).toBe("ek_from_openai");
    expect(String(res.body.realtime_calls_url)).toContain("/realtime/calls");
    expect(res.body.post_connect_session?.type).toBe("realtime");
    expect(String(res.body.post_connect_session?.instructions || "")).toContain("Configured workshop outputs");
    expect(res.body.orchestration?.version).toBe(1);
    expect(Array.isArray(res.body.orchestration?.client_events)).toBe(true);
  });

  it("POST /api/images/generate returns data_url when OpenAI succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/responses")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                output: [
                  {
                    type: "image_generation_call",
                    status: "completed",
                    result: "QUJD",
                    revised_prompt: "rp",
                  },
                ],
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      }),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/images/generate")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "1", role: "input", typeId: "text", values: { content: "hi" } },
            { id: "2", role: "output", typeId: "image", values: { size: "1024x1024" } },
          ],
        },
        prompt: "a blue square",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data_url).toContain("base64,");
    expect(res.body.revised_prompt).toBe("rp");
  });

  it("POST /api/images/generate forwards reference_images to OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    let postedBody;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url).includes("/responses")) {
          postedBody = JSON.parse(String(init.body));
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                output: [
                  {
                    type: "image_generation_call",
                    status: "completed",
                    result: "QUJD",
                  },
                ],
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      }),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/images/generate")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "i1", role: "input", typeId: "image", values: { imageSource: "file", uploadStub: "x.png" } },
            { id: "2", role: "output", typeId: "image", values: { size: "1024x1024" } },
          ],
        },
        prompt: "make it blue",
        reference_images: [{ block_id: "i1", image_url: "data:image/png;base64,QUJD" }],
      });
    expect(res.status).toBe(200);
    const content = postedBody.input?.[0]?.content;
    expect(content.some((c) => c.type === "input_image" && c.image_url.startsWith("data:image/png"))).toBe(true);
  });

  it("POST /api/audio/speech returns data_url when OpenAI succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/audio/speech")) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => new Uint8Array([0, 1, 2, 3]).buffer,
          };
        }
        return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
      }),
    );

    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/audio/speech")
      .send({
        plan: {
          version: 1,
          blocks: [
            { id: "1", role: "input", typeId: "text", values: { content: "hi" } },
            { id: "2", role: "output", typeId: "audio", values: { voice: "alloy" } },
          ],
        },
        input: "hello world",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(String(res.body.data_url)).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("POST /api/workshop-session/tooling-mock persists mutations per session", async () => {
    const sid = createMockToolingSession();
    const app = createApp({ staticRoot });
    const r2 = await request(app)
      .post("/api/workshop-session/tooling-mock")
      .send({
        session_id: sid,
        call: { domain: "customers", operation: "update", id: "cust-001", record: { city: "Köln" } },
      });
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    const r3 = await request(app)
      .post("/api/workshop-session/tooling-mock")
      .send({ session_id: sid, call: { domain: "customers", operation: "get", id: "cust-001" } });
    expect(r3.body.data.city).toBe("Köln");
  });

  it("POST /api/workshop-session/dynamic-ui patches and reads state", async () => {
    const sid = createDynamicUiSession();
    const app = createApp({ staticRoot });
    const p = await request(app)
      .post("/api/workshop-session/dynamic-ui")
      .send({
        action: "patch",
        session_id: sid,
        patch: { nlPrompt: "sliders", widgets: { "slider:A": "12" } },
      });
    expect(p.status).toBe(200);
    expect(p.body.ok).toBe(true);
    const r = await request(app)
      .post("/api/workshop-session/dynamic-ui")
      .send({ action: "read", session_id: sid });
    expect(r.body.state.nlPrompt).toBe("sliders");
    expect(r.body.state.widgets["slider:A"]).toBe("12");
  });

  it("POST /api/dynamic-ui/generate returns html from OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/responses")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                output_text: JSON.stringify({ html: "<p>x</p>" }),
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      }),
    );
    const app = createApp({ staticRoot });
    const res = await request(app)
      .post("/api/dynamic-ui/generate")
      .send({ prompt: "a paragraph", role: "input" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.html).toBe("<p>x</p>");
  });

  it("POST /api/workshop-session/dynamic-ui merges outputData", async () => {
    const sid = createDynamicUiSession();
    const app = createApp({ staticRoot });
    await request(app)
      .post("/api/workshop-session/dynamic-ui")
      .send({
        action: "patch",
        session_id: sid,
        patch: { outputData: { blockA: { score: 3 } } },
      })
      .expect(200);
    const r = await request(app)
      .post("/api/workshop-session/dynamic-ui")
      .send({ action: "read", session_id: sid });
    expect(r.body.state.outputData.blockA).toEqual({ score: 3 });
  });
});
