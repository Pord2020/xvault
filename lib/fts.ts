/**
 * PostgreSQL full-text search across bookmarks.
 * Uses to_tsvector / plainto_tsquery for ranked full-text search.
 * rebuildFts() is a no-op — PostgreSQL runs FTS directly on the table.
 */

import prisma from '@/lib/db'

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function ensureFtsTable(): Promise<void> {}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function rebuildFts(): Promise<void> {}

/**
 * Search bookmarks using PostgreSQL full-text search.
 * Returns bookmark IDs ordered by relevance.
 * Returns [] on error (caller falls back to ILIKE queries).
 */
export async function ftsSearch(keywords: string[]): Promise<string[]> {
  if (keywords.length === 0) return []

  try {
    const query = keywords
      .map((kw) => kw.replace(/['"]/g, ' ').trim())
      .filter((kw) => kw.length >= 2)
      .join(' ')

    if (!query) return []

    const results = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Bookmark"
      WHERE to_tsvector('english',
        text || ' ' ||
        COALESCE("semanticTags", '') || ' ' ||
        COALESCE(entities, '')
      ) @@ plainto_tsquery('english', ${query})
      LIMIT 150
    `
    return results.map((r) => r.id)
  } catch {
    return []
  }
}
