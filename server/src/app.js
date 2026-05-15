import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { validatePlan } from "./validatePlan.js";
import { buildRealtimeBootstrapClientEvents } from "./orchestrateRealtime.js";
import { buildRealtimePostConnectSession, mintRealtimeClientSecret } from "./realtimeSession.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ staticRoot: string }} opts
 */
export function createApp(opts) {
  const { staticRoot } = opts;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

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
      const client_events = buildRealtimeBootstrapClientEvents(result.plan);
      const post_connect_session = buildRealtimePostConnectSession(result.plan);
      return res.json({
        valid: true,
        mode: "realtime",
        client_secret: { value: secret.value, expires_at: secret.expires_at },
        realtime_calls_url: `${base}/realtime/calls`,
        post_connect_session,
        orchestration: { version: 1, client_events },
      });
    } catch (e) {
      const st = typeof e.status === "number" ? e.status : NaN;
      const status = st >= 400 && st < 600 ? st : 502;
      return res.status(status).json({
        valid: false,
        errors: [{ code: e.code || "OPENAI", message: e.message || "OpenAI request failed" }],
      });
    }
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
