import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ slug: string }> }

// GET — public endpoint, no auth needed
export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { slug } = await params

  try {
    // Increment views and fetch the shared record in one call
    const shared = await prisma.sharedCollection.update({
      where: { slug },
      data: { views: { increment: 1 } },
      select: {
        views: true,
        collection: {
          include: {
            bookmarks: {
              orderBy: { addedAt: 'desc' },
              include: {
                bookmark: {
                  include: {
                    mediaItems: { select: { id: true, type: true, url: true, thumbnailUrl: true } },
                    categories: {
                      include: {
                        category: { select: { id: true, name: true, slug: true, color: true } },
                      },
                      orderBy: { confidence: 'desc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    const c = shared.collection

    return NextResponse.json({
      collection: {
        name: c.name,
        description: c.description,
        color: c.color,
        emoji: c.emoji,
        bookmarkCount: c.bookmarks.length,
        bookmarks: c.bookmarks.map(({ bookmark: b, addedAt }) => ({
          id: b.id,
          tweetId: b.tweetId,
          text: b.text,
          authorHandle: b.authorHandle,
          authorName: b.authorName,
          tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
          importedAt: b.importedAt.toISOString(),
          repoMeta: b.repoMeta ?? null,
          addedAt: addedAt.toISOString(),
          mediaItems: b.mediaItems,
          categories: b.categories.map((bc) => ({
            id: bc.category.id,
            name: bc.category.name,
            slug: bc.category.slug,
            color: bc.category.color,
            confidence: bc.confidence,
          })),
        })),
      },
    })
  } catch (err) {
    const isNotFound =
      err instanceof Error && err.message.toLowerCase().includes('record to update not found')
    if (isNotFound) {
      return NextResponse.json({ error: 'Shared collection not found' }, { status: 404 })
    }

    console.error('[shared GET] error:', err)
    return NextResponse.json(
      { error: `Failed to fetch shared collection: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
