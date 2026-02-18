import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") })

/** Bootstrap env only. */
export function getEnv(key: string, defaultValue?: string): string {
  const v = typeof process.env[key] === "string" ? (process.env[key] as string).trim() : ""
  return v !== "" ? v : (defaultValue !== undefined ? defaultValue : "")
}

export const RUN_MODE = getEnv("RUN_MODE", "standalone") as "standalone" | "embedded"
export const AUTH_MODE = getEnv("AUTH_MODE", "standalone") as "standalone" | "portal"
export const DB_SCHEMA = getEnv("DB_SCHEMA", "writium")
/** When embedded, use Portal DB and ai_portal schema. */
export const DATABASE_URL = getEnv("DATABASE_URL") || getEnv("PORTAL_DATABASE_URL")
