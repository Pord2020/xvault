/**
 * Simple in-memory rate limiter for API routes.
 * Resets on server restart — appropriate for a local self-hosted app.
 * Usage: const { allowed, remaining } = rateLimit(request, { max: 10, windowMs: 60_000 })
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitOptions {
  /** Maximum requests in the window */
  max: number
  /** Window duration in ms */
  windowMs: number
  /** Key prefix to differentiate different limiters */
  prefix?: string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  identifier: string,
  options: RateLimitOptions,
): RateLimitResult {
  const { max, windowMs, prefix = 'rl' } = options
  const key = `${prefix}:${identifier}`
  const now = Date.now()

  let entry = store.get(key)
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs }
    store.set(key, entry)
  }

  entry.count++
  const remaining = Math.max(0, max - entry.count)
  return { allowed: entry.count <= max, remaining, resetAt: entry.resetAt }
}

/** Get client IP from Next.js request headers */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'local'
}
