/**
 * Weekly digest generation.
 * Analyzes bookmarks from the last 7 days and produces a structured digest.
 */
import prisma from '@/lib/db'
import { claudePrompt, getCliAvailability, modelNameToCliAlias } from '@/lib/claude-cli-auth'
import { getActiveModel } from '@/lib/settings'

export interface DigestData {
  period: { start: string; end: string; bookmarkCount: number }
  topTopics: Array<{ topic: string; count: number }>
  topTools: Array<{ tool: string; count: number }>
  topAuthors: Array<{ handle: string; name: string; count: number }>
  notableRepos: Array<{ fullName: string; stars: number; description: string | null }>
  aiSummary: string
  bookmarkIds: string[]
}

export async function generateDigest(days = 7): Promise<DigestData> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const until = new Date()

  const bookmarks = await prisma.bookmark.findMany({
    where: { importedAt: { gte: since } },
    select: {
      id: true, text: true, authorHandle: true, authorName: true,
      semanticTags: true, entities: true, repoMeta: true,
      tweetCreatedAt: true,
    },
    orderBy: { importedAt: 'desc' },
  })

  if (bookmarks.length === 0) {
    return {
      period: { start: since.toISOString(), end: until.toISOString(), bookmarkCount: 0 },
      topTopics: [], topTools: [], topAuthors: [], notableRepos: [],
      aiSummary: 'No bookmarks imported this week.',
      bookmarkIds: [],
    }
  }

  // Aggregate topics and tools
  const topicCounts = new Map<string, number>()
  const toolCounts = new Map<string, number>()
  const authorCounts = new Map<string, { name: string; count: number }>()
  const repos: Array<{ fullName: string; stars: number; description: string | null }> = []

  for (const b of bookmarks) {
    if (b.semanticTags) {
      try {
        for (const t of JSON.parse(b.semanticTags) as string[])
          topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
      } catch { /* skip */ }
    }
    if (b.entities) {
      try {
        const e = JSON.parse(b.entities) as { tools?: string[] }
        for (const tool of e.tools ?? [])
          toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1)
      } catch { /* skip */ }
    }
    if (b.repoMeta) {
      try {
        const r = JSON.parse(b.repoMeta) as { fullName: string; stars: number; description: string | null }
        if (!repos.find((x) => x.fullName === r.fullName)) repos.push(r)
      } catch { /* skip */ }
    }
    const entry = authorCounts.get(b.authorHandle) ?? { name: b.authorName, count: 0 }
    authorCounts.set(b.authorHandle, { ...entry, count: entry.count + 1 })
  }

  const topTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([topic, count]) => ({ topic, count }))

  const topTools = Array.from(toolCounts.entries())
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([tool, count]) => ({ tool, count }))

  const topAuthors = Array.from(authorCounts.entries())
    .sort((a, b) => b[1].count - a[1].count).slice(0, 8)
    .map(([handle, { name, count }]) => ({ handle, name, count }))

  const notableRepos = repos
    .sort((a, b) => b.stars - a.stars).slice(0, 5)

  // Generate AI narrative summary
  const model = await getActiveModel()
  const snippets = bookmarks.slice(0, 20).map((b) =>
    `@${b.authorHandle}: ${b.text.slice(0, 150)}`
  ).join('\n')

  const prompt = `You are writing a weekly digest of someone's Twitter/X bookmarks.

Period: Last ${days} days
Total bookmarks saved: ${bookmarks.length}
Top topics: ${topTopics.slice(0, 5).map((t) => t.topic).join(', ')}
Top tools: ${topTools.slice(0, 5).map((t) => t.tool).join(', ')}
Most bookmarked authors: ${topAuthors.slice(0, 3).map((a) => `@${a.handle}`).join(', ')}

Sample of recent bookmarks:
${snippets}

Write a 3-4 sentence narrative digest summary. Be specific about what was bookmarked, what themes emerged, and 1-2 highlights worth remembering. Conversational tone, not a list.`

  let aiSummary = `This week you saved ${bookmarks.length} bookmarks. Top themes: ${topTopics.slice(0, 3).map((t) => t.topic).join(', ')}.`

  try {
    if (await getCliAvailability()) {
      const result = await claudePrompt(prompt, { model: modelNameToCliAlias(model), timeoutMs: 30_000 })
      if (result.success && result.data) aiSummary = result.data.trim()
    }
  } catch { /* keep fallback summary */ }

  return {
    period: { start: since.toISOString(), end: until.toISOString(), bookmarkCount: bookmarks.length },
    topTopics, topTools, topAuthors, notableRepos, aiSummary,
    bookmarkIds: bookmarks.map((b) => b.id),
  }
}
