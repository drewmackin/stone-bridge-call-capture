import { useEffect, useRef } from 'react'
import { formatDuration } from '../lib/format'

interface Props {
  canRecord: boolean
  recording: boolean
  /** A just-stopped call is being written to disk — Record waits so a double-click on Stop can't start a new call. */
  busy: boolean
  elapsedSec: number
  hint: string
  /** Subscribe to live per-channel loudness (dBFS) so the button reacts to what is heard. */
  register: (cb: (levels: number[]) => void) => () => void
  onStart: () => void
  onStop: () => void
}

/**
 * The one big control. Gold = ready, red square = recording, gray = not ready
 * (with the reason right under it). A ring breathes with the live input level —
 * functional feedback that the room mic is hearing the call, not decoration.
 */
export default function RecordControl({
  canRecord,
  recording,
  busy,
  elapsedSec,
  hint,
  register,
  onStart,
  onStop
}: Props): JSX.Element {
  const ringRef = useRef<HTMLSpanElement>(null)

  // ~60 updates/s — mutated imperatively, no React re-render.
  useEffect(() => {
    return register((levels) => {
      const db = levels.length ? Math.max(...levels) : -120
      const fill = Math.max(0, Math.min(1, (db + 60) / 60))
      const el = ringRef.current
      if (el) {
        el.style.transform = `scale(${(1 + fill * 0.35).toFixed(3)})`
        el.style.opacity = (0.15 + fill * 0.55).toFixed(3)
      }
    })
  }, [register])

  const ready = canRecord && !busy
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-[104px] w-[104px] items-center justify-center">
        <span
          ref={ringRef}
          aria-hidden="true"
          className={
            'pointer-events-none absolute inset-[10px] rounded-full ' +
            (recording ? 'bg-rec/40' : ready ? 'bg-gold-600/45' : 'bg-ink/10')
          }
          style={{ transform: 'scale(1)', opacity: 0.15, transition: 'transform 80ms linear, opacity 120ms linear' }}
        />
        {recording ? (
          <button
            onClick={onStop}
            aria-label={`Stop recording (${formatDuration(elapsedSec)} recorded)`}
            className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-rec text-white shadow-[0_6px_20px_oklch(var(--rec)/0.35)] transition-transform duration-150 ease-spring hover:brightness-95 active:scale-95"
          >
            <span className="h-7 w-7 rounded-[5px] bg-white" />
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={!ready}
            aria-label="Start recording"
            className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gold-600 text-navy shadow-[0_6px_20px_oklch(var(--gold-800)/0.3)] transition-[transform,background-color] duration-150 ease-spring hover:bg-gold-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink-3 disabled:shadow-none"
          >
            <span className="h-7 w-7 rounded-full bg-current" />
          </button>
        )}
      </div>

      <div className="flex h-7 items-center gap-2 font-mono text-[20px] tabular-nums tracking-tight" aria-live="off">
        {recording && <span className="h-2 w-2 animate-pulse rounded-full bg-rec" aria-hidden="true" />}
        <span className={recording ? 'text-ink' : 'text-ink-3'}>{formatDuration(recording ? elapsedSec : 0)}</span>
      </div>
      <p className="min-h-[18px] max-w-[360px] text-center text-[12px] leading-snug text-ink-2">{hint}</p>
    </div>
  )
}
