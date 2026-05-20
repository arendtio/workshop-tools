# Deployment architecture

**Status:** agreed direction  
**Last updated:** 2026-05-14

## Goal

The **deployment unit** for this project is a **single Docker image** that runs an **HTTP server** on port **8080** by default: it serves the static UI under `workshop-sandbox/` and the **Node workshop API** under `/api/*` (plan validation and Realtime client secrets). There is **no application-level HTTPS** inside the container; operators terminate TLS **outside** this repository (for example with a reverse proxy or platform ingress).

## Scope

| In scope (design) | Out of scope (this repo) |
|-------------------|---------------------------|
| One container: Node HTTP server, static UI + `/api` routes | Reverse proxy, certificates, or HTTPS configuration |
| `Dockerfile` + `.dockerignore` in repo root | Pre-publishing images to a registry (optional per environment) |
| Plain HTTP on port **8080** inside the container (override with `PORT`) | mTLS, WAF, or edge routing beyond documenting the HTTP port |

## Dockerfile and `.dockerignore`

The repository root **`Dockerfile`** builds the workshop image: it installs production dependencies from `server/package-lock.json`, copies `workshop-sandbox/` and `server/`, and starts `node server/src/index.js`.

**Runtime secrets:** pass the long-lived OpenAI key at run time, for example:

```sh
docker build -t workshop-tools .
docker run --rm -p 8080:8080 -e OPENAI_API_KEY="sk-..." workshop-tools
```

Optional: `OPENAI_REALTIME_MODEL` (defaults to a cost-conscious Realtime model), `OPENAI_DYNAMIC_UI_MODEL` (default `gpt-5.4-mini`), `OPENAI_DYNAMIC_UI_REASONING_EFFORT` (default `low`), `OPENAI_API_BASE`, `OPENAI_SAFETY_IDENTIFIER`, `PORT`.

## Container contract (when an image exists)

1. **Process:** Node serves static assets from `workshop-sandbox/` and JSON APIs under `/api/`.
2. **Protocol:** **HTTP only** between the reverse proxy (or client) and the container, unless the platform injects TLS in front of the workload without changing this image.
3. **Port:** expose **8080** for HTTP unless overridden with the `PORT` environment variable.
4. **Build:** the image is produced by **`docker build`** (or equivalent in CI). Build steps may grow once backend and assets need compilation or dependency installs.

## Reverse proxy and HTTPS

HTTPS encryption and certificate lifecycle are **explicitly not** implemented in this project. The expected pattern is:

```
[Browser] --HTTPS--> [Reverse proxy / ingress] --HTTP--> [workshop-tools container :<http-port>]
```

The reverse proxy is owned and operated **outside** this codebase; this repository only documents that the container speaks **HTTP** on the exposed port.

## Local development (current)

- **Full stack (recommended):** from the repository root, `cd server && npm install && npm start` then open `http://localhost:8080` (static UI + `/api`).
- **UI only:** `python3 -m http.server 8080 --directory workshop-sandbox` — Run uses the **mock** loop only; live-audio pipelines need the Node server on the **same origin** for validation and Realtime client secrets.

## Related files

- **`AGENTS.md`** — local development without Docker.
