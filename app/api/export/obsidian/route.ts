import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { exportToObsidianZip, ExportableBookmark } from '@/lib/export-obsidian'

const BOOKMARK_INCLUDE = {
  categories: {
    include: {
      category: {
        select: { name: true, slug: true },
      },
    },
  },
} as const

type BookmarkWithCategories = {
  id: string
  tweetId: string
  text: string
  authorHandle: string
  authorName: string
  tweetCreatedAt: Date | null
  importedAt: Date
  semanticTags: string | null
  entities: string | null
  repoMeta: string | null
  highlights: string | null
  categories: Array<{
    category: { name: string; slug: string }
  }>
}

function toExportable(b: BookmarkWithCategories): ExportableBookmark {
  return {
    id: b.id,
    tweetId: b.tweetId,
    text: b.text,
    authorHandle: b.authorHandle,
    authorName: b.authorName,
    tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
    importedAt: b.importedAt.toISOString(),
    semanticTags: b.semanticTags,
    entities: b.entities,
    repoMeta: b.repoMeta,
    highlights: b.highlights,
    categories: b.categories.map((bc) => ({
      name: bc.category.name,
      slug: bc.category.slug,
    })),
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => ({})) as {
    collectionId?: string
    categorySlug?: string
    all?: boolean
  }

  try {
    let bookmarks: BookmarkWithCategories[] = []
    let folderName = 'All Bookmarks'

    const BOOKMARK_SELECT = {
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
      highlights: true,
    } as const

    if (body.collectionId) {
      const collection = await prisma.collection.findUnique({
        where: { id: body.collectionId },
        select: { name: true },
      })
      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }
      folderName = collection.name

      const collectionBookmarks = await prisma.bookmarkCollection.findMany({
        where: { collectionId: body.collectionId },
        take: 1000,
        orderBy: { addedAt: 'desc' },
        include: {
          bookmark: {
            select: {
              ...BOOKMARK_SELECT,
              ...BOOKMARK_INCLUDE,
            },
          },
        },
      })
      bookmarks = collectionBookmarks.map((cb) => cb.bookmark)
    } else if (body.categorySlug) {
      const category = await prisma.category.findUnique({
        where: { slug: body.categorySlug },
        select: { name: true },
      })
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      folderName = category.name

      bookmarks = await prisma.bookmark.findMany({
        where: {
          categories: {
            some: { category: { slug: body.categorySlug } },
          },
        },
        take: 1000,
        orderBy: { importedAt: 'desc' },
        select: {
          ...BOOKMARK_SELECT,
          ...BOOKMARK_INCLUDE,
        },
      })
    } else if (body.all) {
      bookmarks = await prisma.bookmark.findMany({
        take: 1000,
        orderBy: { importedAt: 'desc' },
        select: {
          ...BOOKMARK_SELECT,
          ...BOOKMARK_INCLUDE,
        },
      })
    } else {
      return NextResponse.json(
        { error: 'Provide one of: collectionId, categorySlug, or all: true' },
        { status: 400 }
      )
    }

    const exportable = bookmarks.map(toExportable)
    const buffer = await exportToObsidianZip(exportable, folderName)

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="siftly-export.zip"`,
      },
    })
  } catch (err) {
    console.error('Obsidian export error:', err)
    return NextResponse.json(
      { error: `Export failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
