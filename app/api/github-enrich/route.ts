import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { extractGithubRepos, fetchRepoMeta, type RepoMeta } from '@/lib/github-enrichment'

// GET — status: how many bookmarks have/need repo meta
export async function GET(): Promise<NextResponse> {
  const total = await prisma.bookmark.count()
  const withRepos = await prisma.bookmark.count({ where: { repoMeta: { not: null } } })
  // Estimate: count bookmarks with 'github.com' in text
  const candidates = await prisma.$queryRaw<[{ n: number }]>`
    SELECT COUNT(*) as n FROM Bookmark WHERE text LIKE '%github.com%' AND repoMeta IS NULL
  `
  return NextResponse.json({ total, enriched: withRepos, pending: Number(candidates[0]?.n ?? 0) })
}

// POST — trigger enrichment for bookmarks with GitHub URLs
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as { token?: string; limit?: number }
  const token = body.token ?? process.env.GITHUB_TOKEN
  const limit = Math.min(body.limit ?? 50, 200)

  // Find bookmarks with github.com URLs (including ones with stale repoMeta)
  const bookmarks = await prisma.$queryRaw<Array<{ id: string; text: string; entities: string | null; repoMeta: string | null }>>`
    SELECT id, text, entities, repoMeta FROM Bookmark
    WHERE text LIKE '%github.com%'
    LIMIT ${limit}
  `

  // Filter out bookmarks whose repoMeta was fetched recently (within 7 days)
  const toEnrich = bookmarks.filter((b) => {
    if (!b.repoMeta) return true  // needs enrichment
    try {
      const meta = JSON.parse(b.repoMeta) as { fetchedAt?: string }
      if (!meta.fetchedAt) return true
      const age = Date.now() - new Date(meta.fetchedAt).getTime()
      return age > 7 * 24 * 60 * 60 * 1000  // re-fetch if older than 7 days
    } catch { return true }
  })

  if (toEnrich.length === 0) {
    return NextResponse.json({ message: 'Nothing to enrich', enriched: 0 })
  }

  // Collect unique repos across all bookmarks
  const repoToBookmarks = new Map<string, string[]>()
  for (const b of toEnrich) {
    const repos = extractGithubRepos(b.text)
    for (const repo of repos) {
      if (!repoToBookmarks.has(repo)) repoToBookmarks.set(repo, [])
      repoToBookmarks.get(repo)!.push(b.id)
    }
  }

  // Fetch metadata for each unique repo (rate-limit safe: sequential with short delay)
  const repoMetaCache = new Map<string, RepoMeta | null>()
  for (const [fullName] of repoToBookmarks) {
    const meta = await fetchRepoMeta(fullName, token)
    repoMetaCache.set(fullName, meta)
    await new Promise((r) => setTimeout(r, 100)) // be polite to GitHub API
  }

  // Update bookmarks with the best repo meta found (first valid repo per bookmark)
  let enrichedCount = 0
  for (const b of toEnrich) {
    const repos = extractGithubRepos(b.text)
    const meta = repos.map((r) => repoMetaCache.get(r)).find((m) => m != null)
    if (meta) {
      await prisma.bookmark.update({
        where: { id: b.id },
        data: { repoMeta: JSON.stringify(meta) },
      })
      enrichedCount++
    }
  }

  return NextResponse.json({ enriched: enrichedCount, total: toEnrich.length })
}
