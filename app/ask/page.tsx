'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, MessageSquare, BookOpen, Github, RotateCcw } from 'lucide-react'

interface Source {
  id: string
  tweetId: string
  text: string
  authorHandle: string
  authorName: string
  tweetCreatedAt: string | null
  repoMeta: string | null
  categories: string[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

const EXAMPLE_QUESTIONS = [
  '¿Cuáles son las mejores herramientas para construir pipelines RAG?',
  '¿Qué he guardado sobre agentes de IA y flujos de trabajo autónomos?',
  '¿Qué repositorios de GitHub debería revisar para herramientas LLM?',
  '¿Qué consejos tengo sobre ingeniería de prompts?',
  'Resume lo que sé sobre bases de datos vectoriales',
]

function RepoChip({ repoMeta }: { repoMeta: string }) {
  try {
    const r = JSON.parse(repoMeta) as { fullName: string; stars: number; isArchived: boolean }
    return (
      <a
        href={`https://github.com/${r.fullName}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
      >
        <Github size={11} />
        <span className="font-mono">{r.fullName}</span>
        <span className="text-zinc-500">⭐{r.stars >= 1000 ? `${(r.stars / 1000).toFixed(1)}k` : r.stars}</span>
        {r.isArchived && <span className="text-amber-500 text-[10px]">archived</span>}
      </a>
    )
  } catch {
    return null
  }
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const tweetUrl = source.authorHandle !== 'unknown'
    ? `https://twitter.com/${source.authorHandle}/status/${source.tweetId}`
    : `https://twitter.com/i/web/status/${source.tweetId}`
  return (
    <a
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1.5 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900 transition-all text-left"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">[{index + 1}]</span>
        <span className="text-xs font-semibold text-zinc-300">@{source.authorHandle}</span>
        {source.tweetCreatedAt && (
          <span className="text-[10px] text-zinc-600 ml-auto">
            {new Date(source.tweetCreatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{source.text}</p>
      {source.repoMeta && <RepoChip repoMeta={source.repoMeta} />}
      {source.categories.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {source.categories.map((c) => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500">{c}</span>
          ))}
        </div>
      )}
    </a>
  )
}

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function ask(question: string) {
    if (!question.trim() || loading) return
    setError(null)
    const userMsg: Message = { role: 'user', content: question }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string }
        throw new Error(errData.error ?? 'Request failed')
      }

      // Handle SSE streaming response
      const contentType = res.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream')) {
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let sources: Source[] = []
        let assistantContent = ''
        // Add placeholder assistant message
        setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [] }])
        setLoading(false)
        setStreaming(true)

        if (reader) {
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const raw = line.slice(5).trim()
              if (!raw) continue
              try {
                const event = JSON.parse(raw) as { type: string; data: unknown }
                if (event.type === 'sources') {
                  sources = event.data as Source[]
                  setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = { role: 'assistant', content: assistantContent, sources }
                    return next
                  })
                } else if (event.type === 'delta') {
                  assistantContent += event.data as string
                  setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = { role: 'assistant', content: assistantContent, sources }
                    return next
                  })
                } else if (event.type === 'error') {
                  throw new Error(String(event.data))
                }
              } catch { /* skip malformed lines */ }
            }
          }
        }
      } else {
        // Fallback: plain JSON response
        const data = await res.json() as { answer?: string; sources?: Source[]; error?: string }
        if (data.error) throw new Error(data.error)
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer ?? '', sources: data.sources ?? [] }])
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setMessages((prev) => {
        const next = [...prev]
        if (next[next.length - 1]?.role === 'assistant' && !next[next.length - 1].content) next.pop()
        if (next[next.length - 1]?.role === 'user') next.pop()
        return next
      })
      setLoading(false)
    } finally {
      setStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void ask(input)
    }
  }

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <MessageSquare size={16} className="text-violet-400" />
            <h1 className="text-lg font-bold text-zinc-100">Pregunta a tus bookmarks</h1>
          </div>
          <p className="text-xs text-zinc-500">Obtén respuestas sintetizadas de tu conocimiento guardado</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-all border border-transparent hover:border-zinc-700"
          >
            <RotateCcw size={12} />
            Nueva conversación
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
            <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
              <Sparkles size={28} className="text-violet-400" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-zinc-100 mb-2">¿Qué quieres saber?</h2>
              <p className="text-sm text-zinc-500 max-w-md">
                Pregunta lo que quieras — buscaré en tus bookmarks y te daré una respuesta sintetizada con fuentes.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => void ask(q)}
                  className="text-left px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/80 text-sm text-zinc-400 hover:text-zinc-200 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mt-0.5">
                        <Sparkles size={12} className="text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="ml-10">
                        <div className="flex items-center gap-1.5 mb-2">
                          <BookOpen size={12} className="text-zinc-600" />
                          <span className="text-xs text-zinc-600 font-medium uppercase tracking-wide">Fuentes ({msg.sources.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.sources.map((s, j) => <SourceCard key={s.id} source={s} index={j} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(loading || streaming) && (
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <Loader2 size={12} className="text-violet-400 animate-spin" />
                </div>
                <span className="text-sm text-zinc-500">{loading ? 'Buscando en tus bookmarks…' : 'Generando respuesta…'}</span>
              </div>
            )}
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800/50 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta lo que quieras sobre tus bookmarks… (Enter para enviar)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/60 focus:bg-zinc-800 transition-all leading-relaxed"
              style={{ maxHeight: '160px' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }}
            />
            <button
              onClick={() => void ask(input)}
              disabled={!input.trim() || loading || streaming}
              className="shrink-0 p-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {(loading || streaming) ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2 text-center">
            Las respuestas se sintetizan desde tus bookmarks — no desde el conocimiento general de Claude
          </p>
        </div>
      </div>
    </div>
  )
}
