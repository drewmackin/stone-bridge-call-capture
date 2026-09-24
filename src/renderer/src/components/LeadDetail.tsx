import { useCallback, useEffect, useId, useMemo, useState, type MutableRefObject, type ReactNode } from 'react'
import type { CallAnalysis, Lead, PipelineProgress } from '@shared/types'
import { EDITABLE_LEAD_FIELDS } from '@shared/types'
import { visibleSheetColumns } from '@shared/sheet-view'
import ConfirmDialog from './ConfirmDialog'
import StatusBadge from './StatusBadge'
import { Notice, type ToastMsg } from './Notice'
import {
  AlertIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ExternalIcon,
  GaugeIcon,
  RefreshIcon,
  RestoreIcon,
  SheetIcon,
  SpinnerIcon,
  TrashIcon,
  UploadIcon
} from './icons'
import { errorText, formatMeeting, formatWhen } from '../lib/format'
import type { LeaveGuard } from '../App'

interface Props {
  leadId: string
  onBack: () => void
  onChanged: () => void
  leaveGuard: MutableRefObject<LeaveGuard | null>
}

type Confirm = null | 'permanent' | 'discard'

/** One labelled field; "not captured" is spelled out, never color alone. */
function Field({
  label,
  value,
  onChange,
  multiline = false,
  className = '',
  placeholder = 'not captured'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  className?: string
  placeholder?: string
}): JSX.Element {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="t-label mb-1.5 block">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="space-y-3 border-t border-line px-5 py-4 first:border-t-0">
      <h3 id={id} className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gold-800">
        {title}
      </h3>
      {children}
    </div>
  )
}

/** Speaker-prefixed transcript lines ("Seller: …") get a quiet speaker label. */
function Transcript({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n').filter((l) => l.trim())
  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed text-ink">
      {lines.map((line, i) => {
        const m = /^([A-Za-z][\w .'-]{0,24}):\s?(.*)$/.exec(line)
        return m ? (
          <p key={i}>
            <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{m[1]}</span>
            {m[2]}
          </p>
        ) : (
          <p key={i}>{line}</p>
        )
      })}
    </div>
  )
}

const STATUS_OPTIONS: { value: Lead['status']; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Approved' },
  { value: 'pushed', label: 'In Sheet' },
  { value: 'archived', label: 'Archived' }
]

export default function LeadDetail({ leadId, onBack, onChanged, leaveGuard }: Props): JSX.Element {
  const [lead, setLead] = useState<Lead | null>(null)
  const [draft, setDraft] = useState<Lead | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [processing, setProcessing] = useState<PipelineProgress | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [msg, setMsg] = useState<ToastMsg | null>(null)

  const load = useCallback(async () => {
    try {
      const l = await window.stoneBridge.getLead(leadId)
      if (!l) {
        setNotFound(true)
        return
      }
      setLead(l)
      setDraft(l)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  // Only operator-editable fields count as "unsaved".
  const dirty = useMemo(
    () => !!lead && !!draft && EDITABLE_LEAD_FIELDS.some((k) => draft[k] !== lead[k]),
    [lead, draft]
  )

  // Let the app ask before navigation throws edits away.
  useEffect(() => {
    leaveGuard.current = () => dirty
    return () => {
      leaveGuard.current = null
    }
  }, [dirty, leaveGuard])

  // Reprocessing progress for THIS lead (Transcribe again).
  useEffect(() => {
    return window.stoneBridge.onPipelineProgress((p) => {
      if (p.leadId !== leadId) return
      setProcessing(p)
      if (p.stage === 'done' || p.stage === 'error') {
        void load()
        onChanged()
      }
    })
  }, [leadId, load, onChanged])

  const analysis = useMemo<CallAnalysis | null>(() => {
    if (!lead?.call_analysis) return null
    try {
      return JSON.parse(lead.call_analysis) as CallAnalysis
    } catch {
      return null
    }
  }, [lead?.call_analysis])

  const save = useCallback(
    async (extra: Partial<Lead> = {}): Promise<Lead | null> => {
      if (!lead || !draft) return null
      setSaving(true)
      try {
        const patch: Partial<Lead> = {}
        const next = { ...draft, ...extra }
        for (const k of EDITABLE_LEAD_FIELDS) {
          if (next[k] !== lead[k]) (patch as Record<string, unknown>)[k] = next[k]
        }
        const updated = Object.keys(patch).length ? await window.stoneBridge.updateLead(leadId, patch) : lead
        setLead(updated)
        setDraft(updated)
        onChanged()
        return updated
      } catch (e) {
        setMsg({ tone: 'danger', text: `Save failed: ${errorText(e)}` })
        return null
      } finally {
        setSaving(false)
      }
    },
    [lead, draft, leadId, onChanged]
  )

  // ⌘S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty && !saving) void save()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dirty, saving, save])

  if (notFound || loadError) {
    return (
      <div className="space-y-4">
        <button className="btn-quiet -ml-2" onClick={onBack}>
          <ChevronLeftIcon className="h-4 w-4" /> Leads
        </button>
        <Notice
          tone={notFound ? 'info' : 'danger'}
          title={notFound ? 'This lead no longer exists' : 'Couldn’t open this lead'}
          action={
            !notFound && (
              <button className="btn-secondary btn-sm" onClick={() => void load()}>
                Try again
              </button>
            )
          }
        >
          {notFound ? 'It may have been deleted permanently.' : loadError}
        </Notice>
      </div>
    )
  }
  if (!lead || !draft) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] text-ink-3" role="status">
        <SpinnerIcon className="h-4 w-4" /> Loading lead…
      </div>
    )
  }

  const set = (patch: Partial<Lead>): void => setDraft((d) => (d ? { ...d, ...patch } : d))
  const isTrashed = !!lead.deleted_at
  const busy = saving || pushing
  const reprocessing = !!processing && ['saving', 'transcribing', 'extracting'].includes(processing.stage)
  const canTranscribe = !!lead.audio_path && !isTrashed

  const goBack = (): void => (dirty ? setConfirm('discard') : onBack())

  const push = async (): Promise<void> => {
    setPushing(true)
    setMsg(null)
    const hadEvent = !!lead.calendar_event_id
    try {
      const r = await window.stoneBridge.pushLead(leadId)
      const parts = [r.ok ? `Pushed to row ${r.row} of your Sheet${r.created ? '' : ' (updated)'}.` : `Push failed: ${r.error}`]
      if (r.calendar) {
        if (r.calendar.skipped) parts.push(hadEvent ? 'Meeting cleared, so its calendar event was removed.' : 'No meeting time, so no calendar event.')
        else parts.push(r.calendar.ok ? `Calendar event ${r.calendar.created ? 'created' : 'updated'}.` : `Calendar failed: ${r.calendar.error}`)
      }
      const ok = r.ok && (!r.calendar || r.calendar.ok || r.calendar.skipped)
      setMsg({ tone: ok ? 'ok' : r.ok ? 'warn' : 'danger', text: parts.filter(Boolean).join(' ') })
      await load()
      onChanged()
    } catch (e) {
      setMsg({ tone: 'danger', text: `Push failed: ${errorText(e)} Your local record is safe.` })
    } finally {
      setPushing(false)
    }
  }

  const approve = async (): Promise<void> => {
    const updated = await save({ status: 'reviewed' })
    if (updated) setMsg({ tone: 'ok', text: 'Approved. Push it to the Sheet when you’re ready.' })
  }

  const analyze = async (): Promise<void> => {
    setAnalyzing(true)
    setMsg(null)
    try {
      const updated = await window.stoneBridge.analyzeCall(leadId)
      // Merge ONLY the scorecard — never overwrite edits in progress.
      setLead((l) => (l ? { ...l, call_analysis: updated.call_analysis } : l))
      setDraft((d) => (d ? { ...d, call_analysis: updated.call_analysis } : d))
    } catch (e) {
      setMsg({ tone: 'danger', text: `Call analysis failed: ${errorText(e)}` })
    } finally {
      setAnalyzing(false)
    }
  }

  const transcribeAgain = async (): Promise<void> => {
    setMsg(null)
    setProcessing({ leadId, stage: 'transcribing', message: 'Starting…', retryable: false, audioPathSafe: lead.audio_path })
    try {
      await window.stoneBridge.retryProcessing(leadId)
    } catch (e) {
      setProcessing(null)
      setMsg({ tone: 'danger', text: `Processing failed: ${errorText(e)}` })
      void load()
    }
  }

  const moveToTrash = async (): Promise<void> => {
    try {
      await window.stoneBridge.softDeleteLead(leadId)
      leaveGuard.current = null
      onChanged()
      onBack()
    } catch (e) {
      setMsg({ tone: 'danger', text: `Couldn’t move to Trash: ${errorText(e)}` })
    }
  }
  const restore = async (): Promise<void> => {
    try {
      await window.stoneBridge.restoreLead(leadId)
      await load()
      onChanged()
      setMsg({ tone: 'ok', text: 'Restored from the Trash.' })
    } catch (e) {
      setMsg({ tone: 'danger', text: `Restore failed: ${errorText(e)}` })
    }
  }
  const permanentDelete = async (alsoRemoveSheetRow: boolean): Promise<void> => {
    try {
      if (alsoRemoveSheetRow && lead.sheet_row != null) {
        // deleteSheetRow reports failure in its result — stop rather than orphan the row.
        const r = await window.stoneBridge.deleteSheetRow(leadId)
        if (!r.ok) {
          setMsg({ tone: 'danger', text: `Couldn’t remove the Sheet row, so nothing was deleted: ${r.error}` })
          return
        }
      }
      await window.stoneBridge.permanentDeleteLead(leadId)
      leaveGuard.current = null
      onChanged()
      onBack()
    } catch (e) {
      setMsg({ tone: 'danger', text: `Delete failed: ${errorText(e)}` })
    }
  }

  // ---- Primary action: exactly one, chosen by state ------------------------
  let primary: JSX.Element | null = null
  if (isTrashed) {
    primary = (
      <button className="btn-primary" onClick={restore}>
        <RestoreIcon className="h-3.5 w-3.5" /> Restore
      </button>
    )
  } else if (dirty) {
    primary = (
      <button className="btn-primary" onClick={() => void save()} disabled={busy}>
        {saving ? <SpinnerIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    )
  } else if (lead.status === 'new') {
    primary = (
      <button className="btn-primary" onClick={() => void approve()} disabled={busy}>
        <CheckIcon className="h-3.5 w-3.5" /> Approve
      </button>
    )
  } else if (lead.status === 'reviewed' || lead.status === 'pushed') {
    primary = (
      <button
        className={lead.status === 'pushed' ? 'btn-secondary' : 'btn-primary'}
        onClick={() => void push()}
        disabled={busy || reprocessing}
      >
        {pushing ? <SpinnerIcon className="h-3.5 w-3.5" /> : lead.status === 'pushed' ? <RefreshIcon className="h-3.5 w-3.5" /> : <UploadIcon className="h-3.5 w-3.5" />}
        {pushing ? 'Pushing…' : lead.status === 'pushed' ? 'Re-push to Sheet' : 'Push to Sheet'}
      </button>
    )
  }

  const score = analysis ? Math.max(0, Math.min(100, Math.round(analysis.score))) : null

  return (
    <div className="space-y-4">
      {/* ---- Header ---------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <button className="btn-quiet -ml-2" onClick={goBack}>
          <ChevronLeftIcon className="h-4 w-4" /> Leads
        </button>
        <div className="flex items-center gap-2">
          {dirty && !isTrashed && (
            <button className="btn-quiet" onClick={() => setDraft(lead)} disabled={busy}>
              Revert
            </button>
          )}
          {primary}
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={'t-title ' + (lead.name ? '' : 'italic text-ink-3')}>{lead.name || 'Name not captured'}</h1>
            <StatusBadge lead={lead} />
          </div>
          <p className="t-meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Captured {formatWhen(lead.created_at)}</span>
            {lead.sheet_row != null && (
              <span className="inline-flex items-center gap-1">
                <SheetIcon className="h-3.5 w-3.5" /> Row {lead.sheet_row} in your Sheet
              </span>
            )}
            {lead.calendar_event_link && (
              <a
                href={lead.calendar_event_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-gold-800 underline decoration-gold-800/30 underline-offset-2 hover:decoration-gold-800"
              >
                <CalendarIcon className="h-3.5 w-3.5" /> Calendar event <ExternalIcon className="h-3 w-3" />
              </a>
            )}
            {score !== null && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded hover:text-ink"
                onClick={() => document.getElementById('scorecard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <GaugeIcon className="h-3.5 w-3.5" /> Call score {score}
              </button>
            )}
          </p>
        </div>
        {!isTrashed && (
          <div role="radiogroup" aria-label="Status" className="flex items-center gap-0.5 rounded-[9px] bg-ink/[0.05] p-[3px]">
            {STATUS_OPTIONS.map((o) => {
              const disabled = o.value === 'pushed' && lead.status !== 'pushed'
              const active = draft.status === o.value
              return (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={active}
                  disabled={disabled || busy}
                  title={disabled ? 'Set automatically when the lead is pushed' : undefined}
                  onClick={() => set({ status: o.value })}
                  className={
                    'h-7 rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed ' +
                    (active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink disabled:text-ink-3/60')
                  }
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        )}
      </header>

      {/* ---- Messages ---------------------------------------------------------- */}
      <div className="space-y-2 empty:hidden">
        {msg && (
          <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Notice>
        )}
        {isTrashed && (
          <Notice tone="info" title="This lead is in the Trash">
            It’s hidden from your lists. Restore it, or delete it permanently at the bottom of this page.
          </Notice>
        )}
        {lead.needs_review && lead.status === 'new' && !isTrashed && (
          <Notice tone="warn" title="Check this lead before approving it">
            The AI couldn’t fill every field with confidence, so uncertain ones were left blank — nothing was guessed.
            Compare each field with the transcript.
          </Notice>
        )}
        {dirty && lead.status === 'pushed' && (
          <Notice tone="info">This lead is already in your Sheet. After saving, re-push it to update the row.</Notice>
        )}
        {reprocessing && (
          <Notice tone="info" title="Processing the recording…">
            {processing?.message}
          </Notice>
        )}
        {processing?.stage === 'error' && (
          <Notice tone="danger" title="Processing stopped" onDismiss={() => setProcessing(null)}>
            {processing.message}
          </Notice>
        )}
      </div>

      {/* ---- Transcript | fields ---------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-2">
        <section
          className="card flex max-h-[calc(100vh-var(--toolbar-h)-var(--footer-h)-40px)] min-h-[280px] flex-col min-[960px]:sticky min-[960px]:top-[calc(var(--toolbar-h)+16px)] min-[960px]:self-start"
          aria-labelledby="transcript-heading"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 id="transcript-heading" className="t-heading">
              Transcript
            </h2>
            {canTranscribe && (
              <button
                className="btn-quiet btn-sm -mr-2"
                onClick={() => void transcribeAgain()}
                disabled={reprocessing || dirty || busy}
                title={dirty ? 'Save or revert your edits first — processing refills the fields' : 'Transcribe and extract this recording again'}
              >
                {reprocessing ? <SpinnerIcon className="h-3.5 w-3.5" /> : <RefreshIcon className="h-3.5 w-3.5" />}
                {lead.transcript_text ? 'Process again' : 'Transcribe'}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {lead.transcript_text ? (
              <Transcript text={lead.transcript_text} />
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-3">
                {lead.audio_path
                  ? 'No transcript yet. The recording is saved — press Transcribe to process it.'
                  : 'No transcript — this lead was added by hand.'}
              </p>
            )}
          </div>
        </section>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            if (dirty) void save()
          }}
          aria-label="Lead details"
        >
          <fieldset disabled={busy || isTrashed} className="min-w-0">
            <Section title="Contact">
              <Field label="Name" value={draft.name} onChange={(v) => set({ name: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone, as heard" value={draft.phone_raw} onChange={(v) => set({ phone_raw: v })} />
                <Field label="Phone, normalized" value={draft.phone_e164} placeholder="+1…" onChange={(v) => set({ phone_e164: v })} />
              </div>
              {draft.phone_ambiguous && (
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
                  <AlertIcon className="h-3.5 w-3.5" /> The number was unclear on the call — verify it in the transcript.
                </p>
              )}
              <Field label="Property address" value={draft.address} onChange={(v) => set({ address: v })} />
            </Section>

            <Section title="Property">
              <div className="grid grid-cols-4 gap-3">
                <Field label="Beds" value={draft.beds} placeholder="—" onChange={(v) => set({ beds: v })} />
                <Field label="Baths" value={draft.baths} placeholder="—" onChange={(v) => set({ baths: v })} />
                <Field label="Sq ft" value={draft.sqft} placeholder="—" onChange={(v) => set({ sqft: v })} />
                <Field label="Built" value={draft.year_built} placeholder="—" onChange={(v) => set({ year_built: v })} />
              </div>
              <Field label="Condition" value={draft.condition_notes} onChange={(v) => set({ condition_notes: v })} multiline />
            </Section>

            <Section title="Deal">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Asking price" value={draft.asking_price} onChange={(v) => set({ asking_price: v })} />
                <Field label="Timeline" value={draft.timeline} onChange={(v) => set({ timeline: v })} />
              </div>
              <Field label="Motivation" value={draft.motivation} onChange={(v) => set({ motivation: v })} multiline />
              <Field label="Summary" value={draft.summary} onChange={(v) => set({ summary: v })} multiline />
            </Section>

            <Section title="Follow-up">
              <Field label="Next step" value={draft.next_action} onChange={(v) => set({ next_action: v })} multiline />
              <MeetingField
                value={draft.meeting_datetime}
                hasEvent={!!lead.calendar_event_id}
                onChange={(v) => set({ meeting_datetime: v })}
              />
            </Section>

            <Section title="Consent record">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-ink-3">State</dt>
                <dd className="text-ink">{lead.consent_state || <span className="not-captured">not logged</span>}</dd>
                <dt className="text-ink-3">Method</dt>
                <dd className="text-ink">{lead.consent_method || <span className="not-captured">not logged</span>}</dd>
              </dl>
              <p className="t-meta">Logged when the call was captured. It can’t be edited.</p>
            </Section>
          </fieldset>
        </form>
      </div>

      {/* ---- Sheet preview + scorecard ----------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-2">
        <section className="card overflow-hidden" aria-labelledby="preview-heading">
          <div className="border-b border-line px-5 py-3">
            <h2 id="preview-heading" className="t-heading">
              What the Sheet will get
            </h2>
            <p className="t-meta mt-0.5">Columns A–H, live as you edit. Bookkeeping goes to hidden columns.</p>
          </div>
          <dl className="divide-y divide-line">
            {visibleSheetColumns({ ...draft, status: 'pushed' }).map((c) => (
              <div key={c.header} className="grid grid-cols-[132px_1fr] gap-3 px-5 py-2">
                <dt className="t-label pt-0.5 leading-snug">{c.header}</dt>
                <dd className="whitespace-pre-wrap break-words text-[13px] text-ink">
                  {c.value || <span className="not-captured">not captured</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="scorecard" className="card scroll-mt-[calc(var(--toolbar-h)+16px)]" aria-labelledby="score-heading">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <div>
              <h2 id="score-heading" className="t-heading">
                Call scorecard
              </h2>
              <p className="t-meta mt-0.5">Graded against wholesaling call best practices.</p>
            </div>
            <button
              className="btn-secondary btn-sm"
              onClick={() => void analyze()}
              disabled={analyzing || !lead.transcript_text || isTrashed}
              title={!lead.transcript_text ? 'Needs a transcript first' : undefined}
            >
              {analyzing ? <SpinnerIcon className="h-3.5 w-3.5" /> : <GaugeIcon className="h-3.5 w-3.5" />}
              {analyzing ? 'Grading…' : analysis ? 'Grade again' : 'Grade call'}
            </button>
          </div>
          <div className="px-5 py-4">
            {analysis && score !== null ? (
              <>
                <div className="flex items-end justify-between">
                  <span className="text-[12px] text-ink-2">How the call went</span>
                  <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tight text-ink">
                    {score}
                    <span className="text-[13px] font-medium text-ink-3">/100</span>
                  </span>
                </div>
                <div
                  className="relative mt-2 h-2 rounded-full"
                  role="meter"
                  aria-label="Call score"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={score}
                  style={{ background: 'linear-gradient(90deg, oklch(var(--danger-solid)), oklch(var(--warn-dot)) 50%, oklch(var(--ok-dot)))' }}
                >
                  <span
                    className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
                    style={{ left: `${score}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-ink-3">
                  <span>Needs work</span>
                  <span>Strong call</span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ScoreList title="What went well" tone="ok" items={analysis.strengths} empty="Nothing notable on this call." />
                  <ScoreList title="Do better next time" tone="warn" items={analysis.improvements} empty="No suggestions." />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-ink-3">
                {lead.transcript_text
                  ? 'Not graded yet. Grade it to see what went well and what to do better next time.'
                  : 'Needs a transcript before it can be graded.'}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* ---- Remove ------------------------------------------------------------ */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line px-5 py-3.5">
        <p className="t-meta max-w-[560px]">
          {isTrashed
            ? 'Deleting permanently removes this lead, its recording and its transcript from this Mac. It can’t be undone.'
            : 'Moving to the Trash hides this lead everywhere. You can restore it from the Trash later.'}
        </p>
        {isTrashed ? (
          <button className="btn-danger-quiet" onClick={() => setConfirm('permanent')}>
            <TrashIcon className="h-3.5 w-3.5" /> Delete permanently…
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => void moveToTrash()} disabled={busy}>
            <TrashIcon className="h-3.5 w-3.5" /> Move to Trash
          </button>
        )}
      </section>

      {confirm === 'permanent' && (
        <ConfirmDialog
          title="Delete this lead permanently?"
          body="The lead, its recording and its transcript are removed from this Mac for good. Any calendar event stays on your calendar."
          confirmLabel="Delete permanently"
          danger
          option={
            lead.sheet_row != null
              ? { label: `Also remove row ${lead.sheet_row} from the Google Sheet`, defaultChecked: false }
              : undefined
          }
          onCancel={() => setConfirm(null)}
          onConfirm={(alsoRemove) => {
            setConfirm(null)
            void permanentDelete(alsoRemove)
          }}
        />
      )}
      {confirm === 'discard' && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You edited this lead but didn’t save. Going back throws those edits away."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            leaveGuard.current = null
            onBack()
          }}
        />
      )}
    </div>
  )
}

function MeetingField({
  value,
  hasEvent,
  onChange
}: {
  value: string
  hasEvent: boolean
  onChange: (v: string) => void
}): JSX.Element {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="t-label mb-1.5 block">
        Next meeting
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="datetime-local"
          className="input max-w-[240px]"
          value={value.slice(0, 16)}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button type="button" className="btn-quiet btn-sm" onClick={() => onChange('')}>
            Clear
          </button>
        )}
      </div>
      <p className="t-meta mt-1.5">
        {value
          ? `${formatMeeting(value)} — a calendar event is ${hasEvent ? 'updated' : 'created'} when you push.`
          : hasEvent
            ? 'No meeting set — the existing calendar event is removed when you push.'
            : 'No meeting set. Add one to get a calendar event when you push.'}
      </p>
    </div>
  )
}

function ScoreList({
  title,
  tone,
  items,
  empty
}: {
  title: string
  tone: 'ok' | 'warn'
  items: string[]
  empty: string
}): JSX.Element {
  return (
    <div className={'rounded border px-3.5 py-3 ' + (tone === 'ok' ? 'border-ok/20 bg-ok-bg/60' : 'border-warn/25 bg-warn-bg/60')}>
      <h3 className={'mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] ' + (tone === 'ok' ? 'text-ok' : 'text-warn')}>
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-1.5 text-[13px] leading-snug text-ink">
          {items.map((s, i) => (
            <li key={i} className="flex gap-2">
              {tone === 'ok' ? (
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
              ) : (
                <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              )}
              <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-3">{empty}</p>
      )}
    </div>
  )
}
