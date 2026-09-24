import type { AppReadiness, ServiceStatus } from '@shared/types'
import { AlertIcon, CheckCircleIcon } from './icons'

type Key = 'transcription' | 'anthropic' | 'sheets' | 'calendar' | 'diarization'

// Ordered by what the next call depends on first.
const SERVICES: { key: Key; name: string; optional?: boolean }[] = [
  { key: 'transcription', name: 'Transcription' },
  { key: 'anthropic', name: 'AI lead extraction' },
  { key: 'sheets', name: 'Google Sheets' },
  { key: 'calendar', name: 'Google Calendar follow-ups' },
  { key: 'diarization', name: 'Speaker labels', optional: true }
]

/** Needs attention = a required service that isn't working. Optional ones never count. */
export function setupIssues(r: AppReadiness): number {
  return SERVICES.filter((s) => !s.optional && !r[s.key].ok).length
}

function Row({ name, s, optional }: { name: string; s: ServiceStatus; optional?: boolean }): JSX.Element {
  return (
    <li className="flex items-start gap-2.5 py-2">
      {s.ok ? (
        <CheckCircleIcon className="mt-px h-4 w-4 shrink-0 text-ok" />
      ) : optional && !s.configured ? (
        <span className="mt-[5px] h-1.5 w-4 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
      ) : (
        <AlertIcon className="mt-px h-4 w-4 shrink-0 text-warn" />
      )}
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">
          {name}
          <span className="sr-only">
            {s.ok ? ' — working' : optional && !s.configured ? ' — optional, off' : ' — needs setup'}
          </span>
          {optional && <span className="ml-1.5 text-[11px] font-normal text-ink-3">optional</span>}
        </div>
        <div className="text-[12px] leading-snug text-ink-2">{s.detail}</div>
      </div>
    </li>
  )
}

export default function ServiceStatusPanel({
  readiness,
  onlyProblems = false
}: {
  readiness: AppReadiness
  onlyProblems?: boolean
}): JSX.Element {
  const rows = SERVICES.filter((s) => !onlyProblems || (!s.optional && !readiness[s.key].ok))
  return (
    <ul className="divide-y divide-line">
      {rows.map((s) => (
        <Row key={s.key} name={s.name} s={readiness[s.key]} optional={s.optional} />
      ))}
    </ul>
  )
}
