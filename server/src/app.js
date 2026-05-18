import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { validatePlan } from "./validatePlan.js";
import { buildRealtimeBootstrapClientEvents } from "./orchestrateRealtime.js";
import { buildRealtimePostConnectSession, mintRealtimeClientSecret } from "./realtimeSession.js";
import { generateWorkshopImageFromPlan } from "./imageGeneration.js";
import { generateWorkshopSpeechFromPlan } from "./speechGeneration.js";
import { generateDynamicUiFromPrompt } from "./dynamicUiGeneration.js";
import { createMockToolingSession, hasMockToolingSession, runMockToolingCall } from "./mockToolingStore.js";
import {
  createDynamicUiSession,
  hasDynamicUiSession,
  patchDynamicUiSession,
  readDynamicUiSession,
} from "./dynamicUiSessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
function planHasProcessTooling(plan) {
  return plan.blocks.some((b) => b.role === "process" && b.typeId === "tooling");
}

/**
 * @param {{ blocks: { role: string, typeId: string }[] }} plan
 */
function planUsesDynamicUiModule(plan) {
  return plan.blocks.some((b) => b.typeId === "dynamic-ui");
}

/**
 * @param {{ staticRoot: string }} opts
 */
export function createApp(opts) {
  const { staticRoot } = opts;
  const app = express();
  app.disable("x-powered-by");
  /** File uploads as data URLs on `/api/images/generate` need a larger body than plan JSON alone. */
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "workshop-server" });
  });

  app.post("/api/plan/validate", (req, res) => {
    const result = validatePlan(req.body);
    if (!result.ok) {
      return res.status(400).json({ valid: false, errors: result.errors });
    }
    return res.json({ valid: true, mode: result.mode });
  });

  app.post("/api/realtime/client-secret", async (req, res) => {
    const planBody = req.body?.plan ?? req.body;
    const result = validatePlan(planBody);
    if (!result.ok) {
      return res.status(400).json({ valid: false, errors: result.errors });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        valid: false,
        errors: [{ code: "NO_API_KEY", message: "Server is missing OPENAI_API_KEY." }],
      });
    }
    try {
      const secret = await mintRealtimeClientSecret(result.plan);
      const base = (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");

      let toolingMockSessionId;
      if (planHasProcessTooling(result.plan)) {
        toolingMockSessionId = createMockToolingSession();
      }
      let dynamicUiSessionId;
      if (planUsesDynamicUiModule(result.plan)) {
        dynamicUiSessionId = createDynamicUiSession();
      }

      /** @type {Record<string, unknown>} */
      const planForSession = { ...result.plan };
      if (toolingMockSessionId) planForSession.toolingMockSessionId = toolingMockSessionId;
      if (dynamicUiSessionId) planForSession.dynamicUiSessionId = dynamicUiSessionId;

      const client_events = buildRealtimeBootstrapClientEvents(planForSession);
      const post_connect_session = buildRealtimePostConnectSession(planForSession);

      /** @type {Record<string, unknown>} */
      const payload = {
        valid: true,
        mode: "realtime",
        client_secret: { value: secret.value, expires_at: secret.expires_at },
        realtime_calls_url: `${base}/realtime/calls`,
        post_connect_session,
        orchestration: { version: 1, client_events },
      };
      if (toolingMockSessionId) payload.tooling_mock_session_id = toolingMockSessionId;
      if (dynamicUiSessionId) payload.dynamic_ui_session_id = dynamicUiSessionId;
      return res.json(payload);
    } catch (e) {
      const st = typeof e.status === "number" ? e.status : NaN;
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({
        valid: false,
        errors: [{ code: e.code || "OPENAI", message: e.message || "OpenAI request failed" }],
      });
    }
  });

  app.post("/api/images/generate", async (req, res) => {
    const planBody = req.body?.plan ?? req.body;
    const prompt = req.body?.prompt;
    const result = validatePlan(planBody);
    if (!result.ok) {
      return res.status(400).json({ ok: false, errors: result.errors });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "NO_API_KEY",
        message: "Server is missing OPENAI_API_KEY.",
      });
    }
    const p = String(prompt ?? "").trim();
    if (!p) {
      return res.status(400).json({ ok: false, error: "EMPTY_PROMPT", message: "Missing prompt." });
    }
    try {
      const out = await generateWorkshopImageFromPlan(result.plan, p, {
        referenceImages: req.body?.reference_images,
      });
      return res.json({ ok: true, data_url: out.data_url, revised_prompt: out.revised_prompt ?? null });
    } catch (e) {
      const code = /** @type {{ code?: string }} */ (e).code;
      if (code === "NO_IMAGE_OUTPUT") {
        return res.status(400).json({ ok: false, error: code, message: e.message || "No output:image in plan." });
      }
      if (code === "EMPTY_PROMPT") {
        return res.status(400).json({ ok: false, error: code, message: e.message });
      }
      const st = typeof e.status === "number" ? e.status : NaN;
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({
        ok: false,
        error: code || "OPENAI_IMAGE",
        message: e.message || "Image generation failed.",
      });
    }
  });

  app.post("/api/audio/speech", async (req, res) => {
    const planBody = req.body?.plan ?? req.body;
    const input = req.body?.input ?? req.body?.text;
    const result = validatePlan(planBody);
    if (!result.ok) {
      return res.status(400).json({ ok: false, errors: result.errors });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "NO_API_KEY",
        message: "Server is missing OPENAI_API_KEY.",
      });
    }
    try {
      const out = await generateWorkshopSpeechFromPlan(result.plan, input, {});
      return res.json({ ok: true, data_url: out.data_url, voice: out.voice, model: out.model });
    } catch (e) {
      const code = /** @type {{ code?: string }} */ (e).code;
      if (code === "NO_SPEECH_OUTPUT") {
        return res.status(400).json({ ok: false, error: code, message: e.message || "No output:audio in plan." });
      }
      if (code === "EMPTY_TTS_INPUT") {
        return res.status(400).json({ ok: false, error: code, message: e.message });
      }
      const st = typeof e.status === "number" ? e.status : NaN;
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({
        ok: false,
        error: code || "OPENAI_SPEECH",
        message: e.message || "Speech synthesis failed.",
      });
    }
  });

  app.post("/api/workshop-session/tooling-mock", (req, res) => {
    const sessionId = String(req.body?.session_id || "").trim();
    const call = req.body?.call && typeof req.body.call === "object" ? req.body.call : req.body;
    if (!hasMockToolingSession(sessionId)) {
      return res.status(404).json({ ok: false, error: "unknown_session" });
    }
    const out = runMockToolingCall(sessionId, call);
    return res.status(out.ok ? 200 : 400).json(out);
  });

  app.post("/api/dynamic-ui/generate", async (req, res) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        ok: false,
        error: "NO_API_KEY",
        message: "Server is missing OPENAI_API_KEY.",
      });
    }
    const prompt = req.body?.prompt ?? req.body?.ui_prompt;
    const role = req.body?.role ?? "input";
    try {
      const out = await generateDynamicUiFromPrompt(String(role), String(prompt ?? ""));
      return res.json({
        ok: true,
        html: out.html,
        output_schema: out.output_schema ?? null,
      });
    } catch (e) {
      const code = /** @type {{ code?: string }} */ (e).code;
      if (code === "EMPTY_PROMPT" || code === "INVALID_ROLE") {
        return res.status(400).json({ ok: false, error: code, message: e.message });
      }
      const st = typeof e.status === "number" ? e.status : NaN;
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({
        ok: false,
        error: code || "OPENAI_DYNAMIC_UI",
        message: e.message || "Dynamic UI generation failed.",
      });
    }
  });

  app.post("/api/workshop-session/dynamic-ui", (req, res) => {
    const sessionId = String(req.body?.session_id || "").trim();
    const action = String(req.body?.action || "patch").trim().toLowerCase();
    if (action === "read") {
      const r = readDynamicUiSession(sessionId);
      if (!r.ok) return res.status(404).json(r);
      return res.json(r);
    }
    const patch = req.body?.patch && typeof req.body.patch === "object" ? req.body.patch : {};
    const r = patchDynamicUiSession(sessionId, patch);
    if (!r.ok) return res.status(404).json(r);
    return res.json(r);
  });

  app.use(express.static(staticRoot, { extensions: ["html"] }));

  app.use((_req, res) => {
    res.status(404).type("text/plain").send("Not found");
  });

  return app;
}

export function resolveRepoRoot() {
  return path.resolve(__dirname, "..", "..");
}
