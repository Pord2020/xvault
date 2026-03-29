import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  try {
    const reminders = await prisma.bookmark.findMany({
      where: {
        reminderAt: {
          lte: new Date(),
          not: null,
        },
      },
      select: {
        id: true,
        tweetId: true,
        text: true,
        authorHandle: true,
        tweetCreatedAt: true,
        reminderAt: true,
        reminderNote: true,
        categories: {
          include: {
            category: {
              select: { id: true, name: true, slug: true, color: true },
            },
          },
        },
      },
      orderBy: { reminderAt: 'asc' },
    })

    const formatted = reminders.map((b) => ({
      id: b.id,
      tweetId: b.tweetId,
      text: b.text,
      authorHandle: b.authorHandle,
      tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
      reminderAt: b.reminderAt?.toISOString() ?? null,
      reminderNote: b.reminderNote,
      categories: b.categories.map((bc) => ({
        id: bc.category.id,
        name: bc.category.name,
        slug: bc.category.slug,
        color: bc.category.color,
        confidence: bc.confidence,
      })),
    }))

    return NextResponse.json({ reminders: formatted })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch due reminders' },
      { status: 500 }
    )
  }
}
