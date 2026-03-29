import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface Highlight {
  id: string
  text: string
  note: string
  createdAt: string
}

function parseHighlights(raw: string | null): Highlight[] {
  if (!raw) return []
  try {
    return JSON.parse(raw) as Highlight[]
  } catch {
    return []
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: { highlights: true },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    return NextResponse.json({ highlights: parseHighlights(bookmark.highlights) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch highlights' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  let body: { text?: string; note?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text, note = '' } = body

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: { highlights: true },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    const highlights = parseHighlights(bookmark.highlights)
    const newHighlight: Highlight = {
      id: crypto.randomUUID(),
      text: text.trim(),
      note,
      createdAt: new Date().toISOString(),
    }
    highlights.push(newHighlight)

    await prisma.bookmark.update({
      where: { id },
      data: { highlights: JSON.stringify(highlights) },
    })

    return NextResponse.json({ highlight: newHighlight, highlights })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add highlight' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const highlightId = searchParams.get('highlightId')

  if (!highlightId) {
    return NextResponse.json({ error: 'highlightId query param is required' }, { status: 400 })
  }

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: { highlights: true },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    const highlights = parseHighlights(bookmark.highlights)
    const filtered = highlights.filter((h) => h.id !== highlightId)

    if (filtered.length === highlights.length) {
      return NextResponse.json({ error: 'Highlight not found' }, { status: 404 })
    }

    await prisma.bookmark.update({
      where: { id },
      data: { highlights: JSON.stringify(filtered) },
    })

    return NextResponse.json({ highlights: filtered })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete highlight' },
      { status: 500 }
    )
  }
}
