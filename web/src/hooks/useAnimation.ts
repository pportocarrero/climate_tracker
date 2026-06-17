import { useState, useEffect, useRef, useCallback } from 'react'

export interface AnimationState {
  isPlaying:   boolean
  speed:       number          // multiplier: 0.5x, 1x, 2x, 3x
  currentIndex: number         // index into the sequence array
  sequence:    string[]        // ordered list of "YYYY-MM" dates being played
}

interface UseAnimationOptions {
  onFrame: (date: string) => void   // called whenever the current frame changes
  baseIntervalMs?: number           // time between frames at 1x speed
}

/**
 * Manages playback through a sequence of months. The CALLER owns what
 * "selectedDate" means in the rest of the app — this hook just advances
 * an index over time and calls onFrame with the corresponding date string,
 * so App.tsx can feed that straight into the same selectedDate state the
 * DatePicker already drives.
 */
export function useAnimation({ onFrame, baseIntervalMs = 800 }: UseAnimationOptions) {
  const [isPlaying, setIsPlaying]   = useState(false)
  const [speed, setSpeed]           = useState(1)
  const [currentIndex, setIndex]    = useState(0)
  const [sequence, setSequence]     = useState<string[]>([])
  const [loop, setLoop]             = useState(true)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start playing a specific sequence of months (e.g. all months between
  // a start and end date selected in the range picker).
  const play = useCallback((months: string[], startIndex = 0) => {
    if (months.length === 0) return
    setSequence(months)
    setIndex(startIndex)
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => setIsPlaying(false), [])
  const resume = useCallback(() => {
    if (sequence.length > 0) setIsPlaying(true)
  }, [sequence])

  const stop = useCallback(() => {
    setIsPlaying(false)
    setSequence([])
    setIndex(0)
  }, [])

  const scrubTo = useCallback((index: number) => {
    setIndex(Math.max(0, Math.min(index, sequence.length - 1)))
  }, [sequence.length])

  // The actual timer — advances currentIndex every (baseIntervalMs / speed) ms
  useEffect(() => {
    if (!isPlaying || sequence.length === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    const intervalMs = baseIntervalMs / speed
    intervalRef.current = setInterval(() => {
      setIndex(prev => {
        const next = prev + 1
        if (next >= sequence.length) {
          if (loop) return 0
          setIsPlaying(false)
          return prev   // stay on the last frame when not looping
        }
        return next
      })
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, speed, sequence.length, baseIntervalMs, loop])

  // Fire onFrame whenever the current frame's date actually changes
  useEffect(() => {
    if (sequence.length > 0 && sequence[currentIndex]) {
      onFrame(sequence[currentIndex])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, sequence])

  return {
    isPlaying,
    speed,
    setSpeed,
    currentIndex,
    sequence,
    loop,
    setLoop,
    play,
    pause,
    resume,
    stop,
    scrubTo,
  }
}
