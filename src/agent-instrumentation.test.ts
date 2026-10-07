import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import { createServer, request as httpRequest, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express, { type NextFunction, type Request, type Response } from "express"
import request from "supertest"

const tracked: Array<Record<string, unknown>> = []
let trackImpl: (type: string, fields: Record<string, unknown>) => void

vi.mock("@doclight/node", () => ({
  createDoclight: () => ({
    track: (type: string, fields: Record<string, unknown>) => trackImpl(type, fields),
  }),
}))

import { doclightMiddleware } from "./index"

const BOT = "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)"
const baseCfg = { apiKey: "k", projectId: "p" }

beforeEach(() => {
  tracked.length = 0
  trackImpl = (_t, f) => void tracked.push(f)
})

const meta = (e: Record<string, unknown>) => e.metadata as Record<string, unknown>

describe("collection policy", () => {
  it("defaults to agent-only: ignores unknown/human requests", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("User-Agent", "Mozilla/5.0 Firefox").expect(200)
    await request(app).get("/a").expect(200)
    expect(tracked).toHaveLength(0)
  })

  it("records known bots as observed, untrusted evidence", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("User-Agent", BOT).expect(200)
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).toMatchObject({ agentType: "GPTBot", agentVendor: "openai", status: "success" })
    expect(meta(tracked[0]!)).toMatchObject({ evidence: "observed_user_agent", trust: "untrusted" })
  })

  it("records a valid declared agent header as untrusted", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("x-agent-id", "my-agent").expect(200)
    expect(tracked[0]).toMatchObject({ agentType: "my-agent" })
    expect(meta(tracked[0]!)).toMatchObject({ evidence: "declared_header", trust: "untrusted" })
  })

  it("collect:none opts out even for bots", async () => {
    const app = express()
    app.use(doclightMiddleware({ ...baseCfg, express: { collect: "none" } }))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("User-Agent", BOT).expect(200)
    expect(tracked).toHaveLength(0)
  })

  it("collect:all records unknown clients without agent fields", async () => {
    const app = express()
    app.use(doclightMiddleware({ ...baseCfg, express: { collect: "all" } }))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").expect(200)
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).not.toHaveProperty("agentType")
  })

  it("ignoreRoutes / ignoreUserAgents skip bots", async () => {
    const app = express()
    app.use(
      doclightMiddleware({
        ...baseCfg,
        express: { ignoreRoutes: ["/health"], ignoreUserAgents: ["GPTBot"] },
      }),
    )
    app.get("/health", (_q: Request, r: Response) => r.send("ok"))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/health").set("User-Agent", "ClaudeBot/1.0").expect(200)
    await request(app).get("/a").set("User-Agent", BOT).expect(200)
    expect(tracked).toHaveLength(0)
  })
})

describe("one event per request", () => {
  it("emits once for success, with route template and referrer origin only", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/users/:id", (_q: Request, r: Response) => r.json({}))
    await request(app)
      .get("/users/42?token=secret123")
      .set("User-Agent", BOT)
      .set("Referer", "https://user:pw@example.com:8443/private/path?q=secret#frag")
      .expect(200)
    expect(tracked).toHaveLength(1)
    const ev = tracked[0]!
    expect(ev.apiEndpoint).toBe("/users/:id")
    expect(meta(ev).referrerOrigin).toBe("https://example.com:8443")
    const s = JSON.stringify(ev)
    for (const leak of ["secret123", "pw", "private", "frag", "token"]) expect(s).not.toContain(leak)
  })

  it("drops non-http referrers", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("User-Agent", BOT).set("Referer", "javascript:alert(1)").expect(200)
    expect(meta(tracked[0]!)).not.toHaveProperty("referrerOrigin")
  })

  it("keeps router mount prefix without leaking mount params or query", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    const router = express.Router({ mergeParams: true })
    router.get("/items/:itemId", (_q: Request, r: Response) => r.send("ok"))
    app.use("/orgs/acme-9", router)
    await request(app).get("/orgs/acme-9/items/5?k=v").set("User-Agent", BOT).expect(200)
    expect(tracked[0]!.apiEndpoint).toBe("/orgs/:id/items/:itemId")
  })

  it("masks secret-like segments on unmatched paths", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    const secret = "sk_live_" + "a".repeat(30)
    await request(app).get(`/reset/${secret}?x=1`).set("User-Agent", BOT).expect(404)
    expect(tracked).toHaveLength(1)
    expect(JSON.stringify(tracked[0])).not.toContain(secret)
    expect(tracked[0]).toMatchObject({ status: "failed", errorType: "not_found" })
  })

  it("emits once and preserves the error handler for next(err)", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/boom", (_q: Request, _r: Response, next: NextFunction) => next(new Error("x")))
    app.use((_e: Error, _q: Request, r: Response, _n: NextFunction) => {
      r.status(500).json({ handled: true })
    })
    const res = await request(app).get("/boom").set("User-Agent", BOT).expect(500)
    expect(res.body).toEqual({ handled: true })
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).toMatchObject({ status: "failed", errorType: "server_error" })
  })

  it("emits once for a streamed response", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/s", (_q: Request, r: Response) => {
      r.write("a")
      setTimeout(() => {
        r.write("b")
        r.end("c")
      }, 10)
    })
    const res = await request(app).get("/s").set("User-Agent", BOT).expect(200)
    expect(res.text).toBe("abc")
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).toMatchObject({ status: "success" })
  })

  it("repeated finish/close/error callbacks still yield one event", () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true })
    const req = {
      method: "GET",
      path: "/a",
      originalUrl: "/a",
      headers: { "user-agent": BOT },
    }
    const next = vi.fn()
    doclightMiddleware(baseCfg)(req as unknown as Request, res as unknown as Response, next)
    expect(next).toHaveBeenCalledTimes(1)
    res.emit("finish")
    res.emit("finish")
    res.emit("close")
    res.emit("error", new Error("late"))
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).toMatchObject({ status: "success" })
  })
})

describe("aborted connections", () => {
  let server: Server
  afterEach(() => new Promise<void>((r) => server.close(() => r())))

  it("records client abort as cancelled, exactly once", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/slow", (_q: Request, r: Response) => {
      r.write("partial")
      // never ends
    })
    server = createServer(app)
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
    const port = (server.address() as AddressInfo).port
    await new Promise<void>((resolve) => {
      const req = httpRequest(
        { port, host: "127.0.0.1", path: "/slow", headers: { "user-agent": BOT } },
        (res) => {
          res.once("data", () => {
            req.destroy()
            resolve()
          })
          res.on("error", () => {})
        },
      )
      req.on("error", () => {})
      req.end()
    })
    await vi.waitFor(() => expect(tracked).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(tracked).toHaveLength(1)
    expect(tracked[0]).toMatchObject({ status: "cancelled", errorType: "client_aborted" })
    expect(meta(tracked[0]!).outcome).toBe("aborted")
  })
})

describe("bounded correlation and failure isolation", () => {
  it("ignores oversized or unsafe session/agent headers", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app)
      .get("/a")
      .set("User-Agent", BOT)
      .set("x-doclight-session-id", "s".repeat(500))
      .set("x-agent-id", "bad value;<script>")
      .expect(200)
    const ev = tracked[0]!
    expect(String(ev.sessionId)).toMatch(/^[0-9a-f-]{36}$/)
    expect(ev.agentType).toBe("GPTBot")
  })

  it("accepts a valid bounded session id", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.get("/a", (_q: Request, r: Response) => r.send("ok"))
    await request(app).get("/a").set("User-Agent", BOT).set("x-doclight-session-id", "sess_1").expect(200)
    expect(tracked[0]!.sessionId).toBe("sess_1")
  })

  it("does not alter the response when track() throws", async () => {
    trackImpl = () => {
      throw new Error("telemetry down")
    }
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.post("/a", express.json(), (q: Request, r: Response) => r.status(201).json(q.body))
    const res = await request(app).post("/a").set("User-Agent", BOT).send({ a: 1 }).expect(201)
    expect(res.body).toEqual({ a: 1 })
  })

  it("does not consume the request body", async () => {
    const app = express()
    app.use(doclightMiddleware(baseCfg))
    app.post("/echo", express.text(), (q: Request, r: Response) => r.send(q.body))
    const res = await request(app)
      .post("/echo")
      .set("User-Agent", BOT)
      .set("Content-Type", "text/plain")
      .send("hello")
      .expect(200)
    expect(res.text).toBe("hello")
    expect(JSON.stringify(tracked[0])).not.toContain("hello")
  })
})
