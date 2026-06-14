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
    ignoreRoutes: ["/healthz", "/readyz"],   // exact req.path match
    ignoreUserAgents: ["Googlebot"],          // substring match
    sessionHeader: "x-doclight-session-id",  // default
    agentHeader: "x-agent-id",               // default
  },
})
```

## Session Correlation

If your AI agent sets `x-doclight-session-id` on outbound HTTP requests, the middleware propagates that value into every `api_called` event — correlating API calls to the agent session in the Doclight dashboard.

## What Gets Captured

One `api_called` event per request: route pattern, HTTP method, status, duration, error type, and session/agent IDs from headers. **Request bodies, response bodies, query parameters, and header values are never captured.**

## License

MIT
