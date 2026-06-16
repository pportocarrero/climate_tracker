import { useState, useEffect } from 'react'
import type { DataManifest }   from '../types'
import { fetchManifest }       from '../lib/tileUrl'

interface ManifestState {
  manifest: DataManifest | null
  loading:  boolean
  error:    string | null
}

export function useManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({
    manifest: null,
    loading:  true,
    error:    null,
  })

  useEffect(() => {
    let cancelled = false
    fetchManifest()
      .then(m => { if (!cancelled) setState({ manifest: m, loading: false, error: null }) })
      .catch(e => { if (!cancelled) setState({ manifest: null, loading: false, error: String(e) }) })
    return () => { cancelled = true }
  }, [])

  return state
}
