import { useState, useCallback, useEffect, useRef } from 'react'
import { Globe }               from './components/Globe'
import { Sidebar }             from './components/Sidebar'
import { TopBar }              from './components/TopBar'
import { DatePicker }          from './components/DatePicker'
import { AnimationControls }   from './components/AnimationControls'
import { useManifest }         from './hooks/useManifest'
import { useAuth }             from './hooks/useAuth'
import { useUserPrefs }        from './hooks/useUserPrefs'
import { useAvailableMonths }  from './hooks/useAvailableMonths'
import { useAnimation }        from './hooks/useAnimation'
import { prefetchTiles }       from './lib/tileUrl'
import { ensureManifestCached } from './lib/manifestCache'

const PREFETCH_AHEAD = 3   // how many upcoming frames to preload during playback

export default function App() {
  // null = "current conditions" (latest.json); a "YYYY-MM" string = historical
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { manifest, loading, error } = useManifest(selectedDate)
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const { layerState, setLayerState } = useUserPrefs(user)
  const { months, loading: monthsLoading } = useAvailableMonths()

  // Animation drives selectedDate the same way the DatePicker does — each
  // frame just becomes the new selectedDate, so Globe/Sidebar don't need
  // to know whether a date came from manual selection or playback.
  const handleFrame = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  const animation = useAnimation({ onFrame: handleFrame, baseIntervalMs: 800 })

  // Prefetch upcoming frames' tiles AND manifests while playing, so
  // playback never has to wait on a network request — both the tile
  // images and the manifest (Nino indices, condition) for the next few
  // frames are already warm in their respective caches by the time
  // playback reaches them.
  const prefetchedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!animation.isPlaying) return
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const aheadIndex = animation.currentIndex + i
      const aheadDate  = animation.sequence[aheadIndex]
      if (aheadDate && !prefetchedRef.current.has(aheadDate)) {
        prefetchedRef.current.add(aheadDate)
        prefetchTiles(aheadDate, layerState.activeLayer)
        ensureManifestCached(aheadDate)
      }
    }
  }, [animation.isPlaying, animation.currentIndex, animation.sequence, layerState.activeLayer])

  // Manually picking a date while an animation sequence is loaded should
  // stop playback — otherwise the timer would immediately override the
  // user's manual choice on the next tick.
  const handleManualSelect = useCallback((date: string | null) => {
    if (animation.sequence.length > 0) animation.stop()
    setSelectedDate(date)
  }, [animation])

  // Prefetch the first several frames BEFORE starting playback, so even
  // the opening frames are warm — otherwise only frames discovered via the
  // ahead-of-playback effect above would benefit, leaving a stutter right
  // at the start of every new animation run.
  const handlePlay = useCallback((seqMonths: string[], startIndex = 0) => {
    for (let i = 0; i < PREFETCH_AHEAD && startIndex + i < seqMonths.length; i++) {
      const date = seqMonths[startIndex + i]
      prefetchedRef.current.add(date)
      prefetchTiles(date, layerState.activeLayer)
      ensureManifestCached(date)
    }
    animation.play(seqMonths, startIndex)
  }, [animation, layerState.activeLayer])

  const currentDate = selectedDate === null ? manifest?.date ?? null : null

  // Only show the loading overlay for a "cold" load (first visit, no
  // animation running) — during animation, brief per-frame loading states
  // would otherwise flicker the overlay in and out disruptively. Thanks to
  // prefetching + caching, frames are normally already warm by playback
  // time anyway; this is just a safety net for the rare cache-miss case.
  const showLoadingOverlay = loading && !animation.isPlaying

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
          onSelect={handleManualSelect}
          loading={monthsLoading}
        />
        <div style={styles.toolbarDivider} />
        <AnimationControls
          months={months}
          isPlaying={animation.isPlaying}
          speed={animation.speed}
          currentIndex={animation.currentIndex}
          sequence={animation.sequence}
          loop={animation.loop}
          onPlay={handlePlay}
          onPause={animation.pause}
          onResume={animation.resume}
          onStop={animation.stop}
          onScrub={animation.scrubTo}
          onSpeedChange={animation.setSpeed}
          onLoopChange={animation.setLoop}
        />
      </div>
      <div style={styles.body}>
        <div style={styles.globeWrap}>
          <Globe
            manifest={manifest}
            layerState={layerState}
          />
          {showLoadingOverlay && (
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
    flexWrap:       'wrap',
    gap:            8,
  },
  toolbarDivider: {
    width:      1,
    height:     20,
    background: 'rgba(255,255,255,.1)',
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
