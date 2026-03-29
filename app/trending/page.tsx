'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendingUp, Zap, Hash, Wrench, Users, BarChart2, ArrowUp, ArrowDown, Minus, Loader2 } from 'lucide-react'

interface TrendTag { tag: string; count: number; prev: number; trend: 'new' | 'up' | 'down' | 'stable' }
interface TrendTool { tool: string; count: number }
interface TrendAuthor { authorHandle: string; authorName: string; count: number }
interface TrendCategory { name: string; slug: string; color: string; count: number }
interface ActivityDay { date: string; count: number }

interface TrendData {
  period: { days: number; since: string; bookmarkCount: number; prevCount: number }
  topTags: TrendTag[]
  topTools: TrendTool[]
  topHashtags: Array<{ tag: string; count: number }>
  topAuthors: TrendAuthor[]
  topCategories: TrendCategory[]
  activityByDay: ActivityDay[]
}

function TrendIcon({ trend }: { trend: 'new' | 'up' | 'down' | 'stable' }) {
  if (trend === 'new') return <span className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">NEW</span>
  if (trend === 'up') return <ArrowUp size={11} className="text-emerald-400" />
  if (trend === 'down') return <ArrowDown size={11} className="text-zinc-600" />
  return <Minus size={11} className="text-zinc-700" />
}

function MiniBar({ value, max, color = '#6366f1' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

function ActivityChart({ days }: { days: ActivityDay[] }) {
  if (days.length === 0) return null
  const max = Math.max(...days.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {days.map((d) => {
        const pct = (d.count / max) * 100
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group/bar" title={`${label}: ${d.count}`}>
            <span className="text-[9px] text-zinc-500 opacity-0 group-hover/bar:opacity-100 transition-opacity">{d.count}</span>
            <div
              className="w-full rounded-t-sm bg-indigo-500/50 hover:bg-indigo-500 transition-colors min-h-[2px]"
              style={{ height: `${Math.max(pct, 3)}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function TrendingPage() {
  const [data, setData] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(7)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/trending?days=${period}`)
      .then((r) => r.json())
      .then((d: TrendData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  const maxTagCount = data?.topTags[0]?.count ?? 1
  const maxToolCount = data?.topTools[0]?.count ?? 1

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-0.5">Inteligencia</p>
          <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-2">
            <TrendingUp size={24} className="text-amber-400" />
            Radar de tendencias
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Qué temas y herramientas dominan tus bookmarks</p>
        </div>
        <div className="flex gap-1.5">
          {([7, 14, 30] as const).map((d) => {
            const label = d === 7 ? 'Últimos 7 días' : d === 14 ? 'Últimos 14 días' : 'Últimos 30 días'
            return (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${period === d ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-zinc-600 animate-spin" />
        </div>
      ) : !data || data.period.bookmarkCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-zinc-800 rounded-2xl">
          <BarChart2 size={32} className="text-zinc-700 mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No hay bookmarks importados en los últimos {period} días</p>
          <p className="text-zinc-600 text-sm mb-4">Importa bookmarks para ver temas y herramientas en tendencia</p>
          <Link href="/import" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            Importar bookmarks →
          </Link>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-3xl font-bold text-zinc-100">{data.period.bookmarkCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Bookmarks importados</p>
              {data.period.prevCount > 0 && (
                <p className="text-[10px] text-zinc-600 mt-1">
                  vs {data.period.prevCount} período anterior
                </p>
              )}
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-3xl font-bold text-zinc-100">{data.topTags.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Temas únicos encontrados</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-3xl font-bold text-zinc-100">{data.topTools.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Herramientas mencionadas</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-3xl font-bold text-zinc-100">{data.topAuthors.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Autores únicos</p>
            </div>
          </div>

          {/* Activity chart */}
          {data.activityByDay.length > 1 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Actividad de importación</h2>
              </div>
              <ActivityChart days={data.activityByDay} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top topics */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={14} className="text-amber-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Temas principales</h2>
                <span className="text-xs text-zinc-600 ml-auto">de etiquetas IA</span>
              </div>
              <div className="space-y-2">
                {data.topTags.slice(0, 12).map(({ tag, count, trend }) => (
                  <div key={tag} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 truncate w-36">{tag}</span>
                    <MiniBar value={count} max={maxTagCount} color="#f59e0b" />
                    <span className="text-xs text-zinc-500 w-6 text-right tabular-nums">{count}</span>
                    <TrendIcon trend={trend} />
                  </div>
                ))}
              </div>
            </div>

            {/* Top tools */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Wrench size={14} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Herramientas y repositorios principales</h2>
              </div>
              {data.topTools.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No se detectaron herramientas — ejecuta el enriquecimiento con IA para extraer herramientas de los bookmarks</p>
              ) : (
                <div className="space-y-2">
                  {data.topTools.map(({ tool, count }) => (
                    <div key={tool} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-300 truncate w-36">{tool}</span>
                      <MiniBar value={count} max={maxToolCount} color="#3b82f6" />
                      <span className="text-xs text-zinc-500 w-6 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top hashtags */}
            {data.topHashtags.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Hash size={14} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Hashtags en tendencia</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.topHashtags.map(({ tag, count }) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-700 bg-zinc-800/50 text-xs text-zinc-300 hover:border-emerald-500/40 transition-colors"
                    >
                      <span className="text-emerald-500">#</span>{tag}
                      <span className="text-zinc-600 text-[10px]">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top authors */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-violet-400" />
                <h2 className="text-sm font-semibold text-zinc-200">Autores más guardados</h2>
              </div>
              <div className="space-y-3">
                {data.topAuthors.slice(0, 8).map(({ authorHandle, authorName, count }) => (
                  <a
                    key={authorHandle}
                    href={`https://twitter.com/${authorHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:text-zinc-200 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                      {authorName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-300 truncate group-hover:text-zinc-100">{authorName}</p>
                      <p className="text-[10px] text-zinc-600">@{authorHandle}</p>
                    </div>
                    <span className="text-xs text-zinc-500 font-medium tabular-nums">{count}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Top categories */}
            {data.topCategories.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={14} className="text-pink-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">Categorías en este período</h2>
                </div>
                <div className="space-y-2">
                  {data.topCategories.map(({ name, slug, color, count }) => (
                    <Link key={slug} href={`/categories/${slug}`} className="flex items-center gap-3 hover:text-zinc-200 transition-colors">
                      <span className="text-xs text-zinc-300 truncate w-36 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {name}
                      </span>
                      <MiniBar value={count} max={data.topCategories[0]?.count ?? 1} color={color} />
                      <span className="text-xs text-zinc-500 w-6 text-right tabular-nums">{count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
