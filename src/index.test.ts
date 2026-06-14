import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import type { AddressInfo } from "node:net"
import express, { type NextFunction, type Request, type Response } from "express"
import request from "supertest"
import { doclightMiddleware } from "./index"

// ─── CaptureSink ─────────────────────────────────────────────────────────────

interface CapturedEvent {
  type: string
  apiEndpoint?: string
  httpMethod?: string
  status?: string
  durationMs?: number
  errorType?: string
  sessionId?: string
  agentType?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

class CaptureSink {
  readonly events: CapturedEvent[] = []
  private _server: Server | undefined
  private _port = 0

  get baseUrl() {
    return `http://127.0.0.1:${this._port}`
  }

  async start() {
    await new Promise<void>((resolve) => {
      this._server = createServer((req: IncomingMessage, res: ServerResponse) => {
        void this._handle(req, res)
      })
      this._server.listen(0, "127.0.0.1", () => {
        this._port = (this._server!.address() as AddressInfo).port
        resolve()
      })
    })
  }

  async stop() {
    if (!this._server) return
    await new Promise<void>((resolve, reject) => {
      this._server!.close((err) => (err ? reject(err) : resolve()))
    })
  }

  private async _handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString("utf8")
    try {
      const parsed = JSON.parse(body)
      const evs: CapturedEvent[] = Array.isArray(parsed.events) ? parsed.events : []
      this.events.push(...evs)
    } catch {
      // ignore malformed payloads
    }
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify({ accepted: 1, rejected: 0 }))
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cfg(endpoint: string, overrides?: object) {
  return {
    apiKey: "dl_express_test",
    projectId: "proj_express_test",
    endpoint,
    transport: { batchSize: 1, flushIntervalMs: 60_000, retries: 0 },
    ...overrides,
  } as const
}

function apiCalledEvents(sink: CaptureSink) {
  return sink.events.filter((e) => e.type === "api_called")
}

async function waitForEvent(sink: CaptureSink, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (apiCalledEvents(sink).length > 0) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error("Timed out waiting for api_called event")
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("doclightMiddleware", () => {
  let sink: CaptureSink

  beforeEach(async () => {
    sink = new CaptureSink()
    await sink.start()
  })

  afterEach(async () => {
    await sink.stop()
  })

  // ── 1: Happy path ─────────────────────────────────────────────────────────
  it("emits api_called with correct fields for a successful GET", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/api/data", (_req: Request, res: Response) => res.json({ ok: true }))

    await request(app).get("/api/data").expect(200)
    await waitForEvent(sink)

    const events = apiCalledEvents(sink)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev.apiEndpoint).toBe("/api/data")
    expect(ev.httpMethod).toBe("GET")
    expect(ev.status).toBe("success")
    expect(typeof ev.durationMs).toBe("number")
    expect(ev.durationMs).toBeGreaterThanOrEqual(0)
  })

  // ── 2: 404 → failed + not_found ───────────────────────────────────────────
  it("sets status:failed and errorType:not_found for a 404 response", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/missing", (_req: Request, res: Response) =>
      res.status(404).json({ error: "not found" }),
    )

    await request(app).get("/missing").expect(404)
    await waitForEvent(sink)

    const ev = apiCalledEvents(sink)[0]!
    expect(ev.status).toBe("failed")
    expect(ev.errorType).toBe("not_found")
  })

  // ── 3: 401 → unauthorized ─────────────────────────────────────────────────
  it("sets errorType:unauthorized for a 401 response", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/secret", (_req: Request, res: Response) => res.status(401).end())

    await request(app).get("/secret").expect(401)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.errorType).toBe("unauthorized")
  })

  // ── 4: 500 → server_error ─────────────────────────────────────────────────
  it("sets errorType:server_error for a 500 response", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/boom", (_req: Request, res: Response) => res.status(500).end())

    await request(app).get("/boom").expect(500)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.errorType).toBe("server_error")
  })

  // ── 5: Route normalization — Express route pattern ────────────────────────
  it("uses req.route.path when Express matched a named param route", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/users/:id", (_req: Request, res: Response) => res.json({}))

    await request(app).get("/users/123").expect(200)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.apiEndpoint).toBe("/users/:id")
  })

  // ── 6: Route normalization — slug with digit ──────────────────────────────
  it("normalizes slug-with-digit segments to :id when no route pattern", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    // Catch-all so req.route is not set by a named param route
    app.use((_req: Request, res: Response) => res.status(200).end())

    await request(app).get("/posts/abc-123-def").expect(200)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.apiEndpoint).toBe("/posts/:id")
  })

  // ── 7: Route normalization — plain path unchanged ─────────────────────────
  it("does not replace plain text path segments", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.use((_req: Request, res: Response) => res.status(200).end())

    await request(app).get("/healthz").expect(200)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.apiEndpoint).toBe("/healthz")
  })

  // ── 8: ignoreRoutes — no event for ignored path ───────────────────────────
  it("skips tracking when req.path is in ignoreRoutes", async () => {
    const app = express()
    app.use(
      doclightMiddleware({
        ...cfg(sink.baseUrl),
        express: { ignoreRoutes: ["/healthz"] },
      }),
    )
    app.get("/healthz", (_req: Request, res: Response) => res.json({ ok: true }))
    app.get("/api/data", (_req: Request, res: Response) => res.json({ ok: true }))

    await request(app).get("/healthz").expect(200)
    // Make a tracked request so we can confirm the sink is reachable
    await request(app).get("/api/data").expect(200)
    await waitForEvent(sink)

    const events = apiCalledEvents(sink)
    expect(events).toHaveLength(1)
    expect(events[0]?.apiEndpoint).not.toBe("/healthz")
  })

  // ── 9: ignoreUserAgents — no event for matched UA ─────────────────────────
  it("skips tracking when User-Agent matches ignoreUserAgents", async () => {
    const app = express()
    app.use(
      doclightMiddleware({
        ...cfg(sink.baseUrl),
        express: { ignoreUserAgents: ["Googlebot"] },
      }),
    )
    app.get("/page", (_req: Request, res: Response) => res.json({}))

    await request(app)
      .get("/page")
      .set("User-Agent", "Googlebot/2.1 (+http://www.google.com/bot.html)")
      .expect(200)

    // Fixed wait — no event to poll for
    await new Promise((r) => setTimeout(r, 300))
    expect(apiCalledEvents(sink)).toHaveLength(0)
  })

  // ── 10: Session correlation ───────────────────────────────────────────────
  it("propagates x-doclight-session-id header into event sessionId", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/api/chat", (_req: Request, res: Response) => res.json({}))

    const sessionId = "sess_abc_123"
    await request(app).get("/api/chat").set("x-doclight-session-id", sessionId).expect(200)
    await waitForEvent(sink)

    expect(apiCalledEvents(sink)[0]?.sessionId).toBe(sessionId)
  })

  // ── 11: Middleware overhead < 1ms ─────────────────────────────────────────
  it("adds less than 1ms average overhead per request", async () => {
    const RUNS = 20

    const appBase = express()
    appBase.get("/ping", (_req: Request, res: Response) => res.json({ ok: true }))
    const t0 = Date.now()
    for (let i = 0; i < RUNS; i++) {
      await request(appBase).get("/ping").expect(200)
    }
    const baseMs = (Date.now() - t0) / RUNS

    const appInstr = express()
    appInstr.use(doclightMiddleware(cfg(sink.baseUrl)))
    appInstr.get("/ping", (_req: Request, res: Response) => res.json({ ok: true }))
    const t1 = Date.now()
    for (let i = 0; i < RUNS; i++) {
      await request(appInstr).get("/ping").expect(200)
    }
    const instrMs = (Date.now() - t1) / RUNS

    expect(instrMs - baseMs).toBeLessThan(1)
  })

  // ── 12: Failure safety — invalid config ───────────────────────────────────
  it("does not affect response when Doclight config is invalid (strict:false)", async () => {
    const app = express()
    // Empty apiKey fails schema validation → client silently disabled (strict defaults false)
    app.use(
      doclightMiddleware({
        apiKey: "",
        projectId: "proj_test",
        endpoint: sink.baseUrl,
        transport: { batchSize: 1, flushIntervalMs: 60_000, retries: 0 },
      }),
    )
    app.get("/api", (_req: Request, res: Response) => res.json({ ok: true }))

    await request(app).get("/api").expect(200)
  })

  // ── 13: Express error handler compatibility ───────────────────────────────
  it("still emits api_called when route calls next(err) and error handler sends 500", async () => {
    const app = express()
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.get("/crash", (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error("something broke"))
    })
    // 4-arg signature required for Express to recognise as error handler
    app.use(
      (
        _err: Error,
        _req: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        res.status(500).json({ error: "internal server error" })
      },
    )

    await request(app).get("/crash").expect(500)
    await waitForEvent(sink)

    const ev = apiCalledEvents(sink)[0]!
    expect(ev.status).toBe("failed")
    expect(ev.errorType).toBe("server_error")
  })

  // ── 14: Body privacy ──────────────────────────────────────────────────────
  it("does not capture POST body content in any event field", async () => {
    const app = express()
    app.use(express.json())
    app.use(doclightMiddleware(cfg(sink.baseUrl)))
    app.post("/api/ingest", (_req: Request, res: Response) => res.status(201).end())

    const sensitivePayload = { password: "super-secret-1234", ssn: "123-45-6789" }
    await request(app).post("/api/ingest").send(sensitivePayload).expect(201)
    await waitForEvent(sink)

    const ev = apiCalledEvents(sink)[0]!
    const evStr = JSON.stringify(ev)
    expect(evStr).not.toContain("super-secret-1234")
    expect(evStr).not.toContain("123-45-6789")
    expect(evStr).not.toContain("password")
    expect(evStr).not.toContain("ssn")
  })
})
