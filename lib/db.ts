import { PrismaClient } from '@/app/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient
  _queryLog: Array<{ query: string; durationMs: number; ts: number }>
}

function createClient(): PrismaClient {
  return new PrismaClient({
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
    if (log.length > 200) log.splice(0, log.length - 200)
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma

/** Access the in-memory query performance log */
export function getQueryLog() {
  return globalForPrisma._queryLog ?? []
}
