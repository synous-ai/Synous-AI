import { drizzle as drizzleNodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { Pool as PgPool } from 'pg'
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { env } from '../config/env'
import * as schema from './schema'

// @neondatabase/serverless habla el protocolo WebSocket de Neon — necesita un
// constructor de WebSocket explícito fuera de edge/browser runtimes (Node no
// trae uno global).
neonConfig.webSocketConstructor = ws

/**
 * Driver de Postgres bifurcado por entorno: local dev sigue con node-postgres
 * contra el Postgres de Docker (rápido, sin red, cero setup); cualquier
 * DATABASE_URL de Neon (deploy) usa el driver serverless de Neon — necesario
 * porque neon-http (la alternativa "simple") NO soporta transacciones, y
 * db.transaction() es una regla explícita del proyecto usada en ~18 archivos.
 *
 * Se expone todo bajo el tipo de node-postgres (NodePgDatabase): ambos drivers
 * comparten la misma superficie de query building de Drizzle para el dialecto
 * Postgres, solo difiere el transporte por debajo. Verificado explícitamente
 * con un test de transacción real contra Neon antes de confiar en esto — ver
 * plan de migración.
 */
function createDb(): { pool: PgPool | NeonPool; db: NodePgDatabase<typeof schema> } {
  if (env.DATABASE_URL.includes('neon.tech')) {
    const pool = new NeonPool({ connectionString: env.DATABASE_URL })
    const db = drizzleNeon(pool, { schema, casing: 'snake_case' }) as unknown as NodePgDatabase<
      typeof schema
    >
    return { pool, db }
  }
  const pool = new PgPool({ connectionString: env.DATABASE_URL })
  const db = drizzleNodePostgres(pool, { schema, casing: 'snake_case' })
  return { pool, db }
}

const instance = createDb()

export const pool = instance.pool
export const db = instance.db

export type DB = typeof db

/** Cierre ordenado del pool (para tests y shutdown). */
export async function closeDb(): Promise<void> {
  await pool.end()
}

export * as schema from './schema'
