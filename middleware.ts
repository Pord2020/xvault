import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientId } from './lib/rate-limit'

/**
 * Middleware that combines:
 * 1. Rate limiting for AI-heavy routes
 * 2. Optional HTTP Basic Auth protection (set SIFTLY_USERNAME + SIFTLY_PASSWORD to enable)
 *
 * The bookmarklet endpoint is excluded from auth so cross-origin imports from x.com work.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const clientId = getClientId(request)

  // --- Rate limiting for AI-heavy routes ---
  let rateLimitResult: ReturnType<typeof rateLimit> | null = null

  if (pathname === '/api/ask') {
    rateLimitResult = rateLimit(clientId, { max: 20, windowMs: 60_000, prefix: 'ask' })
  } else if (/^\/api\/categories\/[^/]+\/summary$/.test(pathname)) {
    rateLimitResult = rateLimit(clientId, { max: 5, windowMs: 60_000, prefix: 'cat-summary' })
  } else if (pathname === '/api/digest' && request.method === 'POST') {
    rateLimitResult = rateLimit(clientId, { max: 3, windowMs: 10 * 60_000, prefix: 'digest' })
  } else if (pathname === '/api/search/ai') {
    rateLimitResult = rateLimit(clientId, { max: 30, windowMs: 60_000, prefix: 'search-ai' })
  }

  if (rateLimitResult && !rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  // --- Optional HTTP Basic Auth ---
  const username = process.env.SIFTLY_USERNAME?.trim()
  const password = process.env.SIFTLY_PASSWORD?.trim()

  // No credentials configured → pass through (default local behaviour)
  if (!username || !password) return NextResponse.next()

  // Let the bookmarklet endpoint through — it's called cross-origin from x.com
  // and can't include Basic Auth credentials.
  if (pathname === '/api/import/bookmarklet') {
    return NextResponse.next()
  }

  const authHeader = request.headers.get('Authorization')

  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.slice(6))
      const colonIdx = decoded.indexOf(':')
      if (colonIdx !== -1) {
        const user = decoded.slice(0, colonIdx)
        const pass = decoded.slice(colonIdx + 1)
        if (user === username && pass === password) {
          return NextResponse.next()
        }
      }
    } catch {
      // malformed base64 → fall through to 401
    }
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Siftly"' },
  })
}

export const config = {
  matcher: [
    // AI rate-limited routes
    '/api/ask',
    '/api/categories/:path*/summary',
    '/api/digest',
    '/api/search/ai',
    // Auth protection: everything except Next.js internals and static root files
    '/((?!_next/|favicon.ico|icon.svg).*)',
  ],
}
