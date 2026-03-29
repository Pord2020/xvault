/**
 * Export bookmarks / collections to Obsidian-compatible Markdown files.
 * Each bookmark becomes a .md file with YAML frontmatter.
 * Uses the existing jszip package to bundle everything into a .zip.
 */
import JSZip from 'jszip'

export interface ExportableBookmark {
  id: string
  tweetId: string
  text: string
  authorHandle: string
  authorName: string
  tweetCreatedAt: string | null
  importedAt: string
  semanticTags: string | null
  entities: string | null
  repoMeta: string | null
  highlights: string | null
  categories: Array<{ name: string; slug: string }>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function parseTags(semanticTags: string | null): string[] {
  if (!semanticTags) return []
  try { return JSON.parse(semanticTags) as string[] } catch { return [] }
}

function buildMarkdown(b: ExportableBookmark): string {
  const tags = parseTags(b.semanticTags)
  const cats = b.categories.map((c) => c.slug)
  const allTags = [...new Set([...tags.slice(0, 10), ...cats])]
    .map((t) => t.replace(/\s+/g, '-').toLowerCase())

  let repoBlock = ''
  if (b.repoMeta) {
    try {
      const r = JSON.parse(b.repoMeta) as { fullName: string; stars: number; description: string | null; language: string | null }
      repoBlock = `\n## GitHub Repo\n- **${r.fullName}** — ⭐ ${r.stars}${r.language ? ` · ${r.language}` : ''}\n${r.description ? `- ${r.description}\n` : ''}- [Open on GitHub](https://github.com/${r.fullName})\n`
    } catch { /* skip */ }
  }

  let highlightsBlock = ''
  if (b.highlights) {
    try {
      const hl = JSON.parse(b.highlights) as Array<{ text: string; note: string }>
      if (hl.length > 0) {
        highlightsBlock = `\n## Highlights\n${hl.map((h) => `> ${h.text}\n${h.note ? `\n*Note: ${h.note}*` : ''}`).join('\n\n')}\n`
      }
    } catch { /* skip */ }
  }

  const tweetUrl = `https://twitter.com/${b.authorHandle}/status/${b.tweetId}`
  const date = b.tweetCreatedAt ? new Date(b.tweetCreatedAt).toISOString().slice(0, 10) : new Date(b.importedAt).toISOString().slice(0, 10)

  const frontmatter = [
    '---',
    `source: twitter`,
    `author: "@${b.authorHandle}"`,
    `author_name: "${b.authorName.replace(/"/g, '\\"')}"`,
    `url: "${tweetUrl}"`,
    `date: ${date}`,
    `imported: ${new Date(b.importedAt).toISOString().slice(0, 10)}`,
    allTags.length > 0 ? `tags: [${allTags.map((t) => `"${t}"`).join(', ')}]` : '',
    b.categories.length > 0 ? `categories: [${b.categories.map((c) => `"${c.name}"`).join(', ')}]` : '',
    '---',
  ].filter(Boolean).join('\n')

  return `${frontmatter}\n\n# Tweet by @${b.authorHandle}\n\n${b.text}\n\n— [View on X](${tweetUrl})\n${repoBlock}${highlightsBlock}`
}

export async function exportToObsidianZip(
  bookmarks: ExportableBookmark[],
  folderName = 'Siftly Export',
): Promise<Buffer> {
  const zip = new JSZip()
  const folder = zip.folder(folderName)!

  const usedNames = new Set<string>()

  for (const b of bookmarks) {
    const prefix = b.tweetCreatedAt
      ? new Date(b.tweetCreatedAt).toISOString().slice(0, 10)
      : new Date(b.importedAt).toISOString().slice(0, 10)
    const base = `${prefix}-${slugify(b.authorHandle)}-${slugify(b.text.slice(0, 40))}`
    let name = `${base}.md`
    let counter = 1
    while (usedNames.has(name)) { name = `${base}-${counter++}.md` }
    usedNames.add(name)

    folder.file(name, buildMarkdown(b))
  }

  // Add a README
  folder.file('_README.md', `# Siftly Export\n\nGenerated: ${new Date().toISOString().slice(0, 10)}\nBookmarks: ${bookmarks.length}\n\nEach file is a tweet bookmark with YAML frontmatter for Obsidian.\n\n## Suggested Setup\n1. Copy this folder into your Obsidian vault\n2. Use the Dataview plugin to query by tags/author/date\n3. Tags are derived from AI-generated semantic tags\n`)

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}
