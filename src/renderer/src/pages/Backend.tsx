import { useCallback, useEffect, useState } from 'react'
import type { Lead } from '@shared/types'
import LeadTable from '../components/LeadTable'
import LeadDetail from '../components/LeadDetail'

type StatusFilter = Lead['status'] | 'all'

interface Props {
  /** When set (e.g. clicking a recent capture on Home), open this lead's detail. */
  initialLeadId?: string | null
  onConsumedInitial?: () => void
}

/** Backend = the staging buffer between capture and the Sheet. */
export default function Backend({ initialLeadId, onConsumedInitial }: Props): JSX.Element {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [archiveView, setArchiveView] = useState(false)
  const [sortBy, setSortBy] = useState<keyof Lead>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushSummary, setPushSummary] = useState<{ ok: boolean; text: string } | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await window.stoneBridge.listLeads({
        search,
        status: archiveView ? 'all' : statusFilter,
        onlyDeleted: archiveView,
        sortBy,
        sortDir
      })
      setLeads(rows)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, archiveView, sortBy, sortDir])

  useEffect(() => {
    void reload()
  }, [reload])

  // Open a specific lead when navigated here from a recent-capture click.
  useEffect(() => {
    if (initialLeadId) {
      setSelectedId(initialLeadId)
      onConsumedInitial?.()
    }
  }, [initialLeadId, onConsumedInitial])

  const onSort = (col: keyof Lead): void => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(col)
      setSortDir(col === 'name' ? 'asc' : 'desc')
    }
  }

  const addManual = async (): Promise<void> => {
    const lead = await window.stoneBridge.addManualLead({})
    await reload()
    setSelectedId(lead.id)
  }

  const pushAllApproved = async (): Promise<void> => {
    setPushBusy(true)
    setPushSummary(null)
    try {
      const results = await window.stoneBridge.pushAllApproved()
      const ok = results.filter((r) => r.ok)
      const failed = results.filter((r) => !r.ok)
      const created = ok.filter((r) => r.created).length
      const text =
        results.length === 0
          ? 'No approved (Reviewed) leads to push. Mark a lead Reviewed to approve it.'
          : `Pushed ${ok.length} lead${ok.length === 1 ? '' : 's'} (${created} new, ${ok.length - created} updated)${failed.length ? `, ${failed.length} failed: ${failed[0].error}` : ''}.`
      setPushSummary({ ok: failed.length === 0, text })
      await reload()
    } catch (e) {
      setPushSummary({ ok: false, text: `Push failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setPushBusy(false)
    }
  }

  // Inline edit (name/address) straight from the list.
  const editLead = async (id: string, patch: Partial<Lead>): Promise<void> => {
    try {
      await window.stoneBridge.updateLead(id, patch)
      await reload()
    } catch (e) {
      setPushSummary({ ok: false, text: `Edit failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // Approve + push a single lead (Sheet + calendar) right from its row.
  const approveOne = async (id: string): Promise<void> => {
    setRowBusyId(id)
    setPushSummary(null)
    try {
      const r = await window.stoneBridge.pushLead(id)
      const parts: string[] = [r.ok ? `Pushed to row ${r.row}` : `Push failed: ${r.error}`]
      if (r.calendar && !r.calendar.skipped) {
        parts.push(
          r.calendar.ok
            ? `calendar ${r.calendar.created ? 'created' : 'updated'}`
            : `calendar failed: ${r.calendar.error}`
        )
      }
      setPushSummary({
        ok: r.ok && (!r.calendar || r.calendar.ok || r.calendar.skipped),
        text: parts.join(' · ')
      })
      await reload()
    } catch (e) {
      setPushSummary({ ok: false, text: `Push failed: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setRowBusyId(null)
    }
  }

  if (selectedId) {
    return (
      <LeadDetail
        leadId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void reload()
        }}
        onChanged={reload}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Backend</h1>
          <p className="mt-1 text-sm text-navy/55">
            Review and correct each lead, then push approved leads to your Google Sheet. The local
            database is the source of truth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={addManual}>
            + Add manual lead
          </button>
          <button className="btn-gold px-4 py-2 text-sm" onClick={pushAllApproved} disabled={pushBusy}>
            {pushBusy ? 'Pushing…' : 'Push all approved →'}
          </button>
        </div>
      </div>

      {pushSummary && (
        <div
          className={
            'rounded-lg border p-3 text-sm ' +
            (pushSummary.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-amber-300 bg-amber-50 text-amber-800')
          }
        >
          {pushSummary.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search name, phone, address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input w-44"
          value={statusFilter}
          disabled={archiveView}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="pushed">Pushed</option>
          <option value="archived">Archived</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-navy/70">
          <input
            type="checkbox"
            className="h-4 w-4 accent-gold"
            checked={archiveView}
            onChange={(e) => setArchiveView(e.target.checked)}
          />
          Show archive (deleted)
        </label>
        <span className="ml-auto text-xs text-navy/40">
          {loading ? 'Loading…' : `${leads.length} record${leads.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {leads.length === 0 && !loading ? (
        <div className="panel p-10 text-center text-sm text-navy/45">
          {archiveView
            ? 'No archived records.'
            : 'No leads yet. Capture a call on the Home page and it will appear here marked new.'}
        </div>
      ) : (
        <LeadTable
          leads={leads}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          onOpen={setSelectedId}
          onEdit={editLead}
          onApprove={approveOne}
          busyId={rowBusyId}
        />
      )}
    </div>
  )
}
