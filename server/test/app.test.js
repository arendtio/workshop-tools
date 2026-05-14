import path from "path";
import { fileURLToPath } from "url";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "..", "..", "workshop-sandbox");

describe("HTTP API", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.unstubAllGlobals();
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

  it("POST /api/realtime/client-secret rejects static pipelines", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
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
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
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
  });
});
