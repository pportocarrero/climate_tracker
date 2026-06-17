import { useState, useEffect, useRef } from 'react'
import type { DataManifest }   from '../types'
import { fetchManifest, fetchManifestForDate } from '../lib/tileUrl'
import { manifestCache, CURRENT_KEY } from '../lib/manifestCache'

interface ManifestState {
  manifest: DataManifest | null
  loading:  boolean
  error:    string | null
}

/**
 * Fetches the manifest for the given date, or "current conditions"
 * (latest.json) when selectedDate is null.
 *
 * Cached in-memory (via the shared manifestCache module) per date —
 * repeated selections of the same month (e.g. during looping animation
 * playback, or scrubbing back and forth) resolve instantly with no
 * network round-trip and no loading flicker. The animation prefetch
 * logic in App.tsx warms this same cache ahead of playback.
 */
export function useManifest(selectedDate: string | null): ManifestState {
  const cacheKey = selectedDate ?? CURRENT_KEY
  const cached    = manifestCache.get(cacheKey)

  const [state, setState] = useState<ManifestState>({
    manifest: cached ?? null,
    loading:  !cached,
    error:    null,
  })

  // Tracks the most recent request so a slow, superseded fetch can't
  // overwrite state after a newer one has already resolved.
  const latestRequestRef = useRef(0)

  useEffect(() => {
    const cachedNow = manifestCache.get(cacheKey)
    if (cachedNow) {
      // Already have it — resolve synchronously, no loading state at all.
      setState({ manifest: cachedNow, loading: false, error: null })
      return
    }

    const requestId = ++latestRequestRef.current
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    const fetcher = selectedDate
      ? fetchManifestForDate(selectedDate)
      : fetchManifest()

    fetcher
      .then(m => {
        manifestCache.set(cacheKey, m)
        if (!cancelled && requestId === latestRequestRef.current) {
          setState({ manifest: m, loading: false, error: null })
        }
      })
      .catch(e => {
        if (!cancelled && requestId === latestRequestRef.current) {
          setState({ manifest: null, loading: false, error: String(e) })
        }
      })

    return () => { cancelled = true }
  }, [selectedDate, cacheKey])

  return state
}
