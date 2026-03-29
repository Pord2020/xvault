import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { claudePrompt, getCliAvailability, modelNameToCliAlias } from '@/lib/claude-cli-auth'
import { getActiveModel, getProvider } from '@/lib/settings'
import { resolveAIClient } from '@/lib/ai-client'

type Params = { params: Promise<{ slug: string }> }

export async function POST(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const { slug } = await params

  try {
    const category = await prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true },
    })

    if (!category) {
      return NextResponse.json({ error: `Category not found: ${slug}` }, { status: 404 })
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        categories: {
          some: { category: { slug } },
        },
      },
      take: 50,
      orderBy: { importedAt: 'desc' },
      select: {
        text: true,
        authorHandle: true,
        semanticTags: true,
        entities: true,
        repoMeta: true,
      },
    })

    if (bookmarks.length === 0) {
      return NextResponse.json({
        summary: `No bookmarks found in the "${category.name}" category yet.`,
        bookmarkCount: 0,
        categoryName: category.name,
      })
    }

    // Build a readable snippet for each bookmark
    const snippets = bookmarks.map((b, i) => {
      const parts: string[] = [`${i + 1}. @${b.authorHandle}: ${b.text.slice(0, 300)}`]

      if (b.repoMeta) {
        try {
          const r = JSON.parse(b.repoMeta) as { fullName: string; stars: number; description: string | null }
          parts.push(`[GitHub: ${r.fullName} ⭐${r.stars}${r.description ? ` — ${r.description.slice(0, 100)}` : ''}]`)
        } catch { /* skip */ }
      }

      if (b.semanticTags) {
        try {
          const tags = JSON.parse(b.semanticTags) as string[]
          if (tags.length) parts.push(`tags: ${tags.slice(0, 8).join(', ')}`)
        } catch { /* skip */ }
      }

      if (b.entities) {
        try {
          const ent = JSON.parse(b.entities) as { tools?: string[] }
          if (ent.tools?.length) parts.push(`tools: ${ent.tools.join(', ')}`)
        } catch { /* skip */ }
      }

      return parts.join(' | ')
    })

    const prompt = `You are summarizing a person's knowledge about ${category.name}. Based on these ${bookmarks.length} saved tweets, provide:
1) A 2-3 sentence overview of what they know
2) Key concepts/tools mentioned
3) Notable insights or tips

Be specific and reference actual content.

BOOKMARKS:
${snippets.join('\n\n')}`

    const provider = await getProvider()
    const model = await getActiveModel()

    let summary = ''

    // Try CLI first (Anthropic provider only)
    if (provider === 'anthropic' && (await getCliAvailability())) {
      const result = await claudePrompt(prompt, {
        model: modelNameToCliAlias(model),
        timeoutMs: 60_000,
      })
      if (result.success && result.data) {
        summary = result.data
      }
    }

    // Fall back to AI client (SDK)
    if (!summary) {
      const setting = await prisma.setting.findUnique({ where: { key: 'anthropicApiKey' } })
      const client = await resolveAIClient({ dbKey: setting?.value?.trim() ?? '' }).catch(() => null)

      if (!client) {
        return NextResponse.json(
          { error: 'No AI configured. Add an API key in Settings or log in with Claude CLI.' },
          { status: 400 }
        )
      }

      const response = await client.createMessage({
        model,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      })
      summary = response.text ?? ''
    }

    if (!summary) {
      return NextResponse.json(
        { error: 'AI returned an empty response. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      summary,
      bookmarkCount: bookmarks.length,
      categoryName: category.name,
    })
  } catch (err) {
    console.error(`[summary POST] category ${slug} error:`, err)
    return NextResponse.json(
      { error: `Failed to generate summary: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
