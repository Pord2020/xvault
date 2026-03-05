'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'
import dynamic from 'next/dynamic'

const MindmapCanvas = dynamic(
  () => import('@/components/mindmap/mindmap-canvas'),
  { ssr: false, loading: () => <CanvasLoader /> }
)

interface MindmapData {
  nodes: Node[]
  edges: Edge[]
}

interface CategoryLegendItem {
  name: string
  color: string
  slug: string
}

function CanvasLoader() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <Loader2 size={32} className="text-indigo-400 animate-spin" />
    </div>
  )
}

function Legend({ categories }: { categories: CategoryLegendItem[] }) {
  if (categories.length === 0) return null

  return (
    <div className="absolute top-4 left-4 z-10 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl p-4 max-w-52">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Categories</p>
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.slug} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-xs text-zinc-300 truncate">{cat.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600 mt-3">Click a category to expand</p>
    </div>
  )
}

function extractLegend(nodes: Node[]): CategoryLegendItem[] {
  return nodes
    .filter((n) => n.type === 'category')
    .map((n) => {
      const d = n.data as { name: string; color: string; slug: string }
      return { name: d.name, color: d.color, slug: d.slug }
    })
}

export default function MindmapPage() {
  const [data, setData] = useState<MindmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/mindmap')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load mindmap')
        return r.json()
      })
      .then((d: MindmapData) => setData(d))
      .catch((err) => setError(err.message ?? 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={36} className="text-indigo-400 animate-spin" />
          <p className="text-zinc-400 text-sm">Loading mindmap...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <p className="text-zinc-400">{error}</p>
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <div className="text-center">
          <p className="text-xl font-semibold text-zinc-400">No data to display</p>
          <p className="text-zinc-600 text-sm mt-1">Import and categorize bookmarks first.</p>
        </div>
      </div>
    )
  }

  const legend = extractLegend(data.nodes)

  return (
    <div className="relative w-full h-screen">
      <Legend categories={legend} />
      <MindmapCanvas initialNodes={data.nodes} initialEdges={data.edges} />
    </div>
  )
}
