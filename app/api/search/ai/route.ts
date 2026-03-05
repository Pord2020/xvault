import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'

async function getApiKey(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
  if (setting?.value?.trim()) return setting.value.trim()
  return process.env.ANTHROPIC_API_KEY ?? ''
}

async function getAnthropicModel(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicModel' } })
  return setting?.value ?? 'claude-haiku-4-5-20251001'
}

/**
 * Parse structured imageTags JSON (new format) or fall back to plaintext (legacy).
 * Returns a compact string suitable for inclusion in the search index.
 */
function buildImageContext(imageTags: string | null): string {
  if (!imageTags) return ''
  try {
    const parsed = JSON.parse(imageTags) as Record<string, unknown>
    const parts: string[] = []
    if (parsed.scene) parts.push(`scene:${parsed.scene}`)
    if (parsed.action) parts.push(`action:${parsed.action}`)
    if (parsed.style) parts.push(`style:${parsed.style}`)
    if (parsed.mood) parts.push(`mood:${parsed.mood}`)
    if (Array.isArray(parsed.text_ocr) && (parsed.text_ocr as unknown[]).length)
      parts.push(`text:"${(parsed.text_ocr as string[]).join(' | ').slice(0, 200)}"`)
    if (Array.isArray(parsed.people) && (parsed.people as unknown[]).length)
      parts.push(`people:${(parsed.people as string[]).join(', ')}`)
    if (Array.isArray(parsed.objects) && (parsed.objects as unknown[]).length)
      parts.push(`objects:${(parsed.objects as string[]).slice(0, 6).join(', ')}`)
    if (parsed.meme_template) parts.push(`meme:${parsed.meme_template}`)
    if (Array.isArray(parsed.tags) && (parsed.tags as unknown[]).length)
      parts.push(`tags:${(parsed.tags as string[]).slice(0, 20).join(', ')}`)
    return parts.join(' | ')
  } catch {
    // Legacy plain-text imageTags
    return imageTags.slice(0, 400)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { query?: string; category?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { query, category } = body
  if (!query?.trim()) return NextResponse.json({ error: 'Query required' }, { status: 400 })

  const apiKey = await getApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'No Anthropic API key configured. Add it in Settings.' }, { status: 400 })
  }

  const baseURL = process.env.ANTHROPIC_BASE_URL
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
  const model = await getAnthropicModel()

  // Fetch bookmarks — optionally filtered by category
  const whereClause = category
    ? { categories: { some: { category: { slug: category } } } }
    : {}

  const bookmarks = await prisma.bookmark.findMany({
    where: whereClause,
    orderBy: [{ tweetCreatedAt: 'desc' }, { importedAt: 'desc' }],
    include: {
      mediaItems: { select: { type: true, url: true, thumbnailUrl: true, imageTags: true } },
      categories: {
        include: { category: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { confidence: 'desc' },
      },
    },
  })

  if (bookmarks.length === 0) {
    return NextResponse.json({ bookmarks: [], explanation: 'No bookmarks found.' })
  }

  // Build compact, structured search index
  const index = bookmarks.map((b) => {
    // Image context from all media items
    const mediaContext = b.mediaItems
      .map((m) => {
        const ctx = buildImageContext(m.imageTags)
        return ctx ? `[${m.type}:${ctx}]` : `[${m.type}]`
      })
      .join(' ')

    // Semantic tags (AI-generated)
    let semTags = ''
    if (b.semanticTags) {
      try {
        semTags = ` [sem:${(JSON.parse(b.semanticTags) as string[]).slice(0, 25).join(',')}]`
      } catch { /* ignore */ }
    }

    // Entity hashtags (free signal)
    let hashtags = ''
    if (b.entities) {
      try {
        const ent = JSON.parse(b.entities) as { hashtags?: string[]; tools?: string[] }
        const tags = [...(ent.hashtags ?? []), ...(ent.tools ?? [])].slice(0, 8)
        if (tags.length) hashtags = ` [#{${tags.join(',')}}]`
      } catch { /* ignore */ }
    }

    // Top category
    const cats = b.categories.map((bc) => bc.category.slug).join(',')

    return `${b.id}|@${b.authorHandle}: ${b.text.slice(0, 250)} ${mediaContext}${semTags}${hashtags}|[${cats}]`
  })

  const isMemeQuery = /meme|funny|laugh|lol|joke|humor|memes/i.test(query)
  const isVisualQuery = /image|photo|picture|chart|screenshot|graph|diagram|logo|icon|video/i.test(query)

  const prompt = `You are a precise semantic bookmark search engine.

User query: "${query}"
${category ? `Category filter: "${category}"` : ''}

${isMemeQuery ? 'MEME SEARCH: Match visual humor descriptions in [photo:...] and [gif:...] tags. Prioritize bookmarks tagged funny-memes.' : ''}
${isVisualQuery ? 'VISUAL SEARCH: Prioritize matches in image/video context sections ([photo:...], [video:...]).' : ''}

Search index format per line:
  id | @author: tweet_text [type:scene:X|action:Y|text:"OCR"|tags:...] [sem:ai_tags] [#{hashtags}] | [categories]

KEY: text:"..." = text visible IN the image (OCR) — match this for image text queries
     tags: = visual search tags    sem: = AI semantic tags    #{} = hashtags

BOOKMARKS (${bookmarks.length} total):
${index.join('\n')}

Return ONLY valid JSON:
{
  "matches": [
    { "id": "bookmark_id", "score": 0.95, "reason": "why ≤10 words" }
  ],
  "explanation": "one sentence"
}

Rules:
- Return 1-10 best matches, ranked by score (0.0-1.0)
- Minimum score threshold: 0.35
- Match semantically — synonyms, related concepts, visual descriptions
- If query mentions text that appears in images, check text:"..." field`

  let aiResponse: { matches: { id: string; score: number; reason: string }[]; explanation: string }

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.find((b) => b.type === 'text')?.text ?? '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    aiResponse = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as typeof aiResponse)
      : { matches: [], explanation: 'No results found.' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AI search error:', msg)
    return NextResponse.json({ error: `AI search failed: ${msg}` }, { status: 500 })
  }

  // Hydrate matched bookmarks
  const matchMap = new Map(aiResponse.matches.map((m) => [m.id, m]))
  const matchedIds = aiResponse.matches.map((m) => m.id)

  const fullBookmarks = await prisma.bookmark.findMany({
    where: { id: { in: matchedIds } },
    include: {
      mediaItems: true,
      categories: {
        include: { category: { select: { id: true, name: true, slug: true, color: true } } },
        orderBy: { confidence: 'desc' },
      },
    },
  })

  const sorted = fullBookmarks.sort(
    (a, b) => (matchMap.get(b.id)?.score ?? 0) - (matchMap.get(a.id)?.score ?? 0),
  )

  const results = sorted.map((b) => ({
    id: b.id,
    tweetId: b.tweetId,
    text: b.text,
    authorHandle: b.authorHandle,
    authorName: b.authorName,
    tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
    importedAt: b.importedAt.toISOString(),
    mediaItems: b.mediaItems.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      imageTags: m.imageTags ?? null,
    })),
    categories: b.categories.map((bc) => ({
      id: bc.category.id,
      name: bc.category.name,
      slug: bc.category.slug,
      color: bc.category.color,
      confidence: bc.confidence,
    })),
    aiScore: matchMap.get(b.id)?.score ?? 0,
    aiReason: matchMap.get(b.id)?.reason ?? '',
  }))

  return NextResponse.json({ bookmarks: results, explanation: aiResponse.explanation })
}
