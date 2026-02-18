/**
 * Citation formats – compatible with CitationReference in write-articles.
 */
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

function extractBibTeXValue(text: string, key: string): string | undefined {
  const re = new RegExp(`${key}\\s*=\\s*[{"]([^}"]*)["}]`, "i")
  const m = text.match(re)
  return m ? m[1].trim().replace(/\s+/g, " ") : undefined
}

export function parseBibTeX(text: string): CitationReference | null {
  const t = text.trim()
  if (!t) return null
  const match = t.match(/@(\w+)\s*\{[^,]*,\s*([\s\S]*)\}/)
  if (!match) return null
  const typeStr = (match[1] || "misc").toLowerCase()
  const body = match[2] || ""
  const typeMap: Record<string, string> = {
    article: "article", jour: "article", book: "book",
    inproceedings: "inproceedings", conference: "inproceedings", misc: "misc",
  }
  const author = extractBibTeXValue(body, "author")
  const title = extractBibTeXValue(body, "title")
  if (!author && !title) return null
  const normalizedAuthor = author?.replace(/\s+and\s+/gi, ", ")
  return {
    type: typeMap[typeStr] ?? "misc",
    author: normalizedAuthor ?? "",
    title: title ?? "",
    year: extractBibTeXValue(body, "year") ?? "",
    journal: extractBibTeXValue(body, "journal") ?? "",
    booktitle: extractBibTeXValue(body, "booktitle") ?? "",
    volume: extractBibTeXValue(body, "volume") ?? "",
    pages: extractBibTeXValue(body, "pages") ?? "",
    publisher: extractBibTeXValue(body, "publisher") ?? "",
    doi: extractBibTeXValue(body, "doi") ?? "",
    url: extractBibTeXValue(body, "url") ?? "",
  }
}

export function parseCitationFormat(
  text: string
): { format: string; ref: CitationReference } | null {
  const t = text.trim()
  if (!t) return null
  if (/@\w+\s*\{/.test(t)) {
    const entries = t.split(/(?=@\w+\s*\{)/).filter((s) => s.trim())
    for (const entry of entries) {
      const ref = parseBibTeX(entry.trim())
      if (ref) return { format: "bibtex", ref }
    }
  }
  if (/^TY\s+-\s+/m.test(t)) {
    const lines = t.split(/\r?\n/)
    const fields: Record<string, string> = {}
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9]{2})\s+-\s+(.+)$/)
      if (m) fields[m[1]] = m[2].trim()
    }
    const author = (fields["AU"] ?? "").replace(/\r?\n/g, ", ")
    const title = fields["TI"] ?? ""
    if (author || title)
      return {
        format: "refman",
        ref: {
          type: "article",
          author,
          title,
          year: (fields["PY"] ?? "").slice(0, 4),
          journal: fields["JO"] ?? "",
          volume: fields["VL"] ?? "",
          pages: [fields["SP"], fields["EP"]].filter(Boolean).join("-"),
          doi: fields["DO"] ?? "",
          url: fields["UR"] ?? "",
          booktitle: fields["T3"] ?? "",
        },
      }
  }
  return null
}

function escapeBibTeX(str: string): string {
  return str.replace(/[{}"\\]/g, (c) => (c === "\\" ? "\\\\" : `\\${c}`))
}

export function toBibTeX(refs: CitationReference[]): string {
  return refs
    .map((r, i) => {
      const type = (r.type || "misc").toLowerCase()
      const key = `ref${i + 1}${(r.year ?? "").slice(-2)}`
      const fields: string[] = []
      if (r.author) fields.push(`  author = {${escapeBibTeX(r.author)}}`)
      if (r.title) fields.push(`  title = {${escapeBibTeX(r.title)}}`)
      if (r.year) fields.push(`  year = {${r.year}}`)
      if (r.journal) fields.push(`  journal = {${escapeBibTeX(r.journal)}}`)
      if (r.volume) fields.push(`  volume = {${r.volume}}`)
      if (r.pages) fields.push(`  pages = {${r.pages}}`)
      if (r.publisher) fields.push(`  publisher = {${escapeBibTeX(r.publisher)}}`)
      if (r.doi) fields.push(`  doi = {${r.doi}}`)
      if (r.url) fields.push(`  url = {${r.url}}`)
      if (r.booktitle) fields.push(`  booktitle = {${escapeBibTeX(r.booktitle)}}`)
      return `@${type}{${key},\n${fields.join(",\n")}\n}`
    })
    .join("\n\n")
}

function getAuthorLastName(authorStr: string): string {
  if (!authorStr?.trim()) return "n.d."
  const parts = authorStr.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)
  const one = parts[0]!
  const commaIdx = one.indexOf(",")
  if (commaIdx >= 0) {
    const lastName = one.slice(0, commaIdx).trim()
    return lastName || one
  }
  const words = one.split(/\s+/).filter(Boolean)
  return words.length > 0 ? words[words.length - 1]! : one
}

export function formatInTextAPA(ref: CitationReference): string {
  const author = getAuthorLastName(ref.author || "")
  const year = ref.year?.trim() || "n.d."
  return `(${author}, ${year})`
}

export function formatInTextAPANarrative(ref: CitationReference): string {
  const author = getAuthorLastName(ref.author || "")
  const year = ref.year?.trim() || "n.d."
  return `${author} (${year})`
}

function formatOneAuthorAPA(name: string): string {
  const s = name.trim()
  if (!s) return ""
  const commaIdx = s.indexOf(",")
  if (commaIdx >= 0) {
    const lastName = s.slice(0, commaIdx).trim()
    const firstPart = s.slice(commaIdx + 1).trim()
    const initials = firstPart.split(/\s+/).filter(Boolean).map((w) => w[0] + ".").join(" ")
    return lastName ? `${lastName}, ${initials}`.trim() : firstPart
  }
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return s
  const last = words.pop()!
  const initials = words.map((w) => w[0] + ".").join(" ")
  return `${last}, ${initials}`
}

function formatReferenceAPA(ref: CitationReference): string {
  const rawAuthors = (ref.author || "").split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)
  const authors = rawAuthors.map((a) => formatOneAuthorAPA(a))
  const authorStr =
    authors.length === 0 ? "N.d." :
    authors.length === 1 ? authors[0]! :
    authors.length <= 7 ? authors.slice(0, -1).join(", ") + ", & " + authors[authors.length - 1] :
    authors[0] + " et al."
  const year = ref.year?.trim() ? ` (${ref.year}).` : " (n.d.)."
  const title = ref.title?.trim() ? ` ${ref.title}.` : ""
  const ty = (ref.type || "").toLowerCase()
  if (ty === "article" || ty === "jour") {
    const journal = ref.journal?.trim()
    const vol = ref.volume?.trim()
    const pages = ref.pages?.trim()
    let rest = journal ? ` *${journal}*` + (vol ? `, *${vol}*` : "") + (pages ? `, ${pages}` : "") + "." : ""
    const doi = ref.doi?.trim()
    if (doi) rest += ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    else if (ref.url?.trim()) rest += ` ${ref.url}`
    return `${authorStr}${year}${title}${rest}`.trim()
  }
  if (ty === "book") {
    const pub = ref.publisher?.trim()
    let end = pub ? ` ${pub}.` : ""
    if (ref.doi?.trim()) end += ` https://doi.org/${ref.doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    else if (ref.url?.trim()) end += ` ${ref.url}`
    return `${authorStr}${year}${title}${end}`.trim()
  }
  if (ty === "inproceedings") {
    const conf = (ref.booktitle || ref.journal || "").trim()
    let end = conf ? ` In *${conf}*.` : ""
    if (ref.doi?.trim()) end += ` https://doi.org/${ref.doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    else if (ref.url?.trim()) end += ` ${ref.url}`
    return `${authorStr}${year}${title}${end}`.trim()
  }
  return `${authorStr}${year}${title}`.trim()
}

export function toReferenceListAPA(refs: CitationReference[]): string {
  return refs.map((r) => formatReferenceAPA(r)).join("\n\n")
}

export function formatReferenceIEEE(ref: CitationReference, index: number): string {
  const authors = (ref.author || "").split(/\s+and\s+|;|,/).map((s) => s.trim()).filter(Boolean)
  const authorStr = authors.length === 0 ? "N.d." : authors
    .map((a) => {
      const words = a.split(/\s+/)
      if (words.length <= 1) return a
      const last = words.pop()!
      return `${last}, ${words.map((w) => w[0]).join(". ")}.`
    })
    .join(", ")
  const title = ref.title?.trim() ? `"${ref.title}",` : ""
  const year = ref.year?.trim() || "n.d."
  const ty = (ref.type || "").toLowerCase()
  if (ty === "article" || ty === "jour") {
    const journal = ref.journal?.trim()
    const vol = ref.volume?.trim()
    const pages = ref.pages?.trim()
    let rest = journal ? ` *${journal}*` : ""
    if (vol) rest += `, vol. ${vol}`
    if (pages) rest += `, pp. ${pages}`
    rest += `, ${year}.`
    if (ref.doi?.trim()) rest += ` doi: ${ref.doi.replace(/^https?:\/\/doi\.org\//i, "")}`
    return `[${index + 1}] ${authorStr}, ${title} ${rest}`.trim()
  }
  return `[${index + 1}] ${authorStr}, ${title} ${year}.`.trim()
}

export function toReferenceListIEEE(refs: CitationReference[]): string {
  return refs.map((r, i) => formatReferenceIEEE(r, i)).join("\n\n")
}

export function markdownItalicsToHtml(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "<em>$1</em>")
}
