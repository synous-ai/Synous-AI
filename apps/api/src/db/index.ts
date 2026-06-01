import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env'
import * as schema from './schema'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

export const db = drizzle(pool, { schema, casing: 'snake_case' })

export type DB = typeof db

/** Cierre ordenado del pool (para tests y shutdown). */
export async function closeDb(): Promise<void> {
  await pool.end()
}

export * as schema from './schema'
