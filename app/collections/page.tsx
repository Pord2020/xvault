'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FolderOpen, Plus, Loader2, Trash2, ArrowRight } from 'lucide-react'

interface Collection {
  id: string
  name: string
  description: string | null
  color: string
  emoji: string
  createdAt: string
  bookmarkCount: number
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']
const EMOJIS = ['📁', '🚀', '🤖', '💡', '🛠️', '📊', '🎯', '🔬', '⚡', '🌟', '🧠', '🔗']

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#6366f1', emoji: '📁' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadCollections()
  }, [])

  async function loadCollections() {
    setLoading(true)
    const res = await fetch('/api/collections')
    const data = await res.json() as { collections: Collection[] }
    setCollections(data.collections ?? [])
    setLoading(false)
  }

  async function createCollection() {
    if (!form.name.trim()) return
    setCreating(true)
    setError(null)
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json() as { collection?: Collection; error?: string }
    if (!res.ok) { setError(data.error ?? 'Failed'); setCreating(false); return }
    setCollections((prev) => [data.collection!, ...prev])
    setForm({ name: '', description: '', color: '#6366f1', emoji: '📁' })
    setShowForm(false)
    setCreating(false)
  }

  async function deleteCollection(id: string) {
    if (!confirm('¿Eliminar esta colección? Los bookmarks no serán eliminados.')) return
    await fetch(`/api/collections/${id}`, { method: 'DELETE' })
    setCollections((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-0.5">Organizar</p>
          <h1 className="text-3xl font-bold text-zinc-100">Colecciones de proyectos</h1>
          <p className="text-zinc-400 mt-1 text-sm">Agrupa bookmarks por proyecto, tema o meta</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          Nueva colección
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-5 rounded-2xl border border-zinc-700 bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4">Nueva colección</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              {/* Emoji picker */}
              <div className="shrink-0">
                <label className="text-xs text-zinc-500 block mb-1">Ícono</label>
                <select
                  value={form.emoji}
                  onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                  className="w-16 px-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm focus:outline-none focus:border-indigo-500 text-center"
                >
                  {EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-500 block mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="ej. App de Agente IA, Landing Page..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') void createCollection() }}
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Descripción</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="¿Para qué es esta colección?"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Color</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{
                      backgroundColor: c,
                      outline: form.color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => void createCollection()}
              disabled={!form.name.trim() || creating}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Collections grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-zinc-600 animate-spin" />
        </div>
      ) : collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-5 rounded-2xl bg-zinc-800/50 mb-4">
            <FolderOpen size={32} className="text-zinc-600" />
          </div>
          <h3 className="text-zinc-300 font-semibold mb-1">Sin colecciones aún</h3>
          <p className="text-zinc-500 text-sm max-w-xs">
            Crea una colección para organizar bookmarks por proyecto. Luego fija bookmarks desde la vista de exploración.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((col) => (
            <div key={col.id} className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-all overflow-hidden">
              <Link href={`/collections/${col.id}`} className="flex flex-col p-5 h-full">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${col.color}18`, border: `1px solid ${col.color}30` }}
                  >
                    {col.emoji}
                  </div>
                  <span className="text-xs text-zinc-500 mt-1">{col.bookmarkCount} bookmarks</span>
                </div>
                <h3 className="font-semibold text-zinc-100 mb-1">{col.name}</h3>
                {col.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{col.description}</p>
                )}
                <div className="flex items-center gap-1 mt-auto pt-3 text-xs text-zinc-600 group-hover:text-indigo-400 transition-colors">
                  <span>Abrir</span>
                  <ArrowRight size={11} />
                </div>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); void deleteCollection(col.id) }}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-700 hover:text-red-400 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all"
                title="Eliminar colección"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
