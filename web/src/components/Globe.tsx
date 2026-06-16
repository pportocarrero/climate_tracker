import { useCallback, useState }    from 'react'
import DeckGL                        from '@deck.gl/react'
import { GlobeView }                 from '@deck.gl/core'
import { TileLayer }                 from '@deck.gl/geo-layers'
import { BitmapLayer, GeoJsonLayer,
         SolidPolygonLayer }         from '@deck.gl/layers'
import type { DataManifest, LayerState, ZoneProperties } from '../types'
import { getTileUrl }                from '../lib/tileUrl'

interface GlobeProps {
  manifest:   DataManifest | null
  layerState: LayerState
}

const INITIAL_VIEW_STATE = {
  longitude:  -160,
  latitude:     5,
  zoom:         1.2,
  minZoom:      0,
  maxZoom:      6,
}

// Background ocean polygon covering the whole globe so the sphere has
// an ocean color behind the tiles
const OCEAN_BG = [{
  polygon: [[-180,-90],[ 180,-90],[ 180, 90],[-180, 90],[-180,-90]]
}]

export function Globe({ manifest, layerState }: GlobeProps) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)

  const onViewStateChange = useCallback(
    ({ viewState: vs }: { viewState: typeof INITIAL_VIEW_STATE }) => {
      setViewState(vs)
    }, []
  )

  const layers = []

  // ── Ocean background so the globe sphere looks like Earth ─────────────────
  layers.push(
    new SolidPolygonLayer({
      id:          'ocean-bg',
      data:         OCEAN_BG,
      getPolygon:  (d: typeof OCEAN_BG[0]) => d.polygon,
      getFillColor: [10, 60, 120, 255],
      stroked:      false,
    })
  )

  // ── Base map tiles (countries, coastlines) ────────────────────────────────
  layers.push(
    new TileLayer({
      id:       'base-tiles',
      data:     'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tileSize:  256,
      minZoom:   0,
      maxZoom:   6,
      renderSubLayers(props) {
        const bb = props.tile.boundingBox
        return new BitmapLayer(props, {
          data:   undefined,
          image:  props.data,
          bounds: [bb[0][0], bb[0][1], bb[1][0], bb[1][1]],
        })
      },
    })
  )

  // ── SST / Anomaly tile overlay ────────────────────────────────────────────
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
            const bb = props.tile.boundingBox
            return new BitmapLayer(props, {
              data:   undefined,
              image:  props.data,
              bounds: [bb[0][0], bb[0][1], bb[1][0], bb[1][1]],
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
        getFillColor:  (f) => [...(f.properties as ZoneProperties).color, 30]  as [number,number,number,number],
        getLineColor:  (f) => [...(f.properties as ZoneProperties).color, 230] as [number,number,number,number],
        getLineWidth:       2,
        pickable:           true,
      })
    )
  }

  return (
    <DeckGL
      views={new GlobeView({ id: 'globe', controller: true })}
      viewState={{ globe: viewState }}
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
