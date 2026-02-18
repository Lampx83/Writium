/**
 * Get current user: standalone = from header (X-User-Id when proxied) or simple session;
 * portal = from X-User-Id, X-User-Email, X-User-Name set by Portal proxy.
 */
import type { Request } from "express"
import { AUTH_MODE } from "./env"

export type CurrentUser = { id: string; email?: string; name?: string }

export async function getCurrentUserId(req: Request): Promise<string | null> {
  const user = await getCurrentUser(req)
  return user?.id ?? null
}

const GUEST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getCurrentUser(req: Request): Promise<CurrentUser | null> {
  if (AUTH_MODE === "portal") {
    const portalUser = (req as Request & { portalUser?: CurrentUser }).portalUser
    if (portalUser?.id) return portalUser
    const id = req.headers["x-user-id"] as string | undefined
    const email = req.headers["x-user-email"] as string | undefined
    const name = req.headers["x-user-name"] as string | undefined
    if (id?.trim()) {
      return { id: id.trim(), email: email?.trim(), name: name?.trim() }
    }
    const guestId = (req.headers["x-guest-id"] as string)?.trim()
    if (guestId && GUEST_UUID_RE.test(guestId)) {
      return { id: guestId, email: "guest@local", name: "Guest" }
    }
    return null
  }
  // Standalone: same pattern - can be set by reverse proxy or simple session
  const id = req.headers["x-user-id"] as string | undefined
  const email = req.headers["x-user-email"] as string | undefined
  const name = req.headers["x-user-name"] as string | undefined
  if (id?.trim()) {
    return { id: id.trim(), email: email?.trim(), name: name?.trim() }
  }
  const guestId = (req.headers["x-guest-id"] as string)?.trim()
  if (guestId && GUEST_UUID_RE.test(guestId)) {
    return { id: guestId, email: "guest@local", name: "Guest" }
  }
  // Optional: cookie/session for standalone
  const session = (req as Request & { session?: { userId?: string; userEmail?: string; userDisplayName?: string } }).session
  if (session?.userId) {
    return {
      id: session.userId,
      email: session.userEmail,
      name: session.userDisplayName,
    }
  }
  return null
}

/** For WebSocket upgrade: get user from request (cookie/header). */
export type WsRequestLike = { headers: { cookie?: string; [k: string]: string | string[] | undefined } }

export async function getCurrentUserFromWs(req: WsRequestLike): Promise<CurrentUser | null> {
  const id = req.headers["x-user-id"] as string | undefined
  const email = req.headers["x-user-email"] as string | undefined
  const name = req.headers["x-user-name"] as string | undefined
  if (id?.trim()) {
    return { id: id.trim(), email: email?.trim(), name: name?.trim() }
  }
  return null
}
