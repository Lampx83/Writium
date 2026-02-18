const GUEST_ID_KEY = "write_guest_id"
const GUEST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function generateGuestId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Get or create guest ID (localStorage). Client-side only. */
export function getOrCreateGuestId(): string | null {
  if (typeof window === "undefined") return null
  try {
    let id = localStorage.getItem(GUEST_ID_KEY)
    if (!id || !GUEST_UUID_RE.test(id)) {
      id = generateGuestId()
      localStorage.setItem(GUEST_ID_KEY, id)
    }
    return id
  } catch {
    return null
  }
}
