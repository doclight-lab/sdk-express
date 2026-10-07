// Runnable example: DOCLIGHT_API_KEY=... DOCLIGHT_PROJECT_ID=... node examples/server.mjs
// Requires `pnpm build` (or an installed @doclight/express).
import express from "express"
import { doclightMiddleware } from "../dist/index.mjs"

const doclight = doclightMiddleware({
  apiKey: process.env.DOCLIGHT_API_KEY ?? "",
  projectId: process.env.DOCLIGHT_PROJECT_ID ?? "",
  enabled: Boolean(process.env.DOCLIGHT_API_KEY && process.env.DOCLIGHT_PROJECT_ID),
  express: { ignoreRoutes: ["/healthz"] },
})

const app = express()
app.use(doclight)
app.get("/healthz", (_req, res) => res.send("ok"))
app.get("/api/items/:id", (req, res) => res.json({ id: req.params.id }))

const server = app.listen(Number(process.env.PORT ?? 3000), () => console.log("listening"))

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close()
    // Bounded: resolves within 5s even if ingestion is unreachable.
    void doclight.shutdown(5000).finally(() => process.exit(0))
  })
}
