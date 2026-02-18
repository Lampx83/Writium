/**
 * Write articles API – CRUD, versions, comments, share, export-docx.
 * Uses __SCHEMA__ for table names (writium or ai_portal).
 */
import { Router, Request, Response } from "express"
import { query } from "../lib/db"
import { getCurrentUserId, getCurrentUser } from "../lib/auth"
import { getEnv } from "../lib/env"

const router = Router()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function paramId(req: Request): string {
  const p = req.params.id
  return Array.isArray(p) ? (p[0] ?? "") : (p ?? "")
}

function getBaseUrl(): string {
  return getEnv("WRITIUM_URL", "http://localhost:3002").replace(/\/$/, "")
}

/** User-friendly message when DB connection/auth fails. */
function dbErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e?.code === "28P01") return "Database connection failed: check user and password in .env (DATABASE_URL)."
  if (e?.code === "3D000") return "Database does not exist: run createdb writium and psql writium -f schema/schema.sql"
  return e?.message ?? "Database error"
}

/** Ensure user exists in users table (needed for guest when no record yet). */
async function ensureUserExists(userId: string, email: string, displayName: string): Promise<void> {
  const safeEmail = email === "guest@local" ? `guest-${userId}@local` : email
  await query(
    `INSERT INTO __SCHEMA__.users (id, email, display_name) VALUES ($1::uuid, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, String(safeEmail).slice(0, 255), (displayName || "Guest").slice(0, 200)]
  )
}

// POST /export-docx – no login required (HTML → DOCX only)
router.post("/export-docx", async (req: Request, res: Response) => {
  try {
    const { html = "" } = req.body ?? {}
    const htmlStr = String(html).trim()
    if (!htmlStr) return res.status(400).json({ error: "Missing HTML content" })
    const HTMLtoDOCX = require("html-to-docx")
    const result = await HTMLtoDOCX(htmlStr, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    })
    const data = Buffer.isBuffer(result)
      ? result
      : result instanceof Uint8Array
        ? Buffer.from(result)
        : Buffer.from(result as ArrayBuffer)
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    res.setHeader("Content-Disposition", 'attachment; filename="document.docx"')
    res.send(data)
  } catch (err: unknown) {
    console.error("POST /export-docx error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

async function canAccessArticle(
  userId: string,
  userEmail: string | undefined,
  articleId: string,
  _mode: "read" | "write"
): Promise<boolean> {
  const art = await query<{ user_id: string; project_id: string | null }>(
    `SELECT user_id, project_id FROM __SCHEMA__.write_articles WHERE id = $1::uuid LIMIT 1`,
    [articleId]
  )
  if (art.rows.length === 0) return false
  const row = art.rows[0]
  if (row.user_id === userId) return true
  if (!row.project_id || !userEmail) return false
  const proj = await query<{ user_id: string; team_members: unknown }>(
    `SELECT user_id, team_members FROM __SCHEMA__.projects WHERE id = $1::uuid LIMIT 1`,
    [row.project_id]
  )
  if (proj.rows.length === 0) return false
  const members = proj.rows[0].team_members
  const arr = Array.isArray(members) ? members.map((m: unknown) => String(m).trim().toLowerCase()) : []
  return arr.includes(userEmail.trim().toLowerCase())
}

async function isArticleOwner(articleId: string, userId: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM __SCHEMA__.write_articles WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
    [articleId, userId]
  )
  return rows.rows.length > 0
}

// GET / – list articles
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const currentUser = await getCurrentUser(req)
    const userEmail = currentUser?.email ?? undefined
    const limit = Math.min(Number(req.query.limit ?? 50), 100)
    const offset = Math.max(Number(req.query.offset ?? 0), 0)
    const projectId = (req.query.project_id as string)?.trim()
    const hasProjectId = projectId && UUID_RE.test(projectId)

    let whereClause: string
    let listParams: unknown[]
    let countParams: unknown[]

    if (!hasProjectId) {
      whereClause = "WHERE user_id = $1::uuid"
      listParams = [userId, limit, offset]
      countParams = [userId]
    } else {
      const proj = await query<{ user_id: string; team_members: unknown }>(
        `SELECT user_id, team_members FROM __SCHEMA__.projects WHERE id = $1::uuid LIMIT 1`,
        [projectId]
      )
      if (proj.rows.length === 0) {
        return res.json({ articles: [], page: { limit, offset, total: 0 } })
      }
      const ownerId = proj.rows[0].user_id
      const members = proj.rows[0].team_members
      const arr = Array.isArray(members) ? members.map((m: unknown) => String(m).trim().toLowerCase()) : []
      const isOwner = ownerId === userId
      const isMember = !!userEmail && arr.includes(userEmail.trim().toLowerCase())
      if (!isOwner && !isMember) {
        return res.json({ articles: [], page: { limit, offset, total: 0 } })
      }
      const authorId = isOwner ? userId : ownerId
      whereClause = "WHERE user_id = $1::uuid AND project_id = $2::uuid"
      listParams = [authorId, projectId, limit, offset]
      countParams = [authorId, projectId]
    }

    const limitOffset = hasProjectId ? "LIMIT $3 OFFSET $4" : "LIMIT $2 OFFSET $3"
    const rows = await query(
      `SELECT id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at
       FROM __SCHEMA__.write_articles
       ${whereClause}
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       ${limitOffset}`,
      listParams
    )
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM __SCHEMA__.write_articles ${whereClause}`,
      countParams
    )
    res.json({
      articles: rows.rows,
      page: { limit, offset, total: countRes.rows[0]?.total ?? 0 },
    })
  } catch (err: unknown) {
    console.error("GET /articles error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// GET /shared/:token – no login required (public share link)
router.get("/shared/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim()
    if (!token) return res.status(400).json({ error: "Missing share token" })
    const rows = await query(
      `SELECT id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at, share_token
       FROM __SCHEMA__.write_articles WHERE share_token = $1 LIMIT 1`,
      [token]
    )
    if (rows.rows.length === 0) return res.status(404).json({ error: "Share link invalid or expired" })
    res.json({ article: rows.rows[0] })
  } catch (err: unknown) {
    console.error("GET /shared/:token error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// PATCH /shared/:token – no login required (edit via share link)
router.patch("/shared/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim()
    if (!token) return res.status(400).json({ error: "Missing share token" })
    const body = req.body ?? {}
    const { title, content, template_id } = body
    const refsRaw = body.references_json ?? body.references
    const updates: string[] = []
    const params: unknown[] = []
    let p = 1
    if (title !== undefined) { updates.push(`title = $${p++}`); params.push(String(title).slice(0, 500)) }
    if (content !== undefined) { updates.push(`content = $${p++}`); params.push(String(content)) }
    if (template_id !== undefined) { updates.push(`template_id = $${p++}`); params.push(template_id || null) }
    if (refsRaw !== undefined) { updates.push(`references_json = $${p++}::jsonb`); params.push(Array.isArray(refsRaw) ? JSON.stringify(refsRaw) : "[]") }
    if (updates.length === 0) {
      const existing = await query(
        `SELECT id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at
         FROM __SCHEMA__.write_articles WHERE share_token = $1`,
        [token]
      )
      if (existing.rows.length === 0) return res.status(404).json({ error: "Share link invalid or expired" })
      return res.json({ article: existing.rows[0] })
    }
    updates.push(`updated_at = now()`)
    params.push(token)
    const tokenParam = p
    const rows = await query(
      `UPDATE __SCHEMA__.write_articles SET ${updates.join(", ")} WHERE share_token = $${tokenParam}::text
       RETURNING id, user_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at`,
      params
    )
    if (rows.rows.length === 0) return res.status(404).json({ error: "Share link invalid or expired" })
    res.json({ article: rows.rows[0] })
  } catch (err: unknown) {
    console.error("PATCH /shared/:token error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// POST /:id/share
router.post("/:id/share", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const crypto = await import("crypto")
    const token = crypto.randomBytes(16).toString("hex")
    const result = await query(
      `UPDATE __SCHEMA__.write_articles SET share_token = $1 WHERE id = $2::uuid AND user_id = $3::uuid
       RETURNING id, share_token`,
      [token, id, userId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: "Article not found" })
    const shareUrl = `${getBaseUrl()}?share=${token}`
    res.json({ share_token: token, share_url: shareUrl })
  } catch (err: unknown) {
    console.error("POST /:id/share error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// DELETE /:id/share
router.delete("/:id/share", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    await query(`UPDATE __SCHEMA__.write_articles SET share_token = NULL WHERE id = $1::uuid AND user_id = $2::uuid`, [id, userId])
    res.status(204).send()
  } catch (err: unknown) {
    console.error("DELETE /:id/share error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

const MAX_VERSIONS_PER_ARTICLE = 100

// GET /:id/versions
router.get("/:id/versions", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, userId)
    if (!canAccess) return res.status(404).json({ error: "No permission to view this article" })
    const limit = Math.min(Number(req.query.limit ?? 50), 100)
    const rows = await query(
      `SELECT id, article_id, title, content, references_json, created_at
       FROM __SCHEMA__.write_article_versions WHERE article_id = $1::uuid ORDER BY created_at DESC LIMIT $2`,
      [id, limit]
    )
    res.json({ versions: rows.rows })
  } catch (err: unknown) {
    console.error("GET /:id/versions error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// GET /:id/versions/:vid
router.get("/:id/versions/:vid", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    const vid = (req.params as { vid?: string }).vid
    if (!UUID_RE.test(id) || !vid || !UUID_RE.test(vid)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, userId)
    if (!canAccess) return res.status(404).json({ error: "No permission to view this article" })
    const rows = await query(
      `SELECT id, article_id, title, content, references_json, created_at
       FROM __SCHEMA__.write_article_versions WHERE id = $1::uuid AND article_id = $2::uuid LIMIT 1`,
      [vid, id]
    )
    if (rows.rows.length === 0) return res.status(404).json({ error: "Version not found" })
    res.json({ version: rows.rows[0] })
  } catch (err: unknown) {
    console.error("GET /:id/versions/:vid error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// POST /:id/versions/:vid/restore
router.post("/:id/versions/:vid/restore", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const currentUser = await getCurrentUser(req)
    const userEmail = currentUser?.email ?? undefined
    const id = paramId(req)
    const vid = (req.params as { vid?: string }).vid
    if (!UUID_RE.test(id) || !vid || !UUID_RE.test(vid)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await canAccessArticle(userId, userEmail, id, "write")
    if (!canAccess) return res.status(404).json({ error: "No permission to edit this article" })
    const verRows = await query(
      `SELECT title, content, references_json FROM __SCHEMA__.write_article_versions
       WHERE id = $1::uuid AND article_id = $2::uuid LIMIT 1`,
      [vid, id]
    )
    if (verRows.rows.length === 0) return res.status(404).json({ error: "Version not found" })
    const v = verRows.rows[0] as { title: string; content: string; references_json: string }
    const upd = await query(
      `UPDATE __SCHEMA__.write_articles
       SET title = $1, content = $2, references_json = $3::jsonb, updated_at = now()
       WHERE id = $4::uuid AND user_id = $5::uuid
       RETURNING id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at`,
      [v.title, v.content, v.references_json ?? "[]", id, userId]
    )
    if (upd.rows.length === 0) return res.status(404).json({ error: "Article not found" })
    res.json({ article: upd.rows[0] })
  } catch (err: unknown) {
    console.error("POST /:id/versions/:vid/restore error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// DELETE /:id/versions/:vid
router.delete("/:id/versions/:vid", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    const vid = (req.params as { vid?: string }).vid
    if (!UUID_RE.test(id) || !vid || !UUID_RE.test(vid)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, userId)
    if (!canAccess) return res.status(404).json({ error: "No permission to delete this article version" })
    const del = await query(
      `DELETE FROM __SCHEMA__.write_article_versions WHERE id = $1::uuid AND article_id = $2::uuid`,
      [vid, id]
    )
    if ((del as { rowCount?: number }).rowCount === 0) return res.status(404).json({ error: "Version not found" })
    res.status(204).send()
  } catch (err: unknown) {
    console.error("DELETE /:id/versions/:vid error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// POST /:id/versions/clear
router.post("/:id/versions/clear", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, userId)
    if (!canAccess) return res.status(404).json({ error: "No permission to clear this article history" })
    await query(
      `DELETE FROM __SCHEMA__.write_article_versions
       WHERE article_id = $1::uuid AND id NOT IN (
         SELECT id FROM __SCHEMA__.write_article_versions WHERE article_id = $1::uuid
         ORDER BY created_at DESC LIMIT 1
       )`,
      [id]
    )
    res.status(204).send()
  } catch (err: unknown) {
    console.error("POST /:id/versions/clear error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// GET /:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const currentUser = await getCurrentUser(req)
    const userEmail = currentUser?.email ?? undefined
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const allowed = await canAccessArticle(userId, userEmail, id, "read")
    if (!allowed) return res.status(404).json({ error: "Article not found" })
    const rows = await query(
      `SELECT id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at, share_token
       FROM __SCHEMA__.write_articles WHERE id = $1::uuid LIMIT 1`,
      [id]
    )
    if (rows.rows.length === 0) return res.status(404).json({ error: "Article not found" })
    res.json({ article: rows.rows[0] })
  } catch (err: unknown) {
    console.error("GET /:id error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// POST /
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const currentUser = await getCurrentUser(req)
    await ensureUserExists(userId, currentUser?.email ?? "guest@local", currentUser?.name ?? "Guest")
    const body = req.body ?? {}
    const { title = "Untitled document", content = "", template_id = null, project_id = null } = body
    const refsRaw = body.references_json ?? body.references ?? []
    const refsJson = Array.isArray(refsRaw) ? JSON.stringify(refsRaw) : "[]"
    const projectIdVal = project_id && UUID_RE.test(String(project_id).trim()) ? String(project_id).trim() : null
    const rows = await query(
      `INSERT INTO __SCHEMA__.write_articles (user_id, project_id, title, content, template_id, references_json)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
       RETURNING id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at`,
      [userId, projectIdVal, String(title).slice(0, 500), String(content), template_id || null, refsJson]
    )
    res.status(201).json({ article: rows.rows[0] })
  } catch (err: unknown) {
    console.error("POST / error:", err)
    const msg = dbErrorMessage(err)
    res.status(500).json({ error: "Internal Server Error", message: msg })
  }
})

// PATCH /:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const currentUser = await getCurrentUser(req)
    const userEmail = currentUser?.email ?? undefined
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const allowed = await canAccessArticle(userId, userEmail, id, "write")
    if (!allowed) return res.status(404).json({ error: "Article not found" })
    const body = req.body ?? {}
    const { title, content, template_id } = body
    const refsRaw = body.references_json ?? body.references
    const updates: string[] = []
    const params: unknown[] = []
    let p = 1
    if (title !== undefined) { updates.push(`title = $${p++}`); params.push(String(title).slice(0, 500)) }
    if (content !== undefined) { updates.push(`content = $${p++}`); params.push(String(content)) }
    if (template_id !== undefined) { updates.push(`template_id = $${p++}`); params.push(template_id || null) }
    if (refsRaw !== undefined) { updates.push(`references_json = $${p++}::jsonb`); params.push(Array.isArray(refsRaw) ? JSON.stringify(refsRaw) : "[]") }
    if (updates.length === 0) {
      const existing = await query(
        `SELECT id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at
         FROM __SCHEMA__.write_articles WHERE id = $1::uuid`,
        [id]
      )
      if (existing.rows.length === 0) return res.status(404).json({ error: "Article not found" })
      return res.json({ article: existing.rows[0] })
    }
    const current = await query(
      `SELECT title, content, COALESCE(references_json, '[]'::jsonb) AS references_json
       FROM __SCHEMA__.write_articles WHERE id = $1::uuid`,
      [id]
    )
    if (current.rows.length > 0) {
      const c = current.rows[0] as { title: string; content: string; references_json: string }
      await query(
        `INSERT INTO __SCHEMA__.write_article_versions (article_id, title, content, references_json)
         VALUES ($1::uuid, $2, $3, $4::jsonb)`,
        [id, c.title, c.content, typeof c.references_json === "string" ? c.references_json : JSON.stringify(c.references_json ?? [])]
      )
      const countRes = await query(
        `SELECT COUNT(*)::int AS n FROM __SCHEMA__.write_article_versions WHERE article_id = $1::uuid`,
        [id]
      )
      const n = (countRes.rows[0] as { n?: number })?.n ?? 0
      if (n > MAX_VERSIONS_PER_ARTICLE) {
        await query(
          `DELETE FROM __SCHEMA__.write_article_versions
           WHERE article_id = $1::uuid AND id NOT IN (
             SELECT id FROM __SCHEMA__.write_article_versions WHERE article_id = $1::uuid
             ORDER BY created_at DESC LIMIT $2
           )`,
          [id, MAX_VERSIONS_PER_ARTICLE]
        )
      }
    }
    updates.push(`updated_at = now()`)
    params.push(id)
    const whereIdParam = p
    const rows = await query(
      `UPDATE __SCHEMA__.write_articles SET ${updates.join(", ")} WHERE id = $${whereIdParam}::uuid
       RETURNING id, user_id, project_id, title, content, template_id, COALESCE(references_json, '[]'::jsonb) AS references_json, created_at, updated_at`,
      params
    )
    if (rows.rows.length === 0) return res.status(404).json({ error: "Article not found" })
    res.json({ article: rows.rows[0] })
  } catch (err: unknown) {
    console.error("PATCH /:id error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// DELETE /:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const result = await query(
      `DELETE FROM __SCHEMA__.write_articles WHERE id = $1::uuid AND user_id = $2::uuid`,
      [id, userId]
    )
    if ((result as { rowCount?: number }).rowCount === 0) return res.status(404).json({ error: "Article not found" })
    res.status(204).send()
  } catch (err: unknown) {
    console.error("DELETE /:id error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// GET /:id/comments
router.get("/:id/comments", async (req: Request, res: Response) => {
  try {
    const userId = await getCurrentUserId(req)
    if (!userId) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, userId)
    if (!canAccess) return res.status(404).json({ error: "No permission to view comments on this article" })
    const rows = await query(
      `SELECT id, article_id, user_id, author_display, content, parent_id, created_at
       FROM __SCHEMA__.write_article_comments WHERE article_id = $1::uuid ORDER BY created_at ASC`,
      [id]
    )
    res.json({ comments: rows.rows })
  } catch (err: unknown) {
    console.error("GET /:id/comments error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// POST /:id/comments
router.post("/:id/comments", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req)
    if (!user) return res.status(401).json({ error: "Not logged in" })
    const id = paramId(req)
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid ID" })
    const canAccess = await isArticleOwner(id, user.id)
    if (!canAccess) return res.status(404).json({ error: "No permission to comment on this article" })
    const body = req.body ?? {}
    const content = String(body.content ?? "").trim()
    const parentId = body.parent_id && UUID_RE.test(String(body.parent_id).trim()) ? String(body.parent_id).trim() : null
    const commentId = body.id && UUID_RE.test(String(body.id).trim()) ? String(body.id).trim() : null
    if (!content) return res.status(400).json({ error: "Comment content cannot be empty" })
    await ensureUserExists(user.id, user.email ?? "guest@local", user.name ?? "Guest")
    const authorDisplay = (user.name || user.email || "User").slice(0, 200)
    if (commentId) {
      const rows = await query(
        `INSERT INTO __SCHEMA__.write_article_comments (id, article_id, user_id, author_display, content, parent_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid)
         RETURNING id, article_id, user_id, author_display, content, parent_id, created_at`,
        [commentId, id, user.id, authorDisplay, content, parentId]
      )
      return res.status(201).json({ comment: rows.rows[0] })
    }
    const rows = await query(
      `INSERT INTO __SCHEMA__.write_article_comments (article_id, user_id, author_display, content, parent_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)
       RETURNING id, article_id, user_id, author_display, content, parent_id, created_at`,
      [id, user.id, authorDisplay, content, parentId]
    )
    res.status(201).json({ comment: rows.rows[0] })
  } catch (err: unknown) {
    console.error("POST /:id/comments error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

// DELETE /:id/comments/:commentId
router.delete("/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req)
    if (!user) return res.status(401).json({ error: "Not logged in" })
    const articleId = paramId(req)
    const commentId = (req.params as { commentId?: string }).commentId?.trim()
    if (!UUID_RE.test(articleId) || !commentId || !UUID_RE.test(commentId)) return res.status(400).json({ error: "Invalid ID" })
    const isOwner = await isArticleOwner(articleId, user.id)
    const commentRow = await query(
      `SELECT id, user_id FROM __SCHEMA__.write_article_comments WHERE id = $1::uuid AND article_id = $2::uuid LIMIT 1`,
      [commentId, articleId]
    )
    const comment = commentRow.rows[0] as { id: string; user_id: string } | undefined
    if (!comment) return res.status(404).json({ error: "Comment not found" })
    const isCommentAuthor = comment.user_id === user.id
    if (!isOwner && !isCommentAuthor) return res.status(403).json({ error: "Only the article owner or comment author can delete" })
    await query(
      `DELETE FROM __SCHEMA__.write_article_comments WHERE id = $1::uuid AND article_id = $2::uuid`,
      [commentId, articleId]
    )
    res.status(204).send()
  } catch (err: unknown) {
    console.error("DELETE /:id/comments/:commentId error:", err)
    res.status(500).json({ error: "Internal Server Error", message: (err as Error)?.message })
  }
})

/** For Portal collab WS: resolve article access. */
export async function resolveArticleAccess(
  userId: string,
  userEmail: string | undefined,
  params: { articleId?: string; shareToken?: string }
): Promise<string | null> {
  if (params.shareToken && String(params.shareToken).trim()) {
    const rows = await query<{ id: string }>(
      `SELECT id FROM __SCHEMA__.write_articles WHERE share_token = $1::text LIMIT 1`,
      [String(params.shareToken).trim()]
    )
    return rows.rows[0]?.id ?? null
  }
  if (params.articleId && UUID_RE.test(params.articleId)) {
    const allowed = await canAccessArticle(userId, userEmail, params.articleId, "read")
    return allowed ? params.articleId : null
  }
  return null
}

export default router
