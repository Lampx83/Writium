/**
 * Write Agent API: GET /v1/metadata, GET /v1/data, POST /v1/ask
 */
import { Router, Request, Response } from "express"
import OpenAI from "openai"
import { getEnv } from "../lib/env"

const router = Router()

const PRIMARY_DOMAIN = getEnv("PRIMARY_DOMAIN", "localhost")
const EXTRA_WHITELIST = new Set<string>([
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:3002",
  "https://localhost:3002",
])

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  try {
    const u = new URL(origin)
    if (u.hostname === PRIMARY_DOMAIN || u.hostname.endsWith(`.${PRIMARY_DOMAIN}`)) return true
    if (EXTRA_WHITELIST.has(origin)) return true
    return false
  } catch {
    return false
  }
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin! : ""
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed
  return headers
}

function getOpenAIApiKey(): string | null {
  return getEnv("OPENAI_API_KEY") || null
}

router.get("/v1/metadata", async (req: Request, res: Response) => {
  const origin = (req.headers.origin as string) || null
  const headers = buildCorsHeaders(origin)
  const body = {
    name: "Writium",
    description: "Supports writing and editing documents, theses, and reports. Helps structure content, improve academic style, and ensure consistency.",
    version: "1.0.0",
    developer: "Writium",
    capabilities: ["write", "edit", "structure", "improve", "format"],
    supported_models: [
      { model_id: "gpt-4o", name: "GPT-4o", description: "Powerful model for complex academic writing and editing", accepted_file_types: ["pdf", "docx", "txt", "md"] },
      { model_id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast model for simple writing and editing tasks", accepted_file_types: ["txt", "md"] },
    ],
    sample_prompts: [
      "Write an introduction for a topic on AI applications in education",
      "Improve the style of this paragraph to match academic writing",
      "Create an outline structure for a thesis on machine learning",
      "Edit and reformat the conclusion section of this document",
    ],
    provided_data_types: [
      { type: "templates", description: "Templates for various document types" },
      { type: "examples", description: "Examples of document sections" },
    ],
    contact: "ai-portal@neu.edu.vn",
    status: "active",
  }
  res.set(headers).json(body)
})

router.get("/v1/data", async (req: Request, res: Response) => {
  const origin = (req.headers.origin as string) || null
  const headers = buildCorsHeaders(origin)
  const type = (req.query.type as string) || "templates"
  const data: Record<string, unknown[]> = {
    templates: [
      { id: "template1", title: "Master's Thesis", type: "thesis" },
      { id: "template2", title: "Scientific Paper", type: "paper" },
      { id: "template3", title: "Report", type: "report" },
      { id: "template4", title: "Conference Paper", type: "conference" },
      { id: "template5", title: "Internship Report", type: "internship" },
      { id: "template6", title: "Essay", type: "essay" },
      { id: "template7", title: "Project Proposal", type: "proposal" },
      { id: "template8", title: "Abstract", type: "abstract" },
      { id: "template9", title: "Survey Report", type: "survey" },
      { id: "template10", title: "Doctoral Dissertation", type: "dissertation" },
    ],
    examples: [
      { id: "example1", title: "Introduction Example", description: "Sample introduction section", type: "introduction" },
      { id: "example2", title: "Conclusion Example", description: "Sample conclusion section", type: "conclusion" },
    ],
  }
  res.set(headers).json({
    status: "success",
    data_type: type,
    items: data[type] || [],
    last_updated: new Date().toISOString(),
  })
})

interface AskRequest {
  session_id: string
  model_id: string
  user: string
  prompt: string
  context?: { project?: string; extra_data?: unknown; history?: unknown[] }
}

router.post("/v1/ask", async (req: Request, res: Response) => {
  const origin = (req.headers.origin as string) || null
  const headers = buildCorsHeaders(origin)
  let body: AskRequest
  try {
    body = req.body
  } catch {
    return res.status(400).set(headers).json({
      session_id: null,
      status: "error",
      error_code: "INVALID_JSON",
      error_message: "Payload is not valid JSON",
    })
  }
  if (!body.session_id || !body.model_id || !body.user || !body.prompt) {
    return res.status(400).set(headers).json({
      session_id: body?.session_id ?? null,
      status: "error",
      error_code: "INVALID_REQUEST",
      error_message: "Missing required parameters",
    })
  }
  const apiKey = getOpenAIApiKey()
  if (!apiKey) {
    return res.status(500).set(headers).json({
      session_id: body.session_id,
      status: "error",
      error_message: "Configure OPENAI_API_KEY.",
    })
  }
  const t0 = Date.now()
  const client = new OpenAI({ apiKey })
  const systemPrompt = `You are an AI assistant specialized in writing and editing documents. Your tasks:
- Help write document sections (introduction, methods, results, conclusion)
- Improve academic style
- Ensure consistency and logic in the text
- Format and structure content according to academic standards
- Edit and optimize existing paragraphs
Respond in a professional, clear manner suitable for academic writing.`
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ]
    if (Array.isArray(body.context?.history)) {
      const history = body.context.history.map((h: unknown) => {
        const x = h as { role?: string; content?: string }
        const role: "user" | "assistant" | "system" =
          x.role === "user" ? "user" : x.role === "assistant" ? "assistant" : "system"
        return { role, content: String(x.content ?? "") }
      }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
      messages.push(...history)
    }
    messages.push({ role: "user", content: body.prompt })
    const completion = await client.chat.completions.create({
      model: body.model_id,
      messages,
    })
    const choice = completion.choices?.[0]
    const answer = (choice?.message?.content ?? "").trim()
    const response_time_ms = Date.now() - t0
    const tokens_used = (completion.usage as { total_tokens?: number })?.total_tokens ?? 0
    res.set(headers).json({
      session_id: body.session_id,
      status: "success",
      content_markdown: answer || "*(no content)*",
      meta: { model: body.model_id, response_time_ms, tokens_used },
    })
  } catch (err: unknown) {
    const response_time_ms = Date.now() - t0
    const status = Number((err as { status?: number })?.status) || 500
    res.status(status).set(headers).json({
      session_id: body.session_id,
      status: "error",
      error_message: (err as Error)?.message || "OpenAI API call failed.",
      meta: { model: body.model_id, response_time_ms },
    })
  }
})

router.options("/v1/*", (req: Request, res: Response) => {
  res.set(buildCorsHeaders((req.headers.origin as string) || null)).status(204).send()
})

export default router
