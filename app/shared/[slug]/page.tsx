'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import BookmarkCard from '@/components/bookmark-card'
import type { BookmarkWithMedia } from '@/lib/types'

interface SharedCollection {
  name: string
  description: string | null
  color: string
  emoji: string
  bookmarkCount: number
  bookmarks: BookmarkWithMedia[]
}

export default function SharedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [collection, setCollection] = useState<SharedCollection | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/shared/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null }
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then((d) => {
        if (d) setCollection(d.collection)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !collection) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-center px-4">
        <span className="text-5xl">🔒</span>
        <h1 className="text-xl font-semibold text-zinc-300">Collection not found or no longer shared</h1>
        <p className="text-zinc-500 text-sm">This collection may have been made private or removed.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800/60 bg-zinc-900/50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="text-5xl leading-none">{collection.emoji}</span>
              <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold text-zinc-100">{collection.name}</h1>
                {collection.description && (
                  <p className="text-zinc-400 text-base">{collection.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-sm font-medium">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: collection.color }}
                />
                {collection.bookmarkCount} bookmark{collection.bookmarkCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bookmark grid */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {collection.bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-zinc-500 text-lg">No bookmarks in this collection yet.</p>
          </div>
        ) : (
          <div className="columns-1 md:columns-2 xl:columns-3 gap-4 space-y-4">
            {collection.bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="break-inside-avoid">
                <BookmarkCard bookmark={bookmark} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800/40 mt-8">
        <div className="max-w-5xl mx-auto px-6 py-5 flex justify-center">
          <Link
            href="https://github.com/viperrcrypto/Siftly"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Powered by Siftly
          </Link>
        </div>
      </div>
    </div>
  )
}
