import type { User } from 'firebase/auth'

interface TopBarProps {
  user:     User | null
  loading:  boolean
  signIn:   () => Promise<void>
  signOut:  () => Promise<void>
  dataDate: string | null
}

export function TopBar({ user, loading, signIn, signOut, dataDate }: TopBarProps) {
  return (
    <header style={styles.bar}>
      {/* Logo */}
      <div style={styles.logo}>
        <span style={styles.logoIcon}>🌊</span>
        <span style={styles.logoText}>ENSO Viewer</span>
        <span style={styles.logoBeta}>beta</span>
      </div>

      {/* Data date */}
      {dataDate && (
        <div style={styles.datePill}>
          <span style={styles.dot} />
          Data: {dataDate}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Auth */}
      {loading ? null : user ? (
        <div style={styles.userRow}>
          <img
            src={user.photoURL ?? ''}
            alt={user.displayName ?? 'User'}
            style={styles.avatar}
            referrerPolicy="no-referrer"
          />
          <span style={styles.userName}>{user.displayName?.split(' ')[0]}</span>
          <button onClick={signOut} style={styles.signOutBtn}>Sign out</button>
        </div>
      ) : (
        <button onClick={signIn} style={styles.signInBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ verticalAlign: 'middle', marginRight: 6 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      )}
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height:         48,
    flexShrink:     0,
    display:        'flex',
    alignItems:     'center',
    gap:            12,
    padding:        '0 16px',
    background:     '#071422',
    borderBottom:   '1px solid rgba(255,255,255,.07)',
    color:          '#ecf0f1',
  },
  logo: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
  },
  logoIcon: {
    fontSize: 18,
  },
  logoText: {
    fontWeight:    600,
    fontSize:      15,
    letterSpacing: '-.3px',
  },
  logoBeta: {
    fontSize:      10,
    background:    'rgba(41,128,185,.3)',
    color:         '#7fb3d3',
    padding:       '1px 6px',
    borderRadius:  4,
    fontWeight:    500,
  },
  datePill: {
    display:    'flex',
    alignItems: 'center',
    gap:        6,
    fontSize:   12,
    color:      '#7f8c8d',
    background: 'rgba(255,255,255,.04)',
    padding:    '3px 10px',
    borderRadius: 20,
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: '50%',
    background:   '#27ae60',
    flexShrink:   0,
  },
  userRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
  },
  avatar: {
    width:        28,
    height:       28,
    borderRadius: '50%',
    border:       '1px solid rgba(255,255,255,.15)',
  },
  userName: {
    fontSize: 13,
    color:    '#bdc3c7',
  },
  signOutBtn: {
    background: 'none',
    border:     '1px solid rgba(255,255,255,.12)',
    borderRadius: 6,
    padding:    '3px 10px',
    fontSize:   12,
    color:      '#7f8c8d',
    cursor:     'pointer',
  },
  signInBtn: {
    display:      'flex',
    alignItems:   'center',
    background:   '#fff',
    border:       'none',
    borderRadius: 6,
    padding:      '5px 12px',
    fontSize:     13,
    fontWeight:   500,
    color:        '#202124',
    cursor:       'pointer',
  },
}
