import type { CreateDoclightConfig } from "@doclight/node"

export interface DoclightExpressOptions {
  express?: {
    captureRoutePattern?: boolean
    ignoreRoutes?: string[]
    ignoreUserAgents?: string[]
    sessionHeader?: string
    agentHeader?: string
  }
}

export type DoclightMiddlewareConfig = CreateDoclightConfig & DoclightExpressOptions
