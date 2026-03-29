import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateDigest } from '@/lib/digest'

export async function GET(): Promise<NextResponse> {
  try {
    const digest = await prisma.digest.findFirst({
      orderBy: { generatedAt: 'desc' },
    })

    if (!digest) {
      return NextResponse.json({ digest: null })
    }

    return NextResponse.json({
      digest: {
        id: digest.id,
        generatedAt: digest.generatedAt.toISOString(),
        periodStart: digest.periodStart.toISOString(),
        periodEnd: digest.periodEnd.toISOString(),
        content: JSON.parse(digest.content),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch digest' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { days?: number } = {}
  try {
    body = await request.json()
  } catch {
    // body is optional
  }

  const days = typeof body.days === 'number' && body.days > 0 ? body.days : 7

  try {
    const data = await generateDigest(days)

    const digest = await prisma.digest.create({
      data: {
        content: JSON.stringify(data),
        periodStart: new Date(data.period.start),
        periodEnd: new Date(data.period.end),
      },
    })

    return NextResponse.json({
      digest: {
        id: digest.id,
        generatedAt: digest.generatedAt.toISOString(),
        content: data,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate digest' },
      { status: 500 }
    )
  }
}
