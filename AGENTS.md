# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

This is **workshop-tools**: an HTML/CSS/JS **AI Workshop Sandbox** workbench under `workshop-sandbox/`, plus a small **Node.js** backend in `server/` (plan validation, Realtime **client secrets**, and **orchestration**: session instructions plus bootstrap `conversation.item.create` events for the data channel). The UI stays static files; there is no separate frontend build step for the workbench.

### Running the Application

**Full stack (static UI + API, same origin)** — from the repository root:

```sh
cd server && npm install && npm start
```

If plan validation returns `ERR_DLOPEN_FAILED` / `better_sqlite3.node` “did not self-register”, the native module was built for another Node version — run `cd server && npm rebuild better-sqlite3` (or reinstall: `rm -rf node_modules && npm install`).

Then open `http://localhost:8080` (Express serves `workshop-sandbox/` and mounts `/api/*`).

**UI only** — no `/api` routes (plan validation and **Run** need the Node server):

```sh
python3 -m http.server 8080 --directory workshop-sandbox
```

Then open `http://localhost:8080`. **Run** is not available without the API (no client secret); use the Node server for any pipeline.

**Docker** — build and run (set your API key in the environment):

```sh
docker build -t workshop-tools .
docker run --rm -p 8080:8080 -e OPENAI_API_KEY="sk-..." workshop-tools
```

### Testing

- **Server (automated):** `cd server && npm test` (Vitest: plan validation, Realtime session mapping, orchestration bootstrap events, HTTP routes with mocked `fetch`).
- **Manual:** open the app from the Node server; load presets; click **Run** — the client validates the plan, obtains a client secret, opens **WebRTC** to OpenAI (`/v1/realtime/calls`), then sends orchestration events on the `oai-events` channel. Pipelines **without** a live microphone input end automatically when the model response completes (unless tool follow-ups are still pending); pipelines **with** live mic input stay open until you stop.
- No ESLint/Prettier is configured for the static UI.

### Key Caveats

- **Authentication** is intentionally omitted for now; protect the deployment at the network edge if needed.
- **OpenAI:** the long-lived key is **`OPENAI_API_KEY`** on the server only (or **`OPENAI_API_KEY_FILE`** pointing at a secret file, e.g. Docker `/run/secrets/openai_api_key`); the browser receives a **short-lived** client secret. Optional: `OPENAI_REALTIME_MODEL`, `OPENAI_DYNAMIC_UI_MODEL` (default `gpt-5.4-mini`), `OPENAI_DYNAMIC_UI_REASONING_EFFORT` (default `low`), `OPENAI_IMAGE_TOOL_QUALITY` (default `low`), `OPENAI_API_BASE`, `OPENAI_SAFETY_IDENTIFIER`, `PORT`.
- Google Fonts (DM Sans) load via CDN; offline environments fall back to system-ui.
- **Log pools:** process modules `log-generator` / `log-analyzer` persist SQLite files under `data/log-pools/` (overwrite on same name; survives until server restart; mount that directory in Docker for persistence). Generator uses agent tool `workshop_log_pool_generate`; analyzer uses read-only `workshop_log_sql` on a dropdown-selected pool. Log generation for `shop-package-lifecycle` picks **shop numbers (1000–2000), order ids, customer ids, and product ids** from the tooling mock DB when `data/tooling-mock/workshop.sqlite` is seeded.
- **Knowledge pools:** process module `vector-db` uploads files via multipart to `/api/knowledge-pools/upload` (max **50 MB** per file), persists under `data/knowledge-pools/`, and indexes into an OpenAI Vector Store (PDF, Office, HTML, CSV, text, images — parsed by OpenAI, no local Office/PDF libraries). Realtime runs expose `workshop_knowledge_search` (function tool → `/api/knowledge-pools/search`); the pool must have at least one indexed file before Run. Native `file_search` is not supported on Realtime sessions (only `function` and `mcp`).
- **Tooling mock:** process module `tooling` uses a shared SQLite DB at `data/tooling-mock/workshop.sqlite` (seeded once on first use — whichever runs first between **tooling** and **log-generator** calls `ensureToolingMockSeeded()`; mount `data/tooling-mock/` in Docker). Realtime tool `workshop_mock_tooling_call` → `/api/tooling-mock/call`. **`list` requires `filter`** (at least one criterion) and returns at most **`limit` rows (default/max 100)**. Domains: customers, orders, shop (1000–2000), products, inventory, other.
