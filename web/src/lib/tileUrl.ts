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
 * Represents "current conditions" — the most recently processed month.
 */
export async function fetchManifest(): Promise<DataManifest> {
  const res = await fetch('/latest.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch latest.json: ${res.status}`)
  return res.json() as Promise<DataManifest>
}

/**
 * Fetches the manifest for a SPECIFIC historical month, directly from the
 * tiles branch (since that's where each month's self-describing
 * manifest.json lives, alongside its own tiles).
 */
export async function fetchManifestForDate(date: string): Promise<DataManifest> {
  if (!GITHUB_REPO) {
    throw new Error('VITE_GITHUB_REPO not set')
  }
  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/tiles/tiles/${date}/manifest.json`
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch manifest for ${date}: ${res.status}`)
  return res.json() as Promise<DataManifest>
}

/**
 * Fetches the lightweight index of every month that has data available,
 * used to populate the date picker dropdown. Each entry has just enough
 * info (date, condition, nino34) to render the dropdown without needing
 * to fetch every month's full manifest up front.
 */
export interface AvailableMonth {
  date:      string
  condition: string
  nino34:    number
}

export async function fetchAvailableMonths(): Promise<AvailableMonth[]> {
  const res = await fetch('/available-months.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch available-months.json: ${res.status}`)
  return res.json() as Promise<AvailableMonth[]>
}

/**
 * Preloads the low-zoom tiles (Z0-Z2 — the ones visible at typical
 * zoomed-out viewing distance) for a given date + layer, so that when
 * animation playback reaches this month, the tiles are already in the
 * browser's HTTP cache and render instantly instead of stuttering on
 * a fresh network request.
 *
 * Z0-Z2 covers 1 + 4 + 16 = 21 tiles per layer — small enough to prefetch
 * a few months ahead without meaningfully impacting bandwidth.
 */
export function prefetchTiles(date: string, layer: ActiveLayer): void {
  if (!GITHUB_REPO) return
  const base = `https://raw.githubusercontent.com/${GITHUB_REPO}/tiles/tiles/${date}/${layer}`

  for (let z = 0; z <= 2; z++) {
    const n = 2 ** z
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const img = new Image()
        img.src = `${base}/${z}/${x}/${y}.png`
        // Intentionally not awaited — fire-and-forget into the browser
        // cache. We don't care about the result, just that the request
        // happens early.
      }
    }
  }
}
