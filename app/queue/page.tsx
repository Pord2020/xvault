'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BookOpen, Loader2, BookMarked, Play, Check, RotateCcw } from 'lucide-react'
import BookmarkCard from '@/components/bookmark-card'
import type { BookmarkWithMedia } from '@/lib/types'

type QueueStatus = 'queue' | 'reading' | 'done'

interface QueueBookmark extends BookmarkWithMedia {
  readingStatus: QueueStatus
  queuedAt: string | null
}

interface QueueResponse {
  bookmarks: Array<{
    id: string
    tweetId: string
    text: string
    authorHandle: string
    authorName: string
    tweetCreatedAt: string | null
    importedAt: string
    queuedAt: string | null
    readingStatus: string
    mediaItems: BookmarkWithMedia['mediaItems']
    categories: BookmarkWithMedia['categories']
  }>
  total: number
}

const TAB_LABELS: { key: QueueStatus; label: string }[] = [
  { key: 'queue', label: 'Por leer' },
  { key: 'reading', label: 'Leyendo' },
  { key: 'done', label: 'Terminado' },
]

export default function QueuePage() {
  const [activeTab, setActiveTab] = useState<QueueStatus>('queue')
  const [bookmarks, setBookmarks] = useState<Record<QueueStatus, QueueBookmark[]>>({
    queue: [],
    reading: [],
    done: [],
  })
  const [counts, setCounts] = useState<Record<QueueStatus, number>>({ queue: 0, reading: 0, done: 0 })
  const [loading, setLoading] = useState(true)

  const loadTab = useCallback(async (status: QueueStatus) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/queue?status=${status}`)
      const data = (await res.json()) as QueueResponse
      const mapped: QueueBookmark[] = (data.bookmarks ?? []).map((b) => ({
        id: b.id,
        tweetId: b.tweetId,
        text: b.text,
        authorHandle: b.authorHandle,
        authorName: b.authorName,
        tweetCreatedAt: b.tweetCreatedAt,
        importedAt: b.importedAt,
        mediaItems: b.mediaItems ?? [],
        categories: b.categories ?? [],
        readingStatus: (b.readingStatus as QueueStatus) ?? status,
        queuedAt: b.queuedAt ?? null,
      }))
      setBookmarks((prev) => ({ ...prev, [status]: mapped }))
      setCounts((prev) => ({ ...prev, [status]: data.total ?? mapped.length }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTab(activeTab)
  }, [activeTab, loadTab])

  async function updateStatus(id: string, newStatus: QueueStatus) {
    // Optimistic: remove from current tab
    setBookmarks((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].filter((b) => b.id !== id),
    }))
    setCounts((prev) => ({ ...prev, [activeTab]: Math.max(0, prev[activeTab] - 1) }))

    await fetch(`/api/bookmarks/${id}/reading-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const current = bookmarks[activeTab]

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-0.5">Biblioteca</p>
          <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-3">
            <BookOpen size={28} className="text-indigo-400" />
            Lista de lectura
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Lleva el control de lo que lees y lo que tienes pendiente</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                activeTab === key ? 'bg-indigo-500/60 text-indigo-100' : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="text-zinc-600 animate-spin" />
        </div>
      ) : current.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-5 rounded-2xl bg-zinc-800/50 mb-4">
            <BookMarked size={32} className="text-zinc-600" />
          </div>
          <h3 className="text-zinc-300 font-semibold mb-1">
            {activeTab === 'queue'
              ? 'Lista vacía'
              : activeTab === 'reading'
              ? 'No estás leyendo nada'
              : 'Nada terminado aún'}
          </h3>
          <p className="text-zinc-500 text-sm max-w-xs mb-4">
            {activeTab === 'queue'
              ? 'Agrega bookmarks a tu lista de lectura desde la vista de exploración.'
              : activeTab === 'reading'
              ? 'Empieza a leer un bookmark desde la pestaña Por leer.'
              : 'Marca los bookmarks como terminados cuando los acabes.'}
          </p>
          <Link
            href="/bookmarks"
            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
          >
            Agregar a la lista desde Explorar →
          </Link>
        </div>
      ) : (
        <div className="masonry-grid">
          {current.map((bookmark) => (
            <div key={bookmark.id} className="masonry-item">
              <div className="relative group">
                <BookmarkCard bookmark={bookmark} />
                {/* Status action button overlay */}
                <div className="mt-2 flex justify-end">
                  {activeTab === 'queue' && (
                    <button
                      onClick={() => void updateStatus(bookmark.id, 'reading')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 hover:text-indigo-100 text-xs font-medium transition-all"
                    >
                      <Play size={11} />
                      Marcar como leyendo
                    </button>
                  )}
                  {activeTab === 'reading' && (
                    <button
                      onClick={() => void updateStatus(bookmark.id, 'done')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 hover:text-emerald-100 text-xs font-medium transition-all"
                    >
                      <Check size={11} />
                      Marcar como terminado
                    </button>
                  )}
                  {activeTab === 'done' && (
                    <button
                      onClick={() => void updateStatus(bookmark.id, 'queue')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 border border-zinc-600/30 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-all"
                    >
                      <RotateCcw size={11} />
                      Volver a la lista
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
