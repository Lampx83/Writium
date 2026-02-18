/**
 * Entry point to mount Write app into Portal (no separate process).
 * Exports routers for Portal to mount at /api/apps/write.
 */
import path from "path"
import express from "express"
import agentRouter from "./routes/agent"
import articlesRouter from "./routes/articles"

/**
 * Create main router to mount at /api/apps/:alias.
 * - /metadata -> alias for /v1/metadata (Portal standard)
 * - /v1/* -> agent (metadata, ask)
 * - /api/write-articles -> articles
 * Auth /api/auth/* in portal mode is handled by Portal (returns user from session).
 */
export function createEmbedRouter(): express.Router {
  const router = express.Router()
  router.use(express.json({ limit: "50mb" }))
  router.use(express.urlencoded({ extended: true, limit: "50mb" }))

  // Alias /metadata -> /v1/metadata (Portal expects GET {base_url}/metadata)
  router.get("/metadata", (req, res, next) => {
    const origUrl = req.url
    req.url = "/v1/metadata"
    ;(agentRouter as express.RequestHandler)(req, res, (err?: any) => {
      req.url = origUrl
      if (err) next(err)
      else next()
    })
  })
  router.use("/", agentRouter)
  router.use("/api/write-articles", articlesRouter)

  return router
}

/**
 * Public directory (for Portal to serve static assets).
 */
export function getPublicDir(appRoot: string): string {
  return path.join(appRoot, "public")
}
