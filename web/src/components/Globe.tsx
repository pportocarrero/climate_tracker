import { useRef }                       from 'react'
import { Viewer, ImageryLayer, Entity,
         PolygonGraphics, PolylineGraphics,
         LabelGraphics }                  from 'resium'
import {
  Ion, UrlTemplateImageryProvider,
  Color, Cartesian3, PolygonHierarchy,
  VerticalOrigin, HeightReference, LabelStyle,
} from 'cesium'
import type { Viewer as CesiumViewer } from 'cesium'
import type { DataManifest, LayerState } from '../types'
import { getTileUrl }                    from '../lib/tileUrl'

// Cesium Ion token — not required for basic tile imagery, only for
// Cesium World Terrain / Bing imagery. We use free OSM-style tiles instead,
// so no token is needed for Phase 1.
Ion.defaultAccessToken = ''

interface GlobeProps {
  manifest:   DataManifest | null
  layerState: LayerState
}

// Niño zone definitions: [west, south, east, north] in degrees.
// labelLon/labelLat let us nudge the label position independently of the
// rectangle center — useful for Niño 4, which is split across the dateline.
const NINO_ZONES: {
  id: string; label: string; color: [number, number, number]
  rect: [number, number, number, number]
  labelPos?: [number, number]   // override [lon, lat] for label placement
}[] = [
  { id: 'nino12', label: 'Niño 1+2', color: [180, 180, 180], rect: [-90, -10, -80,   0] },
  { id: 'nino3',  label: 'Niño 3',   color: [239, 159,  39], rect: [-150, -5, -90,   5] },
  { id: 'nino34', label: 'Niño 3.4', color: [226,  75,  74], rect: [-170, -5, -120,  5] },
  { id: 'nino4a', label: 'Niño 4',   color: [239, 159,  39], rect: [ 160, -5,  180,  5], labelPos: [170, 0] },
  { id: 'nino4b', label: '',         color: [239, 159,  39], rect: [-180, -5, -150,  5] },   // no label — avoids duplicate "Niño 4" text
]

/** Returns the 4 corner Cartesian3 points (no closing point) for a fill polygon. */
function rectCorners([w, s, e, n]: [number, number, number, number]): Cartesian3[] {
  return Cartesian3.fromDegreesArray([w, s,  e, s,  e, n,  w, n])
}

/** Returns the 5-point closed-loop border (lon/lat pairs) for a [w,s,e,n] rect. */
function rectBorder([w, s, e, n]: [number, number, number, number]): Cartesian3[] {
  return Cartesian3.fromDegreesArray([w, s,  e, s,  e, n,  w, n,  w, s])
}

/** Returns the centroid [lon, lat] of a [w,s,e,n] rectangle. */
function rectCenter([w, s, e, n]: [number, number, number, number]): [number, number] {
  return [(w + e) / 2, (s + n) / 2]
}

export function Globe({ manifest, layerState }: GlobeProps) {
  const viewerRef = useRef<CesiumViewer | null>(null)

  const sstUrl = manifest ? getTileUrl(manifest, layerState.activeLayer) : null

  return (
    <Viewer
      full
      timeline={false}
      animation={false}
      baseLayerPicker={false}
      navigationHelpButton={false}
      homeButton={false}
      sceneModePicker={false}
      geocoder={false}
      fullscreenButton={false}
      infoBox={false}
      selectionIndicator={false}
      ref={(e) => { if (e?.cesiumElement) viewerRef.current = e.cesiumElement }}
    >
      {/* ── Base map imagery — CartoDB Positron, free, no key needed ── */}
      <ImageryLayer
        imageryProvider={new UrlTemplateImageryProvider({
          url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          credit: '© CartoDB, © OpenStreetMap contributors',
        })}
      />

      {/* ── SST / Anomaly overlay ── */}
      {sstUrl && (
        <ImageryLayer
          imageryProvider={new UrlTemplateImageryProvider({
            url: sstUrl,
            credit: 'NOAA ERSSTv5',
            minimumLevel: 0,
            maximumLevel: 4,
          })}
          alpha={0.75}
        />
      )}

      {/* ── ENSO zone fills (semi-transparent, draped on surface) ── */}
      {layerState.showZones && NINO_ZONES.map((zone) => (
        <Entity key={`${zone.id}-fill`}>
          <PolygonGraphics
            hierarchy={new PolygonHierarchy(rectCorners(zone.rect))}
            material={Color.fromBytes(...zone.color, 45)}
          />
        </Entity>
      ))}

      {/* ── ENSO zone borders (rendered as polylines — always visible) ── */}
      {layerState.showZones && NINO_ZONES.map((zone) => (
        <Entity key={`${zone.id}-line`}>
          <PolylineGraphics
            positions={rectBorder(zone.rect)}
            width={3}
            material={Color.fromBytes(...zone.color, 255)}
            clampToGround={true}
          />
        </Entity>
      ))}

      {/* ── ENSO zone labels ── */}
      {layerState.showZones && NINO_ZONES.filter(z => z.label).map((zone) => {
        const [lon, lat] = zone.labelPos ?? rectCenter(zone.rect)
        return (
          <Entity key={`${zone.id}-label`} position={Cartesian3.fromDegrees(lon, lat)}>
            <LabelGraphics
              text={zone.label}
              font="600 13px sans-serif"
              fillColor={Color.WHITE}
              outlineColor={Color.fromBytes(10, 20, 35, 255)}
              outlineWidth={3}
              style={LabelStyle.FILL_AND_OUTLINE}
              verticalOrigin={VerticalOrigin.CENTER}
              heightReference={HeightReference.CLAMP_TO_GROUND}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
              pixelOffset={new Cartesian3(0, 0)}
            />
          </Entity>
        )
      })}
    </Viewer>
  )
}
