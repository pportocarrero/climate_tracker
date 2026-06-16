import { useCallback, useState }    from 'react'
import DeckGL                        from '@deck.gl/react'
import { TileLayer }                 from '@deck.gl/geo-layers'
import { BitmapLayer, GeoJsonLayer } from '@deck.gl/layers'
import { WebMercatorViewport }       from '@deck.gl/core'
import type { DataManifest, LayerState, ZoneProperties } from '../types'
import { getTileUrl }                from '../lib/tileUrl'

interface GlobeProps {
  manifest:   DataManifest | null
  layerState: LayerState
}

const INITIAL_VIEW = {
  longitude: -160,    // Center on Pacific
  latitude:   5,
  zoom:       2,
  pitch:      30,
  bearing:    0,
  minZoom:    1,
  maxZoom:    6,
}

export function Globe({ manifest, layerState }: GlobeProps) {
  const [viewState, setViewState] = useState(INITIAL_VIEW)

  const onViewStateChange = useCallback(({ viewState: vs }: { viewState: typeof INITIAL_VIEW }) => {
    setViewState(vs)
  }, [])

  const layers = []

  // ── SST or Anomaly tile layer ─────────────────────────────────────────────
  if (manifest) {
    const tileUrl = getTileUrl(manifest, layerState.activeLayer)
    layers.push(
      new TileLayer({
        id:           'sst-tiles',
        data:          tileUrl,
        tileSize:      256,
        minZoom:       0,
        maxZoom:       4,
        renderSubLayers(props) {
          const { boundingBox } = props.tile
          return new BitmapLayer(props, {
            data:          undefined,
            image:         props.data,
            bounds: [
              boundingBox[0][0], boundingBox[0][1],
              boundingBox[1][0], boundingBox[1][1],
            ],
          })
        },
      })
    )
  }

  // ── ENSO zone outlines ────────────────────────────────────────────────────
  if (layerState.showZones) {
    layers.push(
      new GeoJsonLayer<ZoneProperties>({
        id:              'enso-zones',
        data:            '/enso-zones.geojson',
        stroked:         true,
        filled:          true,
        lineWidthMinPixels: 2,
        getFillColor:    (f) => [...(f.properties as ZoneProperties).color, 20] as [number,number,number,number],
        getLineColor:    (f) => [...(f.properties as ZoneProperties).color, 200] as [number,number,number,number],
        getLineWidth:    2,
        // Show label on hover via tooltip
        pickable:        true,
      })
    )
  }

  return (
    <DeckGL
      viewState={viewState}
      controller={{ inertia: true, scrollZoom: { smooth: true } }}
      onViewStateChange={onViewStateChange}
      layers={layers}
      getTooltip={({ object }) => {
        if (!object) return null
        const props = object.properties as ZoneProperties
        if (!props?.label) return null
        return { html: `<div style="padding:6px 10px;font-size:13px;font-weight:500">${props.label}</div>` }
      }}
      style={{ background: '#0a1929' }}
    >
      {/* Subtle grid / graticule can go here in phase 2 */}
    </DeckGL>
  )
}
