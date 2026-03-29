#!/usr/bin/env npx tsx
/**
 * Siftly MCP Server
 * Exposes your bookmarks as tools Claude can use during any coding session.
 *
 * Usage: add to ~/.claude/claude_desktop_config.json or settings.json
 *   "siftly": {
 *     "command": "npx",
 *     "args": ["tsx", "/path/to/Siftly/mcp-server.ts"]
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ??
  path.join(__dirname, 'prisma', 'dev.db')

const db = new Database(DB_PATH, { readonly: true })

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBookmark(b: {
  id: string
  text: string
  authorHandle: string
  tweetCreatedAt: string | null
  semanticTags: string | null
  entities: string | null
  categories: string | null
}): string {
  const lines: string[] = []
  lines.push(`**@${b.authorHandle}** — ${b.tweetCreatedAt?.slice(0, 10) ?? 'unknown date'}`)
  lines.push(b.text.slice(0, 400))

  if (b.semanticTags) {
    try {
      const tags = JSON.parse(b.semanticTags) as string[]
      if (tags.length) lines.push(`Tags: ${tags.slice(0, 15).join(', ')}`)
    } catch { /* skip */ }
  }

  if (b.entities) {
    try {
      const ent = JSON.parse(b.entities) as { tools?: string[]; hashtags?: string[] }
      if (ent.tools?.length) lines.push(`Tools: ${ent.tools.join(', ')}`)
      if (ent.hashtags?.length) lines.push(`#${ent.hashtags.join(' #')}`)
    } catch { /* skip */ }
  }

  if (b.categories) {
    try {
      const cats = JSON.parse(b.categories) as Array<{ name: string; confidence: number }>
      if (cats.length) lines.push(`Categories: ${cats.map(c => `${c.name}(${c.confidence.toFixed(1)})`).join(', ')}`)
    } catch { /* skip */ }
  }

  return lines.join('\n')
}

// ── Database queries ──────────────────────────────────────────────────────────

function searchBookmarks(keywords: string[], limit: number) {
  const conditions = keywords.flatMap(kw => [
    `b.text LIKE '%${kw.replace(/'/g, "''")}%'`,
    `b.semanticTags LIKE '%${kw.replace(/'/g, "''")}%'`,
    `b.entities LIKE '%${kw.replace(/'/g, "''")}%'`,
  ])

  const whereClause = conditions.length > 0
    ? `WHERE (${conditions.join(' OR ')})`
    : ''

  const rows = db.prepare(`
    SELECT
      b.id, b.text, b.authorHandle, b.tweetCreatedAt, b.semanticTags, b.entities,
      json_group_array(json_object('name', cat.name, 'confidence', bc.confidence)) as categories
    FROM Bookmark b
    LEFT JOIN BookmarkCategory bc ON bc.bookmarkId = b.id
    LEFT JOIN Category cat ON cat.id = bc.categoryId
    ${whereClause}
    GROUP BY b.id
    ORDER BY b.enrichedAt DESC, b.tweetCreatedAt DESC
    LIMIT ${limit}
  `).all() as Array<{
    id: string; text: string; authorHandle: string
    tweetCreatedAt: string | null; semanticTags: string | null
    entities: string | null; categories: string | null
  }>

  return rows
}

function getByCategory(categorySlug: string, limit: number) {
  const rows = db.prepare(`
    SELECT
      b.id, b.text, b.authorHandle, b.tweetCreatedAt, b.semanticTags, b.entities,
      json_group_array(json_object('name', cat2.name, 'confidence', bc2.confidence)) as categories
    FROM Bookmark b
    JOIN BookmarkCategory bc ON bc.bookmarkId = b.id
    JOIN Category cat ON cat.id = bc.categoryId AND cat.slug = ?
    LEFT JOIN BookmarkCategory bc2 ON bc2.bookmarkId = b.id
    LEFT JOIN Category cat2 ON cat2.id = bc2.categoryId
    GROUP BY b.id
    ORDER BY bc.confidence DESC, b.tweetCreatedAt DESC
    LIMIT ?
  `).all(categorySlug, limit) as Array<{
    id: string; text: string; authorHandle: string
    tweetCreatedAt: string | null; semanticTags: string | null
    entities: string | null; categories: string | null
  }>

  return rows
}

function getStats() {
  const total = (db.prepare('SELECT COUNT(*) as n FROM Bookmark').get() as { n: number }).n
  const enriched = (db.prepare('SELECT COUNT(*) as n FROM Bookmark WHERE enrichedAt IS NOT NULL').get() as { n: number }).n
  const categories = db.prepare(`
    SELECT cat.name, cat.slug, COUNT(bc.bookmarkId) as count
    FROM Category cat
    LEFT JOIN BookmarkCategory bc ON bc.categoryId = cat.id
    GROUP BY cat.id
    ORDER BY count DESC
  `).all() as Array<{ name: string; slug: string; count: number }>

  return { total, enriched, categories }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'siftly',
  version: '1.0.0',
})

// Tool 1: Search bookmarks by keywords/topic
server.tool(
  'search_bookmarks',
  'Search your saved Twitter/X bookmarks by topic, keyword, tool name, or concept. Returns relevant bookmarks with tags and categories.',
  {
    query: z.string().describe('Search query — topic, keyword, tool name, or natural language question'),
    limit: z.number().min(1).max(30).default(10).describe('Max number of results to return'),
  },
  async ({ query, limit }) => {
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 6)

    const rows = searchBookmarks(keywords, limit)

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: `No bookmarks found for: "${query}"` }] }
    }

    const formatted = rows.map(b => formatBookmark(b)).join('\n\n---\n\n')
    return {
      content: [{
        type: 'text',
        text: `Found ${rows.length} bookmarks for "${query}":\n\n${formatted}`,
      }],
    }
  },
)

// Tool 2: Get bookmarks by category
server.tool(
  'get_bookmarks_by_category',
  'Retrieve bookmarks from a specific category (e.g. ai-resources, dev-tools, productivity, design, finance-crypto)',
  {
    category: z.string().describe('Category slug (e.g. ai-resources, dev-tools, productivity, design, finance-crypto, news, funny-memes)'),
    limit: z.number().min(1).max(30).default(10).describe('Max number of results'),
  },
  async ({ category, limit }) => {
    const rows = getByCategory(category, limit)

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: `No bookmarks found in category: "${category}"` }] }
    }

    const formatted = rows.map(b => formatBookmark(b)).join('\n\n---\n\n')
    return {
      content: [{
        type: 'text',
        text: `Top ${rows.length} bookmarks in "${category}":\n\n${formatted}`,
      }],
    }
  },
)

// Tool 3: Get stats + available categories
server.tool(
  'get_siftly_stats',
  'Get an overview of your bookmark library: total count, categories, and enrichment status.',
  {},
  async () => {
    const stats = getStats()
    const catList = stats.categories
      .filter(c => c.count > 0)
      .map(c => `  - ${c.name} (slug: ${c.slug}): ${c.count} bookmarks`)
      .join('\n')

    return {
      content: [{
        type: 'text',
        text: `Siftly Bookmark Library:\n- Total: ${stats.total} bookmarks\n- Enriched with AI: ${stats.enriched}\n\nCategories:\n${catList}`,
      }],
    }
  },
)

// Tool 4: Find bookmarks relevant to a project context
server.tool(
  'find_relevant_for_project',
  'Find bookmarks relevant to a project you are working on. Provide a description of your project and get the most useful saved resources.',
  {
    project_description: z.string().describe('Brief description of what you are building or researching'),
    topics: z.array(z.string()).default([]).describe('Specific topics or technologies involved (e.g. ["RAG", "vector DB", "Next.js"])'),
    limit: z.number().min(1).max(20).default(10).describe('Max results'),
  },
  async ({ project_description, topics, limit }) => {
    const combined = [project_description, ...topics].join(' ')
    const keywords = combined
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 8)

    const rows = searchBookmarks(keywords, limit)

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'No relevant bookmarks found for this project context.' }] }
    }

    const formatted = rows.map(b => formatBookmark(b)).join('\n\n---\n\n')
    return {
      content: [{
        type: 'text',
        text: `Found ${rows.length} bookmarks relevant to: "${project_description}"\n\n${formatted}`,
      }],
    }
  },
)

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
