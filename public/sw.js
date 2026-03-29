// Siftly Service Worker
// Cache name — bump the version string to force cache invalidation on deploy
const CACHE_NAME = 'siftly-v1'

// Core pages to pre-cache on install
const PRECACHE_URLS = ['/', '/bookmarks', '/collections', '/ask', '/trending']

// ---------------------------------------------------------------------------
// Install — pre-cache core static assets
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

// ---------------------------------------------------------------------------
// Activate — clean up old caches from previous versions
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

// ---------------------------------------------------------------------------
// Fetch — tiered caching strategy
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // --- API routes: network first, fallback to offline JSON ---
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        Response.json({ error: 'offline', offline: true }, { status: 503 }),
      ),
    )
    return
  }

  // --- Static assets (_next/): cache first, then network ---
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const cloned = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          }
          return response
        })
      }),
    )
    return
  }

  // --- Pages: network first, fall back to cache ---
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful page responses
        if (response.ok) {
          const cloned = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  )
})
