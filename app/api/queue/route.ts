import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

const SELECT = {
  id: true,
  tweetId: true,
  text: true,
  authorHandle: true,
  authorName: true,
  tweetCreatedAt: true,
  importedAt: true,
  queuedAt: true,
  readingStatus: true,
  repoMeta: true,
  mediaItems: { select: { id: true, type: true, url: true, thumbnailUrl: true } },
  categories: {
    include: { category: { select: { id: true, name: true, slug: true, color: true } } },
    orderBy: { confidence: 'desc' as const },
  },
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status') ?? 'active'

  let statusFilter: string | string[]

  if (statusParam === 'all') {
    statusFilter = ['queue', 'reading', 'done']
  } else if (statusParam === 'done') {
    statusFilter = 'done'
  } else if (statusParam === 'reading') {
    statusFilter = 'reading'
  } else if (statusParam === 'queue') {
    statusFilter = 'queue'
  } else {
    statusFilter = ['queue', 'reading']
  }

  const where = Array.isArray(statusFilter)
    ? { readingStatus: { in: statusFilter } }
    : { readingStatus: statusFilter }

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where,
      select: SELECT,
      orderBy: [{ queuedAt: 'asc' }, { importedAt: 'desc' }],
    })

    const formatted = bookmarks.map((b) => ({
      id: b.id,
      tweetId: b.tweetId,
      text: b.text,
      authorHandle: b.authorHandle,
      authorName: b.authorName,
      tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
      importedAt: b.importedAt.toISOString(),
      queuedAt: b.queuedAt?.toISOString() ?? null,
      readingStatus: b.readingStatus,
      repoMeta: b.repoMeta,
      mediaItems: b.mediaItems,
      categories: b.categories.map((bc) => ({
        id: bc.category.id,
        name: bc.category.name,
        slug: bc.category.slug,
        color: bc.category.color,
        confidence: bc.confidence,
      })),
    }))

    return NextResponse.json({
      bookmarks: formatted,
      total: formatted.length,
      status: statusParam,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch queue' },
      { status: 500 }
    )
  }
}
