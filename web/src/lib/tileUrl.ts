import type { DataManifest, ActiveLayer } from '../types'

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO as string
// e.g. "pportocarrero/climate_tracker"

/**
 * Returns a Deck.gl TileLayer data URL template.
 *
 * Tiles are uploaded to GitHub Releases as flat files named:
 *   {layer}_{z}_{x}_{y}.png
 *
 * Download URL pattern:
 *   https://github.com/{owner}/{repo}/releases/download/{tag}/{layer}_{z}_{x}_{y}.png
 *
 * Deck.gl substitutes {z}, {x}, {y} at request time.
 */
export function getTileUrl(manifest: DataManifest, layer: ActiveLayer): string {
  if (!GITHUB_REPO) {
    console.warn('VITE_GITHUB_REPO not set')
    return ''
  }
  const base = `https://github.com/${GITHUB_REPO}/releases/download/${manifest.release_tag}`
  return `${base}/${layer}_{z}_{x}_{y}.png`
}

/**
 * Fetches the latest.json manifest committed to the repo by the pipeline.
 */
export async function fetchManifest(): Promise<DataManifest> {
  const res = await fetch('/latest.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch latest.json: ${res.status}`)
  return res.json() as Promise<DataManifest>
}
