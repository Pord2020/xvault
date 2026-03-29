import { test, expect } from '@playwright/test'

const PAGES = [
  { url: '/', title: 'Dashboard' },
  { url: '/collections', contains: 'Collections' },
  { url: '/trending', contains: 'Trending' },
  { url: '/ask', contains: 'Ask' },
  { url: '/queue', contains: 'Queue' },
  { url: '/digest', contains: 'Digest' },
  { url: '/duplicates', contains: 'Duplicate' },
]

for (const page of PAGES) {
  test(`${page.url} loads without error`, async ({ page: p }) => {
    await p.goto(page.url)
    await p.waitForLoadState('networkidle')
    // No error page shown
    const body = await p.textContent('body')
    expect(body).not.toContain('Application error')
    expect(body).not.toContain('500')
    if (page.contains) {
      expect(body).toContain(page.contains)
    }
  })
}
