// ── Climate data types ────────────────────────────────────────────────────────

export interface NinoIndices {
  nino12:  number   // Niño 1+2 anomaly °C
  nino3:   number   // Niño 3 anomaly °C
  nino34:  number   // Niño 3.4 anomaly °C (primary ONI proxy)
  nino4:   number   // Niño 4 anomaly °C
}

export type EnsoCondition =
  | 'strong-el-nino'
  | 'moderate-el-nino'
  | 'weak-el-nino'
  | 'neutral'
  | 'weak-la-nina'
  | 'moderate-la-nina'
  | 'strong-la-nina'

export interface DataManifest {
  date:        string          // "YYYY-MM"
  release_tag: string          // "tiles-YYYY-MM"
  generated:   string          // ISO timestamp
  indices:     NinoIndices
  condition:   EnsoCondition
  tile_sets: {
    sst:     string            // path template e.g. "sst/{z}/{x}/{y}.png"
    anomaly: string
  }
}

// ── UI / layer state ───────────────────────────────────────────────────────────

export type ActiveLayer = 'sst' | 'anomaly'

export interface LayerState {
  activeLayer:   ActiveLayer
  showZones:     boolean
  showWinds:     boolean   // phase 2
  showStorms:    boolean   // phase 2
}

// ── User state (synced to Firestore) ─────────────────────────────────────────

export interface UserPreferences {
  layerState:    LayerState
  viewState:     ViewState
}

export interface ViewState {
  longitude:  number
  latitude:   number
  zoom:       number
  pitch:      number
  bearing:    number
}

// ── ENSO zone GeoJSON feature properties ──────────────────────────────────────

export interface ZoneProperties {
  id:    'nino12' | 'nino3' | 'nino34' | 'nino4'
  label: string
  color: [number, number, number]
}
