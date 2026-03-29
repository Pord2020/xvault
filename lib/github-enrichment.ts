/**
 * GitHub Repo Enrichment
 * Detects GitHub repo URLs in bookmarks and fetches metadata (stars, last push, archived, etc.)
 */

const GITHUB_URL_REGEX = /https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/g

export interface RepoMeta {
  fullName: string
  description: string | null
  stars: number
  forks: number
  language: string | null
  topics: string[]
  lastPush: string   // ISO date
  isArchived: boolean
  fetchedAt: string  // ISO date
}

/** Extract unique GitHub repo full names (owner/repo) from text */
export function extractGithubRepos(text: string): string[] {
  const seen = new Set<string>()
  const matches = text.matchAll(GITHUB_URL_REGEX)
  for (const match of matches) {
    // Strip trailing .git or extra path segments — keep only owner/repo
    const raw = match[1].replace(/\.git$/, '').split('/').slice(0, 2).join('/')
    if (raw.includes('/')) seen.add(raw)
  }
  return Array.from(seen)
}

/** Fetch repo metadata from GitHub API */
export async function fetchRepoMeta(fullName: string, token?: string): Promise<RepoMeta | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, { headers })
    if (!res.ok) return null
    const data = await res.json() as {
      full_name: string
      description: string | null
      stargazers_count: number
      forks_count: number
      language: string | null
      topics: string[]
      pushed_at: string
      archived: boolean
    }
    return {
      fullName: data.full_name,
      description: data.description ?? null,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language ?? null,
      topics: data.topics ?? [],
      lastPush: data.pushed_at,
      isArchived: data.archived,
      fetchedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** Format star count for display (1234 → 1.2k) */
export function formatStars(stars: number): string {
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k`
  return String(stars)
}

/** Returns true if the repo's last push was more than `days` days ago */
export function isRepoPotentiallyStale(lastPush: string, days = 365): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return new Date(lastPush).getTime() < cutoff
}
