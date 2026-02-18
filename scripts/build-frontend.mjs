#!/usr/bin/env node
/**
 * Build Next.js frontend (static export) and copy to public/ for Express to serve.
 * Run from writium project root: node scripts/build-frontend.mjs
 */
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const frontendDir = path.join(root, "frontend")
const outDir = path.join(frontendDir, "out")
const publicDir = path.join(root, "public")

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      cleanDir(full)
      fs.rmdirSync(full)
    } else {
      fs.unlinkSync(full)
    }
  }
}

const forEmbed = process.env.BUILD_FOR === "embed"
const nextBin = path.join(frontendDir, "node_modules", ".bin", "next")
const nextPkg = path.join(frontendDir, "node_modules", "next")
if (!fs.existsSync(nextPkg)) {
  console.error("[build-frontend] Frontend dependencies missing. Run: cd frontend && npm install")
  process.exit(1)
}
const nextDir = path.join(frontendDir, ".next")
if (fs.existsSync(nextDir)) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true })
    console.log("[build-frontend] Cleared frontend/.next")
  } catch (e) {
    console.warn("[build-frontend] Could not clear .next (run: rm -rf frontend/.next):", e.message)
  }
}
if (fs.existsSync(outDir)) {
  try {
    fs.rmSync(outDir, { recursive: true, force: true })
    console.log("[build-frontend] Cleared frontend/out")
  } catch (e) {
    console.warn("[build-frontend] Could not clear out/ (run: rm -rf frontend/out):", e.message)
  }
}
if (forEmbed) console.log("[build-frontend] Building for Portal embed (assetPrefix=/embed/write)...")
else console.log("[build-frontend] Building Next.js (standalone)...")
const build = spawnSync(nextBin, ["build"], {
  cwd: frontendDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_FOR: forEmbed ? "embed" : "" },
})
if (build.status !== 0) {
  console.error("[build-frontend] Next build failed")
  process.exit(1)
}

if (!fs.existsSync(outDir)) {
  console.error("[build-frontend] Missing frontend/out after build")
  process.exit(1)
}

console.log("[build-frontend] Copying out/ to public/...")
if (fs.existsSync(publicDir)) {
  try {
    fs.rmSync(publicDir, { recursive: true, force: true })
  } catch (e) {
    console.error("[build-frontend] Could not clear public/ (run: rm -rf public):", e.message)
    process.exit(1)
  }
}
fs.mkdirSync(publicDir, { recursive: true })
copyRecursive(outDir, publicDir)
console.log("[build-frontend] Done. public/ updated.")
console.log("[build-frontend] Note: keep public/ when running standalone; pack will include public/ in the zip.")
