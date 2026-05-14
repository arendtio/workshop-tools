# Deployment architecture

**Status:** agreed direction  
**Last updated:** 2026-05-14

## Goal

The **deployment unit** for this project is a **single Docker image** that runs an **HTTP server** and serves the application (today the static UI under `workshop-sandbox/`; later including a backend when that exists). There is **no application-level HTTPS** inside the container; operators terminate TLS **outside** this repository (for example with a reverse proxy or platform ingress).

## Scope

| In scope (design) | Out of scope (this repo) |
|-------------------|---------------------------|
| Target shape: one container, HTTP server, build via image definition when added | Reverse proxy, certificates, or HTTPS configuration |
| Image build as part of a deploy pipeline once a `Dockerfile` exists | Pre-publishing images to a registry (optional per environment) |
| Plain HTTP on a defined container port at the workload | mTLS, WAF, or edge routing beyond documenting the HTTP port |

## Dockerfile and `.dockerignore` (deferred)

A **`Dockerfile`** (and typically **`.dockerignore`**) will be introduced **when the application has enough substance to warrant it**—in particular when there is a **backend** and deployment packaging is meaningful. Until then, this repository **does not** ship those files; local work continues to use a simple static server (see **`AGENTS.md`**).

When added, the image should still follow the contract below (HTTP inside the container, TLS at the edge).

## Container contract (when an image exists)

1. **Process:** an HTTP server serves the deployable assets (static files today; static plus API or other processes once a backend exists).
2. **Protocol:** **HTTP only** between the reverse proxy (or client) and the container, unless the platform injects TLS in front of the workload without changing this image.
3. **Port:** expose a **single well-documented TCP port** for HTTP (conventionally **80** for a static front-end; adjust if the stack uses another port).
4. **Build:** the image is produced by **`docker build`** (or equivalent in CI). Build steps may grow once backend and assets need compilation or dependency installs.

## Reverse proxy and HTTPS

HTTPS encryption and certificate lifecycle are **explicitly not** implemented in this project. The expected pattern is:

```
[Browser] --HTTPS--> [Reverse proxy / ingress] --HTTP--> [workshop-tools container :<http-port>]
```

The reverse proxy is owned and operated **outside** this codebase; this repository only documents that the container speaks **HTTP** on the exposed port.

## Local development (current)

Until a container image is defined in-repo, use **`AGENTS.md`** (for example `python3 -m http.server` for `workshop-sandbox/`).

## Related files

- **`AGENTS.md`** — local development without Docker.
