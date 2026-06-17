import { useState, useEffect } from 'react'
import { fetchAvailableMonths, type AvailableMonth } from '../lib/tileUrl'

interface AvailableMonthsState {
  months:  AvailableMonth[]
  loading: boolean
  error:   string | null
}

export function useAvailableMonths(): AvailableMonthsState {
  const [state, setState] = useState<AvailableMonthsState>({
    months:  [],
    loading: true,
    error:   null,
  })

  useEffect(() => {
    let cancelled = false
    fetchAvailableMonths()
      .then(months => { if (!cancelled) setState({ months, loading: false, error: null }) })
      .catch(e => { if (!cancelled) setState({ months: [], loading: false, error: String(e) }) })
    return () => { cancelled = true }
  }, [])

  return state
}
