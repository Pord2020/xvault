import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/lib/db'

const BATCH_SIZE = 20

const DEFAULT_CATEGORIES = [
  {
    name: 'Funny Memes',
    slug: 'funny-memes',
    color: '#f59e0b',
    description: 'Memes, jokes, humor, funny situations, viral content, satire, comedy, relatable posts',
    isAiGenerated: false,
  },
  {
    name: 'AI Resources',
    slug: 'ai-resources',
    color: '#8b5cf6',
    description:
      'Artificial intelligence, machine learning, LLMs, ChatGPT, Claude, Gemini, Midjourney, prompts, AI tools, model training, agents, RAG, fine-tuning',
    isAiGenerated: false,
  },
  {
    name: 'Dev Tools',
    slug: 'dev-tools',
    color: '#06b6d4',
    description:
      'Programming, coding, GitHub, software engineering, frameworks, APIs, open source, terminal, CI/CD, databases, debugging, architecture',
    isAiGenerated: false,
  },
  {
    name: 'Design',
    slug: 'design',
    color: '#ec4899',
    description:
      'UI/UX design, visual design, typography, product design, Figma, creative tools, color palettes, motion design, branding',
    isAiGenerated: false,
  },
  {
    name: 'Finance & Crypto',
    slug: 'finance-crypto',
    color: '#10b981',
    description:
      'Finance, cryptocurrency, Bitcoin, Ethereum, DeFi, NFTs, trading, investing, charts, stocks, options, macroeconomics, portfolio',
    isAiGenerated: false,
  },
  {
    name: 'Productivity',
    slug: 'productivity',
    color: '#f97316',
    description:
      'Productivity systems, life hacks, time management, habits, focus, mental models, note-taking, self-improvement, second brain',
    isAiGenerated: false,
  },
  {
    name: 'News',
    slug: 'news',
    color: '#6366f1',
    description:
      'Current events, breaking news, politics, tech industry news, announcements, Twitter threads, essays, long-form takes',
    isAiGenerated: false,
  },
  {
    name: 'General',
    slug: 'general',
    color: '#64748b',
    description: "General interest, personal, miscellaneous content that doesn't fit other categories",
    isAiGenerated: false,
  },
] as const

const CATEGORY_SLUGS = DEFAULT_CATEGORIES.map((c) => c.slug)

interface BookmarkForCategorization {
  tweetId: string
  text: string
  imageTags?: string
  semanticTags?: string[]
  hashtags?: string[]
  tools?: string[]
}

interface CategoryAssignment {
  category: string
  confidence: number
}

interface CategorizationResult {
  tweetId: string
  assignments: CategoryAssignment[]
}

export async function seedDefaultCategories(): Promise<void> {
  const existing = await prisma.category.findMany({ select: { slug: true } })
  const existingSlugs = new Set(existing.map((c) => c.slug))

  for (const cat of DEFAULT_CATEGORIES) {
    if (existingSlugs.has(cat.slug)) {
      // Update description in case it's outdated/empty
      await prisma.category.update({
        where: { slug: cat.slug },
        data: { description: cat.description },
      })
    } else {
      await prisma.category.create({ data: { ...cat } })
    }
  }
}

async function getAnthropicModel(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicModel' } })
  return setting?.value ?? 'claude-haiku-4-5-20251001'
}

async function getApiKey(overrideKey?: string): Promise<string> {
  if (overrideKey && overrideKey.trim() !== '') return overrideKey.trim()

  const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
  if (setting?.value && setting.value.trim() !== '') return setting.value.trim()

  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey && envKey.trim() !== '') return envKey.trim()

  throw new Error(
    'No Anthropic API key found. Provide it via the settings page, ANTHROPIC_API_KEY env var, or the API request.',
  )
}

function buildImageContext(rawImageTags: string | undefined): string {
  if (!rawImageTags) return ''
  try {
    const parsed = JSON.parse(rawImageTags) as Record<string, unknown>
    const parts: string[] = []
    if (parsed.style) parts.push(`Style: ${parsed.style}`)
    if (parsed.scene) parts.push(`Scene: ${parsed.scene}`)
    if (parsed.action) parts.push(`Action: ${parsed.action}`)
    if (Array.isArray(parsed.text_ocr) && (parsed.text_ocr as unknown[]).length)
      parts.push(`Text: ${(parsed.text_ocr as string[]).join(' | ').slice(0, 200)}`)
    if (Array.isArray(parsed.tags) && (parsed.tags as unknown[]).length)
      parts.push(`Visual tags: ${(parsed.tags as string[]).slice(0, 15).join(', ')}`)
    if (parsed.meme_template) parts.push(`Meme: ${parsed.meme_template}`)
    return parts.join(' | ')
  } catch {
    return rawImageTags.slice(0, 300)
  }
}

function buildCategorizationPrompt(
  bookmarks: BookmarkForCategorization[],
  categoryDescriptions: Record<string, string>,
): string {
  const categoriesList = CATEGORY_SLUGS.map(
    (slug) => `- ${slug}: ${categoryDescriptions[slug] ?? ''}`,
  ).join('\n')

  const tweetData = bookmarks.map((b) => {
    const entry: Record<string, unknown> = { id: b.tweetId, text: b.text.slice(0, 400) }
    const imgCtx = buildImageContext(b.imageTags)
    if (imgCtx) entry.images = imgCtx
    if (b.semanticTags?.length) entry.aiTags = b.semanticTags.slice(0, 20).join(', ')
    if (b.hashtags?.length) entry.hashtags = b.hashtags.slice(0, 10).join(', ')
    if (b.tools?.length) entry.tools = b.tools.join(', ')
    return entry
  })

  return `You are categorizing Twitter bookmarks into a personal knowledge library.

AVAILABLE CATEGORIES:
${categoriesList}

RULES:
- Assign 1-3 categories per bookmark (only what clearly applies — prefer specificity)
- Score confidence 0.5-1.0 per category based on how well it fits
- Use ALL context: text, images, OCR text, hashtags, tools, visual style
- If image shows a financial chart → finance-crypto (even if text says nothing)
- If image contains code or a GitHub screenshot → dev-tools
- If image is clearly a meme or funny → funny-memes (high confidence)
- "general" only as last resort when nothing else fits

Return ONLY valid JSON (no other text):
[{
  "tweetId": "123",
  "assignments": [
    {"category": "ai-resources", "confidence": 0.92},
    {"category": "dev-tools", "confidence": 0.71}
  ]
}]

BOOKMARKS:
${JSON.stringify(tweetData, null, 1)}`
}

function parseCategorizationResponse(text: string): CategorizationResult[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('No JSON array found in Claude response')

  const parsed: unknown = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) throw new Error('Claude response is not an array')

  return (parsed as Record<string, unknown>[]).map((item): CategorizationResult => {
    const tweetId = String(item.tweetId ?? '')
    const rawAssignments = Array.isArray(item.assignments) ? item.assignments : []

    const assignments: CategoryAssignment[] = (rawAssignments as Record<string, unknown>[])
      .map((a) => ({
        category: String(a.category ?? ''),
        confidence: typeof a.confidence === 'number' ? Math.min(1, Math.max(0.5, a.confidence)) : 0.8,
      }))
      .filter((a) => (CATEGORY_SLUGS as readonly string[]).includes(a.category))

    return { tweetId, assignments }
  })
}

export async function categorizeBatch(
  bookmarks: BookmarkForCategorization[],
  apiKey: string,
  categoryDescriptions: Record<string, string> = {},
): Promise<CategorizationResult[]> {
  if (bookmarks.length === 0) return []

  const client = new Anthropic({
    apiKey,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  })

  const model = await getAnthropicModel()
  const prompt = buildCategorizationPrompt(bookmarks, categoryDescriptions)

  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text content in Claude response')

  return parseCategorizationResponse(textBlock.text)
}

async function writeCategoryResults(results: CategorizationResult[]): Promise<void> {
  if (results.length === 0) return

  const categories = await prisma.category.findMany({ select: { id: true, slug: true } })
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]))

  for (const result of results) {
    if (!result.tweetId || result.assignments.length === 0) continue

    const bookmark = await prisma.bookmark.findUnique({
      where: { tweetId: result.tweetId },
      select: { id: true },
    })
    if (!bookmark) continue

    for (const { category: slug, confidence } of result.assignments) {
      const categoryId = categoryBySlug.get(slug)
      if (!categoryId) continue

      await prisma.bookmarkCategory.upsert({
        where: { bookmarkId_categoryId: { bookmarkId: bookmark.id, categoryId } },
        update: { confidence },
        create: { bookmarkId: bookmark.id, categoryId, confidence },
      })
    }

    // Mark as enriched
    await prisma.bookmark.update({
      where: { id: bookmark.id },
      data: { enrichedAt: new Date() },
    })
  }
}

export async function categorizeAll(
  bookmarkIds: string[],
  onProgress?: (done: number, total: number) => void,
  force = false,
  shouldAbort?: () => boolean,
): Promise<void> {
  await seedDefaultCategories()

  const apiKey = await getApiKey()

  // Load category descriptions for the prompt
  const dbCategories = await prisma.category.findMany({ select: { slug: true, description: true } })
  const categoryDescriptions = Object.fromEntries(
    dbCategories.map((c) => [c.slug, c.description ?? '']),
  )

  const includeMedia = { select: { imageTags: true } } as const

  let bookmarksQuery
  if (bookmarkIds.length > 0) {
    bookmarksQuery = await prisma.bookmark.findMany({
      where: { id: { in: bookmarkIds } },
      select: {
        id: true,
        tweetId: true,
        text: true,
        semanticTags: true,
        entities: true,
        mediaItems: includeMedia,
      },
    })
  } else if (force) {
    bookmarksQuery = await prisma.bookmark.findMany({
      select: {
        id: true,
        tweetId: true,
        text: true,
        semanticTags: true,
        entities: true,
        mediaItems: includeMedia,
      },
    })
  } else {
    // Incremental: only process bookmarks not yet enriched
    bookmarksQuery = await prisma.bookmark.findMany({
      where: { enrichedAt: null },
      select: {
        id: true,
        tweetId: true,
        text: true,
        semanticTags: true,
        entities: true,
        mediaItems: includeMedia,
      },
    })
  }

  const total = bookmarksQuery.length
  let done = 0

  for (let i = 0; i < bookmarksQuery.length; i += BATCH_SIZE) {
    if (shouldAbort?.()) break
    const batch = bookmarksQuery.slice(i, i + BATCH_SIZE).map((b) => {
      const allImageTags = b.mediaItems
        .map((m) => m.imageTags)
        .filter((t): t is string => t !== null && t !== '')
        .join(' | ')

      let semanticTags: string[] | undefined
      if (b.semanticTags) {
        try { semanticTags = JSON.parse(b.semanticTags) as string[] } catch { /* ignore */ }
      }

      let hashtags: string[] | undefined
      let tools: string[] | undefined
      if (b.entities) {
        try {
          const ent = JSON.parse(b.entities) as { hashtags?: string[]; tools?: string[] }
          hashtags = ent.hashtags
          tools = ent.tools
        } catch { /* ignore */ }
      }

      return {
        tweetId: b.tweetId,
        text: b.text,
        imageTags: allImageTags || undefined,
        semanticTags,
        hashtags,
        tools,
      }
    })

    try {
      const results = await categorizeBatch(batch, apiKey, categoryDescriptions)
      await writeCategoryResults(results)
    } catch (err) {
      console.error(`Error categorizing batch at index ${i}:`, err)
    }

    done = Math.min(i + BATCH_SIZE, total)
    onProgress?.(done, total)
  }
}
