"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import {
  FilePlus,
  Save,
  FileDown,
  Share2,
  History,
  MessageCircle,
  Sparkles,
  Search,
  Undo2,
  Redo2,
  X,
  Loader2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table2,
  Sigma,
  ChevronDown,
  FileText,
  BookMarked,
  Copy,
  Check,
  Trash2,
  Heading1,
  Heading2,
  Heading3,
  Type,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  getWriteArticles,
  getWriteArticle,
  createWriteArticle,
  updateWriteArticle,
  updateWriteArticleByShareToken,
  deleteWriteArticle,
  getWriteArticleComments,
  createWriteArticleComment,
  deleteWriteArticleComment,
  getWriteArticleByShareToken,
  createShareLink,
  getArticleVersions,
  restoreArticleVersion,
  deleteArticleVersion,
  clearArticleVersionsExceptLatest,
  type WriteArticle,
  type WriteArticleWithShare,
  type WriteArticleComment,
  type WriteArticleVersion,
  type CitationReference,
} from "@/lib/api/write-articles"
import {
  toBibTeX,
  toReferenceListAPA,
  toReferenceListIEEE,
  formatInTextAPA,
  formatInTextAPANarrative,
  markdownItalicsToHtml,
  parseCitationFormat,
} from "@/lib/citation-formats"
import { getWriteArticlesBase } from "@/lib/config"
import "katex/dist/katex.min.css"

const FONTS = ["Arial", "Times New Roman", "Georgia", "Cambria", "Calibri"]
const FONT_SIZES = [10, 11, 12, 14, 16, 20]
const BLOCK_STYLES = [
  { tag: "p", label: "Paragraph" },
  { tag: "h1", label: "Heading 1" },
  { tag: "h2", label: "Heading 2" },
  { tag: "h3", label: "Heading 3" },
  { tag: "h4", label: "Heading 4" },
] as const
const REF_TYPES = [
  { value: "article", label: "Article" },
  { value: "book", label: "Book" },
  { value: "inproceedings", label: "Conference" },
  { value: "misc", label: "Other" },
]

function normRefs(raw: unknown): CitationReference[] {
  if (Array.isArray(raw)) return raw as CitationReference[]
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function WriteView() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get("rid")?.trim() || undefined
  const shareParam = searchParams.get("share")?.trim() || null

  const [articles, setArticles] = useState<WriteArticle[]>([])
  const [articlesLoading, setArticlesLoading] = useState(true)
  const [currentArticle, setCurrentArticle] = useState<WriteArticleWithShare | null>(null)
  const [currentArticleId, setCurrentArticleId] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("<p><br></p>")
  const [references, setReferences] = useState<CitationReference[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string>("Unsaved")
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [showFindBar, setShowFindBar] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const [findBackward, setFindBackward] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [comments, setComments] = useState<WriteArticleComment[]>([])
  const [commentInput, setCommentInput] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [showVersionHistoryDialog, setShowVersionHistoryDialog] = useState(false)
  const [versionList, setVersionList] = useState<WriteArticleVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [showCitationDialog, setShowCitationDialog] = useState(false)
  const [editingRefIndex, setEditingRefIndex] = useState<number | null | undefined>(undefined)
  const [citationStyle, setCitationStyle] = useState<"APA" | "IEEE">("APA")
  const [currentBlockTag, setCurrentBlockTag] = useState("p")
  const [currentFont, setCurrentFont] = useState("Arial")
  const [currentFontSize, setCurrentFontSize] = useState("11")
  const [showTableDialog, setShowTableDialog] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showFormulaDialog, setShowFormulaDialog] = useState(false)
  const [formulaLatex, setFormulaLatex] = useState("")
  const [formulaError, setFormulaError] = useState<string | null>(null)

  const editorRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const shareParamLoadedRef = useRef(false)

  const loadArticles = useCallback(async () => {
    setArticlesLoading(true)
    try {
      const list = await getWriteArticles(projectId)
      setArticles(list)
    } catch (e) {
      console.error("Load articles failed", e)
      setArticles([])
    } finally {
      setArticlesLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!shareParam) loadArticles()
  }, [loadArticles, shareParam])

  // Load article by share token from URL
  useEffect(() => {
    if (!shareParam?.trim() || shareParamLoadedRef.current) return
    shareParamLoadedRef.current = true
    let cancelled = false
    setArticlesLoading(false)
    getWriteArticleByShareToken(shareParam)
      .then((art) => {
        if (cancelled) return
        setCurrentArticle(art)
        setCurrentArticleId(art.id)
        setShareToken(shareParam)
        setTitle(art.title || "")
        const html = art.content?.trim() ? art.content : "<p><br></p>"
        setContent(html)
        setReferences(normRefs((art as { references_json?: unknown }).references_json))
        setDirty(false)
        setSaveStatus("Saved")
        if (editorRef.current) editorRef.current.innerHTML = html
        if (titleInputRef.current) titleInputRef.current.value = art.title || ""
        if (art.updated_at) setLastSavedAt(new Date(art.updated_at))
        getWriteArticleComments(art.id).then((cmts) => !cancelled && setComments(cmts))
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("Share link invalid")
      })
    return () => { cancelled = true }
  }, [shareParam])

  const loadArticle = useCallback(async (id: string) => {
    try {
      const full = await getWriteArticle(id) as WriteArticleWithShare & { references_json?: unknown }
      setCurrentArticle(full)
      setCurrentArticleId(id)
      setShareToken(null)
      setTitle(full.title || "")
      const html = full.content?.trim() ? full.content : "<p><br></p>"
      setContent(html)
      setReferences(normRefs(full.references_json))
      setDirty(false)
      setSaveStatus("Saved")
      if (editorRef.current) editorRef.current.innerHTML = html
      if (titleInputRef.current) titleInputRef.current.value = full.title || ""
      if (full.updated_at) setLastSavedAt(new Date(full.updated_at))
      const cmts = await getWriteArticleComments(id)
      setComments(cmts)
    } catch (e) {
      console.error("Load article failed", e)
    }
  }, [])

  const handleNewArticle = useCallback(async () => {
    setShareToken(null)
    setSaving(true)
    try {
      const created = await createWriteArticle({
        title: "Untitled document",
        content: "<p><br></p>",
        project_id: projectId || null,
        references: [],
      })
      await loadArticles()
      await loadArticle(created.id)
    } catch (e) {
      console.error("Create article failed", e)
    } finally {
      setSaving(false)
    }
  }, [projectId, loadArticles, loadArticle])

  const handleSave = useCallback(async () => {
    const html = editorRef.current?.innerHTML ?? content
    const t = titleInputRef.current?.value?.trim() ?? title
    setSaving(true)
    setSaveStatus("Saving...")
    try {
      if (shareToken) {
        await updateWriteArticleByShareToken(shareToken, {
          title: t || "Untitled document",
          content: html,
          references,
        })
      } else if (currentArticleId) {
        await updateWriteArticle(currentArticleId, {
          title: t || "Untitled document",
          content: html,
          references,
        })
        await loadArticles()
      } else {
        const created = await createWriteArticle({
          title: t || "Untitled document",
          content: html,
          project_id: projectId || null,
          references,
        })
        setCurrentArticleId(created.id)
        setCurrentArticle(created)
        await loadArticles()
      }
      setDirty(false)
      setSaveStatus("Saved")
      setTitle(t || "Untitled document")
      setLastSavedAt(new Date())
    } catch (e) {
      console.error("Save failed", e)
      setSaveStatus("Save error")
    } finally {
      setSaving(false)
    }
  }, [currentArticleId, shareToken, content, title, references, projectId, loadArticles])

  const handleExportDocx = useCallback(async () => {
    const html = editorRef.current?.innerHTML ?? content
    const base = getWriteArticlesBase()
    try {
      const res = await fetch(`${base}/export-docx`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      })
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = (titleInputRef.current?.value?.trim() || title || "document").replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, "") + ".docx"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error("Export failed", e)
    }
  }, [content, title])

  const handleDeleteArticle = useCallback(async (id: string) => {
    if (!confirm("Delete this article?")) return
    try {
      await deleteWriteArticle(id)
      if (currentArticleId === id) {
        setCurrentArticleId(null)
        setCurrentArticle(null)
        setShareToken(null)
        setTitle("")
        setContent("<p><br></p>")
        setReferences([])
        if (editorRef.current) editorRef.current.innerHTML = "<p><br></p>"
      }
      await loadArticles()
    } catch (e) {
      console.error("Delete failed", e)
    }
  }, [currentArticleId, loadArticles])

  const insertHtml = useCallback((html: string) => {
    const el = editorRef.current
    if (!el) return
    const sel = window.getSelection()
    const inEditor = sel && sel.rangeCount > 0 && sel.anchorNode && el.contains(sel.anchorNode)
    if (!inEditor) {
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
    document.execCommand("insertHTML", false, html)
    el.focus()
    setContent(el.innerHTML)
    setDirty(true)
  }, [])

  const runFindInEditor = useCallback(() => {
    if (!findQuery.trim()) return
    editorRef.current?.focus()
    const w = window as Window & { find?(a: string, b: boolean, c: boolean, d: boolean, e: boolean, f: boolean, g: boolean): boolean }
    if (typeof w.find !== "function") return
    const found = w.find(findQuery.trim(), false, findBackward, true, false, false, false)
    if (!found && !findBackward) w.find(findQuery.trim(), false, false, true, false, true, false)
  }, [findQuery, findBackward])

  const applyFontFamily = useCallback((fontFamily: string) => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
    el.focus()
    const range = sel.getRangeAt(0)
    const span = document.createElement("span")
    span.style.fontFamily = fontFamily
    if (range.collapsed) {
      span.appendChild(document.createTextNode("\u200B"))
      range.insertNode(span)
      range.setStart(span.firstChild!, 1)
      range.collapse(true)
    } else {
      try {
        range.surroundContents(span)
      } catch {
        const fragment = range.extractContents()
        span.appendChild(fragment)
        range.insertNode(span)
      }
    }
    sel.removeAllRanges()
    sel.addRange(range)
    setContent(el.innerHTML)
    setCurrentFont(fontFamily)
    setDirty(true)
  }, [])

  const applyFontSize = useCallback((pt: number) => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
    el.focus()
    const range = sel.getRangeAt(0)
    const span = document.createElement("span")
    span.style.fontSize = `${pt}pt`
    span.style.lineHeight = "1.5"
    if (range.collapsed) {
      span.appendChild(document.createTextNode("\u200B"))
      range.insertNode(span)
      range.setStart(span.firstChild!, 1)
      range.collapse(true)
    } else {
      try {
        range.surroundContents(span)
      } catch {
        const fragment = range.extractContents()
        span.appendChild(fragment)
        range.insertNode(span)
      }
    }
    sel.removeAllRanges()
    sel.addRange(range)
    setContent(el.innerHTML)
    setCurrentFontSize(String(pt))
    setDirty(true)
  }, [])

  const handleInsertTable = useCallback(() => {
    const rows = Math.max(1, Math.min(20, tableRows))
    const cols = Math.max(1, Math.min(10, tableCols))
    const thCell = '<th class="border border-gray-300 dark:border-gray-600 p-2 text-left bg-gray-100 dark:bg-gray-800"><br></th>'
    const header = `<tr>${Array(cols).fill(thCell).join("")}</tr>`
    const tdCell = '<td class="border border-gray-300 dark:border-gray-600 p-2"><br></td>'
    const bodyRows = Array(rows - 1).fill(null).map(() => `<tr>${Array(cols).fill(tdCell).join("")}</tr>`).join("")
    const tableHtml = `<table class="border-collapse border border-gray-300 dark:border-gray-600 my-4 text-sm" style="width:100%"><thead>${header}</thead><tbody>${bodyRows}</tbody></table><p></p>`
    insertHtml(tableHtml)
    setShowTableDialog(false)
  }, [tableRows, tableCols, insertHtml])

  const handleInsertFormula = useCallback(async () => {
    const latex = formulaLatex.trim()
    if (!latex) return
    setFormulaError(null)
    try {
      const katex = (await import("katex")).default
      const rawHtml = katex.renderToString(latex, { throwOnError: true, displayMode: false })
      setFormulaLatex("")
      const formulaHtml = `<span class="editor-formula-inline" style="display:inline;vertical-align:middle">${rawHtml}</span>\u200B`
      insertHtml(formulaHtml)
      setShowFormulaDialog(false)
    } catch (err: unknown) {
      setFormulaError(err instanceof Error ? err.message : "Invalid LaTeX syntax")
    }
  }, [formulaLatex, insertHtml])

  const handleInsertCitation = useCallback((index?: number, narrative?: boolean) => {
    if (references.length === 0) {
      setShowCitationDialog(true)
      return
    }
    const idx = index != null && index >= 0 && index < references.length ? index : references.length - 1
    const ref = references[idx]!
    const text = citationStyle === "APA"
      ? (narrative ? formatInTextAPANarrative(ref) : formatInTextAPA(ref))
      : `[${idx + 1}]`
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    insertHtml(citationStyle === "APA" ? `<span class="citation-intext">${escaped}</span> ` : `<sup>[${idx + 1}]</sup> `)
  }, [references, citationStyle, insertHtml])

  const handleInsertReferenceList = useCallback(() => {
    if (references.length === 0) return
    const raw = citationStyle === "APA" ? toReferenceListAPA(references) : toReferenceListIEEE(references)
    const paras = raw.split(/\n\n+/).filter(Boolean)
    const html = `<h2>References</h2>${paras.map((p) => `<p class="mb-2 text-sm">${markdownItalicsToHtml(p.replace(/\n/g, " "))}</p>`).join("")}<p></p>`
    insertHtml(html)
    setShowCitationDialog(false)
  }, [references, citationStyle, insertHtml])

  const handleExportReferencesBibTeX = useCallback(() => {
    if (references.length === 0) return
    const blob = new Blob([toBibTeX(references)], { type: "application/x-bibtex;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "references.bib"
    a.click()
    URL.revokeObjectURL(a.href)
  }, [references])

  useEffect(() => {
    if (!showShareDialog || !currentArticleId || shareToken) return
    if ((currentArticle as WriteArticleWithShare)?.share_token) {
      const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : ""
      setShareUrl(`${base}?share=${(currentArticle as WriteArticleWithShare).share_token}`)
      setShareLoading(false)
      return
    }
    setShareLoading(true)
    createShareLink(currentArticleId)
      .then((r) => {
        setShareUrl(r.share_url ?? `${typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}?share=${r.share_token}`)
        setCurrentArticle((prev) => prev ? { ...prev, share_token: r.share_token } : null)
      })
      .catch(() => setSaveStatus("Could not create share link"))
      .finally(() => setShareLoading(false))
  }, [showShareDialog, currentArticleId, shareToken, currentArticle])

  const handleCopyShareUrl = useCallback(() => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }
  }, [shareUrl])

  useEffect(() => {
    if (!showVersionHistoryDialog || !currentArticleId || shareToken) return
    setVersionsLoading(true)
    getArticleVersions(currentArticleId)
      .then(setVersionList)
      .catch(() => setVersionList([]))
      .finally(() => setVersionsLoading(false))
  }, [showVersionHistoryDialog, currentArticleId, shareToken])

  const handleRestoreVersion = useCallback(async (versionId: string) => {
    if (!currentArticleId) return
    setRestoringVersionId(versionId)
    try {
      const article = await restoreArticleVersion(currentArticleId, versionId) as WriteArticleWithShare & { references_json?: unknown }
      setTitle(article.title)
      setContent(article.content?.trim() ? article.content : "<p><br></p>")
      setReferences(normRefs(article.references_json))
      if (editorRef.current) editorRef.current.innerHTML = article.content?.trim() ? article.content : "<p><br></p>"
      if (titleInputRef.current) titleInputRef.current.value = article.title || ""
      setLastSavedAt(article.updated_at ? new Date(article.updated_at) : null)
      setShowVersionHistoryDialog(false)
      const list = await getArticleVersions(currentArticleId)
      setVersionList(list)
    } catch (e) {
      console.error("Restore failed", e)
    } finally {
      setRestoringVersionId(null)
    }
  }, [currentArticleId])

  const handleDeleteVersion = useCallback(async (versionId: string) => {
    if (!currentArticleId || !confirm("Delete this version?")) return
    try {
      await deleteArticleVersion(currentArticleId, versionId)
      const list = await getArticleVersions(currentArticleId)
      setVersionList(list)
    } catch (e) {
      console.error("Delete version failed", e)
    }
  }, [currentArticleId])

  const handleClearVersions = useCallback(async () => {
    if (!currentArticleId || !confirm("Clear all history and keep only the latest version?")) return
    try {
      await clearArticleVersionsExceptLatest(currentArticleId)
      const list = await getArticleVersions(currentArticleId)
      setVersionList(list)
    } catch (e) {
      console.error("Clear versions failed", e)
    }
  }, [currentArticleId])

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!currentArticleId) return
    try {
      await deleteWriteArticleComment(currentArticleId, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId))
    } catch (e) {
      console.error("Delete comment failed", e)
    }
  }, [currentArticleId])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const updateBlockTag = () => {
      if (document.activeElement !== el) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
      let value = document.queryCommandValue("formatBlock")?.toLowerCase() ?? "p"
      if (value === "paragraph") value = "p"
      if (value.startsWith("heading ")) value = `h${value.replace("heading ", "").trim()}`
      if (["p", "h1", "h2", "h3", "h4"].includes(value)) setCurrentBlockTag(value)
    }
    document.addEventListener("selectionchange", updateBlockTag)
    el.addEventListener("focus", updateBlockTag)
    return () => {
      document.removeEventListener("selectionchange", updateBlockTag)
      el.removeEventListener("focus", updateBlockTag)
    }
  }, [])

  const handleAddComment = useCallback(async () => {
    if (!currentArticleId || !commentInput.trim()) return
    setCommentSubmitting(true)
    try {
      await createWriteArticleComment(currentArticleId, { content: commentInput.trim() })
      setCommentInput("")
      const cmts = await getWriteArticleComments(currentArticleId)
      setComments(cmts)
    } catch (e) {
      console.error("Add comment failed", e)
    } finally {
      setCommentSubmitting(false)
    }
  }, [currentArticleId, commentInput])

  const execCmd = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? "")
    editorRef.current?.focus()
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
  }, [])

  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = content
  }, [])

  const syncContent = useCallback(() => {
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
  }, [])

  const hasArticle = !!currentArticleId

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <span className="font-semibold">Writium</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r flex flex-col p-2">
          <Button className="w-full gap-2" onClick={handleNewArticle} disabled={saving}>
            <FilePlus className="h-4 w-4" />
            New article
          </Button>
          <div className="mt-2 text-xs text-muted-foreground">Article</div>
          <ul className="mt-1 flex-1 overflow-auto space-y-0.5">
            {articlesLoading ? (
              <li className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </li>
            ) : (
              articles.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded px-2 py-1.5 text-left text-sm truncate",
                      currentArticleId === a.id ? "bg-accent" : "hover:bg-muted"
                    )}
                    onClick={() => loadArticle(a.id)}
                  >
                    {a.title || "Untitled"}
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!hasArticle ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
              Select an article on the left or create a new one.
            </div>
          ) : (
            <>
              <div className="border-b flex items-center gap-1 flex-wrap p-1">
                <input
                  ref={titleInputRef}
                  type="text"
                  placeholder="Untitled"
                  className="min-w-[120px] flex-1 rounded border bg-transparent px-2 py-1.5 text-sm outline-none"
                  defaultValue={title}
                  onBlur={() => setDirty(true)}
                />
                <div className="h-4 w-px bg-border" />
                <Button variant="ghost" size="icon" onClick={() => execCmd("undo")} title="Undo">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("redo")} title="Redo">
                  <Redo2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowFindBar((v) => !v)} title="Find in document">
                  <Search className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">
                  {saveStatus}
                  {lastSavedAt && ` • ${lastSavedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
                <Button size="sm" onClick={() => handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </Button>
                {currentArticleId && !shareToken && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setShowVersionHistoryDialog(true)} title="Version history">
                      <History className="h-4 w-4" /> History
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)} title="Share">
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center gap-2 h-9 rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                    <FileDown className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3 ml-0.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Document</DropdownMenuLabel>
                    <DropdownMenuItem onClick={handleExportDocx}>
                      <FileText className="h-4 w-4 mr-2" /> Word (.docx)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">References</DropdownMenuLabel>
                    <DropdownMenuItem onClick={handleExportReferencesBibTeX} disabled={references.length === 0}>
                      <BookMarked className="h-4 w-4 mr-2" /> BibTeX (.bib)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" onClick={() => setShowAiPanel((v) => !v)}>
                  <Sparkles className="h-4 w-4" /> AI
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCommentsPanel((v) => !v)}>
                  <MessageCircle className="h-4 w-4" /> Comments
                </Button>
              </div>

              {showFindBar && (
                <div className="flex items-center gap-2 border-b px-2 py-1">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Find in document..."
                    className="flex-1 min-w-0 rounded border bg-transparent px-2 py-1 text-sm"
                    value={findQuery}
                    onChange={(e) => setFindQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runFindInEditor()}
                  />
                  <Button variant="ghost" size="sm" onClick={() => { setFindBackward(true); runFindInEditor() }} title="Find previous">
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setFindBackward(false); runFindInEditor() }} title="Find next">
                    ↓
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowFindBar(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="border-b flex flex-wrap items-center gap-1 p-1 overflow-x-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-between min-w-[7rem] gap-1 h-8 px-2 text-xs rounded-md hover:bg-accent">
                    {BLOCK_STYLES.find((b) => b.tag === currentBlockTag)?.label ?? "Paragraph"} <ChevronDown className="h-3 w-3 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {BLOCK_STYLES.map((b) => (
                      <DropdownMenuItem key={b.tag} onClick={() => execCmd("formatBlock", b.tag)} className={currentBlockTag === b.tag ? "bg-muted" : ""}>
                        {b.tag === "h1" && <Heading1 className="h-4 w-4 mr-2" />}
                        {b.tag === "h2" && <Heading2 className="h-4 w-4 mr-2" />}
                        {b.tag === "h3" && <Heading3 className="h-4 w-4 mr-2" />}
                        {b.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Separator orientation="vertical" className="h-6" />
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-between min-w-[6rem] gap-1 h-8 px-2 text-xs rounded-md hover:bg-accent" style={{ fontFamily: currentFont }}>
                    {currentFont} <ChevronDown className="h-3 w-3 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {FONTS.map((f) => (
                      <DropdownMenuItem key={f} onClick={() => applyFontFamily(f)} style={{ fontFamily: f }}>
                        {f}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-1 h-8 px-2 text-xs rounded-md hover:bg-accent">
                    {currentFontSize}pt <ChevronDown className="h-3 w-3 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {FONT_SIZES.map((n) => (
                      <DropdownMenuItem key={n} onClick={() => applyFontSize(n)}>{n}pt</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="ghost" size="icon" onClick={() => execCmd("bold")} title="Bold"><Bold className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("italic")} title="Italic"><Italic className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("underline")} title="Underline"><Underline className="h-4 w-4" /></Button>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="ghost" size="icon" onClick={() => execCmd("insertUnorderedList")} title="Bullet list"><List className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("insertOrderedList")} title="Numbered list"><ListOrdered className="h-4 w-4" /></Button>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="ghost" size="icon" onClick={() => execCmd("justifyLeft")} title="Align left"><AlignLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("justifyCenter")} title="Align center"><AlignCenter className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("justifyRight")} title="Align right"><AlignRight className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => execCmd("justifyFull")} title="Justify"><AlignJustify className="h-4 w-4" /></Button>
                <Separator orientation="vertical" className="h-6" />
                <Button variant="ghost" size="sm" onClick={() => setShowTableDialog(true)} title="Insert table">
                  <Table2 className="h-4 w-4" /> Table
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowFormulaDialog(true)} title="Insert formula">
                  <Sigma className="h-4 w-4" /> Formula
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCitationDialog(true)} title="Citation">
                  <BookMarked className="h-4 w-4" /> Citation
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleInsertCitation(undefined, false)} title="Insert citation (APA)">
                  <Type className="h-4 w-4" /> Insert (APA)
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4 bg-[#e8eaed]">
                <div
                  ref={editorRef}
                  role="textbox"
                  tabIndex={0}
                  className="min-h-full w-full rounded border border-gray-300 bg-white text-black p-4 prose prose-sm max-w-none focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-text"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={syncContent}
                  onBlur={syncContent}
                  onClick={(e) => { (e.target as HTMLElement).focus?.(); }}
                  style={{ fontFamily: "Arial", fontSize: "11pt" }}
                />
              </div>

              {showAiPanel && (
                <div className="absolute right-4 top-24 bottom-24 w-80 border rounded-lg bg-background shadow-lg flex flex-col p-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Ask AI</span>
                    <Button variant="ghost" size="icon" onClick={() => setShowAiPanel(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI feature will connect to Portal when opened from iframe.
                  </p>
                </div>
              )}

              {showCommentsPanel && (
                <div className="absolute right-4 top-24 bottom-24 w-80 border rounded-lg bg-background shadow-lg flex flex-col p-2 z-10">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Comments</span>
                    <Button variant="ghost" size="icon" onClick={() => setShowCommentsPanel(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 mt-2 max-h-64">
                    <ul className="space-y-2 pr-2">
                      {comments.map((c) => (
                        <li key={c.id} className="text-sm border-b pb-2 flex justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium">{c.author_display || "Ẩn danh"}</span>
                            <p className="text-muted-foreground break-words">{c.content}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => handleDeleteComment(c.id)} title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                  <div className="flex gap-2 mt-2">
                    <Input
                      className="flex-1"
                      placeholder="Add a comment..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                    />
                    <Button size="sm" onClick={handleAddComment} disabled={commentSubmitting || !commentInput.trim()}>
                      {commentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Share dialog */}
              <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Share article</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    {shareLoading ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating link...</p>
                    ) : shareUrl ? (
                      <>
                        <div className="flex gap-2">
                          <Input readOnly value={shareUrl} className="font-mono text-xs" />
                          <Button variant="outline" size="sm" onClick={handleCopyShareUrl}>
                            {shareCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {shareCopied ? " Copied" : " Copy"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Send this link for others to view and edit the article.</p>
                      </>
                    ) : null}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Version history dialog */}
              <Dialog open={showVersionHistoryDialog} onOpenChange={setShowVersionHistoryDialog}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Version history</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="flex-1 min-h-0 -mx-2 px-2">
                    {versionsLoading ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
                    ) : versionList.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">No versions yet.</p>
                    ) : (
                      <ul className="space-y-2 pb-4">
                        {versionList.map((v) => (
                          <li key={v.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                            <span className="truncate">{v.title || "Untitled"}</span>
                            <span className="text-muted-foreground shrink-0">{new Date(v.created_at).toLocaleString("vi-VN")}</span>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="outline" size="sm" onClick={() => handleRestoreVersion(v.id)} disabled={restoringVersionId !== null}>
                                {restoringVersionId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore"}
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteVersion(v.id)} title="Delete version"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </ScrollArea>
                  {versionList.length > 1 && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={handleClearVersions}>
                      Clear all history (keep only latest version)
                    </Button>
                  )}
                </DialogContent>
              </Dialog>

              {/* Citation / References dialog */}
              <Dialog open={showCitationDialog} onOpenChange={setShowCitationDialog}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>References</DialogTitle>
                  </DialogHeader>
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs">Citation style:</Label>
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={citationStyle}
                      onChange={(e) => setCitationStyle(e.target.value as "APA" | "IEEE")}
                    >
                      <option value="APA">APA</option>
                      <option value="IEEE">IEEE</option>
                    </select>
                    <Button size="sm" onClick={() => setEditingRefIndex(null)}>Add citation</Button>
                    <Button size="sm" variant="outline" onClick={handleInsertReferenceList} disabled={references.length === 0}>
                      Insert references list into document
                    </Button>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 border rounded p-2 max-h-64">
                    <ul className="space-y-2">
                      {references.map((ref, idx) => (
                        <li key={idx} className="text-sm flex justify-between gap-2 items-start">
                          <span className="min-w-0">
                            [{idx + 1}] {ref.author || "—"} ({ref.year || "n.d."}). {ref.title || "—"}
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => handleInsertCitation(idx)}>Insert</Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingRefIndex(idx)}>Edit</Button>
                            <Button variant="ghost" size="icon" onClick={() => setReferences((prev) => prev.filter((_, i) => i !== idx))} title="Delete"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                  {editingRefIndex !== undefined && (
                    <CitationEditForm
                      initialRef={typeof editingRefIndex === "number" && references[editingRefIndex] ? references[editingRefIndex] : { type: "article", author: "", title: "", year: "" }}
                      onSave={(r) => {
                        if (typeof editingRefIndex === "number" && editingRefIndex < references.length) {
                          setReferences((prev) => prev.map((x, i) => (i === editingRefIndex ? r : x)))
                        } else {
                          setReferences((prev) => [...prev, r])
                        }
                        setEditingRefIndex(undefined)
                      }}
                      onCancel={() => setEditingRefIndex(undefined)}
                    />
                  )}
                </DialogContent>
              </Dialog>

              {/* Table dialog */}
              <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Insert table</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Rows</Label>
                      <Input type="number" min={1} max={20} value={tableRows} onChange={(e) => setTableRows(Number(e.target.value) || 3)} />
                    </div>
                    <div>
                      <Label>Columns</Label>
                      <Input type="number" min={1} max={10} value={tableCols} onChange={(e) => setTableCols(Number(e.target.value) || 3)} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setShowTableDialog(false)}>Cancel</Button>
                    <Button onClick={handleInsertTable}>Insert</Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Formula dialog */}
              <Dialog open={showFormulaDialog} onOpenChange={setShowFormulaDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Insert formula (LaTeX)</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Input
                      placeholder="e.g. \\frac{1}{2}, x^2, \\sqrt{x}"
                      value={formulaLatex}
                      onChange={(e) => { setFormulaLatex(e.target.value); setFormulaError(null) }}
                    />
                    {formulaError && <p className="text-sm text-red-600">{formulaError}</p>}
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setShowFormulaDialog(false)}>Cancel</Button>
                    <Button onClick={handleInsertFormula}>Insert</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function CitationEditForm({
  initialRef,
  onSave,
  onCancel,
}: {
  initialRef: CitationReference
  onSave: (r: CitationReference) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<CitationReference>({
    type: initialRef.type || "article",
    author: initialRef.author || "",
    title: initialRef.title || "",
    year: initialRef.year || "",
    journal: initialRef.journal || "",
    volume: initialRef.volume || "",
    pages: initialRef.pages || "",
    publisher: initialRef.publisher || "",
    doi: initialRef.doi || "",
    url: initialRef.url || "",
    booktitle: initialRef.booktitle || "",
  })
  const [pasteValue, setPasteValue] = useState("")
  const handlePaste = () => {
    const parsed = parseCitationFormat(pasteValue)
    if (parsed) {
      setForm({
        type: parsed.ref.type || "article",
        author: parsed.ref.author || "",
        title: parsed.ref.title || "",
        year: parsed.ref.year || "",
        journal: parsed.ref.journal || "",
        volume: parsed.ref.volume || "",
        pages: parsed.ref.pages || "",
        publisher: parsed.ref.publisher || "",
        doi: parsed.ref.doi || "",
        url: parsed.ref.url || "",
        booktitle: parsed.ref.booktitle || "",
      })
    }
  }
  return (
    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t text-sm">
      <div className="col-span-2">
        <Label className="text-xs">Paste BibTeX / RIS</Label>
        <div className="flex gap-2 mt-0.5">
          <Input
            placeholder="Paste citation string..."
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            className="font-mono text-xs"
          />
          <Button size="sm" variant="outline" onClick={handlePaste}>Parse</Button>
        </div>
      </div>
      <div>
        <Label className="text-xs">Type</Label>
        <select
          className="w-full mt-0.5 h-9 rounded border px-2 text-sm"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
        >
          {REF_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Year</Label>
        <Input value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className="h-9 mt-0.5" />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Author</Label>
        <Input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} className="h-9 mt-0.5" />
      </div>
      <div className="col-span-2">
        <Label className="text-xs">Title</Label>
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-9 mt-0.5" />
      </div>
      <div className="col-span-2 flex gap-2">
        <Button size="sm" onClick={() => onSave(form)}>Save</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
