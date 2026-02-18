/**
 * Writium – standalone server.
 * When embedded in AI Portal, mount agent + articles routers on Portal's app instead.
 */
import "./lib/env"
import fs from "fs"
import path from "path"
import express, { Request, Response } from "express"
import session from "express-session"
import { ensureDatabase } from "./lib/ensure-db"
import cors from "cors"
import { getEnv } from "./lib/env"
import agentRouter from "./routes/agent"
import articlesRouter from "./routes/articles"
import authRouter from "./routes/auth"

const PORT = Number(getEnv("PORT", "3002"))
const app = express()

app.set("trust proxy", 1)

const corsOrigin = getEnv("CORS_ORIGIN", "http://localhost:3000,http://localhost:3002,http://localhost:3003")
app.use(
  cors({
    origin: corsOrigin.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: true,
  })
)
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

const sessionSecret = getEnv("SESSION_SECRET", "writium-secret-change-in-production")
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 },
  })
)

// Static frontend
const publicDir = path.join(__dirname, "..", "public")
app.use(express.static(publicDir))

app.get("/health", async (req: Request, res: Response) => {
  try {
    const { query } = await import("./lib/db")
    await query("SELECT 1")
    res.json({ status: "ok", timestamp: new Date().toISOString(), database: "connected" })
  } catch (err) {
    console.error("Health check failed:", err)
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: "disconnected",
    })
  }
})

// Agent API: /v1/metadata, /v1/data, POST /v1/ask (same contract as Portal's /api/write_agent/v1/...)
app.use("/", agentRouter)
app.use("/api/write_agent", agentRouter)

// Articles API
app.use("/api/write-articles", articlesRouter)

app.use("/api/auth", authRouter)

app.get("/api-info", (req: Request, res: Response) => {
  res.json({
    name: "Writium",
    version: "1.0.0",
    mode: getEnv("RUN_MODE", "standalone"),
    endpoints: { agent: "/v1", articles: "/api/write-articles" },
  })
})

// SPA: path is not API and not a static file → index.html (or fallback if frontend not built)
const indexPath = path.join(publicDir, "index.html")
app.get("*", (req: Request, res: Response, next: () => void) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) return next()
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath)
  res.type("html").send(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Writium</title></head><body>
  <h1>Writium backend is running</h1>
  <p>Frontend not built. Either:</p>
  <ul>
    <li>Run <code>npm run build:frontend</code> then reload, or</li>
    <li>For dev: in another terminal run <code>cd frontend && npm run dev</code>, then open <a href="http://localhost:3003">http://localhost:3003</a></li>
  </ul>
</body></html>`)
})

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found" })
})

function tryListen(port: number): void {
  const server = app.listen(port, () => {
    console.log(`Writium listening on port ${port} (RUN_MODE=${getEnv("RUN_MODE", "standalone")})`)
  })
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying ${port + 1}...`)
      tryListen(port + 1)
    } else {
      throw err
    }
  })
}

;(async () => {
  try {
    await ensureDatabase()
  } catch (e) {
    console.error("[startup] ensureDatabase failed:", (e as Error)?.message ?? e)
  }
  tryListen(PORT)
})()

export default app
