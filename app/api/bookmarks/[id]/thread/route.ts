import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface ThreadTweet {
  tweetId: string
  text: string
  authorHandle: string
  createdAt?: string
}

interface ThreadData {
  tweets: ThreadTweet[]
  fetchedAt: string
}

interface SyndicationTweetResult {
  id_str?: string
  text?: string
  full_text?: string
  user?: {
    screen_name?: string
    name?: string
  }
  created_at?: string
  in_reply_to_status_id_str?: string
  quoted_status?: SyndicationTweetResult
  retweeted_status?: SyndicationTweetResult
}

function parseSyndicationResponse(data: SyndicationTweetResult, fallbackHandle: string): ThreadTweet[] {
  const tweets: ThreadTweet[] = []

  const mainTweet: ThreadTweet = {
    tweetId: data.id_str ?? '',
    text: data.full_text ?? data.text ?? '',
    authorHandle: data.user?.screen_name ?? fallbackHandle,
    createdAt: data.created_at,
  }
  if (mainTweet.text) {
    tweets.push(mainTweet)
  }

  // Include quoted tweet context if present
  if (data.quoted_status) {
    const qt = data.quoted_status
    tweets.push({
      tweetId: qt.id_str ?? '',
      text: qt.full_text ?? qt.text ?? '',
      authorHandle: qt.user?.screen_name ?? fallbackHandle,
      createdAt: qt.created_at,
    })
  }

  return tweets.filter((t) => t.text)
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: {
        id: true,
        tweetId: true,
        text: true,
        authorHandle: true,
        threadData: true,
      },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    if (bookmark.threadData) {
      try {
        const parsed = JSON.parse(bookmark.threadData) as ThreadData
        return NextResponse.json({ tweets: parsed.tweets, reconstructed: true, cached: true })
      } catch {
        // Corrupt data — fall through to return single tweet
      }
    }

    return NextResponse.json({
      tweets: [{ tweetId: bookmark.tweetId, text: bookmark.text, authorHandle: bookmark.authorHandle }],
      reconstructed: false,
      cached: false,
    })
  } catch (err) {
    console.error('[thread GET] error:', err)
    return NextResponse.json(
      { error: `Failed to fetch thread: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

export async function POST(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id },
      select: {
        id: true,
        tweetId: true,
        text: true,
        authorHandle: true,
      },
    })

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    const fallbackResponse = {
      tweets: [{ tweetId: bookmark.tweetId, text: bookmark.text, authorHandle: bookmark.authorHandle }],
      reconstructed: false,
    }

    // Fetch basic tweet data from Twitter's syndication endpoint (no auth required)
    let tweets: ThreadTweet[] = []
    let fetchSuccess = false

    try {
      const url = `https://cdn.syndication.twimg.com/tweet-result?id=${bookmark.tweetId}&lang=en`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Siftly/1.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (res.ok) {
        const data = await res.json() as SyndicationTweetResult
        if (data && (data.text || data.full_text)) {
          tweets = parseSyndicationResponse(data, bookmark.authorHandle)
          fetchSuccess = true
        }
      }
    } catch (fetchErr) {
      console.warn('[thread POST] syndication fetch failed:', fetchErr instanceof Error ? fetchErr.message : fetchErr)
    }

    if (!fetchSuccess || tweets.length === 0) {
      return NextResponse.json({ ...fallbackResponse, partial: true })
    }

    // Store the thread data on the bookmark
    const threadData: ThreadData = {
      tweets,
      fetchedAt: new Date().toISOString(),
    }

    await prisma.bookmark.update({
      where: { id },
      data: { threadData: JSON.stringify(threadData) },
    })

    return NextResponse.json({ tweets, reconstructed: true })
  } catch (err) {
    console.error('[thread POST] error:', err)
    return NextResponse.json(
      { error: `Failed to reconstruct thread: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
