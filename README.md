# @doclight/express

Express middleware that automatically instruments HTTP requests with [Doclight](https://doclight.dev) observability. One `app.use()` call — zero per-route changes.

## Install

```bash
pnpm add @doclight/express
```

## Usage

```ts
import express from "express"
import { doclightMiddleware } from "@doclight/express"

const app = express()

app.use(doclightMiddleware({
  apiKey: process.env.DOCLIGHT_API_KEY!,
  projectId: process.env.DOCLIGHT_PROJECT_ID!,
}))

// All routes below are automatically instrumented
app.get("/api/items", handler)
app.post("/api/orders", handler)
```

## Options

```ts
doclightMiddleware({
  // Required
  apiKey: "dl_...",
  projectId: "proj_...",

  // Express-specific (all optional)
  express: {
    collect: "agents",                        // "agents" (default) | "all" | "none"
    ignoreRoutes: ["/healthz", "/readyz"],   // exact req.path match
    ignoreUserAgents: ["Googlebot"],          // substring match
    sessionHeader: "x-doclight-session-id",  // default
    agentHeader: "x-agent-id",               // default
  },
})
```

## Collection policy

By default (`collect: "agents"`) only requests with **observed agent evidence** are recorded: a known bot/AI-agent `User-Agent` (e.g. GPTBot, ClaudeBot, PerplexityBot, Googlebot) or a valid agent header. Other traffic is not recorded.

- `collect: "all"` records every non-ignored request (agent fields are only set when evidence exists).
- `collect: "none"` opts out entirely; no events are emitted.
- `ignoreRoutes` / `ignoreUserAgents` always take precedence.

Bot identification is conservative and based only on well-known tokens. Every agent label is marked in event metadata as `evidence: "observed_user_agent"` (or `"declared_header"`) and `trust: "untrusted"`: User-Agent and headers are client-controlled and can be spoofed. Nothing is verified.

## Session correlation

If your AI agent sets `x-doclight-session-id` (and optionally `x-agent-id`), the values are attached to the `api_called` event. Values must be 1–128 characters of `A-Z a-z 0-9 . _ : -`; anything else is ignored (a random session id is used). These values are untrusted.

## What gets captured

Exactly one `api_called` event per recorded request: route template, HTTP method, numeric status code, duration, error type, bounded correlation ids, agent label and evidence, and the **origin only** of the `Referer` header (no path, query, fragment or credentials).

- A response that finishes is `success`/`failed` by status code. A connection closed before the response completed is `cancelled` with `errorType: "client_aborted"`; a response stream error is `failed` with `stream_error`. Repeated `finish`/`close`/`error` callbacks never produce a second event.
- Routes use the Express route template (with sanitized router mount prefix). Unmatched paths have ids, long and non-plain segments replaced with `:id`. Query strings are never recorded.
- Request/response bodies, cookies, authorization/other header values, query parameters and raw IPs are never captured.
- Telemetry failures are swallowed; they never change the response, error handling or `next()` behavior, and the middleware does not read the request body.

## Coverage limits

The middleware only sees requests that reach your Express app. It does **not** observe requests answered by a CDN/edge cache, reverse proxy, WAF or static file server in front of Express, or traffic blocked before it reaches the app. Behind a proxy, headers may be rewritten or stripped. It does not recover hidden prompts, infer user journeys, or prove that a client is a particular AI agent.

## Source and issues

- Source: https://github.com/doclight-lab/sdk-express
- Issues: https://github.com/doclight-lab/sdk-express/issues

## License

MIT
