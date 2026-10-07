import { createDoclight } from "@doclight/node"
import type { NextFunction, Request, Response } from "express"
import { classifyUserAgent } from "./bot-detect"
import { statusToErrorType } from "./error-map"
import { normalizeRoute } from "./route-pattern"
import { boundedId, referrerOrigin } from "./sanitize"
import type { DoclightMiddlewareConfig } from "./types"

// HTTP bodies, cookies, credentials, raw IPs and query strings are never captured.

const DEFAULT_SESSION_HEADER = "x-doclight-session-id"
const DEFAULT_AGENT_HEADER = "x-agent-id"

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

type Outcome = "completed" | "aborted" | "stream_error"

export function doclightMiddleware(config: DoclightMiddlewareConfig) {
  const { express: expressOpts = {}, ...doclightConfig } = config
  const {
    collect = "agents",
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
      if (collect === "none" || !METHODS.has(req.method)) {
        next()
        return
      }

      // 1. Skip ignored paths (exact match on req.path, which has no query string)
      if (ignoreRoutes.includes(req.path)) {
        next()
        return
      }

      // 2. Skip ignored user agents (substring match)
      const rawUa = req.headers["user-agent"]
      const ua = typeof rawUa === "string" ? rawUa : ""
      if (ignoreUserAgents.some((pat) => ua.includes(pat))) {
        next()
        return
      }

      // 3. Observed (untrusted) agent evidence, evaluated before the app runs.
      const bot = classifyUserAgent(ua)
      const declaredAgent = boundedId(req.headers[agentHeaderLower])
      if (collect === "agents" && bot === undefined && declaredAgent === undefined) {
        next()
        return
      }

      // 4. Record start BEFORE calling next()
      const start = performance.now()
      let emitted = false

      // Exactly one event per request, whichever of finish/close/error fires first.
      const emit = (outcome: Outcome): void => {
        if (emitted) return
        emitted = true
        try {
          const statusCode = res.statusCode
          const aborted = outcome === "aborted"
          const failed = outcome === "stream_error" || statusCode >= 400
          const status = aborted ? "cancelled" : failed ? "failed" : "success"
          const errorType = aborted
            ? "client_aborted"
            : outcome === "stream_error"
              ? "stream_error"
              : statusToErrorType(statusCode)
          const routePattern = normalizeRoute(req) // req.route is set by this point

          const sessionId = boundedId(req.headers[sessionHeaderLower]) ?? crypto.randomUUID()
          const agentType = bot?.name ?? declaredAgent
          const origin = referrerOrigin(req.headers["referer"])

          client.track("api_called", {
            sessionId,
            apiEndpoint: routePattern,
            httpMethod: req.method as HttpMethod,
            status,
            durationMs: Math.max(0, Math.round(performance.now() - start)),
            ...(errorType !== undefined ? { errorType } : {}),
            ...(agentType !== undefined ? { agentType } : {}),
            ...(bot !== undefined ? { agentVendor: bot.vendor } : {}),
            metadata: {
              statusCode: String(statusCode),
              routePattern,
              outcome,
              evidence: bot !== undefined ? "observed_user_agent" : "declared_header",
              trust: "untrusted",
              ...(origin !== undefined ? { referrerOrigin: origin } : {}),
            },
          })
        } catch {
          // Observability must never affect the response — swallow silently.
        }
      }

      // 5. Register hooks BEFORE next() so they fire even for synchronous handlers.
      res.once("finish", () => emit("completed"))
      res.once("close", () => emit(res.writableFinished ? "completed" : "aborted"))
      res.once("error", () => emit("stream_error"))

      // 6. Hand off — do NOT await
      next()
    } catch {
      // If middleware setup throws, still pass control forward.
      next()
    }
  }
}
