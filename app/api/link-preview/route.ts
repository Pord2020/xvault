import { NextRequest, NextResponse } from 'next/server'

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400', // cache 24h
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Block requests to private/loopback addresses to prevent SSRF */
function isPrivateUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw)
    if (protocol !== 'http:' && protocol !== 'https:') return true
    if (hostname === 'localhost' || hostname === '0.0.0.0') return true
    // IPv4 private ranges
    if (/^127\./.test(hostname)) return true
    if (/^10\./.test(hostname)) return true
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return true
    if (/^192\.168\./.test(hostname)) return true
    if (/^169\.254\./.test(hostname)) return true  // link-local
    // IPv6 loopback / ULA
    if (hostname === '::1' || /^\[::1\]$/.test(hostname)) return true
    if (/^fd[0-9a-f]{2,}:/i.test(hostname)) return true
    return false
  } catch {
    return true // malformed URL
  }
}

/** For JS-rendered platforms that can't be scraped, derive a human-readable title */
function syntheticTitle(finalUrl: string, siteName: string): string {
  try {
    const { hostname, pathname } = new URL(finalUrl)
    const host = hostname.replace(/^www\./, '')

    // X / Twitter articles (x.com/i/article/...)
    if ((host === 'x.com' || host === 'twitter.com') && pathname.startsWith('/i/article')) {
      return 'Article on X'
    }
    // X/Twitter profile or status pages
    if (host === 'x.com' || host === 'twitter.com') {
      return 'View on X'
    }
    // Other platforms with a known site name but no scrape-able title
    if (siteName) return `Article on ${siteName}`
  } catch { /* ignore */ }
  return ''
}

function extractMeta(html: string, ...patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1].trim())
  }
  return ''
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }

  if (isPrivateUrl(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 })
    }

    // Only read first 50KB — enough for head tags
    const reader = res.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'no body' }, { status: 502 })

    let html = ''
    let bytes = 0
    while (bytes < 50_000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytes += value.length
      // Stop once we've passed </head>
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    let finalUrl = res.url

    // t.co with a browser UA returns a 200 JS-redirect page; the destination URL
    // appears in the <title> tag.  Detect this and use the real destination URL.
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const titleTagText = titleTagMatch?.[1]?.trim() ?? ''
    if (
      titleTagText.match(/^https?:\/\//) &&
      (() => { try { return new URL(finalUrl).hostname.includes('t.co') } catch { return false } })()
    ) {
      finalUrl = titleTagText
    }

    const domain = (() => {
      try { return new URL(finalUrl).hostname.replace(/^www\./, '') } catch { return '' }
    })()

    const title = extractMeta(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    )

    const description = extractMeta(
      html,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    )

    const image = extractMeta(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    )

    const siteName = extractMeta(
      html,
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    )

    const resolvedTitle = title || syntheticTitle(finalUrl, siteName)

    return NextResponse.json(
      { title: resolvedTitle, description, image, siteName, domain, url: finalUrl },
      { headers: CACHE_HEADERS },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'preview failed'
    return NextResponse.json({ error: msg }, { status: 502, headers: CACHE_HEADERS })
  }
}
