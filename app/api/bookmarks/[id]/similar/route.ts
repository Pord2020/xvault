import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { computeSimilarities } from '@/lib/similarity'
import type { SimilarityInput } from '@/lib/similarity'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    // Load the target bookmark with similarity fields
    const target = await prisma.bookmark.findUnique({
      where: { id },
      select: {
        id: true,
        semanticTags: true,
        entities: true,
        authorHandle: true,
        categories: {
          include: {
            category: { select: { slug: true } },
          },
        },
      },
    })

    if (!target) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // Load candidate bookmarks (excluding the target)
    const candidates = await prisma.bookmark.findMany({
      where: { id: { not: id } },
      take: 300,
      orderBy: { importedAt: 'desc' },
      select: {
        id: true,
        semanticTags: true,
        entities: true,
        authorHandle: true,
        categories: {
          include: {
            category: { select: { slug: true } },
          },
        },
      },
    })

    const targetInput: SimilarityInput = {
      id: target.id,
      semanticTags: target.semanticTags,
      entities: target.entities,
      authorHandle: target.authorHandle,
      categories: target.categories,
    }

    const candidateInputs: SimilarityInput[] = candidates.map((c) => ({
      id: c.id,
      semanticTags: c.semanticTags,
      entities: c.entities,
      authorHandle: c.authorHandle,
      categories: c.categories,
    }))

    const similarities = computeSimilarities(targetInput, candidateInputs)
    const topIds = similarities.slice(0, 6).map((s) => s.id)

    if (topIds.length === 0) {
      return NextResponse.json({ similar: [] })
    }

    // Load full bookmark data for the top similar IDs
    const similar = await prisma.bookmark.findMany({
      where: { id: { in: topIds } },
      select: {
        id: true,
        tweetId: true,
        text: true,
        authorHandle: true,
        authorName: true,
        tweetCreatedAt: true,
        repoMeta: true,
        categories: {
          include: {
            category: {
              select: { id: true, name: true, slug: true, color: true },
            },
          },
          orderBy: { confidence: 'desc' },
        },
        mediaItems: {
          select: { id: true, type: true, url: true, thumbnailUrl: true },
        },
      },
    })

    // Preserve the similarity-score order
    const idOrder = new Map(topIds.map((sid, i) => [sid, i]))
    similar.sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99))

    const formatted = similar.map((b) => ({
      id: b.id,
      tweetId: b.tweetId,
      text: b.text,
      authorHandle: b.authorHandle,
      authorName: b.authorName,
      tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
      repoMeta: b.repoMeta ?? null,
      categories: b.categories.map((bc) => ({
        id: bc.category.id,
        name: bc.category.name,
        slug: bc.category.slug,
        color: bc.category.color,
        confidence: bc.confidence,
      })),
      mediaItems: b.mediaItems,
    }))

    return NextResponse.json({ similar: formatted })
  } catch (err) {
    console.error('[similar GET] error:', err)
    return NextResponse.json(
      { error: `Failed to compute similar bookmarks: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
