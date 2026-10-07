import type { CreateDoclightConfig } from "@doclight/node"

export interface DoclightExpressOptions {
  express?: {
    /**
     * Which requests are recorded.
     * - `"agents"` (default): only requests with observed bot/agent evidence
     *   (known bot User-Agent or a valid agent header).
     * - `"all"`: every non-ignored request.
     * - `"none"`: opt out entirely; no events are emitted.
     */
    collect?: "agents" | "all" | "none"
    captureRoutePattern?: boolean
    ignoreRoutes?: string[]
    ignoreUserAgents?: string[]
    sessionHeader?: string
    agentHeader?: string
  }
}

export type DoclightMiddlewareConfig = CreateDoclightConfig & DoclightExpressOptions
