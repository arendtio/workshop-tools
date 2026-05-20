# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

This is **workshop-tools**: an HTML/CSS/JS **AI Workshop Sandbox** workbench under `workshop-sandbox/`, plus a small **Node.js** backend in `server/` (plan validation, Realtime **client secrets**, and **orchestration**: session instructions plus bootstrap `conversation.item.create` events for the data channel). The UI stays static files; there is no separate frontend build step for the workbench.

### Running the Application

**Full stack (static UI + API, same origin)** — from the repository root:

```sh
cd server && npm install && npm start
```

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
- **OpenAI:** the long-lived key is **`OPENAI_API_KEY`** on the server only; the browser receives a **short-lived** client secret. Optional: `OPENAI_REALTIME_MODEL`, `OPENAI_DYNAMIC_UI_MODEL` (default `gpt-5.4-mini`), `OPENAI_DYNAMIC_UI_REASONING_EFFORT` (default `low`), `OPENAI_API_BASE`, `OPENAI_SAFETY_IDENTIFIER`, `PORT`.
- Google Fonts (DM Sans) load via CDN; offline environments fall back to system-ui.
