import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { computeSimilarities } from '@/lib/similarity'
import type { SimilarityInput } from '@/lib/similarity'

const sel = {
  id: true,
  tweetId: true,
  text: true,
  authorHandle: true,
  authorName: true,
  tweetCreatedAt: true,
  importedAt: true,
  semanticTags: true,
  entities: true,
  repoMeta: true,
  categories: {
    include: {
      category: { select: { id: true, name: true, slug: true, color: true } },
    },
  },
  mediaItems: { select: { id: true, type: true, url: true, thumbnailUrl: true } },
}

function parseRepoFullName(repoMeta: string | null): string | null {
  if (!repoMeta) return null
  try {
    const r = JSON.parse(repoMeta) as { fullName?: string }
    return r.fullName ?? null
  } catch {
    return null
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const allBookmarks = await prisma.bookmark.findMany({
      where: {
        OR: [
          { semanticTags: { not: null } },
          { entities: { not: null } },
        ],
      },
      select: sel,
      orderBy: { importedAt: 'desc' },
      take: 500,
    })

    // Map id -> full bookmark record
    const bookmarkMap = new Map(allBookmarks.map((b) => [b.id, b]))

    // Track which ids have been grouped already
    const grouped = new Set<string>()
    const groups: Array<{ ids: string[]; reason: string }> = []

    // Group by same GitHub repo fullName
    const repoGroups = new Map<string, string[]>()
    for (const b of allBookmarks) {
      const fullName = parseRepoFullName(b.repoMeta)
      if (!fullName) continue
      const existing = repoGroups.get(fullName) ?? []
      existing.push(b.id)
      repoGroups.set(fullName, existing)
    }

    for (const [fullName, ids] of repoGroups) {
      if (ids.length >= 2) {
        groups.push({ ids, reason: `Same GitHub repo: ${fullName}` })
        for (const id of ids) grouped.add(id)
      }
    }

    // Group by high tag overlap (Jaccard > 0.65 on semanticTags) for ungrouped bookmarks
    const ungrouped = allBookmarks.filter((b) => !grouped.has(b.id))
    const processed = new Set<string>()

    for (const target of ungrouped) {
      if (processed.has(target.id)) continue

      const candidates: SimilarityInput[] = ungrouped
        .filter((b) => b.id !== target.id && !processed.has(b.id))

      const similar = computeSimilarities(target as SimilarityInput, candidates)
        .filter((r) => r.score >= 0.65)

      if (similar.length > 0) {
        const ids = [target.id, ...similar.map((r) => r.id)]
        groups.push({ ids, reason: 'High semantic tag overlap' })
        for (const id of ids) {
          processed.add(id)
          grouped.add(id)
        }
        processed.add(target.id)
      } else {
        processed.add(target.id)
      }
    }

    const result = groups
      .filter((g) => g.ids.length >= 2)
      .map((g) => {
        const preview = g.ids.slice(0, 2).map((id) => bookmarkMap.get(id)).filter(Boolean)
        const bookmarks = preview.map((b) => {
          if (!b) return null
          return {
            id: b.id,
            tweetId: b.tweetId,
            text: b.text,
            authorHandle: b.authorHandle,
            authorName: b.authorName,
            tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
            importedAt: b.importedAt.toISOString(),
            semanticTags: b.semanticTags,
            repoMeta: b.repoMeta,
            categories: b.categories.map((bc) => ({
              id: bc.category.id,
              name: bc.category.name,
              slug: bc.category.slug,
              color: bc.category.color,
              confidence: bc.confidence,
            })),
            mediaItems: b.mediaItems,
          }
        }).filter(Boolean)

        return {
          reason: g.reason,
          count: g.ids.length,
          ids: g.ids,
          bookmarks,
        }
      })

    return NextResponse.json({ groups: result, total: result.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to find duplicates' },
      { status: 500 }
    )
  }
}
