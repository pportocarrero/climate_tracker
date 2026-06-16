import { Globe }       from './components/Globe'
import { Sidebar }     from './components/Sidebar'
import { TopBar }      from './components/TopBar'
import { useManifest } from './hooks/useManifest'
import { useAuth }     from './hooks/useAuth'
import { useUserPrefs }from './hooks/useUserPrefs'

export default function App() {
  const { manifest, loading, error } = useManifest()
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const { layerState, setLayerState } = useUserPrefs(user)

  return (
    <div style={styles.root}>
      <TopBar
        user={user}
        loading={authLoading}
        signIn={signIn}
        signOut={signOut}
        dataDate={manifest?.date ?? null}
      />
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
