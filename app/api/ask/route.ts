import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { ftsSearch } from '@/lib/fts'
import { extractKeywords } from '@/lib/search-utils'
import { resolveAIClient } from '@/lib/ai-client'
import { getActiveModel, getProvider } from '@/lib/settings'
import { getCliAvailability, claudePrompt, modelNameToCliAlias, resolveAnthropicClient } from '@/lib/claude-cli-auth'

const SELECT = {
  id: true, tweetId: true, text: true, authorHandle: true, authorName: true,
  tweetCreatedAt: true, semanticTags: true, entities: true, repoMeta: true,
  categories: {
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { confidence: 'desc' as const },
    take: 2,
  },
} as const

function buildSnippet(b: {
  text: string; authorHandle: string; tweetCreatedAt: Date | null
  semanticTags: string | null; entities: string | null
  repoMeta: string | null
  categories: Array<{ category: { name: string } }>
}): string {
  const parts: string[] = [`@${b.authorHandle}: ${b.text.slice(0, 300)}`]
  if (b.repoMeta) {
    try {
      const r = JSON.parse(b.repoMeta) as { fullName: string; stars: number; description: string | null }
      parts.push(`[GitHub: ${r.fullName} ⭐${r.stars}${r.description ? ` — ${r.description}` : ''}]`)
    } catch { /* skip */ }
  }
  if (b.semanticTags) {
    try {
      const tags = JSON.parse(b.semanticTags) as string[]
      if (tags.length) parts.push(`tags: ${tags.slice(0, 12).join(', ')}`)
    } catch { /* skip */ }
  }
  if (b.entities) {
    try {
      const ent = JSON.parse(b.entities) as { tools?: string[] }
      if (ent.tools?.length) parts.push(`tools: ${ent.tools.join(', ')}`)
    } catch { /* skip */ }
  }
  const cats = b.categories.map((c) => c.category.name).join(', ')
  if (cats) parts.push(`categories: ${cats}`)
  return parts.join(' | ')
}

const encoder = new TextEncoder()

function sendEvent(controller: ReadableStreamDefaultController, type: string, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { question?: string; history?: Array<{ role: string; content: string }> }
  const { question, history = [] } = body

  if (!question?.trim()) {
    return NextResponse.json({ error: 'question required' }, { status: 400 })
  }

  // Retrieve relevant bookmarks
  const keywords = extractKeywords(question)
  const ftsIds = keywords.length > 0 ? await ftsSearch(keywords) : []

  const keywordConditions = keywords.flatMap((kw) => [
    { text: { contains: kw } },
    { semanticTags: { contains: kw } },
    { entities: { contains: kw } },
  ])

  const [ftsHits, likeHits] = await Promise.all([
    ftsIds.length > 0
      ? prisma.bookmark.findMany({ where: { id: { in: ftsIds } }, take: 40, select: SELECT })
      : Promise.resolve([]),
    keywords.length > 0
      ? prisma.bookmark.findMany({ where: { OR: keywordConditions }, take: 40, orderBy: [{ enrichedAt: 'desc' }, { tweetCreatedAt: 'desc' }], select: SELECT })
      : Promise.resolve([]),
  ])

  const seen = new Set<string>()
  const bookmarks = [...ftsHits, ...likeHits].filter((b) => {
    if (seen.has(b.id)) return false
    seen.add(b.id)
    return true
  }).slice(0, 60)

  if (bookmarks.length === 0) {
    // Return a non-streaming response for the no-results case
    const stream = new ReadableStream({
      start(controller) {
        sendEvent(controller, 'sources', [])
        sendEvent(controller, 'delta', "I couldn't find any relevant bookmarks for your question. Try importing and categorizing your bookmarks first.")
        sendEvent(controller, 'done', '')
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const snippets = bookmarks.map((b, i) => `[${i + 1}] ${buildSnippet(b)}`).join('\n\n')

  const systemPrompt = `You are a knowledgeable assistant with access to the user's personal Twitter/X bookmark library. Your job is to answer questions by synthesizing insights from their saved tweets, threads, GitHub repos, and shared resources.

Guidelines:
- Give direct, useful answers — not a list of search results
- Reference specific bookmarks when relevant (use "According to @handle..." or "A bookmark from @handle mentions...")
- If multiple bookmarks cover the same topic, synthesize them into a cohesive answer
- Mention GitHub repos with their star counts when relevant
- If the bookmarks don't fully answer the question, say so and share what IS available
- Keep responses concise but complete — aim for 2-4 paragraphs max
- End with a "Sources" section listing the most relevant bookmark IDs as [1], [2], etc.`

  const conversationContext = history.slice(-4).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')

  const userMessage = `${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ''}Question: ${question}

BOOKMARK LIBRARY (${bookmarks.length} relevant results):
${snippets}

Please answer the question based on the bookmarks above.`

  const provider = await getProvider()
  const model = await getActiveModel()

  // Build the sources payload to send immediately before generation
  // Sources will be re-derived post-generation; send all candidate bookmarks for now
  // and let the client filter after the answer arrives. For the initial push we send
  // an empty array; the final sources are emitted in the "done" event.
  // Actually, per spec we send sources BEFORE generating — emit top bookmarks as candidates.
  const candidateSources = bookmarks.slice(0, 8).map((b) => ({
    id: b.id,
    tweetId: b.tweetId,
    text: b.text.slice(0, 200),
    authorHandle: b.authorHandle,
    authorName: b.authorName,
    tweetCreatedAt: b.tweetCreatedAt?.toISOString() ?? null,
    repoMeta: b.repoMeta ?? null,
    categories: b.categories.map((c) => c.category.name),
  }))

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Emit sources immediately before starting generation
        sendEvent(controller, 'sources', candidateSources)

        let streamed = false

        // Attempt 1: Anthropic SDK streaming via CLI auth or API key
        if (provider === 'anthropic') {
          try {
            const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
            const client = resolveAnthropicClient({ dbKey: setting?.value?.trim() ?? '' })

            const sdkStream = client.messages.stream({
              model,
              max_tokens: 1200,
              messages: [{ role: 'user', content: `${systemPrompt}\n\n${userMessage}` }],
            })

            for await (const chunk of sdkStream) {
              if (
                chunk.type === 'content_block_delta' &&
                chunk.delta.type === 'text_delta'
              ) {
                sendEvent(controller, 'delta', chunk.delta.text)
              }
            }

            streamed = true
          } catch (sdkErr) {
            console.warn('[ask] Anthropic SDK streaming failed, trying CLI fallback:', sdkErr)
          }
        }

        // Attempt 2: CLI via claudePrompt (non-streaming, but wrapped in SSE)
        if (!streamed && provider === 'anthropic' && await getCliAvailability()) {
          try {
            const fullPrompt = `${systemPrompt}\n\n${userMessage}`
            const result = await claudePrompt(fullPrompt, { model: modelNameToCliAlias(model), timeoutMs: 60_000 })
            if (result.success && result.data) {
              sendEvent(controller, 'delta', result.data)
              streamed = true
            }
          } catch (cliErr) {
            console.warn('[ask] CLI fallback failed:', cliErr)
          }
        }

        // Attempt 3: resolveAIClient (handles OpenAI + Anthropic non-streaming)
        if (!streamed) {
          try {
            const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
            const client = await resolveAIClient({ dbKey: setting?.value?.trim() ?? '' }).catch(() => null)
            if (!client) {
              sendEvent(controller, 'delta', 'No AI configured. Add an API key in Settings.')
            } else {
              const response = await client.createMessage({
                model,
                max_tokens: 1200,
                messages: [{ role: 'user', content: `${systemPrompt}\n\n${userMessage}` }],
              })
              sendEvent(controller, 'delta', response.text ?? '')
              streamed = true
            }
          } catch (fallbackErr) {
            console.error('[ask] All AI methods failed:', fallbackErr)
            sendEvent(controller, 'delta', 'Failed to generate a response. Please check your AI configuration in Settings.')
          }
        }

        sendEvent(controller, 'done', '')
      } catch (err) {
        console.error('[ask] Stream error:', err)
        sendEvent(controller, 'delta', 'An unexpected error occurred.')
        sendEvent(controller, 'done', '')
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
