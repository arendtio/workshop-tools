# Deployment architecture

**Status:** agreed direction  
**Last updated:** 2026-05-14

## Goal

The **deployment unit** for this project is a **single Docker image** that runs an **HTTP server** and serves the static UI under `workshop-sandbox/`. There is **no application-level HTTPS** inside the container; operators terminate TLS **outside** this repository (for example with a reverse proxy or platform ingress).

## Scope

| In scope | Out of scope (this repo) |
|----------|---------------------------|
| `Dockerfile` at repository root | Reverse proxy, certificates, or HTTPS configuration |
| Image build as part of a deploy pipeline (or local `docker build`) | Pre-publishing images to a registry (optional per environment) |
| Plain HTTP on a defined container port | mTLS, WAF, or edge routing beyond documenting the HTTP port |

## Container contract

1. **Process:** a static file HTTP server serves files from `workshop-sandbox/` (same tree as developed locally).
2. **Protocol:** **HTTP only** between the reverse proxy (or client) and the container, unless the platform injects TLS in front of the workload without changing this image.
3. **Port:** the image **exposes TCP port 80** (nginx default). Map it as needed (`docker run -p 8080:80`, Kubernetes `Service`, etc.).
4. **Build:** the image is produced by **`docker build`** (or equivalent in CI). No separate compile or package-manager build step is required for the current static mock-up.

## Reverse proxy and HTTPS

HTTPS encryption and certificate lifecycle are **explicitly not** implemented in this project. The expected pattern is:

```
[Browser] --HTTPS--> [Reverse proxy / ingress] --HTTP--> [workshop-tools container :80]
```

The reverse proxy is owned and operated **outside** this codebase; this repository only documents that the container speaks **HTTP** on the exposed port.

## Local verification

Build and run:

```sh
docker build -t workshop-tools .
docker run --rm -p 8080:80 workshop-tools
```

Open `http://localhost:8080` (or the host/port your environment maps to port 80 in the container).

## Related files

- Root **`Dockerfile`** — image definition; build may run in deployment pipelines.
- **`AGENTS.md`** — local development without Docker (`python3 -m http.server`).
