import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET — return sharing info for this collection
export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    const shared = await prisma.sharedCollection.findUnique({
      where: { collectionId: id },
      select: {
        slug: true,
        views: true,
        createdAt: true,
      },
    })

    if (!shared) {
      return NextResponse.json({ shared: null })
    }

    return NextResponse.json({
      shared: {
        slug: shared.slug,
        url: '/shared/' + shared.slug,
        views: shared.views,
        createdAt: shared.createdAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('[share GET] error:', err)
    return NextResponse.json(
      { error: `Failed to fetch share info: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

// POST — create a shared link for this collection
export async function POST(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    // Verify collection exists
    const collection = await prisma.collection.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if already shared — return existing
    const existing = await prisma.sharedCollection.findUnique({
      where: { collectionId: id },
      select: { slug: true, views: true, createdAt: true },
    })

    if (existing) {
      return NextResponse.json({
        shared: {
          slug: existing.slug,
          url: '/shared/' + existing.slug,
          views: existing.views,
          createdAt: existing.createdAt.toISOString(),
        },
      })
    }

    const slug = crypto.randomUUID().slice(0, 8)

    const created = await prisma.sharedCollection.create({
      data: {
        collectionId: id,
        slug,
      },
      select: {
        slug: true,
        views: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      {
        shared: {
          slug: created.slug,
          url: '/shared/' + created.slug,
          views: created.views,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[share POST] error:', err)
    return NextResponse.json(
      { error: `Failed to create share link: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

// DELETE — remove the shared link
export async function DELETE(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    await prisma.sharedCollection.delete({
      where: { collectionId: id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // If not found, that's still a success (idempotent delete)
    const isNotFound =
      err instanceof Error && err.message.toLowerCase().includes('record to delete does not exist')
    if (isNotFound) {
      return NextResponse.json({ ok: true })
    }

    console.error('[share DELETE] error:', err)
    return NextResponse.json(
      { error: `Failed to remove share link: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
