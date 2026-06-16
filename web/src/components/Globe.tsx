import { useCallback, useState }    from 'react'
import DeckGL                        from '@deck.gl/react'
import { TileLayer }                 from '@deck.gl/geo-layers'
import { BitmapLayer, GeoJsonLayer } from '@deck.gl/layers'
import type { DataManifest, LayerState, ZoneProperties } from '../types'
import { getTileUrl }                from '../lib/tileUrl'

interface GlobeProps {
  manifest:   DataManifest | null
  layerState: LayerState
}

const INITIAL_VIEW = {
  longitude: -160,
  latitude:   5,
  zoom:       2,
  pitch:      0,
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

  // ── Base map — OpenStreetMap tiles so the world is always visible ─────────
  layers.push(
    new TileLayer({
      id:       'base-map',
      data:     'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tileSize:  256,
      minZoom:   0,
      maxZoom:   6,
      renderSubLayers(props) {
        const { boundingBox } = props.tile
        return new BitmapLayer(props, {
          data:  undefined,
          image: props.data,
          bounds: [
            boundingBox[0][0], boundingBox[0][1],
            boundingBox[1][0], boundingBox[1][1],
          ],
        })
      },
    })
  )

  // ── SST or Anomaly tile layer (overlaid on base map) ─────────────────────
  if (manifest) {
    const tileUrl = getTileUrl(manifest, layerState.activeLayer)
    if (tileUrl) {
      layers.push(
        new TileLayer({
          id:       'sst-tiles',
          data:      tileUrl,
          tileSize:  256,
          minZoom:   0,
          maxZoom:   4,
          opacity:   0.78,
          renderSubLayers(props) {
            const { boundingBox } = props.tile
            return new BitmapLayer(props, {
              data:  undefined,
              image: props.data,
              bounds: [
                boundingBox[0][0], boundingBox[0][1],
                boundingBox[1][0], boundingBox[1][1],
              ],
            })
          },
        })
      )
    }
  }

  // ── ENSO zone outlines ────────────────────────────────────────────────────
  if (layerState.showZones) {
    layers.push(
      new GeoJsonLayer<ZoneProperties>({
        id:                 'enso-zones',
        data:               '/enso-zones.geojson',
        stroked:            true,
        filled:             true,
        lineWidthMinPixels: 2,
        getFillColor:       (f) => [...(f.properties as ZoneProperties).color, 25] as [number,number,number,number],
        getLineColor:       (f) => [...(f.properties as ZoneProperties).color, 220] as [number,number,number,number],
        getLineWidth:       2,
        pickable:           true,
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
        return {
          html: `<div style="
            padding:6px 12px;
            font-size:13px;
            font-weight:600;
            background:rgba(10,25,41,0.92);
            color:#ecf0f1;
            border-radius:6px;
            border:1px solid rgba(255,255,255,0.15)
          ">${props.label}</div>`
        }
      }}
      style={{ background: '#0a1929' }}
    />
  )
}
