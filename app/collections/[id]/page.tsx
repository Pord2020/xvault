'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Pencil, Trash2, ExternalLink, Github } from 'lucide-react'
import BookmarkCard from '@/components/bookmark-card'
import type { BookmarkWithMedia } from '@/lib/types'

interface CollectionDetail {
  id: string
  name: string
  description: string | null
  color: string
  emoji: string
  bookmarkCount: number
  bookmarks: Array<BookmarkWithMedia & { repoMeta: string | null; addedAt: string }>
}

export default function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    void loadCollection()
  }, [id])

  async function loadCollection() {
    setLoading(true)
    const res = await fetch(`/api/collections/${id}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json() as { collection: CollectionDetail }
    setCollection(data.collection)
    setEditName(data.collection.name)
    setLoading(false)
  }

  async function saveEdit() {
    if (!collection || !editName.trim()) return
    await fetch(`/api/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    })
    setCollection((c) => c ? { ...c, name: editName } : c)
    setEditing(false)
  }

  async function removeBookmark(bookmarkId: string) {
    await fetch(`/api/collections/${id}/bookmarks?bookmarkId=${bookmarkId}`, { method: 'DELETE' })
    setCollection((c) => c ? { ...c, bookmarks: c.bookmarks.filter((b) => b.id !== bookmarkId), bookmarkCount: c.bookmarkCount - 1 } : c)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="text-zinc-600 animate-spin" />
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="p-8 text-center">
        <p className="text-zinc-500">Colección no encontrada.</p>
        <Link href="/collections" className="text-indigo-400 hover:underline text-sm mt-2 inline-block">Volver a colecciones</Link>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/collections" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 transition-colors mb-4 w-fit">
          <ArrowLeft size={14} />
          Colecciones
        </Link>
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
            style={{ backgroundColor: `${collection.color}18`, border: `1px solid ${collection.color}30` }}
          >
            {collection.emoji}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditing(false) }}
                  className="text-2xl font-bold bg-transparent border-b border-zinc-600 focus:border-indigo-500 focus:outline-none text-zinc-100 w-full max-w-sm"
                  autoFocus
                />
                <button onClick={() => void saveEdit()} className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-lg hover:bg-zinc-800">Guardar</button>
                <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 px-2 py-1 rounded-lg hover:bg-zinc-800">Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-zinc-100">{collection.name}</h1>
                <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                  <Pencil size={13} />
                </button>
              </div>
            )}
            {collection.description && (
              <p className="text-sm text-zinc-400 mt-0.5">{collection.description}</p>
            )}
            <p className="text-xs text-zinc-600 mt-1">{collection.bookmarkCount} bookmarks</p>
          </div>
        </div>
      </div>

      {/* Bookmarks */}
      {collection.bookmarks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800 rounded-2xl">
          <p className="text-zinc-500 mb-2">Sin bookmarks en esta colección aún.</p>
          <p className="text-zinc-600 text-sm max-w-xs">
            Explora tus bookmarks y usa el botón de fijar para agregarlos aquí.
          </p>
          <Link href="/bookmarks" className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1.5">
            Explorar bookmarks <ExternalLink size={12} />
          </Link>
        </div>
      ) : (
        <div className="masonry-grid">
          {collection.bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="masonry-item relative group/wrapper">
              <BookmarkCard bookmark={bookmark} />
              <button
                onClick={() => void removeBookmark(bookmark.id)}
                className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-zinc-900/90 text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 opacity-0 group-hover/wrapper:opacity-100 transition-all"
                title="Quitar de la colección"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
