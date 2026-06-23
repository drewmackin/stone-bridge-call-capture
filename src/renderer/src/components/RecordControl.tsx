import { useEffect, useRef } from 'react'

interface Props {
  canRecord: boolean
  recording: boolean
  elapsedSec: number
  blockedReason: string
  /** Subscribe to live per-channel loudness (dBFS) so the button reacts to what is heard. */
  register: (cb: (levels: number[]) => void) => () => void
  onStart: () => void
  onStop: () => void
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RecordControl({
  canRecord,
  recording,
  elapsedSec,
  blockedReason,
  register,
  onStart,
  onStop
}: Props): JSX.Element {
  const ringRef = useRef<HTMLSpanElement>(null)

  // Drive a reactive ring from the live mic loudness so the button visibly
  // responds to what's actually being heard — both before and during recording.
  // Mutated imperatively (no React re-render) since it updates ~60×/sec.
  useEffect(() => {
    const unsub = register((levels) => {
      const db = levels.length ? Math.max(...levels) : -120
      const fill = Math.max(0, Math.min(1, (db + 60) / 60))
      const el = ringRef.current
      if (el) {
        el.style.transform = `scale(${(1 + fill * 0.6).toFixed(3)})`
        el.style.opacity = (0.12 + fill * 0.6).toFixed(3)
      }
    })
    return unsub
  }, [register])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex h-32 w-32 items-center justify-center">
        {/* Live-volume ring — scales/brightens with the input level. */}
        <span
          ref={ringRef}
          aria-hidden
          className={
            'pointer-events-none absolute inset-2 rounded-full ' +
            (recording ? 'bg-red-500/40' : canRecord ? 'bg-gold/40' : 'bg-navy/20')
          }
          style={{
            transform: 'scale(1)',
            opacity: 0.12,
            transition: 'transform 70ms linear, opacity 120ms linear'
          }}
        />
        {recording ? (
          <button
            onClick={onStop}
            className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-700"
          >
            <span className="h-7 w-7 rounded-[4px] bg-white" />
            <span className="mt-2 text-xs font-medium uppercase tracking-wide">Stop</span>
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={!canRecord}
            className="relative z-10 flex h-28 w-28 flex-col items-center justify-center rounded-full bg-gold text-navy shadow-lg transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:bg-navy/15 disabled:text-navy/40"
          >
            <span className="h-8 w-8 rounded-full bg-current opacity-90" />
            <span className="mt-2 text-xs font-medium uppercase tracking-wide">Record</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 font-mono text-lg text-navy">
        {recording && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />}
        <span className={recording ? 'text-navy' : 'text-navy/40'}>{fmt(elapsedSec)}</span>
      </div>

      {!canRecord && !recording && (
        <p className="max-w-xs text-center text-sm text-navy/60">{blockedReason}</p>
      )}
    </div>
  )
}
