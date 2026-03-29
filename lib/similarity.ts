/**
 * Tag-based similarity between bookmarks.
 * Uses Jaccard similarity on semantic tags + entity overlap.
 * No external API needed — works from data already in DB.
 */

export interface SimilarityInput {
  id: string
  semanticTags: string | null
  entities: string | null
  authorHandle: string
  categories: Array<{ category: { slug: string } }>
}

function parseTags(semanticTags: string | null): Set<string> {
  if (!semanticTags) return new Set()
  try { return new Set((JSON.parse(semanticTags) as string[]).map((t) => t.toLowerCase())) }
  catch { return new Set() }
}

function parseTools(entities: string | null): Set<string> {
  if (!entities) return new Set()
  try {
    const ent = JSON.parse(entities) as { tools?: string[]; hashtags?: string[] }
    const all = [...(ent.tools ?? []), ...(ent.hashtags ?? [])]
    return new Set(all.map((t) => t.toLowerCase()))
  } catch { return new Set() }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export interface SimilarityResult {
  id: string
  score: number
}

export function computeSimilarities(target: SimilarityInput, candidates: SimilarityInput[]): SimilarityResult[] {
  const targetTags = parseTags(target.semanticTags)
  const targetTools = parseTools(target.entities)
  const targetCats = new Set(target.categories.map((c) => c.category.slug))

  return candidates
    .filter((c) => c.id !== target.id)
    .map((c) => {
      const tagScore = jaccard(targetTags, parseTags(c.semanticTags))
      const toolScore = jaccard(targetTools, parseTools(c.entities))
      const catScore = jaccard(targetCats, new Set(c.categories.map((x) => x.category.slug)))
      const authorBonus = c.authorHandle === target.authorHandle ? 0.05 : 0
      const score = tagScore * 0.55 + toolScore * 0.30 + catScore * 0.10 + authorBonus
      return { id: c.id, score }
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}
