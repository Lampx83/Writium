/**
 * API base for Write: standalone (same origin) or embed (Portal injects __WRITE_API_BASE__).
 */
export function getWriteApiBase(): string {
  if (typeof window !== "undefined" && (window as unknown as { __WRITE_API_BASE__?: string }).__WRITE_API_BASE__) {
    return (window as unknown as { __WRITE_API_BASE__: string }).__WRITE_API_BASE__.replace(/\/+$/, "")
  }
  return typeof process.env.NEXT_PUBLIC_WRITE_API_BASE === "string"
    ? process.env.NEXT_PUBLIC_WRITE_API_BASE.replace(/\/+$/, "")
    : ""
}

/** Base URL for articles API (append /api/write-articles when calling). */
export function getWriteArticlesBase(): string {
  const base = getWriteApiBase()
  return base ? `${base}/api/write-articles` : "/api/write-articles"
}
