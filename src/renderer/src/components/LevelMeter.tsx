import { useEffect, useRef, useState } from 'react'

interface Props {
  register: (cb: (levels: number[]) => void) => () => void
  channels: number
  audioMode: 'speakerphone' | 'loopback'
  /** False when no device is open — the meter drops to silent instead of freezing. */
  active: boolean
}

/** Map dBFS (~-60..0) to a 0..1 fill. */
function dbToFill(db: number): number {
  return Math.max(0, Math.min(1, (db + 60) / 60))
}
const SIGNAL = 0.08 // fill above which a channel counts as "hearing something"

/**
 * Live input meter — the pre-call check that BOTH voices reach the recorder.
 * Bars update imperatively at display rate (no React re-render per frame); only
 * the per-channel Signal/Silent words re-render, and only when they flip.
 * Peak-hold with slow decay so a pause between words doesn't read as silence.
 * The color ramp is fixed to the track (green → gold → red near clipping), so a
 * bar's color always means its level.
 */
export default function LevelMeter({ register, channels, audioMode, active }: Props): JSX.Element {
  const loopback = audioMode === 'loopback' && channels >= 2
  // Speakerphone: one room mic hears both voices → one bar (max of the device's
  // channels). Loopback: mic and system audio are separate → one bar each.
  const labels = loopback ? ['You · microphone', 'Caller · system audio'] : ['Room mic · both voices']
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const held = useRef<number[]>([])
  const [signal, setSignal] = useState<boolean[]>(labels.map(() => false))
  const signalRef = useRef(signal)

  useEffect(() => {
    const paint = (fills: number[]): void => {
      fills.forEach((f, i) => {
        const el = barRefs.current[i]
        if (el) el.style.clipPath = `inset(0 ${((1 - f) * 100).toFixed(1)}% 0 0)`
      })
      const next = fills.map((f) => f > SIGNAL)
      if (next.some((v, i) => v !== signalRef.current[i])) {
        signalRef.current = next
        setSignal(next)
      }
    }
    if (!active) {
      held.current = []
      paint(labels.map(() => 0))
      return
    }
    return register((levels) => {
      const perBar = loopback ? [levels[0] ?? -120, levels[1] ?? -120] : [Math.max(-120, ...levels)]
      held.current = perBar.map((db, i) => Math.max(db, (held.current[i] ?? -120) - 0.8))
      paint(held.current.map(dbToFill))
    })
    // labels derive from loopback; re-subscribe when the layout or activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, active, loopback])

  return (
    <div className="space-y-2.5">
      {labels.map((label, i) => (
        <div key={label}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-2">{label}</span>
            <span
              className={
                'inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] ' +
                (signal[i] ? 'text-ok' : 'text-ink-3')
              }
            >
              <span className={'h-1.5 w-1.5 rounded-full ' + (signal[i] ? 'bg-ok-dot' : 'bg-ink-3/50')} />
              {signal[i] ? 'Hearing audio' : 'Silent'}
            </span>
          </div>
          <div
            className="relative h-2.5 overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line"
            role="meter"
            aria-label={`${label} input level`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={signal[i] ? 'Hearing audio' : 'Silent'}
          >
            <div
              ref={(el) => (barRefs.current[i] = el)}
              className="absolute inset-0 rounded-full"
              style={{
                clipPath: 'inset(0 100% 0 0)',
                background:
                  'linear-gradient(90deg, oklch(var(--ok-dot)) 0%, oklch(var(--ok-dot)) 62%, oklch(var(--gold-600)) 80%, oklch(var(--rec)) 96%)'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
