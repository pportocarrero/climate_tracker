import type { EnsoCondition } from '../types'

export interface ConditionMeta {
  label:      string
  shortLabel: string
  color:      string      // CSS color for the badge
  bg:         string      // Badge background
  description: string
}

export const CONDITION_META: Record<EnsoCondition, ConditionMeta> = {
  'strong-el-nino': {
    label:       'Strong El Niño',
    shortLabel:  'El Niño',
    color:       '#fff',
    bg:          '#c0392b',
    description: 'Niño 3.4 anomaly ≥ +1.5°C — significant warming of the central-eastern Pacific.',
  },
  'moderate-el-nino': {
    label:       'Moderate El Niño',
    shortLabel:  'El Niño',
    color:       '#fff',
    bg:          '#e74c3c',
    description: 'Niño 3.4 anomaly +0.9°C to +1.5°C.',
  },
  'weak-el-nino': {
    label:       'Weak El Niño',
    shortLabel:  'El Niño',
    color:       '#fff',
    bg:          '#e67e22',
    description: 'Niño 3.4 anomaly +0.5°C to +0.9°C.',
  },
  'neutral': {
    label:       'Neutral',
    shortLabel:  'Neutral',
    color:       '#111',
    bg:          '#dfe6e9',
    description: 'SST anomalies within ±0.5°C of the 1991–2020 baseline.',
  },
  'weak-la-nina': {
    label:       'Weak La Niña',
    shortLabel:  'La Niña',
    color:       '#fff',
    bg:          '#2980b9',
    description: 'Niño 3.4 anomaly −0.5°C to −0.9°C.',
  },
  'moderate-la-nina': {
    label:       'Moderate La Niña',
    shortLabel:  'La Niña',
    color:       '#fff',
    bg:          '#2471a3',
    description: 'Niño 3.4 anomaly −0.9°C to −1.5°C.',
  },
  'strong-la-nina': {
    label:       'Strong La Niña',
    shortLabel:  'La Niña',
    color:       '#fff',
    bg:          '#1a5276',
    description: 'Niño 3.4 anomaly ≤ −1.5°C — significant cooling of the central-eastern Pacific.',
  },
}
