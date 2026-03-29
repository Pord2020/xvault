'use client'

import { useState, useEffect } from 'react'
import { Copy, Loader2, Check, Trash2, X, Github } from 'lucide-react'
import type { BookmarkWithMedia } from '@/lib/types'

interface DuplicateBookmark extends BookmarkWithMedia {
  semanticTags?: string | null
  repoMeta?: string | null
}

interface DuplicateGroup {
  reason: string
  count: number
  ids: string[]
  bookmarks: DuplicateBookmark[]
}

interface DuplicatesResponse {
  groups: DuplicateGroup[]
  total: number
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

function parseRepoName(repoMeta: string | null | undefined): string | null {
  if (!repoMeta) return null
  try {
    const r = JSON.parse(repoMeta) as { fullName?: string }
    return r.fullName ?? null
  } catch {
    return null
  }
}

function ReasonBadge({ reason }: { reason: string }) {
  const isRepo = reason.toLowerCase().includes('github') || reason.toLowerCase().includes('repo')
  const isTags = reason.toLowerCase().includes('tag') || reason.toLowerCase().includes('semantic')

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isRepo
          ? 'bg-zinc-800 border border-zinc-700 text-zinc-300'
          : isTags
          ? 'bg-amber-900/20 border border-amber-700/30 text-amber-300'
          : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
      }`}
    >
      {isRepo && <Github size={11} />}
      {reason}
    </span>
  )
}

function BookmarkPreview({ bookmark }: { bookmark: DuplicateBookmark }) {
  const repoName = parseRepoName(bookmark.repoMeta)
  const preview = bookmark.text.replace(/https?:\/\/t\.co\/\S+/g, '').trim()

  return (
    <div className="flex-1 min-w-0 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/50 space-y-2.5">
      {/* Author */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
          {getInitial(bookmark.authorName || bookmark.authorHandle)}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-zinc-200 truncate">{bookmark.authorName}</p>
          <p className="text-xs text-zinc-500">@{bookmark.authorHandle}</p>
        </div>
      </div>

      {/* Text */}
      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        {preview.slice(0, 120)}{preview.length > 120 ? '…' : ''}
      </p>

      {/* Repo badge */}
      {repoName && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Github size={11} />
          <span className="font-mono">{repoName}</span>
        </div>
      )}

      {/* Categories */}
      {bookmark.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bookmark.categories.slice(0, 2).map((cat) => (
            <span
              key={cat.id}
              className="px-1.5 py-0.5 rounded-md text-xs"
              style={{ backgroundColor: `${cat.color}18`, color: cat.color, border: `1px solid ${cat.color}30` }}
            >
              {cat.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingGroups, setDeletingGroups] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadDuplicates()
  }, [])

  async function loadDuplicates() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/duplicates')
      const data = (await res.json()) as DuplicatesResponse
      setGroups(data.groups ?? [])
    } catch {
      setError('Error al cargar los duplicados')
    } finally {
      setLoading(false)
    }
  }

  async function keepFirst(groupIndex: number) {
    const group = groups[groupIndex]
    if (!group) return

    setDeletingGroups((prev) => new Set(prev).add(groupIndex))

    // Keep first bookmark, delete the rest
    const idsToDelete = group.ids.slice(1)
    await Promise.all(
      idsToDelete.map((id) =>
        fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
      )
    )

    setGroups((prev) => prev.filter((_, i) => i !== groupIndex))
    setDeletingGroups((prev) => {
      const next = new Set(prev)
      next.delete(groupIndex)
      return next
    })
  }

  function keepAll(groupIndex: number) {
    setGroups((prev) => prev.filter((_, i) => i !== groupIndex))
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-0.5">Mantenimiento</p>
          <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-3">
            <Copy size={26} className="text-zinc-400" />
            Detector de duplicados
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Encuentra y elimina bookmarks duplicados o casi duplicados</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="text-zinc-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/40 text-red-300 text-sm">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-5 rounded-2xl bg-zinc-800/50 mb-4">
            <Check size={32} className="text-emerald-500" />
          </div>
          <h3 className="text-zinc-300 font-semibold mb-1">No se encontraron duplicados</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            ¡Tu biblioteca está limpia! Los duplicados se detectan comparando repositorios de GitHub y coincidencias de etiquetas semánticas.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <p className="text-sm text-zinc-400">
            <span className="text-zinc-200 font-semibold">{groups.length}</span> grupo{groups.length !== 1 ? 's' : ''} de posibles duplicados encontrado{groups.length !== 1 ? 's' : ''}
          </p>

          {groups.map((group, idx) => {
            const isDeleting = deletingGroups.has(idx)
            const [first, second] = group.bookmarks

            // Detect shared attributes for diff highlight
            const firstRepo = parseRepoName(first?.repoMeta)
            const secondRepo = parseRepoName(second?.repoMeta)
            const sameRepo = firstRepo && secondRepo && firstRepo === secondRepo
            const sameAuthor = first?.authorHandle && second?.authorHandle && first.authorHandle === second.authorHandle

            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                {/* Group header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ReasonBadge reason={group.reason} />
                    {group.count > 2 && (
                      <span className="text-xs text-zinc-500">{group.count} bookmarks</span>
                    )}
                    {sameAuthor && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/20 border border-blue-700/30 text-blue-400">
                        Mismo autor
                      </span>
                    )}
                    {sameRepo && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                        Mismo repositorio
                      </span>
                    )}
                  </div>
                </div>

                {/* Side-by-side previews */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  {first && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-600 mb-1.5 font-medium uppercase tracking-wider">Conservar</p>
                      <BookmarkPreview bookmark={first} />
                    </div>
                  )}
                  {second && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-600 mb-1.5 font-medium uppercase tracking-wider">
                        {group.count > 2 ? `+ ${group.count - 1} más` : 'Duplicado'}
                      </p>
                      <BookmarkPreview bookmark={second} />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => void keepFirst(idx)}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 border border-red-500/25 text-red-300 hover:text-red-200 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Conservar primero / Eliminar otros
                  </button>
                  <button
                    onClick={() => keepAll(idx)}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <X size={12} />
                    Conservar todos
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
