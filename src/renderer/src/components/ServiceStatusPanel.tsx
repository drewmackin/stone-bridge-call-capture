import type { AppReadiness, ServiceStatus } from '@shared/types'

function Dot({ ok, configured }: { ok: boolean; configured: boolean }): JSX.Element {
  const color = ok ? 'bg-emerald-500' : configured ? 'bg-amber-500' : 'bg-navy/25'
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
}

function Row({ name, s }: { name: string; s: ServiceStatus }): JSX.Element {
  return (
    <div className="flex items-start gap-3 py-2">
      <Dot ok={s.ok} configured={s.configured} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-navy">{name}</div>
        <div className="text-xs leading-snug text-navy/55">{s.detail}</div>
      </div>
    </div>
  )
}

export default function ServiceStatusPanel({ readiness }: { readiness: AppReadiness }): JSX.Element {
  return (
    <div className="panel p-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="panel-heading text-xl">Setup status</h2>
        <span className="text-xs uppercase tracking-wide text-navy/40">
          {readiness.operatorState} · {readiness.audioMode}
        </span>
      </div>
      <div className="divide-y divide-navy/5">
        <Row name="AI extraction (Anthropic)" s={readiness.anthropic} />
        <Row name="Transcription" s={readiness.transcription} />
        <Row name="Speaker labels (diarization)" s={readiness.diarization} />
        <Row name="Google Sheets push" s={readiness.sheets} />
        <Row name="Google Calendar follow-ups" s={readiness.calendar} />
      </div>
    </div>
  )
}
