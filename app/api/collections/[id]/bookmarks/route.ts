import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// POST — add a bookmark to the collection
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: collectionId } = await params
  const body = await request.json().catch(() => ({})) as { bookmarkId?: string }
  if (!body.bookmarkId) return NextResponse.json({ error: 'bookmarkId required' }, { status: 400 })

  await prisma.bookmarkCollection.upsert({
    where: { bookmarkId_collectionId: { bookmarkId: body.bookmarkId, collectionId } },
    create: { bookmarkId: body.bookmarkId, collectionId },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a bookmark from the collection
export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: collectionId } = await params
  const { searchParams } = new URL(request.url)
  const bookmarkId = searchParams.get('bookmarkId')
  if (!bookmarkId) return NextResponse.json({ error: 'bookmarkId required' }, { status: 400 })

  await prisma.bookmarkCollection.delete({
    where: { bookmarkId_collectionId: { bookmarkId, collectionId } },
  }).catch(() => null)
  return NextResponse.json({ ok: true })
}

// GET — list bookmark IDs in collection (lightweight)
export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id: collectionId } = await params
  const items = await prisma.bookmarkCollection.findMany({
    where: { collectionId },
    select: { bookmarkId: true },
  })
  return NextResponse.json({ bookmarkIds: items.map((i) => i.bookmarkId) })
}
