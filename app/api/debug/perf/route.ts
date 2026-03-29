import { NextResponse } from 'next/server'
import { getQueryLog } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const queries = getQueryLog()
    .slice()
    .sort((a, b) => b.durationMs - a.durationMs)

  const avgMs =
    queries.length > 0
      ? Math.round(queries.reduce((sum, q) => sum + q.durationMs, 0) / queries.length)
      : 0

  return NextResponse.json({
    queries,
    slowest: queries[0] ?? null,
    avgMs,
  })
}
