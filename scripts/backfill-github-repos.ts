#!/usr/bin/env npx tsx
/**
 * Backfill GitHub repoMeta for all existing bookmarks.
 * Scans tweet text + URLs from rawJson, detects github.com/owner/repo
 * and writes it to the repoMeta field.
 */

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ??
  path.join(__dirname, '..', 'prisma', 'dev.db')

const db = new Database(DB_PATH)

const GITHUB_RE = /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/gi
const SKIP_OWNERS = new Set(['sponsors', 'orgs', 'about', 'features', 'pricing', 'login', 'join', 'topics', 'explore', 'marketplace', 'settings'])

function extractGithubRepo(text: string, urls: string[]): string | null {
  const sources = [...urls, text]
  for (const src of sources) {
    const matches = [...src.matchAll(GITHUB_RE)]
    for (const m of matches) {
      const owner = m[1]
      const repo = m[2].replace(/[^a-zA-Z0-9_.-]/g, '').replace(/\.git$/, '')
      if (owner && repo && !SKIP_OWNERS.has(owner.toLowerCase()) && repo.length > 0) {
        return JSON.stringify({
          fullName: `${owner}/${repo}`,
          stars: 0,
          language: null,
          isArchived: false,
        })
      }
    }
  }
  return null
}

interface BookmarkRow {
  id: string
  text: string
  rawJson: string
  repoMeta: string | null
}

interface RawJsonParsed {
  urls?: string[]
  entities?: {
    urls?: { expanded_url?: string; url?: string }[]
  }
}

const rows = db.prepare('SELECT id, text, rawJson, repoMeta FROM Bookmark').all() as BookmarkRow[]

const update = db.prepare('UPDATE Bookmark SET repoMeta = ? WHERE id = ?')

let updated = 0
let alreadyHad = 0
let notFound = 0

for (const row of rows) {
  if (row.repoMeta) {
    alreadyHad++
    continue
  }

  // Extract URLs from rawJson
  const urls: string[] = []
  try {
    const raw = JSON.parse(row.rawJson) as RawJsonParsed
    const urlEntities = raw.entities?.urls ?? []
    for (const u of urlEntities) {
      const url = u.expanded_url ?? u.url ?? ''
      if (url) urls.push(url)
    }
    if (raw.urls) urls.push(...raw.urls)
  } catch { /* skip malformed rawJson */ }

  const repoMeta = extractGithubRepo(row.text, urls)
  if (repoMeta) {
    update.run(repoMeta, row.id)
    updated++
  } else {
    notFound++
  }
}

console.log(`✅ Listo:`)
console.log(`   ${updated} bookmarks actualizados con repoMeta`)
console.log(`   ${alreadyHad} ya tenían repoMeta`)
console.log(`   ${notFound} sin GitHub repo detectado`)

db.close()
