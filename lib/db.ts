import BetterSqlite3 from 'better-sqlite3'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/app/generated/prisma/client'
import path from 'path'

// Use DATABASE_URL from env, fallback to default dev path
const dbUrl = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`
const dbPath = dbUrl.replace(/^file:/, '')

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient
  _walEnabled: boolean
  _queryLog: Array<{ query: string; durationMs: number; ts: number }>
}

function createClient(): PrismaClient {
  // Enable WAL mode for concurrent reads + better write performance
  if (!globalForPrisma._walEnabled) {
    try {
      const db = new BetterSqlite3(dbPath)
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
      db.pragma('cache_size = -64000') // 64MB cache
      db.pragma('temp_store = memory')
      db.close()
      globalForPrisma._walEnabled = true
    } catch { /* pragma already set or DB not yet created */ }
  }

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl }),
    log: process.env.NODE_ENV === 'development' ? [
      { emit: 'event', level: 'query' },
    ] : [],
  })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

// Query performance log (dev only) — accessible at /api/debug/perf
if (!globalForPrisma._queryLog) globalForPrisma._queryLog = []
if (process.env.NODE_ENV === 'development') {
  // @ts-expect-error prisma event type
  prisma.$on('query', (e: { query: string; duration: number }) => {
    const log = globalForPrisma._queryLog
    log.push({ query: e.query.slice(0, 200), durationMs: e.duration, ts: Date.now() })
    if (log.length > 200) log.splice(0, log.length - 200) // keep last 200
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma

/** Access the in-memory query performance log */
export function getQueryLog() {
  return globalForPrisma._queryLog ?? []
}
