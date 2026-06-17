import { useMemo } from 'react'
import type { AvailableMonth } from '../lib/tileUrl'
import { CONDITION_META } from '../lib/condition'
import type { EnsoCondition } from '../types'

interface DatePickerProps {
  months:        AvailableMonth[]
  selectedDate:  string | null   // null = "current conditions"
  currentDate:   string | null   // the actual latest.json date, for the button label
  onSelect:      (date: string | null) => void
  loading:       boolean
}

export function DatePicker({ months, selectedDate, currentDate, onSelect, loading }: DatePickerProps) {
  // Group months by year for a cleaner dropdown
  const byYear = useMemo(() => {
    const groups: Record<string, AvailableMonth[]> = {}
    for (const m of months) {
      const year = m.date.slice(0, 4)
      if (!groups[year]) groups[year] = []
      groups[year].push(m)
    }
    return groups
  }, [months])

  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))   // newest year first

  return (
    <div style={styles.wrap}>
      <button
        onClick={() => onSelect(null)}
        style={{
          ...styles.currentBtn,
          ...(selectedDate === null ? styles.currentBtnActive : {}),
        }}
      >
        <span style={styles.liveDot} />
        Current{currentDate ? ` (${currentDate})` : ''}
      </button>

      <select
        value={selectedDate ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={loading || months.length === 0}
        style={styles.select}
      >
        <option value="">— Historical month —</option>
        {years.map(year => (
          <optgroup key={year} label={year}>
            {byYear[year]
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))   // newest month first within year
              .map(m => {
                const meta = CONDITION_META[m.condition as EnsoCondition]
                return (
                  <option key={m.date} value={m.date}>
                    {m.date}  {meta ? `· ${meta.shortLabel}` : ''}  ({m.nino34 >= 0 ? '+' : ''}{m.nino34.toFixed(1)}°)
                  </option>
                )
              })}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
  },
  currentBtn: {
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    background:   'rgba(255,255,255,.04)',
    border:       '1px solid rgba(255,255,255,.1)',
    borderRadius: 6,
    padding:      '5px 12px',
    fontSize:     12,
    color:        '#bdc3c7',
    cursor:       'pointer',
  },
  currentBtnActive: {
    background: 'rgba(41,128,185,.25)',
    border:     '1px solid rgba(41,128,185,.5)',
    color:      '#ecf0f1',
  },
  liveDot: {
    width:        6,
    height:       6,
    borderRadius: '50%',
    background:   '#27ae60',
    flexShrink:   0,
  },
  select: {
    background:   '#0d2137',
    border:       '1px solid rgba(255,255,255,.12)',
    borderRadius: 6,
    padding:      '5px 10px',
    fontSize:     12,
    color:        '#ecf0f1',
    cursor:       'pointer',
    maxWidth:     220,
  },
}
