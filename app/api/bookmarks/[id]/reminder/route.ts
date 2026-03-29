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
      select: { reminderAt: true, reminderNote: true },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    return NextResponse.json({
      reminderAt: bookmark.reminderAt?.toISOString() ?? null,
      reminderNote: bookmark.reminderNote,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch reminder' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  let body: { reminderAt?: string; note?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { reminderAt, note } = body

  if (!reminderAt || typeof reminderAt !== 'string') {
    return NextResponse.json({ error: 'reminderAt (ISO string) is required' }, { status: 400 })
  }

  const date = new Date(reminderAt)
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'reminderAt must be a valid ISO date string' }, { status: 400 })
  }

  try {
    const updated = await prisma.bookmark.update({
      where: { id },
      data: {
        reminderAt: date,
        reminderNote: note ?? null,
      },
      select: { reminderAt: true, reminderNote: true },
    })

    return NextResponse.json({
      reminderAt: updated.reminderAt?.toISOString() ?? null,
      reminderNote: updated.reminderNote,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to set reminder' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const updated = await prisma.bookmark.update({
      where: { id },
      data: {
        reminderAt: null,
        reminderNote: null,
      },
      select: { reminderAt: true, reminderNote: true },
    })

    return NextResponse.json({
      reminderAt: updated.reminderAt,
      reminderNote: updated.reminderNote,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear reminder' },
      { status: 500 }
    )
  }
}
