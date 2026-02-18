import { Pool, QueryResultRow } from "pg"
import { getEnv, DB_SCHEMA, DATABASE_URL } from "./env"

let poolInstance: Pool | null = null

function getPool(): Pool {
  if (!poolInstance) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL or PORTAL_DATABASE_URL is required")
    }
    poolInstance = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return poolInstance
}

export function getSchema(): string {
  return DB_SCHEMA
}

export function resetPool(): void {
  if (poolInstance) {
    poolInstance.end().catch(() => {})
    poolInstance = null
  }
}

const STATEMENT_TIMEOUT_MS = 30_000

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const schema = getSchema()
  const client = await getPool().connect()
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    const normalized = text.replace(/__SCHEMA__/g, schema)
    return await client.query<T>(normalized, params)
  } finally {
    client.release()
  }
}

export async function withTransaction<T>(callback: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    await client.query("BEGIN")
    try {
      const result = await callback(client)
      await client.query("COMMIT")
      return result
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  } finally {
    client.release()
  }
}
