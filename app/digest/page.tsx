'use client'

import { useState, useEffect } from 'react'
import { Newspaper, Sparkles, Loader2, RefreshCw, TrendingUp, Wrench, Users, Github, Star } from 'lucide-react'

interface DigestPeriod {
  start: string
  end: string
  bookmarkCount: number
}

interface DigestContent {
  period: DigestPeriod
  topTopics: Array<{ topic: string; count: number }>
  topTools: Array<{ tool: string; count: number }>
  topAuthors: Array<{ handle: string; name: string; count: number }>
  notableRepos: Array<{ fullName: string; stars: number; description: string | null }>
  aiSummary: string
}

interface DigestData {
  id: string
  generatedAt: string
  periodStart?: string
  periodEnd?: string
  content: DigestContent
}

interface DigestResponse {
  digest: DigestData | null
  error?: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-300 w-32 truncate shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-6 text-right shrink-0">{count}</span>
    </div>
  )
}

export default function DigestPage() {
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadDigest()
  }, [])

  async function loadDigest() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/digest')
      const data = (await res.json()) as DigestResponse
      setDigest(data.digest ?? null)
    } catch {
      setError('Error al cargar el resumen')
    } finally {
      setLoading(false)
    }
  }

  async function generateDigest() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      })
      const data = (await res.json()) as DigestResponse
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Error al generar')
      } else {
        setDigest(data.digest ?? null)
      }
    } catch {
      setError('Error al generar el resumen')
    } finally {
      setGenerating(false)
    }
  }

  const content = digest?.content ?? null
  const maxTopicCount = content ? Math.max(...content.topTopics.map((t) => t.count), 1) : 1
  const maxToolCount = content ? Math.max(...content.topTools.map((t) => t.count), 1) : 1

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-0.5">Análisis</p>
          <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-3">
            <Newspaper size={28} className="text-violet-400" />
            Resumen semanal
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Resumen de tus bookmarks con inteligencia artificial</p>
        </div>
        <button
          onClick={() => void generateDigest()}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
        >
          {generating ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {digest ? 'Generar nuevo' : 'Generar resumen'}
        </button>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="relative mb-5">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Sparkles size={24} className="text-violet-400 animate-pulse" />
            </div>
            <Loader2
              size={48}
              className="absolute -inset-1 text-violet-500/30 animate-spin"
              style={{ top: '-4px', left: '-4px' }}
            />
          </div>
          <h3 className="text-zinc-200 font-semibold mb-1">Analizando tus bookmarks…</h3>
          <p className="text-zinc-500 text-sm">Claude está revisando tus guardados recientes</p>
        </div>
      )}

      {/* Main content */}
      {!generating && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={24} className="text-zinc-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/40 text-red-300 text-sm">
              {error}
            </div>
          ) : !digest || !content ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="p-5 rounded-2xl bg-zinc-800/50 mb-4">
                <Newspaper size={32} className="text-zinc-600" />
              </div>
              <h3 className="text-zinc-300 font-semibold mb-1">Sin resumen todavía</h3>
              <p className="text-zinc-500 text-sm max-w-sm mb-6">
                Genera tu primer resumen para obtener un análisis de tus bookmarks recientes — temas, herramientas, autores y repositorios.
              </p>
              <button
                onClick={() => void generateDigest()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
              >
                <Sparkles size={15} />
                Generar tu primer resumen
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Period info */}
              <div className="flex items-center gap-3 text-sm text-zinc-400">
                <span>
                  Semana del {formatDate(content.period.start)}
                  {content.period.end && ` – ${formatDate(content.period.end)}`}
                </span>
                <span className="text-zinc-700">·</span>
                <span>{content.period.bookmarkCount} bookmarks analizados</span>
                {digest.generatedAt && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">Generado el {formatDate(digest.generatedAt)}</span>
                  </>
                )}
              </div>

              {/* AI Summary */}
              {content.aiSummary && (
                <div className="p-5 rounded-2xl bg-violet-900/10 border border-violet-500/25">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={15} className="text-violet-400" />
                    <span className="text-sm font-semibold text-violet-300">Resumen IA</span>
                  </div>
                  <p className="text-zinc-200 text-sm leading-relaxed">{content.aiSummary}</p>
                </div>
              )}

              {/* 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Topics */}
                {content.topTopics.length > 0 && (
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp size={15} className="text-amber-400" />
                      <span className="text-sm font-semibold text-zinc-200">Temas principales</span>
                    </div>
                    <div className="space-y-3">
                      {content.topTopics.slice(0, 6).map((item) => (
                        <BarRow
                          key={item.topic}
                          label={item.topic}
                          count={item.count}
                          max={maxTopicCount}
                          color="bg-amber-500"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Tools */}
                {content.topTools.length > 0 && (
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                      <Wrench size={15} className="text-blue-400" />
                      <span className="text-sm font-semibold text-zinc-200">Herramientas principales</span>
                    </div>
                    <div className="space-y-3">
                      {content.topTools.slice(0, 6).map((item) => (
                        <BarRow
                          key={item.tool}
                          label={item.tool}
                          count={item.count}
                          max={maxToolCount}
                          color="bg-blue-500"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Authors */}
                {content.topAuthors.length > 0 && (
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                      <Users size={15} className="text-emerald-400" />
                      <span className="text-sm font-semibold text-zinc-200">Autores principales</span>
                    </div>
                    <div className="space-y-2.5">
                      {content.topAuthors.slice(0, 6).map((author) => (
                        <div key={author.handle} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                            {(author.name || author.handle).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 truncate font-medium">{author.name || author.handle}</p>
                            <p className="text-xs text-zinc-500">@{author.handle}</p>
                          </div>
                          <span className="text-xs text-zinc-500 font-mono shrink-0">{author.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notable Repos */}
                {content.notableRepos.length > 0 && (
                  <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2 mb-4">
                      <Github size={15} className="text-zinc-300" />
                      <span className="text-sm font-semibold text-zinc-200">Repositorios principales</span>
                    </div>
                    <div className="space-y-3">
                      {content.notableRepos.slice(0, 5).map((repo) => (
                        <div key={repo.fullName} className="flex items-start gap-3">
                          <Github size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <a
                              href={`https://github.com/${repo.fullName}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-zinc-200 hover:text-white font-medium truncate block transition-colors"
                            >
                              {repo.fullName}
                            </a>
                            {repo.description && (
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{repo.description}</p>
                            )}
                          </div>
                          {repo.stars > 0 && (
                            <div className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                              <Star size={11} />
                              <span>{repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
