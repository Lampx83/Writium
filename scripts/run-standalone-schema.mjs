#!/usr/bin/env node
/**
 * Run Part 1 (standalone) of schema/schema.sql against the writium database.
 * Usage: createdb writium && node scripts/run-standalone-schema.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schemaPath = path.join(__dirname, "..", "schema", "schema.sql")
const STANDALONE_END = "-- #STANDALONE_END"

if (!fs.existsSync(schemaPath)) {
  console.error("Missing schema/schema.sql")
  process.exit(1)
}
let sql = fs.readFileSync(schemaPath, "utf-8")
const idx = sql.indexOf(STANDALONE_END)
if (idx >= 0) sql = sql.slice(0, idx).trim()
execSync("psql writium -f -", { input: sql, stdio: ["pipe", "inherit", "inherit"] })
console.log("[run-standalone-schema] Part 1 applied to database writium")
