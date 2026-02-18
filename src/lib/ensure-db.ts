/**
 * Standalone mode: ensure database exists and schema (tables) has been applied.
 */
import { Pool } from "pg"
import fs from "fs"
import path from "path"
import { getEnv, RUN_MODE, DATABASE_URL } from "./env"
import { resetPool } from "./db"

const CODE_DB_DOES_NOT_EXIST = "3D000"

function getDatabaseNameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const name = (u.pathname || "/").replace(/^\/+|\/+$/g, "") || "postgres"
    return name
  } catch {
    return "writium"
  }
}

function getPostgresUrl(url: string): string {
  try {
    const u = new URL(url)
    u.pathname = "/postgres"
    return u.toString()
  } catch {
    return url.replace(/\/[^/]*$/, "/postgres")
  }
}

async function schemaAlreadyApplied(): Promise<boolean> {
  const { query } = await import("./db")
  const schema = getEnv("DB_SCHEMA", "writium")
  const r = await query<{ n: number }>(
    "SELECT 1 AS n FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'users'",
    [schema]
  )
  return (r?.rows?.length ?? 0) > 0
}

async function createDatabaseIfNeeded(): Promise<void> {
  const dbName = getDatabaseNameFromUrl(DATABASE_URL!)
  const postgresUrl = getPostgresUrl(DATABASE_URL!)
  resetPool()
  const adminPool = new Pool({ connectionString: postgresUrl, max: 1 })
  try {
    await adminPool.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`)
    console.log(`[ensure-db] Created database "${dbName}"`)
  } catch (e: unknown) {
    if ((e as { code?: string })?.code !== "42P04") throw e
    console.log(`[ensure-db] Database "${dbName}" already exists`)
  } finally {
    await adminPool.end()
  }
}

const STANDALONE_END = "-- #STANDALONE_END"

async function applySchemaAndSeed(): Promise<void> {
  const schemaPath = path.join(__dirname, "..", "..", "schema", "schema.sql")
  if (!fs.existsSync(schemaPath)) {
    console.warn("[ensure-db] schema/schema.sql not found, skipping schema init")
    return
  }
  let schemaSql = fs.readFileSync(schemaPath, "utf-8")
  const markerIdx = schemaSql.indexOf(STANDALONE_END)
  if (markerIdx >= 0) schemaSql = schemaSql.slice(0, markerIdx)
  // Split by ; then drop pure comment lines, keep each statement (may contain inline comments)
  const statements = schemaSql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--[^\n]*\n?/gm, "").trim())
    .filter((s) => s.length > 0)
  const schema = getEnv("DB_SCHEMA", "writium")
  const appPool = new Pool({ connectionString: DATABASE_URL!, max: 1 })
  try {
    for (const stmt of statements) {
      if (!stmt) continue
      const sql = stmt.endsWith(";") ? stmt : stmt + ";"
      await appPool.query(sql)
    }
    console.log("[ensure-db] Schema applied successfully")
    await appPool.query(
      `INSERT INTO ${schema}.users (email, display_name) VALUES ('guest@writium.local', 'Guest user') ON CONFLICT (email) DO NOTHING`
    )
  } finally {
    await appPool.end()
  }
}

export async function ensureDatabase(): Promise<void> {
  if (RUN_MODE !== "standalone" || !DATABASE_URL) return

  const { query } = await import("./db")
  let dbExisted = true

  try {
    await query("SELECT 1")
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code !== CODE_DB_DOES_NOT_EXIST) throw err
    dbExisted = false
  }

  if (!dbExisted) {
    console.log("[ensure-db] Database does not exist, creating...")
    await createDatabaseIfNeeded()
  }

  if (await schemaAlreadyApplied()) return

  console.log("[ensure-db] Schema not applied, running schema.sql (Part 1)...")
  await applySchemaAndSeed()
}
