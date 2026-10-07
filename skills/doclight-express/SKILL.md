---
name: doclight-express
description: Add Doclight AI-agent traffic observability to an Express app with @doclight/express.
version: 0.1.0
package: "@doclight/express"
---

# Integrate @doclight/express

Use when an Express 4/5 app (Node >= 18) should record AI-agent/bot requests.

1. Install: `pnpm add @doclight/express` (installs `@doclight/node`; `express` is a peer).
2. Register once, before routes: `app.use(doclightMiddleware({ apiKey, projectId }))`. Read credentials from env; never hard-code them.
3. Default `express.collect` is `"agents"` (only observed bot User-Agents or valid agent headers). Use `"all"` or `"none"` deliberately; add `ignoreRoutes` for health checks.
4. On SIGTERM/SIGINT call `await middleware.shutdown(5000)` after closing the server; it is bounded and never rejects.
5. Verify: send a request with `User-Agent: GPTBot/1.1` and confirm one `api_called` event arrives.

Guarantees to preserve: no bodies, cookies, auth headers, query strings or raw IPs are recorded; referrer is origin-only; telemetry failures never change responses, error handlers or `next()`; agent labels are untrusted (spoofable) evidence.

Limits: only sees requests that reach Express (not CDN/proxy/static-served traffic).
