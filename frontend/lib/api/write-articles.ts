/**
 * Write Articles API client – used by Write app (standalone or embed).
 * Standalone: send X-Guest-Id for backend to accept (no login required).
 */
import { getWriteArticlesBase } from "@/lib/config"
import { getOrCreateGuestId } from "@/lib/guest-id"

function getBase(): string {
  return getWriteArticlesBase()
}

function getRequestHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  }
  const guestId = typeof window !== "undefined" ? getOrCreateGuestId() : null
  if (guestId) headers["X-Guest-Id"] = guestId
  return headers
}

async function request<T>(
  path: string,
  options: RequestInit & { search?: Record<string, string> } = {}
): Promise<T> {
  const { search, ...init } = options
  const base = getBase()
  const p = path.startsWith("/") ? path : `/${path}`
  const url = search && Object.keys(search).length > 0
    ? `${base}${p}?${new URLSearchParams(search).toString()}`
    : `${base}${p}`
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: getRequestHeaders(init),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string; message?: string })?.message ?? (data as { error?: string })?.error ?? `HTTP ${res.status}`)
  return data as T
}

export type CitationReference = {
  type?: string
  author?: string
  title?: string
  year?: string
  journal?: string
  volume?: string
  pages?: string
  publisher?: string
  doi?: string
  url?: string
  booktitle?: string
}

export type WriteArticle = {
  id: string
  user_id: string
  project_id: string | null
  title: string
  content: string
  template_id: string | null
  references_json: CitationReference[] | string
  created_at: string
  updated_at: string
}

export type WriteArticleWithShare = WriteArticle & { share_token?: string | null }

export type WriteArticleComment = {
  id: string
  article_id: string
  user_id: string
  author_display: string | null
  content: string
  parent_id: string | null
  created_at: string
}

export type WriteArticleVersion = {
  id: string
  article_id: string
  title: string
  content: string
  references_json: unknown
  created_at: string
}

export async function getWriteArticles(projectId?: string | null): Promise<WriteArticle[]> {
  const search: Record<string, string> = { limit: "50", offset: "0" }
  if (projectId) search.project_id = projectId
  const data = await request<{ articles: WriteArticle[] }>("/", { method: "GET", search })
  return data.articles ?? []
}

export async function getWriteArticle(id: string): Promise<WriteArticleWithShare> {
  const data = await request<{ article: WriteArticleWithShare }>(`/${id}`, { method: "GET" })
  return data.article
}

export async function createWriteArticle(body: {
  title?: string
  content?: string
  template_id?: string | null
  project_id?: string | null
  references?: CitationReference[]
  references_json?: CitationReference[]
}): Promise<WriteArticleWithShare> {
  const payload = {
    title: body.title ?? "Untitled document",
    content: body.content ?? "",
    template_id: body.template_id ?? null,
    project_id: body.project_id ?? null,
    references_json: body.references_json ?? body.references ?? [],
  }
  const data = await request<{ article: WriteArticleWithShare }>("/", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return data.article
}

export async function updateWriteArticle(
  id: string,
  body: { title?: string; content?: string; template_id?: string | null; references?: CitationReference[]; references_json?: CitationReference[] }
): Promise<WriteArticleWithShare> {
  const payload: Record<string, unknown> = {}
  if (body.title !== undefined) payload.title = body.title
  if (body.content !== undefined) payload.content = body.content
  if (body.template_id !== undefined) payload.template_id = body.template_id
  if (body.references_json !== undefined) payload.references_json = body.references_json
  if (body.references !== undefined) payload.references_json = body.references
  const data = await request<{ article: WriteArticleWithShare }>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return data.article
}

export async function updateWriteArticleByShareToken(
  token: string,
  body: { title?: string; content?: string; template_id?: string | null; references?: CitationReference[]; references_json?: CitationReference[] }
): Promise<WriteArticleWithShare> {
  const payload: Record<string, unknown> = {}
  if (body.title !== undefined) payload.title = body.title
  if (body.content !== undefined) payload.content = body.content
  if (body.template_id !== undefined) payload.template_id = body.template_id
  if (body.references_json !== undefined) payload.references_json = body.references_json
  if (body.references !== undefined) payload.references_json = body.references
  const data = await request<{ article: WriteArticleWithShare }>(`/shared/${encodeURIComponent(token)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  return data.article
}

export async function deleteWriteArticle(id: string): Promise<void> {
  await request(`/${id}`, { method: "DELETE" })
}

export async function getWriteArticleByShareToken(token: string): Promise<WriteArticleWithShare> {
  const data = await request<{ article: WriteArticleWithShare }>(`/shared/${encodeURIComponent(token)}`, { method: "GET" })
  return data.article
}

export async function createShareLink(articleId: string): Promise<{ share_token: string; share_url?: string }> {
  const data = await request<{ share_token: string; share_url?: string }>(`/${articleId}/share`, { method: "POST" })
  return data
}

export async function revokeShareLink(articleId: string): Promise<void> {
  await request(`/${articleId}/share`, { method: "DELETE" })
}

export async function getWriteArticleComments(articleId: string): Promise<WriteArticleComment[]> {
  const data = await request<{ comments: WriteArticleComment[] }>(`/${articleId}/comments`, { method: "GET" })
  return data.comments ?? []
}

export async function createWriteArticleComment(
  articleId: string,
  body: { content: string; parent_id?: string | null; id?: string }
): Promise<WriteArticleComment> {
  const data = await request<{ comment: WriteArticleComment }>(`/${articleId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content: body.content, parent_id: body.parent_id ?? null, id: body.id ?? undefined }),
  })
  return data.comment
}

export async function deleteWriteArticleComment(articleId: string, commentId: string): Promise<void> {
  await request(`/${articleId}/comments/${commentId}`, { method: "DELETE" })
}

export async function getArticleVersions(articleId: string, limit = 50): Promise<WriteArticleVersion[]> {
  const data = await request<{ versions: WriteArticleVersion[] }>(`/${articleId}/versions`, {
    method: "GET",
    search: { limit: String(limit) },
  })
  return data.versions ?? []
}

export async function restoreArticleVersion(articleId: string, versionId: string): Promise<WriteArticleWithShare> {
  const data = await request<{ article: WriteArticleWithShare }>(`/${articleId}/versions/${versionId}/restore`, {
    method: "POST",
  })
  return data.article
}

export async function deleteArticleVersion(articleId: string, versionId: string): Promise<void> {
  await request(`/${articleId}/versions/${versionId}`, { method: "DELETE" })
}

export async function clearArticleVersionsExceptLatest(articleId: string): Promise<void> {
  await request(`/${articleId}/versions/clear`, { method: "POST" })
}
