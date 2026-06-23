import { useEffect, useMemo, useState } from 'react'
import type { CallAnalysis, Lead } from '@shared/types'
import { visibleSheetColumns } from '@shared/sheet-view'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  leadId: string
  onBack: () => void
  onChanged: () => void
}

/** One editable field with a clear "not captured" marker when empty. */
function Field({
  label,
  value,
  onChange,
  multiline = false,
  readOnly = false
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  multiline?: boolean
  readOnly?: boolean
}): JSX.Element {
  const empty = !value
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="field-label">{label}</label>
        {empty && <span className="not-captured text-[10px]">not captured</span>}
      </div>
      {multiline ? (
        <textarea
          className="input min-h-[72px] resize-y"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={readOnly ? '' : 'not captured'}
        />
      ) : (
        <input
          className="input"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={readOnly ? '' : 'not captured'}
        />
      )}
    </div>
  )
}

export default function LeadDetail({ leadId, onBack, onChanged }: Props): JSX.Element {
  const [lead, setLead] = useState<Lead | null>(null)
  const [draft, setDraft] = useState<Lead | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<null | 'permanent'>(null)
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const refreshLead = async (): Promise<void> => {
    try {
      const l = await window.stoneBridge.getLead(leadId)
      setLead(l)
      setDraft(l)
    } catch (e) {
      setPushMsg({ ok: false, text: `Could not reload lead: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  useEffect(() => {
    window.stoneBridge.getLead(leadId).then((l) => {
      setLead(l)
      setDraft(l)
    })
  }, [leadId])

  const dirty = useMemo(() => JSON.stringify(lead) !== JSON.stringify(draft), [lead, draft])

  const analysis = useMemo<CallAnalysis | null>(() => {
    if (!lead?.call_analysis) return null
    try {
      return JSON.parse(lead.call_analysis) as CallAnalysis
    } catch {
      return null
    }
  }, [lead?.call_analysis])

  if (!draft || !lead) {
    return <div className="panel p-6 text-sm text-navy/50">Loading…</div>
  }

  const set = (patch: Partial<Lead>): void => setDraft({ ...draft, ...patch })

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      // Send only edited fields.
      const patch: Partial<Lead> = {}
      for (const k of Object.keys(draft) as (keyof Lead)[]) {
        if (draft[k] !== lead[k]) (patch as Record<string, unknown>)[k] = draft[k]
      }
      const updated = await window.stoneBridge.updateLead(leadId, patch)
      setLead(updated)
      setDraft(updated)
      onChanged()
    } catch (e) {
      setPushMsg({ ok: false, text: `Save failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  const archive = async (): Promise<void> => {
    try {
      await window.stoneBridge.softDeleteLead(leadId)
      onChanged()
      onBack()
    } catch (e) {
      setPushMsg({ ok: false, text: `Archive failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  const restore = async (): Promise<void> => {
    try {
      await window.stoneBridge.restoreLead(leadId)
      onChanged()
      onBack()
    } catch (e) {
      setPushMsg({ ok: false, text: `Restore failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  const permanentDelete = async (alsoRemoveSheetRow: boolean): Promise<void> => {
    try {
      if (alsoRemoveSheetRow && lead.sheet_row != null) {
        await window.stoneBridge.deleteSheetRow(leadId)
      }
      await window.stoneBridge.permanentDeleteLead(leadId)
      onChanged()
      onBack()
    } catch (e) {
      setPushMsg({ ok: false, text: `Delete failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const push = async (): Promise<void> => {
    setPushing(true)
    setPushMsg(null)
    try {
      const r = await window.stoneBridge.pushLead(leadId)
      const parts: string[] = [
        r.ok ? `Sheet: row ${r.row} (${r.created ? 'new' : 'updated'})` : `Sheet failed: ${r.error}`
      ]
      if (r.calendar) {
        if (r.calendar.skipped) parts.push('Calendar: no meeting time set')
        else if (r.calendar.ok) parts.push(`Calendar: event ${r.calendar.created ? 'created' : 'updated'}`)
        else parts.push(`Calendar failed: ${r.calendar.error}`)
      }
      const allOk = r.ok && (!r.calendar || r.calendar.ok || r.calendar.skipped)
      setPushMsg({ ok: allOk, text: parts.join(' · ') })
      await refreshLead()
      onChanged()
    } catch (e) {
      setPushMsg({ ok: false, text: `Push failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setPushing(false)
    }
  }

  const analyze = async (): Promise<void> => {
    setAnalyzing(true)
    setPushMsg(null)
    try {
      const updated = await window.stoneBridge.analyzeCall(leadId)
      setLead(updated)
      setDraft(updated)
    } catch (e) {
      setPushMsg({ ok: false, text: `Call analysis failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setAnalyzing(false)
    }
  }

  const isArchived = !!lead.deleted_at
  const isPushed = lead.sheet_row != null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="btn-ghost" onClick={onBack}>
          ← Back to list
        </button>
        <div className="flex items-center gap-2">
          {dirty && (
            <button className="btn-ghost" onClick={() => setDraft(lead)}>
              Revert
            </button>
          )}
          <button className="btn-ghost" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          <button
            className="btn-gold px-4 py-2 text-sm"
            onClick={push}
            disabled={pushing || dirty}
            title={dirty ? 'Save changes before pushing' : 'Push this lead to the Google Sheet'}
          >
            {pushing ? 'Pushing…' : isPushed ? 'Re-push to Sheet' : 'Push to Sheet'}
          </button>
        </div>
      </div>

      {pushMsg && (
        <div
          className={
            'rounded-lg border p-3 text-sm ' +
            (pushMsg.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-amber-300 bg-amber-50 text-amber-800')
          }
        >
          {pushMsg.text}
          {!pushMsg.ok && ' — your local record is safe.'}
        </div>
      )}

      {lead.needs_review && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          This lead needs review — the AI extraction was unavailable or uncertain. Read the
          transcript and fill the fields. Nothing was invented.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Transcript — the operator's defense against a bad extraction. */}
        <div className="panel flex max-h-[70vh] flex-col p-4">
          <h3 className="panel-heading mb-2 text-lg">Transcript</h3>
          <div className="overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-navy/80">
            {lead.transcript_text ? (
              lead.transcript_text
            ) : (
              <span className="not-captured">
                No transcript (manual entry, or transcription has not run yet).
              </span>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="panel max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gold-600">Contact</h4>
            <Field label="Name" value={draft.name} onChange={(v) => set({ name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone (as heard)" value={draft.phone_raw} onChange={(v) => set({ phone_raw: v })} />
              <Field label="Phone (E.164)" value={draft.phone_e164} onChange={(v) => set({ phone_e164: v })} />
            </div>
            {draft.phone_ambiguous && (
              <p className="text-[11px] text-amber-600">⚠ Phone flagged ambiguous — verify against the transcript.</p>
            )}
            <Field label="Property address" value={draft.address} onChange={(v) => set({ address: v })} />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gold-600">Property</h4>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Beds" value={draft.beds} onChange={(v) => set({ beds: v })} />
              <Field label="Baths" value={draft.baths} onChange={(v) => set({ baths: v })} />
              <Field label="Sq ft" value={draft.sqft} onChange={(v) => set({ sqft: v })} />
              <Field label="Year" value={draft.year_built} onChange={(v) => set({ year_built: v })} />
            </div>
            <Field label="Condition notes" value={draft.condition_notes} onChange={(v) => set({ condition_notes: v })} multiline />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gold-600">Deal</h4>
            <Field label="Asking price → Sheet “Offer”" value={draft.asking_price} onChange={(v) => set({ asking_price: v })} />
            <Field label="Motivation" value={draft.motivation} onChange={(v) => set({ motivation: v })} multiline />
            <Field label="Timeline" value={draft.timeline} onChange={(v) => set({ timeline: v })} />
            <Field label="Summary" value={draft.summary} onChange={(v) => set({ summary: v })} multiline />
            <Field label="Next action" value={draft.next_action} onChange={(v) => set({ next_action: v })} multiline />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="field-label">Next meeting — files a calendar event on push</label>
                {!draft.meeting_datetime && <span className="not-captured text-[10px]">not captured</span>}
              </div>
              <input
                type="datetime-local"
                className="input"
                value={draft.meeting_datetime.slice(0, 16)}
                onChange={(e) => set({ meeting_datetime: e.target.value })}
              />
              {lead.calendar_event_link && (
                <a
                  href={lead.calendar_event_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-gold-600 underline"
                >
                  View calendar event →
                </a>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gold-600">
              Status &amp; compliance
            </h4>
            <div>
              <label className="field-label">Status</label>
              <select
                className="input"
                value={draft.status}
                onChange={(e) => set({ status: e.target.value as Lead['status'] })}
              >
                <option value="new">New</option>
                <option value="reviewed">Reviewed (approved for push)</option>
                {draft.status === 'pushed' && <option value="pushed">Pushed</option>}
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Consent state" value={lead.consent_state} readOnly />
              <Field label="Consent confirmed" value={lead.consent_confirmed ? 'yes' : 'no'} readOnly />
            </div>
            <Field label="Consent method (logged at capture)" value={lead.consent_method} readOnly />
          </section>
        </div>
      </div>

      {/* Sheet preview — exactly what "Push to Sheet" writes to columns A–H. */}
      <div className="panel p-4">
        <h3 className="panel-heading mb-1 text-lg">Sheet preview</h3>
        <p className="mb-3 text-xs text-navy/50">
          Exactly what “Push to Sheet” writes to your columns. Bookkeeping the app needs (ID, dates,
          consent, file links, meeting time) goes in hidden columns and isn’t shown here. Edit the
          fields above and this updates live — approve by setting status to “Reviewed,” then push.
        </p>
        <div className="overflow-hidden rounded-lg border border-navy/10">
          <table className="w-full text-sm">
            <tbody>
              {visibleSheetColumns(draft).map((c, i) => (
                <tr key={c.header} className={i % 2 ? 'bg-parchment/60' : ''}>
                  <td className="w-1/3 border-r border-navy/10 px-3 py-2 align-top text-xs font-semibold uppercase leading-snug tracking-wide text-gold-600">
                    {c.header}
                  </td>
                  <td className="px-3 py-2 align-top text-navy/90">
                    {c.value ? (
                      <span className="whitespace-pre-wrap">{c.value}</span>
                    ) : (
                      <span className="not-captured text-[11px]">not captured</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete / restore */}
      <div className="flex items-center justify-between rounded-lg border border-navy/10 bg-white p-3">
        <p className="text-xs text-navy/50">
          {isArchived
            ? 'This record is archived (soft-deleted). You can restore it or delete it permanently.'
            : 'Deleting archives the record (recoverable). Permanent deletion is separate and asks for confirmation.'}
        </p>
        <div className="flex gap-2">
          {isArchived ? (
            <>
              <button className="btn-ghost" onClick={restore}>
                Restore
              </button>
              <button
                className="inline-flex items-center rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                onClick={() => setConfirm('permanent')}
              >
                Delete permanently
              </button>
            </>
          ) : (
            <button className="btn-ghost" onClick={archive}>
              Archive (soft delete)
            </button>
          )}
        </div>
      </div>

      {/* Call scorecard — AI grade on wholesaling best practices (the very bottom). */}
      <div className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="panel-heading text-lg">Call scorecard</h3>
          <button
            className="btn-ghost text-xs"
            onClick={analyze}
            disabled={analyzing || !lead.transcript_text}
            title={!lead.transcript_text ? 'Needs a transcript first' : 'Grade this call with AI'}
          >
            {analyzing ? 'Analyzing…' : analysis ? '↻ Re-analyze' : 'Analyze call'}
          </button>
        </div>

        {analysis ? (
          <>
            <div className="mb-1 flex items-center justify-between text-xs text-navy/55">
              <span>How good was this call? (wholesaling best practices)</span>
              <span className="font-mono text-base font-semibold text-navy">{analysis.score}/100</span>
            </div>
            <div
              className="relative h-3 w-full rounded-full"
              style={{ background: 'linear-gradient(to right, #dc2626 0%, #f59e0b 50%, #16a34a 100%)' }}
            >
              <div
                className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-navy shadow ring-2 ring-white"
                style={{ left: `calc(${Math.max(0, Math.min(100, analysis.score))}% - 3px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-navy/40">
              <span>Needs work</span>
              <span>Strong call</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  What you did well
                </h4>
                {analysis.strengths.length ? (
                  <ul className="space-y-1.5 text-sm text-navy/80">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 text-emerald-600">✓</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="not-captured text-xs">Nothing notable on this call.</p>
                )}
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Ways you can improve
                </h4>
                {analysis.improvements.length ? (
                  <ul className="space-y-1.5 text-sm text-navy/80">
                    {analysis.improvements.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 text-amber-600">→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="not-captured text-xs">No suggestions.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-navy/50">
            {lead.transcript_text
              ? 'Not graded yet — click “Analyze call” to score it against wholesaling best practices.'
              : 'No transcript yet — record or add a call first, then analyze.'}
          </p>
        )}
      </div>

      {confirm === 'permanent' && (
        <ConfirmDialog
          title="Delete permanently?"
          body="This removes the record from the local database for good. This cannot be undone."
          confirmLabel="Delete permanently"
          danger
          option={
            isPushed
              ? { label: `Also remove the row from the Google Sheet (row ${lead.sheet_row})`, defaultChecked: false }
              : undefined
          }
          onCancel={() => setConfirm(null)}
          onConfirm={(alsoRemoveSheetRow) => {
            setConfirm(null)
            void permanentDelete(alsoRemoveSheetRow)
          }}
        />
      )}
    </div>
  )
}
