import { useEffect, useState } from 'react'
import type { AppReadiness } from '@shared/types'

/** Loads the app readiness snapshot once on mount. */
export function useReadiness(): { readiness: AppReadiness | null; reload: () => void } {
  const [readiness, setReadiness] = useState<AppReadiness | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    window.stoneBridge
      .getReadiness()
      .then((r) => {
        if (active) setReadiness(r)
      })
      .catch(() => {
        if (active) setReadiness(null)
      })
    return () => {
      active = false
    }
  }, [nonce])

  return { readiness, reload: () => setNonce((n) => n + 1) }
}
