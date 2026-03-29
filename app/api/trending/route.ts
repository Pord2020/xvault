import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '7', 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000)

  const [recentBookmarks, prevBookmarks, topAuthors, topCategories] = await Promise.all([
    // Current period
    prisma.bookmark.findMany({
      where: { importedAt: { gte: since } },
      select: { id: true, semanticTags: true, entities: true, authorHandle: true, authorName: true, tweetCreatedAt: true, importedAt: true },
      orderBy: { importedAt: 'desc' },
    }),
    // Previous period for comparison
    prisma.bookmark.findMany({
      where: { importedAt: { gte: prevSince, lt: since } },
      select: { id: true, semanticTags: true, entities: true },
    }),
    // Top authors in period
    prisma.$queryRaw<Array<{ authorHandle: string; authorName: string; count: number }>>`
      SELECT authorHandle, authorName, COUNT(*) as count
      FROM Bookmark
      WHERE importedAt >= ${since.toISOString()}
      GROUP BY authorHandle
      ORDER BY count DESC
      LIMIT 10
    `,
    // Top categories in period
    prisma.$queryRaw<Array<{ name: string; slug: string; color: string; count: number }>>`
      SELECT c.name, c.slug, c.color, COUNT(bc.bookmarkId) as count
      FROM Category c
      JOIN BookmarkCategory bc ON bc.categoryId = c.id
      JOIN Bookmark b ON b.id = bc.bookmarkId
      WHERE b.importedAt >= ${since.toISOString()}
      GROUP BY c.id
      ORDER BY count DESC
      LIMIT 8
    `,
  ])

  // Aggregate tags from current period
  const tagCounts = new Map<string, number>()
  const toolCounts = new Map<string, number>()
  const hashtagCounts = new Map<string, number>()

  for (const b of recentBookmarks) {
    if (b.semanticTags) {
      try {
        const tags = JSON.parse(b.semanticTags) as string[]
        for (const tag of tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
        }
      } catch { /* skip */ }
    }
    if (b.entities) {
      try {
        const ent = JSON.parse(b.entities) as { tools?: string[]; hashtags?: string[] }
        for (const tool of ent.tools ?? []) {
          toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1)
        }
        for (const ht of ent.hashtags ?? []) {
          const lower = ht.toLowerCase()
          hashtagCounts.set(lower, (hashtagCounts.get(lower) ?? 0) + 1)
        }
      } catch { /* skip */ }
    }
  }

  // Previous period tag counts for trend calculation
  const prevTagCounts = new Map<string, number>()
  for (const b of prevBookmarks) {
    if (b.semanticTags) {
      try {
        const tags = JSON.parse(b.semanticTags) as string[]
        for (const tag of tags) prevTagCounts.set(tag, (prevTagCounts.get(tag) ?? 0) + 1)
      } catch { /* skip */ }
    }
  }

  // Sort and format top tags with trend
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => {
      const prev = prevTagCounts.get(tag) ?? 0
      const trend = prev === 0 ? 'new' : count > prev * 1.5 ? 'up' : count < prev * 0.6 ? 'down' : 'stable'
      return { tag, count, prev, trend }
    })

  const topTools = Array.from(toolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tool, count]) => ({ tool, count }))

  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }))

  // Activity by day
  const dayBuckets = new Map<string, number>()
  for (const b of recentBookmarks) {
    const day = new Date(b.importedAt).toISOString().slice(0, 10)
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1)
  }
  const activityByDay = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return NextResponse.json({
    period: { days, since: since.toISOString(), bookmarkCount: recentBookmarks.length, prevCount: prevBookmarks.length },
    topTags,
    topTools,
    topHashtags,
    topAuthors: topAuthors.map((a) => ({ ...a, count: Number(a.count) })),
    topCategories: topCategories.map((c) => ({ ...c, count: Number(c.count) })),
    activityByDay,
  })
}
