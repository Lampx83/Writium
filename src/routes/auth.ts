/**
 * Auth for standalone: login by email, session stores userId.
 */
import { Router, Request, Response } from "express"
import { query } from "../lib/db"
import { RUN_MODE } from "../lib/env"

const router = Router()

export type SessionData = { userId?: string; userEmail?: string; userDisplayName?: string }

router.get("/me", async (req: Request, res: Response) => {
  if (RUN_MODE !== "standalone") {
    return res.status(404).json({ error: "Not available" })
  }
  const session = (req as Request & { session?: SessionData }).session
  if (!session?.userId) {
    return res.status(401).json({ error: "Not logged in" })
  }
  res.json({
    user: {
      id: session.userId,
      email: session.userEmail ?? "",
      name: session.userDisplayName ?? "",
    },
  })
})

router.post("/login", async (req: Request, res: Response) => {
  if (RUN_MODE !== "standalone") {
    return res.status(404).json({ error: "Not available" })
  }
  const email = (req.body?.email ?? "").toString().trim().toLowerCase()
  if (!email) {
    return res.status(400).json({ error: "Please enter email" })
  }
  const rows = await query<{ id: string; email: string; display_name: string | null }>(
    `SELECT id, email, display_name FROM __SCHEMA__.users WHERE email = $1 LIMIT 1`,
    [email]
  )
  let userId: string
  let displayName: string | null
  if (rows.rows.length > 0) {
    userId = rows.rows[0].id
    displayName = rows.rows[0].display_name
  } else {
    const insert = await query<{ id: string }>(
      `INSERT INTO __SCHEMA__.users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, email.split("@")[0] || "User"]
    )
    userId = insert.rows[0].id
    displayName = email.split("@")[0] || "User"
  }
  const session = (req as Request & { session?: SessionData }).session
  if (session) {
    session.userId = userId
    session.userEmail = email
    session.userDisplayName = displayName ?? email
  }
  res.json({
    user: { id: userId, email, name: displayName ?? email },
  })
})

router.post("/logout", (req: Request, res: Response) => {
  const session = (req as Request & { session?: SessionData }).session
  if (session) {
    session.userId = undefined
    session.userEmail = undefined
    session.userDisplayName = undefined
  }
  res.json({ ok: true })
})

export default router
