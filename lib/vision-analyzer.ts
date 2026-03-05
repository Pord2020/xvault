import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'

async function getAnthropicModel(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicModel' } })
  return setting?.value ?? 'claude-haiku-4-5-20251001'
}

type AllowedMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function guessMediaType(url: string, contentTypeHeader: string | null): AllowedMediaType {
  const ct = contentTypeHeader?.toLowerCase() ?? ''
  if (ct.includes('png') || url.includes('.png')) return 'image/png'
  if (ct.includes('gif') || url.includes('.gif')) return 'image/gif'
  if (ct.includes('webp') || url.includes('.webp')) return 'image/webp'
  return 'image/jpeg'
}

const MAX_IMAGE_BYTES = 3_500_000 // 3.5MB raw → ~4.7MB base64, under Claude's 5MB limit

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mediaType: AllowedMediaType } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://twitter.com/',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength < 500) return null // skip tiny/broken responses
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      console.warn(`[vision] skipping oversized image (${Math.round(buffer.byteLength / 1024)}KB): ${url.slice(0, 80)}`)
      return null
    }
    const mediaType = guessMediaType(url, res.headers.get('content-type'))
    return { data: Buffer.from(buffer).toString('base64'), mediaType }
  } catch {
    return null
  }
}

const ANALYSIS_PROMPT = `Analyze this image for a bookmark search system. Return ONLY valid JSON, no markdown, no explanation.

{
  "people": ["description of each person visible — age, gender, appearance, expression, what they're doing"],
  "text_ocr": ["ALL visible text exactly as written — signs, captions, UI text, meme text, headlines, code"],
  "objects": ["significant objects, brands, logos, symbols, technology"],
  "scene": "brief scene description — setting and platform (e.g. 'Twitter screenshot', 'office desk', 'terminal window')",
  "action": "what is happening or being shown",
  "mood": "emotional tone: humorous/educational/alarming/inspiring/satirical/celebratory/neutral",
  "style": "photo/screenshot/meme/chart/infographic/artwork/gif/code/diagram",
  "meme_template": "specific meme template name if applicable, else null",
  "tags": ["30-40 specific searchable tags — topics, synonyms, proper nouns, brands, actions, emotions"]
}

Rules:
- text_ocr: transcribe ALL readable text exactly, word for word
- If a financial chart: include asset name, direction (up/down), timeframe
- If code: include language, key function/concept names
- If a meme: include the exact template name
- tags: be maximally specific — include brand names, person names, tool names, technical terms
- BAD tags: "twitter", "post", "image", "screenshot" (too generic)
- GOOD tags: "bitcoin price chart", "react hooks", "frustrated man", "gpt-4", "bull market"`

const RETRY_DELAYS_MS = [1500, 4000, 10000]
const CONCURRENCY = 3

async function analyzeImageWithRetry(
  url: string,
  client: Anthropic,
  model: string,
  attempt = 0,
): Promise<string> {
  const img = await fetchImageAsBase64(url)
  if (!img) return ''

  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 700,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: ANALYSIS_PROMPT },
          ],
        },
      ],
    })
    const raw = msg.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
    if (!raw) return ''

    // Validate it's parseable JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return ''
    JSON.parse(jsonMatch[0]) // throws if invalid
    return jsonMatch[0]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Never retry client errors (4xx) — bad request, invalid image, too large, etc.
    const isClientError = msg.includes('400') || msg.includes('401') || msg.includes('403') || msg.includes('422')
    const isRetryable =
      !isClientError && (
        msg.includes('rate') ||
        msg.includes('529') ||
        msg.includes('overloaded') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503')
      )

    if (attempt === 0) {
      // Log first failure per item so server console shows what's wrong
      console.warn(`[vision] analysis failed (attempt ${attempt + 1}): ${msg.slice(0, 120)}`)
    }

    if (isRetryable && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      return analyzeImageWithRetry(url, client, model, attempt + 1)
    }
    return ''
  }
}

interface MediaItemForAnalysis {
  id: string
  url: string
  thumbnailUrl: string | null
  type: string
}

/**
 * Check if this URL's analysis result is already cached in another MediaItem row.
 * Deduplicates API calls for the same image URL.
 */
async function getCachedAnalysis(imageUrl: string, excludeId: string): Promise<string | null> {
  const existing = await prisma.mediaItem.findFirst({
    where: { url: imageUrl, imageTags: { not: null }, id: { not: excludeId } },
    select: { imageTags: true },
  })
  return existing?.imageTags ?? null
}

async function analyzeItem(
  item: MediaItemForAnalysis,
  client: Anthropic,
  model: string,
): Promise<number> {
  const imageUrl = item.type === 'video' ? (item.thumbnailUrl ?? item.url) : item.url

  // Check URL-level dedup cache first
  const cached = await getCachedAnalysis(imageUrl, item.id)
  if (cached) {
    await prisma.mediaItem.update({ where: { id: item.id }, data: { imageTags: cached } })
    return 1
  }

  const prefix = item.type === 'video' ? '{"_type":"video_thumbnail",' : ''
  let tags = await analyzeImageWithRetry(imageUrl, client, model)

  if (tags && prefix) {
    // Inject a _type marker into the JSON for video thumbnails
    tags = tags.replace(/^\{/, prefix)
  }

  if (tags) {
    await prisma.mediaItem.update({ where: { id: item.id }, data: { imageTags: tags } })
    return 1
  }

  // CRITICAL: Mark as attempted even on failure. Without this, the while loop in
  // analyzeAllUntagged re-fetches the same items forever (infinite loop).
  await prisma.mediaItem.update({ where: { id: item.id }, data: { imageTags: '{}' } })
  return 0
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++
      results[taskIndex] = await tasks[taskIndex]()
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function analyzeBatch(
  items: MediaItemForAnalysis[],
  client: Anthropic,
  onProgress?: (delta: number) => void,
  shouldAbort?: () => boolean,
): Promise<number> {
  const analyzable = items.filter((m) => m.type === 'photo' || m.type === 'gif' || m.type === 'video')
  if (analyzable.length === 0) return 0

  const model = await getAnthropicModel()

  const tasks = analyzable.map((item) => async () => {
    if (shouldAbort?.()) return 0
    const result = await analyzeItem(item, client, model)
    if (result > 0) onProgress?.(result)
    return result
  })
  const results = await runWithConcurrency(tasks, CONCURRENCY)

  return results.reduce((sum, r) => sum + r, 0)
}

export async function analyzeUntaggedImages(client: Anthropic, limit = 10): Promise<number> {
  const untagged = await prisma.mediaItem.findMany({
    where: { imageTags: null, type: { in: ['photo', 'gif', 'video'] } },
    take: limit,
    select: { id: true, url: true, thumbnailUrl: true, type: true },
  })
  if (untagged.length === 0) return 0
  return analyzeBatch(untagged, client)
}

/**
 * Analyze ALL untagged media items (no limit). Used during full AI categorization.
 */
export async function analyzeAllUntagged(
  client: Anthropic,
  onProgress?: (total: number) => void,
  shouldAbort?: () => boolean,
): Promise<number> {
  const CHUNK = 15
  let total = 0
  let cursor: string | undefined

  while (true) {
    if (shouldAbort?.()) break

    // Use cursor-based pagination so failed items (marked '{}') are skipped naturally,
    // and we never re-fetch items we already attempted this run.
    const untagged = await prisma.mediaItem.findMany({
      where: {
        type: { in: ['photo', 'gif', 'video'] },
        // Only fetch items that have never been attempted (null) — '{}' sentinel means already tried
        imageTags: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: CHUNK,
      select: { id: true, url: true, thumbnailUrl: true, type: true },
    })

    if (untagged.length === 0) break

    cursor = untagged[untagged.length - 1].id

    await analyzeBatch(untagged, client, (delta) => {
      total += delta
      onProgress?.(total)
    }, shouldAbort)

    if (untagged.length < CHUNK) break
  }

  return total
}

/**
 * Generate bookmark-level semantic tags from tweet text + all image tags.
 * Stores JSON tag array in Bookmark.semanticTags.
 */
export async function enrichBookmarkSemanticTags(
  bookmarkId: string,
  tweetText: string,
  imageTags: string[],
  client: Anthropic,
  entities?: {
    hashtags?: string[]
    urls?: string[]
    mentions?: string[]
    tools?: string[]
    tweetType?: string
  },
): Promise<string[]> {
  // Parse structured imageTags JSON if available
  const imageContextParts: string[] = []
  for (const raw of imageTags.filter(Boolean)) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const parts: string[] = []
      if (parsed.scene) parts.push(`Scene: ${parsed.scene}`)
      if (parsed.action) parts.push(`Action: ${parsed.action}`)
      if (Array.isArray(parsed.text_ocr) && parsed.text_ocr.length)
        parts.push(`Text in image: ${(parsed.text_ocr as string[]).join(' | ')}`)
      if (Array.isArray(parsed.objects) && parsed.objects.length)
        parts.push(`Objects: ${(parsed.objects as string[]).join(', ')}`)
      if (Array.isArray(parsed.tags) && parsed.tags.length)
        parts.push(`Visual tags: ${(parsed.tags as string[]).slice(0, 20).join(', ')}`)
      if (parsed.meme_template) parts.push(`Meme: ${parsed.meme_template}`)
      imageContextParts.push(parts.join('\n'))
    } catch {
      imageContextParts.push(raw.slice(0, 400))
    }
  }

  const entityContext = entities
    ? [
        entities.hashtags?.length ? `Hashtags: ${entities.hashtags.join(', ')}` : '',
        entities.tools?.length ? `Tools/Products mentioned: ${entities.tools.join(', ')}` : '',
        entities.mentions?.length ? `Accounts mentioned: @${entities.mentions.join(', @')}` : '',
        entities.tweetType && entities.tweetType !== 'original' ? `Tweet type: ${entities.tweetType}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const prompt = `Generate 30-50 precise semantic search tags for this Twitter bookmark.

Tweet: "${tweetText.slice(0, 600)}"
${entityContext ? `\nContext:\n${entityContext}` : ''}
${imageContextParts.length ? `\nImage analysis:\n${imageContextParts.join('\n---\n')}` : ''}

Generate tags covering:
1. SPECIFIC TOPICS: exact tool names, technologies, people, companies (not generic)
2. ACTIONS: what someone can DO with this (learn X, use Y, build Z)
3. VISUAL: what is shown (chart type, meme name, screenshot of what app)
4. SYNONYMS: alternative terms someone might search
5. CONTEXT: when would someone want this? (starting a startup, learning to code, investing)
6. EMOTIONS: why did they bookmark this? (inspiring, funny, useful reference, how-to)

Return ONLY a JSON array, most-important tags first:
["tag1", "tag2", ...]

BAD tags: "twitter", "tweet", "social media", "post", "screenshot" (too generic)
GOOD tags: "gpt-4 prompting", "bitcoin price crash", "react hooks tutorial", "elon musk", "yield farming"`

  try {
    const model = await getAnthropicModel()
    const msg = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.find((b) => b.type === 'text')?.text ?? ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []

    const tags: unknown = JSON.parse(match[0])
    if (!Array.isArray(tags)) return []
    const result = (tags as unknown[]).map((t) => String(t)).filter((t) => t.length > 0)

    await prisma.bookmark.update({
      where: { id: bookmarkId },
      data: { semanticTags: JSON.stringify(result) },
    })

    return result
  } catch {
    return []
  }
}

/**
 * Run semantic enrichment for all bookmarks that have no semanticTags yet.
 */
export async function enrichAllBookmarks(
  client: Anthropic,
  onProgress?: (total: number) => void,
  shouldAbort?: () => boolean,
): Promise<number> {
  const CHUNK = 50
  let enriched = 0
  let cursor: string | undefined

  while (true) {
    if (shouldAbort?.()) break

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        semanticTags: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: CHUNK,
      select: {
        id: true,
        text: true,
        entities: true,
        mediaItems: { select: { imageTags: true } },
      },
    })

    if (bookmarks.length === 0) break
    cursor = bookmarks[bookmarks.length - 1].id

    for (const b of bookmarks) {
      if (shouldAbort?.()) break

      const imageTags = b.mediaItems
        .map((m) => m.imageTags)
        .filter((t): t is string => t !== null && t !== '' && t !== '{}')

      // Skip bookmarks with no content worth tagging; mark them so we don't retry
      if (imageTags.length === 0 && b.text.length < 20) {
        await prisma.bookmark.update({ where: { id: b.id }, data: { semanticTags: '[]' } })
        continue
      }

      let entities: Parameters<typeof enrichBookmarkSemanticTags>[4] = undefined
      if (b.entities) {
        try {
          entities = JSON.parse(b.entities) as typeof entities
        } catch { /* ignore */ }
      }

      const tags = await enrichBookmarkSemanticTags(b.id, b.text, imageTags, client, entities)
      if (tags.length > 0) {
        enriched++
        onProgress?.(enriched)
      } else {
        // Mark as attempted so re-runs skip it (unless force)
        await prisma.bookmark.update({ where: { id: b.id }, data: { semanticTags: '[]' } })
      }
    }

    if (bookmarks.length < CHUNK) break
  }

  return enriched
}
