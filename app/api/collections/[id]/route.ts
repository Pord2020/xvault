import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET — single collection with bookmarks
export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  const collection = await prisma.collection.findUnique({
    where: { id },
    include: {
      bookmarks: {
        orderBy: { addedAt: 'desc' },
        include: {
          bookmark: {
            include: {
              mediaItems: { select: { id: true, type: true, url: true, thumbnailUrl: true } },
              categories: {
                include: { category: { select: { id: true, name: true, slug: true, color: true } } },
                orderBy: { confidence: 'desc' },
              },
            },
          },
        },
      },
    },
  })
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    collection: {
      id: collection.id, name: collection.name, description: collection.description,
      color: collection.color, emoji: collection.emoji, createdAt: collection.createdAt.toISOString(),
      bookmarkCount: collection.bookmarks.length,
      bookmarks: collection.bookmarks.map(({ bookmark: b, addedAt }) => ({
        id: b.id, tweetId: b.tweetId, text: b.text,
        authorHandle: b.authorHandle, authorName: b.authorName,
        tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
        importedAt: b.importedAt.toISOString(),
        repoMeta: b.repoMeta ?? null,
        addedAt: addedAt.toISOString(),
        mediaItems: b.mediaItems,
        categories: b.categories.map((bc) => ({
          id: bc.category.id, name: bc.category.name, slug: bc.category.slug,
          color: bc.category.color, confidence: bc.confidence,
        })),
      })),
    },
  })
}

// PUT — update collection metadata
export async function PUT(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  const body = await request.json().catch(() => ({})) as {
    name?: string; description?: string; color?: string; emoji?: string
  }
  const collection = await prisma.collection.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() ?? null } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.emoji ? { emoji: body.emoji } : {}),
    },
  }).catch(() => null)
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ collection })
}

// DELETE — remove collection
export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params
  await prisma.collection.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
