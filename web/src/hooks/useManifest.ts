import { useState, useEffect } from 'react'
import type { DataManifest }   from '../types'
import { fetchManifest, fetchManifestForDate } from '../lib/tileUrl'

interface ManifestState {
  manifest: DataManifest | null
  loading:  boolean
  error:    string | null
}

/**
 * Fetches the manifest for the given date, or "current conditions"
 * (latest.json) when selectedDate is null. Re-fetches whenever
 * selectedDate changes — e.g. when the user picks a different month
 * in the date picker.
 */
export function useManifest(selectedDate: string | null): ManifestState {
  const [state, setState] = useState<ManifestState>({
    manifest: null,
    loading:  true,
    error:    null,
  })

  useEffect(() => {
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: null }))

    const fetcher = selectedDate
      ? fetchManifestForDate(selectedDate)
      : fetchManifest()

    fetcher
      .then(m => { if (!cancelled) setState({ manifest: m, loading: false, error: null }) })
      .catch(e => { if (!cancelled) setState({ manifest: null, loading: false, error: String(e) }) })

    return () => { cancelled = true }
  }, [selectedDate])

  return state
}
