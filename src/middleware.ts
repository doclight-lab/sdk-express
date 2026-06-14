import { createDoclight } from "@doclight/node"
import type { NextFunction, Request, Response } from "express"
import { statusToErrorType } from "./error-map"
import { normalizeRoute } from "./route-pattern"
import type { DoclightMiddlewareConfig } from "./types"

// HTTP bodies and header values are never captured — they may contain user data or secrets.

const DEFAULT_SESSION_HEADER = "x-doclight-session-id"
const DEFAULT_AGENT_HEADER = "x-agent-id"

export function doclightMiddleware(config: DoclightMiddlewareConfig) {
  const { express: expressOpts = {}, ...doclightConfig } = config
  const {
    ignoreRoutes = [],
    ignoreUserAgents = [],
    sessionHeader = DEFAULT_SESSION_HEADER,
    agentHeader = DEFAULT_AGENT_HEADER,
  } = expressOpts

  const sessionHeaderLower = sessionHeader.toLowerCase()
  const agentHeaderLower = agentHeader.toLowerCase()

  const client = createDoclight({ lifecycleHooks: false, ...doclightConfig })

  return function doclightHandler(req: Request, res: Response, next: NextFunction): void {
    try {
      // 1. Skip ignored paths (exact match on req.path, which has no query string)
      if (ignoreRoutes.includes(req.path)) {
        next()
        return
      }

      // 2. Skip ignored user agents (substring match)
      const ua = req.headers["user-agent"] ?? ""
      if (ignoreUserAgents.some((pat) => ua.includes(pat))) {
        next()
        return
      }

      // 3. Record start BEFORE calling next()
      const start = Date.now()

      // 4. Register finish hook BEFORE calling next() so it fires even for
      //    synchronous handlers that write the response during next()
      res.on("finish", () => {
        try {
          const statusCode = res.statusCode
          const status = statusCode < 400 ? "success" : "failed"
          const errorType = statusToErrorType(statusCode)
          const routePattern = normalizeRoute(req) // req.route is set by this point

          const rawSession = req.headers[sessionHeaderLower]
          const sessionId =
            typeof rawSession === "string" && rawSession.length > 0
              ? rawSession
              : crypto.randomUUID()

          const rawAgent = req.headers[agentHeaderLower]
          const agentType =
            typeof rawAgent === "string" && rawAgent.length > 0
              ? rawAgent
              : undefined

          client.track("api_called", {
            sessionId,
            apiEndpoint: routePattern,
            httpMethod: req.method as
              | "GET"
              | "POST"
              | "PUT"
              | "PATCH"
              | "DELETE"
              | "HEAD"
              | "OPTIONS",
            status,
            durationMs: Date.now() - start,
            ...(errorType !== undefined ? { errorType } : {}),
            ...(agentType !== undefined ? { agentType } : {}),
            metadata: { statusCode: String(statusCode), routePattern },
          })
        } catch {
          // Observability must never affect the response — swallow silently.
        }
      })

      // 5. Hand off — do NOT await
      next()
    } catch {
      // If middleware setup throws, still pass control forward.
      next()
    }
  }
}
