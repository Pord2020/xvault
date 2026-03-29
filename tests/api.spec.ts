import { test, expect } from '@playwright/test'

test.describe('Collections API', () => {
  let collectionId: string

  test('POST /api/collections creates a collection', async ({ request }) => {
    const res = await request.post('/api/collections', {
      data: { name: 'Test Collection', emoji: '🧪', color: '#6366f1' }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.collection.name).toBe('Test Collection')
    collectionId = body.collection.id
  })

  test('GET /api/collections returns list', async ({ request }) => {
    const res = await request.get('/api/collections')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.collections)).toBe(true)
  })

  test('DELETE /api/collections/:id removes it', async ({ request }) => {
    if (!collectionId) return
    const res = await request.delete(`/api/collections/${collectionId}`)
    expect(res.status()).toBe(200)
  })
})

test.describe('Trending API', () => {
  test('GET /api/trending returns period data', async ({ request }) => {
    const res = await request.get('/api/trending?days=7')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.period).toBeDefined()
    expect(body.topTags).toBeDefined()
    expect(body.topTools).toBeDefined()
  })
})

test.describe('Stats API', () => {
  test('GET /api/stats returns counts', async ({ request }) => {
    const res = await request.get('/api/stats')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.totalBookmarks).toBe('number')
  })
})

test.describe('Queue API', () => {
  test('GET /api/queue returns bookmarks', async ({ request }) => {
    const res = await request.get('/api/queue')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.bookmarks)).toBe(true)
  })
})

test.describe('Duplicates API', () => {
  test('GET /api/duplicates returns groups', async ({ request }) => {
    const res = await request.get('/api/duplicates')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.groups)).toBe(true)
  })
})
