import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET — list all collections with bookmark counts
export async function GET(): Promise<NextResponse> {
  const collections = await prisma.collection.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { bookmarks: true } } },
  })
  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id, name: c.name, description: c.description,
      color: c.color, emoji: c.emoji, createdAt: c.createdAt.toISOString(),
      bookmarkCount: c._count.bookmarks,
    })),
  })
}

// POST — create a new collection
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as {
    name?: string; description?: string; color?: string; emoji?: string
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  const collection = await prisma.collection.create({
    data: {
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      color: body.color ?? '#6366f1',
      emoji: body.emoji ?? '📁',
    },
  })
  return NextResponse.json({ collection }, { status: 201 })
}
