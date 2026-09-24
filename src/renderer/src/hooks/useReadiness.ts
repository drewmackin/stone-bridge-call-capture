import { useCallback, useEffect, useState } from 'react'
import type { AppReadiness } from '@shared/types'
import { errorText } from '../lib/format'

/** The setup snapshot (which services are wired up). Loads on mount; reload() re-checks. */
export function useReadiness(): {
  readiness: AppReadiness | null
  error: string | null
  checking: boolean
  reload: () => void
} {
  const [readiness, setReadiness] = useState<AppReadiness | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    setChecking(true)
    window.stoneBridge
      .getReadiness()
      .then((r) => {
        if (!active) return
        setReadiness(r)
        setError(null)
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { readiness, error, checking, reload }
}
