import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: { readingStatus: true, queuedAt: true },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    return NextResponse.json({
      readingStatus: bookmark.readingStatus,
      queuedAt: bookmark.queuedAt?.toISOString() ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch reading status' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  let body: { status?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { status } = body

  const validStatuses = ['queue', 'reading', 'done', null]
  if (status !== undefined && !validStatuses.includes(status as string | null)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be null, "queue", "reading", or "done"' },
      { status: 400 }
    )
  }

  const data: { readingStatus: string | null; queuedAt: Date | null } = {
    readingStatus: status ?? null,
    queuedAt: null,
  }

  if (status === 'queue') {
    data.queuedAt = new Date()
  }

  try {
    const updated = await prisma.bookmark.update({
      where: { id },
      data,
      select: { readingStatus: true, queuedAt: true },
    })

    return NextResponse.json({
      readingStatus: updated.readingStatus,
      queuedAt: updated.queuedAt?.toISOString() ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update reading status' },
      { status: 500 }
    )
  }
}
