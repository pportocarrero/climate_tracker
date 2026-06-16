import type { DataManifest, LayerState } from '../types'
import { CONDITION_META }                from '../lib/condition'

interface SidebarProps {
  manifest:      DataManifest | null
  layerState:    LayerState
  setLayerState: (update: Partial<LayerState>) => void
  loading:       boolean
  error:         string | null
}

export function Sidebar({ manifest, layerState, setLayerState, loading, error }: SidebarProps) {
  const meta = manifest ? CONDITION_META[manifest.condition] : null

  return (
    <aside style={styles.sidebar}>

      {/* ── Header ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>ENSO Indices</div>
        {loading && <div style={styles.muted}>Loading…</div>}
        {error   && <div style={styles.error}>⚠ {error}</div>}
        {manifest && (
          <>
            <IndexRow label="Niño 1+2" value={manifest.indices.nino12} />
            <IndexRow label="Niño 3"   value={manifest.indices.nino3}  />
            <IndexRow label="Niño 3.4" value={manifest.indices.nino34} bold />
            <IndexRow label="Niño 4"   value={manifest.indices.nino4}  />
          </>
        )}
      </div>

      {/* ── Condition badge ── */}
      {meta && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Condition</div>
          <div style={{ ...styles.badge, background: meta.bg, color: meta.color }}>
            {meta.label}
          </div>
          <p style={styles.description}>{meta.description}</p>
        </div>
      )}

      {/* ── Layer toggles ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Layers</div>

        <LayerOption
          label="SST anomaly"
          active={layerState.activeLayer === 'anomaly'}
          onClick={() => setLayerState({ activeLayer: 'anomaly' })}
        />
        <LayerOption
          label="Absolute SST"
          active={layerState.activeLayer === 'sst'}
          onClick={() => setLayerState({ activeLayer: 'sst' })}
        />

        <div style={{ height: 8 }} />

        <Toggle
          label="ENSO zones"
          checked={layerState.showZones}
          onChange={v => setLayerState({ showZones: v })}
        />
        <Toggle
          label="Trade winds"
          checked={layerState.showWinds}
          onChange={v => setLayerState({ showWinds: v })}
          disabled
          disabledNote="Phase 2"
        />
        <Toggle
          label="Storms"
          checked={layerState.showStorms}
          onChange={v => setLayerState({ showStorms: v })}
          disabled
          disabledNote="Phase 2"
        />
      </div>

      {/* ── Date stamp ── */}
      {manifest && (
        <div style={{ ...styles.muted, marginTop: 'auto', paddingTop: 12 }}>
          Data: {manifest.date}<br />
          Updated: {new Date(manifest.generated).toLocaleString()}
        </div>
      )}

      {/* ── Color scale ── */}
      {manifest && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            {layerState.activeLayer === 'anomaly' ? 'Anomaly scale' : 'SST scale'}
          </div>
          {layerState.activeLayer === 'anomaly'
            ? <ColorBar stops={['#1a5276','#2980b9','#aed6f1','#fff','#f5cba7','#e74c3c','#7b241c']} min="−3°C" max="+3°C" />
            : <ColorBar stops={['#0d1b45','#0d5f8e','#00bcd4','#4caf50','#f9c22e','#e64a19','#b71c1c']} min="−2°C" max="32°C" />
          }
        </div>
      )}
    </aside>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IndexRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const color = value >= 0.5 ? '#e74c3c' : value <= -0.5 ? '#2980b9' : '#bdc3c7'
  return (
    <div style={styles.indexRow}>
      <span style={{ fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}°C
      </span>
    </div>
  )
}

function LayerOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...styles.layerBtn, ...(active ? styles.layerBtnActive : {}) }}>
      <span style={styles.radioCircle}>
        {active && <span style={styles.radioDot} />}
      </span>
      {label}
    </button>
  )
}

function Toggle({
  label, checked, onChange, disabled, disabledNote
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void
  disabled?: boolean; disabledNote?: string
}) {
  return (
    <div style={{ ...styles.toggleRow, opacity: disabled ? 0.45 : 1 }}>
      <span>{label}{disabledNote && <span style={styles.muted}> — {disabledNote}</span>}</span>
      <button
        onClick={() => !disabled && onChange(!checked)}
        style={{ ...styles.toggle, background: checked && !disabled ? '#2980b9' : '#2c3e50' }}
        aria-checked={checked}
        role="switch"
        aria-label={label}
      >
        <span style={{ ...styles.toggleThumb, transform: checked ? 'translateX(14px)' : 'none' }} />
      </button>
    </div>
  )
}

function ColorBar({ stops, min, max }: { stops: string[]; min: string; max: string }) {
  const grad = `linear-gradient(to right, ${stops.join(', ')})`
  return (
    <div>
      <div style={{ height: 8, borderRadius: 4, background: grad, margin: '4px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7f8c8d' }}>
        <span>{min}</span><span>0</span><span>{max}</span>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width:          220,
    flexShrink:     0,
    background:     '#0d2137',
    borderLeft:     '1px solid rgba(255,255,255,.07)',
    padding:        '12px 14px',
    overflowY:      'auto',
    display:        'flex',
    flexDirection:  'column',
    gap:            4,
    color:          '#ecf0f1',
    fontSize:       13,
    userSelect:     'none',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: '.6px',
    textTransform: 'uppercase',
    color:         '#7f8c8d',
    marginBottom:  8,
  },
  indexRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '4px 0',
    borderBottom:   '1px solid rgba(255,255,255,.05)',
    fontSize:       13,
  },
  badge: {
    borderRadius:  6,
    padding:       '6px 10px',
    textAlign:     'center',
    fontWeight:    600,
    fontSize:      13,
    marginBottom:  6,
  },
  description: {
    fontSize:    11,
    color:       '#7f8c8d',
    lineHeight:  1.5,
    margin:      0,
  },
  layerBtn: {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    width:          '100%',
    background:     'none',
    border:         'none',
    color:          '#bdc3c7',
    fontSize:       13,
    cursor:         'pointer',
    padding:        '5px 0',
    textAlign:      'left',
  },
  layerBtnActive: {
    color: '#ecf0f1',
  },
  radioCircle: {
    width:        16,
    height:       16,
    borderRadius: '50%',
    border:       '2px solid #2980b9',
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
  },
  radioDot: {
    width:        8,
    height:       8,
    borderRadius: '50%',
    background:   '#2980b9',
  },
  toggleRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '5px 0',
  },
  toggle: {
    width:        30,
    height:       16,
    borderRadius: 8,
    border:       'none',
    cursor:       'pointer',
    position:     'relative',
    transition:   'background .2s',
    flexShrink:   0,
    padding:      0,
  },
  toggleThumb: {
    position:   'absolute',
    top:        2,
    left:       2,
    width:      12,
    height:     12,
    borderRadius: '50%',
    background: '#ecf0f1',
    transition: 'transform .2s',
  },
  muted: {
    fontSize: 11,
    color:    '#7f8c8d',
    lineHeight: 1.5,
  },
  error: {
    fontSize: 12,
    color:    '#e74c3c',
  },
}
