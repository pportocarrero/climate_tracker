import type { DataManifest, ActiveLayer } from '../types'

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO as string
// e.g. "your-username/enso-viewer"
// Set in .env.local: VITE_GITHUB_REPO=your-username/enso-viewer

/**
 * Returns a Deck.gl TileLayer data URL template for the given layer and manifest.
 *
 * GitHub Release asset download URLs follow this pattern:
 * https://github.com/{owner}/{repo}/releases/download/{tag}/{asset_filename}
 *
 * For tiles we upload the full directory tree as a zip, then extract on the
 * GitHub Actions runner — but the simpler approach for phase 1 is to upload
 * each tile individually via `gh release upload`. The URL then becomes:
 *
 * https://github.com/{repo}/releases/download/{tag}/sst_{z}_{x}_{y}.png
 *
 * We flatten the z/x/y path into the filename to avoid GitHub Release
 * directory restrictions.
 */
export function getTileUrl(
  manifest: DataManifest,
  layer: ActiveLayer
): string {
  if (!GITHUB_REPO) {
    console.warn('VITE_GITHUB_REPO not set — using placeholder tile URL')
    return `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  }
  const base = `https://github.com/${GITHUB_REPO}/releases/download/${manifest.release_tag}`
  // Tile filename format: {layer}_{z}_{x}_{y}.png
  return `${base}/${layer}_{z}_{x}_{y}.png`
}

/**
 * Fetches the latest.json manifest committed to the repo by the pipeline.
 * Falls back to a minimal stub if the file doesn't exist yet.
 */
export async function fetchManifest(): Promise<DataManifest> {
  const res = await fetch('/latest.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to fetch latest.json: ${res.status}`)
  return res.json() as Promise<DataManifest>
}
