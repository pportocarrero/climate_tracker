import { useState, useEffect, useRef }         from 'react'
import { doc, getDoc, setDoc }                 from 'firebase/firestore'
import type { User }                            from 'firebase/auth'
import { db }                                   from '../firebase'
import type { LayerState, UserPreferences }     from '../types'

const DEFAULT_LAYER_STATE: LayerState = {
  activeLayer: 'anomaly',
  showZones:   true,
  showWinds:   false,
  showStorms:  false,
}

export function useUserPrefs(user: User | null) {
  const [layerState, setLayerStateRaw] = useState<LayerState>(DEFAULT_LAYER_STATE)
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  // Load prefs from Firestore when user signs in
  useEffect(() => {
    if (!user) {
      setLayerStateRaw(DEFAULT_LAYER_STATE)
      return
    }
    const ref = doc(db, 'users', user.uid)
    getDoc(ref).then(snap => {
      if (snap.exists()) {
        const prefs = snap.data() as Partial<UserPreferences>
        if (prefs.layerState) setLayerStateRaw(prefs.layerState)
      }
    }).catch(console.error)
  }, [user])

  // Debounced save — only persist after 1 s of inactivity
  const setLayerState = (update: Partial<LayerState>) => {
    const next = { ...layerState, ...update }
    setLayerStateRaw(next)
    if (!user) return
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      const ref = doc(db, 'users', user.uid)
      setDoc(ref, { layerState: next } satisfies Partial<UserPreferences>, { merge: true })
        .catch(console.error)
    }, 1000)
  }

  return { layerState, setLayerState }
}
