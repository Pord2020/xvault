'use client'

import { useEffect } from 'react'

/** Registers the Siftly service worker on mount. Returns null — renders nothing. */
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
