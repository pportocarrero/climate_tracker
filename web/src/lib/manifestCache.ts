import type { DataManifest } from '../types'
import { fetchManifest, fetchManifestForDate } from './tileUrl'

export const CURRENT_KEY = '__current__'

// Module-level cache — persists across component re-renders for the
// lifetime of the page. Once a month's manifest is fetched, every later
// request for it (looping animation, scrubbing back, re-selecting in the
// date picker) resolves instantly from here instead of hitting the network.
export const manifestCache = new Map<string, DataManifest>()

/**
 * Fetches and caches a manifest for the given date (or current conditions
 * if null), but only if it isn't already cached. Used both by useManifest
 * itself and by the animation prefetch-ahead logic, so upcoming frames'
 * manifests are already warm in the cache by the time playback reaches them.
 */
export async function ensureManifestCached(date: string | null): Promise<void> {
  const key = date ?? CURRENT_KEY
  if (manifestCache.has(key)) return
  const manifest = date ? await fetchManifestForDate(date) : await fetchManifest()
  manifestCache.set(key, manifest)
}
