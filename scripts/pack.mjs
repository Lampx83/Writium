#!/usr/bin/env node
/**
 * Package Writium into a single zip file for installation from AI Portal.
 * Run: npm run build && npm run pack
 * Output: dist/writium-package.zip
 *
 * Contents: manifest.json, dist/, public/, schema/, package.json
 * Portal will extract and run node dist/server.js with env from Portal.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const packageDir = path.join(root, "package")
const distDir = path.join(root, "dist")
const publicDir = path.join(root, "public")
const schemaDir = path.join(root, "schema")
const outDir = path.join(root, "dist")
const outZip = path.join(outDir, "writium-package.zip")

function addDirToZip(zip, localDir, zipPrefix = "") {
  if (!fs.existsSync(localDir)) return
  const items = fs.readdirSync(localDir)
  for (const item of items) {
    const full = path.join(localDir, item)
    const rel = zipPrefix ? path.join(zipPrefix, item) : item
    if (fs.statSync(full).isDirectory()) {
      addDirToZip(zip, full, rel)
    } else if (!rel.endsWith(".zip") && !rel.includes("writium-package/") && !rel.endsWith(".DS_Store")) {
      const zipDir = path.dirname(rel)
      zip.addLocalFile(full, zipDir ? zipDir + "/" : "", path.basename(rel))
    }
  }
}

async function main() {
  const manifestPath = path.join(packageDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    console.error("Missing package/manifest.json")
    process.exit(1)
  }
  if (!fs.existsSync(distDir)) {
    console.error("Missing dist/ directory. Run: npm run build before pack")
    process.exit(1)
  }

  const AdmZip = (await import("adm-zip")).default
  const zip = new AdmZip()

  // 1. manifest.json (at zip root)
  zip.addLocalFile(manifestPath, "", "manifest.json")

  // 2. package.json (for npm install on extract)
  const pkgPath = path.join(root, "package.json")
  if (fs.existsSync(pkgPath)) zip.addLocalFile(pkgPath, "", "package.json")

  // 3. dist/ (built backend code)
  addDirToZip(zip, distDir, "dist")

  // 4. public/ (frontend UI)
  addDirToZip(zip, publicDir, "public")

  // 5. schema/ (Part 2 of schema.sql for Portal DB)
  const schemaPath = path.join(schemaDir, "schema.sql")
  const STANDALONE_END = "-- #STANDALONE_END"
  if (fs.existsSync(schemaPath)) {
    const full = fs.readFileSync(schemaPath, "utf-8")
    const idx = full.indexOf(STANDALONE_END)
    const part2 = idx >= 0 ? full.slice(idx + STANDALONE_END.length).trim() : full
    if (part2) zip.addFile("schema/portal-embedded.sql", Buffer.from(part2, "utf-8"))
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  zip.writeZip(outZip)
  console.log("Created:", outZip)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
