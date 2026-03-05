/**
 * Zero-cost entity extraction from stored rawJson tweet data.
 * No AI calls — pure data mining from already-stored JSON.
 */
import prisma from '@/lib/db'

export interface ExtractedEntities {
  hashtags: string[]
  urls: string[]      // expanded/display URLs from tweet entities
  mentions: string[]  // @handles mentioned
  tools: string[]     // detected tool/product names from URLs
  tweetType: 'thread' | 'reply' | 'quote' | 'original'
  hasMedia: boolean
  mediaTypes: string[]
}

const KNOWN_TOOL_DOMAINS: Record<string, string> = {
  'github.com': 'GitHub',
  'huggingface.co': 'HuggingFace',
  'arxiv.org': 'arxiv',
  'openai.com': 'OpenAI',
  'anthropic.com': 'Anthropic',
  'replicate.com': 'Replicate',
  'vercel.com': 'Vercel',
  'netlify.com': 'Netlify',
  'figma.com': 'Figma',
  'notion.so': 'Notion',
  'linear.app': 'Linear',
  'discord.com': 'Discord',
  'discord.gg': 'Discord',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'substack.com': 'Substack',
  'medium.com': 'Medium',
  'producthunt.com': 'Product Hunt',
  'app.daily.dev': 'daily.dev',
  'colab.research.google.com': 'Google Colab',
  'replit.com': 'Replit',
  'codepen.io': 'CodePen',
  'codesandbox.io': 'CodeSandbox',
  'cursor.sh': 'Cursor',
  'cursor.com': 'Cursor',
  'v0.dev': 'v0',
  'bolt.new': 'Bolt',
  'lovable.dev': 'Lovable',
  'perplexity.ai': 'Perplexity',
  'midjourney.com': 'Midjourney',
  'runwayml.com': 'Runway',
  'elevenlabs.io': 'ElevenLabs',
  'lmsys.org': 'LMSys',
  'together.ai': 'Together AI',
  'groq.com': 'Groq',
  'mistral.ai': 'Mistral',
  'cohere.com': 'Cohere',
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function detectTools(urls: string[]): string[] {
  const tools = new Set<string>()
  for (const url of urls) {
    const domain = extractDomain(url)
    if (!domain) continue
    // exact match
    if (KNOWN_TOOL_DOMAINS[domain]) {
      tools.add(KNOWN_TOOL_DOMAINS[domain])
      continue
    }
    // subdomain match (e.g. xyz.github.io)
    for (const [knownDomain, toolName] of Object.entries(KNOWN_TOOL_DOMAINS)) {
      if (domain.endsWith(knownDomain)) {
        tools.add(toolName)
        break
      }
    }
  }
  return Array.from(tools)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeGet(obj: any, ...keys: string[]): any {
  let cur = obj
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  return cur
}

export function extractEntities(rawJson: string): ExtractedEntities {
  const empty: ExtractedEntities = {
    hashtags: [],
    urls: [],
    mentions: [],
    tools: [],
    tweetType: 'original',
    hasMedia: false,
    mediaTypes: [],
  }

  if (!rawJson) return empty

  let tweet: unknown
  try {
    tweet = JSON.parse(rawJson)
  } catch {
    return empty
  }

  // Twitter API v2 or v1 format — try multiple paths
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tweet as any

  // Hashtags — Twitter stores these in entities.hashtags[].tag (v2) or entities.hashtags[].text (v1)
  const hashtagObjs: unknown[] =
    safeGet(t, 'entities', 'hashtags') ??
    safeGet(t, 'legacy', 'entities', 'hashtags') ??
    []
  const hashtags = (hashtagObjs as Record<string, unknown>[])
    .map((h) => String(h.tag ?? h.text ?? '').toLowerCase())
    .filter(Boolean)

  // URLs
  const urlObjs: unknown[] =
    safeGet(t, 'entities', 'urls') ??
    safeGet(t, 'legacy', 'entities', 'urls') ??
    []
  const urls = (urlObjs as Record<string, unknown>[])
    .map((u) => String(u.expanded_url ?? u.url ?? ''))
    .filter((u) => u && !u.includes('twitter.com') && !u.includes('t.co/') && !u.includes('x.com/'))

  // Mentions
  const mentionObjs: unknown[] =
    safeGet(t, 'entities', 'user_mentions') ??
    safeGet(t, 'legacy', 'entities', 'user_mentions') ??
    []
  const mentions = (mentionObjs as Record<string, unknown>[])
    .map((m) => String(m.screen_name ?? m.username ?? '').toLowerCase())
    .filter(Boolean)

  // Tweet type
  let tweetType: ExtractedEntities['tweetType'] = 'original'
  const inReplyToId =
    safeGet(t, 'in_reply_to_tweet_id') ??
    safeGet(t, 'legacy', 'in_reply_to_status_id_str')
  const quotedStatusId =
    safeGet(t, 'quoted_tweet_id_str') ??
    safeGet(t, 'legacy', 'quoted_status_id_str') ??
    safeGet(t, 'quoted_status_id_str')
  const selfThread =
    safeGet(t, 'self_thread') ??
    safeGet(t, 'legacy', 'self_thread')

  if (selfThread) tweetType = 'thread'
  else if (inReplyToId) tweetType = 'reply'
  else if (quotedStatusId) tweetType = 'quote'

  // Media presence
  const mediaArr: unknown[] =
    safeGet(t, 'entities', 'media') ??
    safeGet(t, 'legacy', 'entities', 'media') ??
    safeGet(t, 'extended_entities', 'media') ??
    safeGet(t, 'legacy', 'extended_entities', 'media') ??
    []
  const hasMedia = (mediaArr as []).length > 0
  const mediaTypes = [...new Set(
    (mediaArr as Record<string, unknown>[]).map((m) => String(m.type ?? ''))
  )].filter(Boolean)

  const tools = detectTools(urls)

  return { hashtags, urls, mentions, tools, tweetType, hasMedia, mediaTypes }
}

/**
 * Backfill entity extraction for bookmarks that don't have entities yet.
 * Returns count of updated bookmarks.
 */
export async function backfillEntities(
  onProgress?: (total: number) => void,
  shouldAbort?: () => boolean,
): Promise<number> {
  const CHUNK = 100
  let total = 0

  while (true) {
    if (shouldAbort?.()) break
    const bookmarks = await prisma.bookmark.findMany({
      where: { entities: null },
      take: CHUNK,
      select: { id: true, rawJson: true },
    })

    if (bookmarks.length === 0) break

    for (const b of bookmarks) {
      const entities = extractEntities(b.rawJson)
      await prisma.bookmark.update({
        where: { id: b.id },
        data: { entities: JSON.stringify(entities) },
      })
      total++
      onProgress?.(total)
    }

    if (bookmarks.length < CHUNK) break
  }

  return total
}
