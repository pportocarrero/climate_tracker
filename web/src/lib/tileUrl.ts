import type { DataManifest, ActiveLayer } from '../types'

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO as string
// e.g. "pportocarrero/climate_tracker"

/**
 * Returns a Deck.gl TileLayer URL template.
 *
 * Tiles are committed to the `tiles` branch of the repo:
 *   tiles/{YYYY-MM}/{layer}/{z}/{x}/{y}.png
 *
 * Served via raw.githubusercontent.com — no rate limits, no auth needed,
 * public repos only, cached at CDN edge.
 *
 * URL pattern:
 *   https://raw.githubusercontent.com/{owner}/{repo}/tiles/tiles/{YYYY-MM}/{layer}/{z}/{x}/{y}.png
 *
 * Deck.gl substitutes {z}, {x}, {y} at tile request time.
 */
export function getTileUrl(manifest: DataManifest, layer: ActiveLayer): string {
  if (!GITHUB_REPO) {
    console.warn('VITE_GITHUB_REPO not set — tiles will not load')
    return ''
  }
  const base = `https://raw.githubusercontent.com/${GITHUB_REPO}/tiles/tiles/${manifest.date}/${layer}`
  return `${base}/{z}/{x}/{y}.png`
}

/**
 * Fetches the latest.json manifest committed to main by the pipeline.
 */
export async function fetchManifest(): Promise<DataManifest> {
  const res = await fetch('/latest.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch latest.json: ${res.status}`)
  return res.json() as Promise<DataManifest>
}
