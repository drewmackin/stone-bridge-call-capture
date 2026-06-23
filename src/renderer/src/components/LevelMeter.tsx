import { useEffect, useState } from 'react'

interface Props {
  register: (cb: (levels: number[]) => void) => () => void
  channels: number
  audioMode: 'speakerphone' | 'loopback'
}

/** Map dBFS (~-60..0) to a 0..1 fill. */
function dbToFill(db: number): number {
  return Math.max(0, Math.min(1, (db + 60) / 60))
}

function Bar({ label, fill, active }: { label: string; fill: number; active: boolean }): JSX.Element {
  const pct = Math.round(fill * 100)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-navy/70">{label}</span>
        <span className={'text-[10px] ' + (active ? 'text-emerald-600' : 'text-navy/30')}>
          {active ? 'signal' : 'silent'}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-navy/10">
        <div
          className={
            'h-full rounded-full transition-[width] duration-75 ' +
            (fill > 0.92 ? 'bg-red-500' : fill > 0.05 ? 'bg-emerald-500' : 'bg-navy/20')
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function LevelMeter({ register, channels, audioMode }: Props): JSX.Element {
  // Peak-hold with slow decay so a brief silence between words doesn't flip the
  // meter to "silent" — the false negative the pre-recording check must avoid.
  const [held, setHeld] = useState<number[]>([])

  useEffect(() => {
    const unsub = register((levels) => {
      setHeld((prev) => levels.map((db, i) => Math.max(db, (prev[i] ?? -120) - 0.8)))
    })
    return unsub
  }, [register])

  const labels =
    audioMode === 'loopback'
      ? ['You (microphone)', 'Caller (system audio)']
      : ['Microphone — both voices']

  const fills = (channels >= 2 ? [0, 1] : [0]).map((c) => dbToFill(held[c] ?? -120))

  return (
    <div className="rounded-lg border border-navy/10 bg-parchment/40 p-3">
      <div className="space-y-2">
        {fills.map((f, i) => (
          <Bar key={i} label={labels[i] ?? `Channel ${i + 1}`} fill={f} active={f > 0.05} />
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-navy/50">
        Before recording, confirm the meter moves for <span className="font-medium">both</span> your
        voice and the caller’s voice on speaker. A flat meter means the recorder will capture
        silence — the most common mistake.
      </p>
    </div>
  )
}
