import { afterEach, describe, expect, it } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import request from "supertest"
import { doclightMiddleware } from "./index"

let server: Server | undefined

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

async function hangingEndpoint(): Promise<string> {
  // Accepts connections but never answers, simulating an unreachable ingest.
  server = createServer(() => undefined)
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

describe("middleware shutdown", () => {
  it("resolves within the timeout when ingestion hangs and does not affect responses", async () => {
    const endpoint = await hangingEndpoint()
    const mw = doclightMiddleware({
      apiKey: "dl_express_test",
      projectId: "proj_express_test",
      endpoint,
      transport: { batchSize: 1, flushIntervalMs: 60_000, retries: 0, requestTimeoutMs: 30_000 },
      express: { collect: "all" },
    })
    const app = express()
    app.use(mw)
    app.get("/ok", (_req, res) => res.json({ ok: true }))

    const res = await request(app).get("/ok")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })

    const started = Date.now()
    await mw.shutdown(300)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it("flush and shutdown never reject", async () => {
    const mw = doclightMiddleware({
      apiKey: "dl_express_test",
      projectId: "proj_express_test",
      endpoint: "http://127.0.0.1:1",
      transport: { retries: 0, requestTimeoutMs: 200 },
      express: { collect: "none" },
    })
    await expect(mw.flush(200)).resolves.toBeUndefined()
    await expect(mw.shutdown(200)).resolves.toBeUndefined()
  })
})
