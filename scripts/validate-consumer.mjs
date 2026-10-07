#!/usr/bin/env node
// Packs the built package, installs the tarball into a clean temp project and runs
// ESM + CJS consumers against a local ingestion sink. No credentials are used.
// Usage: node scripts/validate-consumer.mjs [--express=4|5|<semver>] (default: 4 and 5)
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const arg = process.argv.find((a) => a.startsWith("--express="))
const versions = arg ? [arg.slice("--express=".length)] : ["4", "5"]
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" })

const packDir = mkdtempSync(join(tmpdir(), "doclight-express-pack-"))
run("pnpm", ["build"], root)
run("pnpm", ["pack", "--pack-destination", packDir], root)
const tarball = join(packDir, readdirSync(packDir).find((f) => f.endsWith(".tgz")))

const consumer = (esm) => `
${esm ? 'import http from "node:http"\nimport express from "express"\nimport { doclightMiddleware } from "@doclight/express"' : 'const http = require("node:http")\nconst express = require("express")\nconst { doclightMiddleware } = require("@doclight/express")'}

const events = []
const sink = http.createServer((req, res) => {
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    try { events.push(...JSON.parse(Buffer.concat(chunks).toString()).events) } catch {}
    res.writeHead(200, { "content-type": "application/json" }).end('{"accepted":1,"rejected":0}')
  })
})
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)))
const assert = (c, m) => { if (!c) { console.error("FAIL: " + m); process.exit(1) } }

const sinkPort = await listen(sink)
const mw = doclightMiddleware({
  apiKey: "dl_consumer_fixture", projectId: "proj_consumer_fixture",
  endpoint: "http://127.0.0.1:" + sinkPort,
  transport: { batchSize: 1, flushIntervalMs: 60000, retries: 0 },
})
const app = express()
app.use(mw)
app.get("/api/items/:id", (req, res) => res.json({ id: req.params.id }))
app.get("/boom", () => { throw new Error("boom") })
app.use((err, _req, res, _next) => res.status(500).json({ handled: true }))
const appPort = await listen(http.createServer(app))
const base = "http://127.0.0.1:" + appPort
const bot = { "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)" }

const ok = await fetch(base + "/api/items/42?token=SECRET", { headers: { ...bot, cookie: "sid=SECRET", authorization: "Bearer SECRET", referer: "https://example.com/private/path?token=SECRET" } })
assert(ok.status === 200 && (await ok.json()).id === "42", "response unchanged")
const err = await fetch(base + "/boom", { headers: bot })
assert(err.status === 500 && (await err.json()).handled === true, "error handler still runs")
const human = await fetch(base + "/api/items/1", { headers: { "user-agent": "Mozilla/5.0 Firefox/130.0" } })
assert(human.status === 200, "non-agent request served")

const started = Date.now()
await mw.shutdown(3000)
assert(Date.now() - started < 4000, "shutdown bounded")
await new Promise((r) => setTimeout(r, 200))

assert(events.length === 2, "exactly one event per recorded agent request, got " + events.length)
const [a, b] = events
assert(a.apiEndpoint === "/api/items/:id" && a.status === "success" && a.agentType, "success event shape")
assert(b.status === "failed", "error event status")
const wire = JSON.stringify(events)
assert(!/SECRET|sid=|127\\.0\\.0\\.1:\\d+\\/|token=/.test(wire), "no credentials, cookies, query or raw URLs on the wire")
assert(a.metadata.referrerOrigin === "https://example.com", "referrer origin only")
console.log("consumer ok (${esm ? "esm" : "cjs"})")
process.exit(0)
`

let failed = false
for (const v of versions) {
  const dir = mkdtempSync(join(tmpdir(), `doclight-express-consumer-${v}-`))
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, version: "0.0.0" }))
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball, `express@${v}`], dir)
    writeFileSync(join(dir, "esm.mjs"), consumer(true))
    // CJS has no top-level await; wrap it.
    const cjs = consumer(false)
    const head = cjs.split("\nconst events")[0]
    writeFileSync(join(dir, "cjs.cjs"), `${head}\n;(async () => {\nconst events${cjs.split("\nconst events")[1]}\n})()\n`)
    for (const f of ["esm.mjs", "cjs.cjs"]) {
      process.stdout.write(`express@${v} ${f}: `)
      process.stdout.write(run("node", [f], dir))
    }
  } catch (e) {
    failed = true
    console.error(`express@${v} FAILED: ${e.message}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
rmSync(packDir, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
