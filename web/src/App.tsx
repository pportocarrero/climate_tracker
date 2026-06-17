import { useState }            from 'react'
import { Globe }               from './components/Globe'
import { Sidebar }             from './components/Sidebar'
import { TopBar }              from './components/TopBar'
import { DatePicker }          from './components/DatePicker'
import { useManifest }         from './hooks/useManifest'
import { useAuth }             from './hooks/useAuth'
import { useUserPrefs }        from './hooks/useUserPrefs'
import { useAvailableMonths }  from './hooks/useAvailableMonths'

export default function App() {
  // null = "current conditions" (latest.json); a "YYYY-MM" string = historical
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { manifest, loading, error } = useManifest(selectedDate)
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const { layerState, setLayerState } = useUserPrefs(user)
  const { months, loading: monthsLoading } = useAvailableMonths()

  // For the "Current" button label, we want the actual latest.json date —
  // but only once we've loaded it (and only when viewing current conditions,
  // otherwise manifest.date reflects the SELECTED historical month instead).
  const currentDate = selectedDate === null ? manifest?.date ?? null : null

  return (
    <div style={styles.root}>
      <TopBar
        user={user}
        loading={authLoading}
        signIn={signIn}
        signOut={signOut}
        dataDate={manifest?.date ?? null}
      />
      <div style={styles.toolbar}>
        <DatePicker
          months={months}
          selectedDate={selectedDate}
          currentDate={currentDate}
          onSelect={setSelectedDate}
          loading={monthsLoading}
        />
      </div>
      <div style={styles.body}>
        <div style={styles.globeWrap}>
          <Globe
            manifest={manifest}
            layerState={layerState}
          />
          {loading && (
            <div style={styles.loadingOverlay}>
              <div style={styles.loadingText}>Loading climate data…</div>
            </div>
          )}
        </div>
        <Sidebar
          manifest={manifest}
          layerState={layerState}
          setLayerState={setLayerState}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width:          '100vw',
    height:         '100vh',
    display:        'flex',
    flexDirection:  'column',
    background:     '#0a1929',
    color:          '#ecf0f1',
    overflow:       'hidden',
  },
  toolbar: {
    display:        'flex',
    alignItems:     'center',
    padding:        '8px 16px',
    background:     '#071422',
    borderBottom:   '1px solid rgba(255,255,255,.07)',
    flexShrink:     0,
  },
  body: {
    flex:     1,
    display:  'flex',
    overflow: 'hidden',
  },
  globeWrap: {
    flex:     1,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position:   'absolute',
    inset:      0,
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  loadingText: {
    fontSize:   14,
    color:      'rgba(255,255,255,.4)',
    background: 'rgba(0,0,0,.4)',
    padding:    '8px 16px',
    borderRadius: 8,
  },
}
