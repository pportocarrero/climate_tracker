import { useMemo, useState } from 'react'
import type { AvailableMonth } from '../lib/tileUrl'

interface AnimationControlsProps {
  months:       AvailableMonth[]
  isPlaying:    boolean
  speed:        number
  currentIndex: number
  sequence:     string[]
  loop:         boolean
  onPlay:       (months: string[], startIndex?: number) => void
  onPause:      () => void
  onResume:     () => void
  onStop:       () => void
  onScrub:      (index: number) => void
  onSpeedChange: (speed: number) => void
  onLoopChange:  (loop: boolean) => void
}

const SPEEDS = [0.5, 1, 2, 3]

export function AnimationControls({
  months, isPlaying, speed, currentIndex, sequence, loop,
  onPlay, onPause, onResume, onStop, onScrub, onSpeedChange, onLoopChange,
}: AnimationControlsProps) {
  const sortedDates = useMemo(() => months.map(m => m.date).sort(), [months])

  const [startDate, setStartDate] = useState<string>(sortedDates[0] ?? '')
  const [endDate, setEndDate]     = useState<string>(sortedDates[sortedDates.length - 1] ?? '')

  const hasActiveSequence = sequence.length > 0

  const handlePlay = () => {
    if (hasActiveSequence) {
      // Already have a sequence loaded — just resume/restart it
      onResume()
      return
    }
    const rangeMonths = sortedDates.filter(d => d >= startDate && d <= endDate)
    if (rangeMonths.length > 0) onPlay(rangeMonths)
  }

  return (
    <div style={styles.wrap}>
      {!hasActiveSequence && (
        <>
          <select
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={styles.rangeSelect}
          >
            {sortedDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span style={styles.rangeArrow}>→</span>
          <select
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={styles.rangeSelect}
          >
            {sortedDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </>
      )}

      <button onClick={isPlaying ? onPause : handlePlay} style={styles.playBtn}>
        {isPlaying ? '⏸' : '▶'}
      </button>

      {hasActiveSequence && (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(0, sequence.length - 1)}
            value={currentIndex}
            onChange={(e) => onScrub(Number(e.target.value))}
            style={styles.slider}
          />
          <span style={styles.frameLabel}>
            {sequence[currentIndex]} ({currentIndex + 1}/{sequence.length})
          </span>

          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            style={styles.speedSelect}
          >
            {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
          </select>

          <button
            onClick={() => onLoopChange(!loop)}
            style={{ ...styles.loopBtn, ...(loop ? styles.loopBtnActive : {}) }}
            title="Loop"
          >
            ⟲
          </button>

          <button onClick={onStop} style={styles.stopBtn} title="Stop">
            ✕
          </button>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
  },
  rangeSelect: {
    background:   '#0d2137',
    border:       '1px solid rgba(255,255,255,.12)',
    borderRadius: 6,
    padding:      '5px 8px',
    fontSize:     12,
    color:        '#ecf0f1',
    cursor:       'pointer',
  },
  rangeArrow: {
    color:    'rgba(255,255,255,.4)',
    fontSize: 12,
  },
  playBtn: {
    background:   'rgba(41,128,185,.25)',
    border:       '1px solid rgba(41,128,185,.5)',
    borderRadius: 6,
    padding:      '5px 12px',
    fontSize:     13,
    color:        '#ecf0f1',
    cursor:       'pointer',
    minWidth:     32,
  },
  slider: {
    width:     140,
    accentColor: '#2980b9',
  },
  frameLabel: {
    fontSize:   11,
    color:      'rgba(255,255,255,.6)',
    whiteSpace: 'nowrap',
    minWidth:   110,
  },
  speedSelect: {
    background:   '#0d2137',
    border:       '1px solid rgba(255,255,255,.12)',
    borderRadius: 6,
    padding:      '5px 6px',
    fontSize:     12,
    color:        '#ecf0f1',
    cursor:       'pointer',
  },
  loopBtn: {
    background:   'rgba(255,255,255,.04)',
    border:       '1px solid rgba(255,255,255,.1)',
    borderRadius: 6,
    padding:      '4px 8px',
    fontSize:     13,
    color:        'rgba(255,255,255,.5)',
    cursor:       'pointer',
  },
  loopBtnActive: {
    background: 'rgba(41,128,185,.25)',
    border:     '1px solid rgba(41,128,185,.5)',
    color:      '#ecf0f1',
  },
  stopBtn: {
    background:   'rgba(255,255,255,.04)',
    border:       '1px solid rgba(255,255,255,.1)',
    borderRadius: 6,
    padding:      '4px 9px',
    fontSize:     12,
    color:        'rgba(255,255,255,.5)',
    cursor:       'pointer',
  },
}
