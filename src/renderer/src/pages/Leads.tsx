import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { Lead, PushResult } from '@shared/types'
import LeadTable, { type SortCol } from '../components/LeadTable'
import LeadDetail from '../components/LeadDetail'
import { Notice, Toast, type ToastMsg } from '../components/Notice'
import { PlusIcon, SearchIcon, SpinnerIcon, TrashIcon, UploadIcon, XIcon } from '../components/icons'
import { errorText, plural } from '../lib/format'
import type { LeaveGuard } from '../App'

type View = 'review' | 'approved' | 'pushed' | 'archived' | 'all' | 'trash'

const TABS: { view: Exclude<View, 'trash'>; label: string; match: (l: Lead) => boolean }[] = [
  { view: 'review', label: 'To review', match: (l) => l.status === 'new' },
  { view: 'approved', label: 'Approved', match: (l) => l.status === 'reviewed' },
  { view: 'pushed', label: 'In Sheet', match: (l) => l.status === 'pushed' },
  { view: 'archived', label: 'Archived', match: (l) => l.status === 'archived' },
  { view: 'all', label: 'All', match: () => true }
]

const EMPTY: Record<View, string> = {
  review: 'Nothing to review. New calls land here once they’re transcribed.',
  approved: 'No approved leads. Open a lead, check it against the transcript, then approve it.',
  pushed: 'Nothing has been pushed to your Sheet yet.',
  archived: 'No archived leads.',
  all: 'No leads yet. Record a call and it appears here as soon as it’s saved.',
  trash: 'Trash is empty.'
}

interface Props {
  openLeadId: string | null
  onOpenLead: (id: string) => void
  onCloseLead: () => void
  version: number
  onDataChanged: () => void
  leaveGuard: MutableRefObject<LeaveGuard | null>
}

/** Summarize a batch push, including calendar outcomes, in one line. */
function summarize(results: PushResult[]): ToastMsg {
  if (results.length === 0) {
    return { tone: 'info', text: 'No approved leads to push. Approve a lead first.' }
  }
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const created = ok.filter((r) => r.created).length
  const calFailed = results.filter((r) => r.calendar && !r.calendar.ok && !r.calendar.skipped)
  const parts = [`Pushed ${plural(ok.length, 'lead')} (${created} new, ${ok.length - created} updated).`]
  if (failed.length) parts.push(`${failed.length} failed: ${failed[0].error}`)
  if (calFailed.length) parts.push(`Calendar failed for ${calFailed.length}: ${calFailed[0].calendar?.error}`)
  return { tone: failed.length || calFailed.length ? 'warn' : 'ok', text: parts.join(' ') }
}

function describe(r: PushResult): ToastMsg {
  const parts = [r.ok ? `Pushed to row ${r.row} of your Sheet${r.created ? '' : ' (updated)'}.` : `Push failed: ${r.error}`]
  if (r.calendar && !r.calendar.skipped) {
    parts.push(r.calendar.ok ? `Calendar event ${r.calendar.created ? 'created' : 'updated'}.` : `Calendar failed: ${r.calendar.error}`)
  }
  const ok = r.ok && (!r.calendar || r.calendar.ok || r.calendar.skipped)
  return { tone: ok ? 'ok' : r.ok ? 'warn' : 'danger', text: parts.join(' ') }
}

/** Leads = the staging buffer between capture and the Sheet. */
export default function LeadsPage({ openLeadId, onOpenLead, onCloseLead, version, onDataChanged, leaveGuard }: Props): JSX.Element {
  const [view, setView] = useState<View | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortCol>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [live, setLive] = useState<Lead[] | null>(null)
  const [trash, setTrash] = useState<Lead[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [pushAllBusy, setPushAllBusy] = useState(false)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [adding, setAdding] = useState(false)
  const pushLock = useRef(false)

  // Debounce typing so every keystroke doesn't re-query.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, deleted] = await Promise.all([
        window.stoneBridge.listLeads({ search, status: 'all', sortBy, sortDir }),
        window.stoneBridge.listLeads({ search, onlyDeleted: true, sortBy, sortDir })
      ])
      setLive(rows)
      setTrash(deleted)
      setLoadError(null)
      // First visit: open on "To review" when there's something to review.
      setView((v) => v ?? (rows.some((l) => l.status === 'new') ? 'review' : 'all'))
    } catch (e) {
      setLoadError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [search, sortBy, sortDir])

  useEffect(() => {
    void reload()
  }, [reload, version])

  const counts = useMemo(() => {
    const c = {} as Record<View, number>
    for (const t of TABS) c[t.view] = (live ?? []).filter(t.match).length
    c.trash = trash.length
    return c
  }, [live, trash])

  const current: View = view ?? 'all'
  const rows = useMemo(() => {
    if (current === 'trash') return trash
    const tab = TABS.find((t) => t.view === current) ?? TABS[4]
    return (live ?? []).filter(tab.match)
  }, [current, live, trash])

  const onSort = (col: SortCol): void => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(col)
      setSortDir(col === 'name' ? 'asc' : 'desc')
    }
  }

  const afterChange = async (): Promise<void> => {
    await reload()
    onDataChanged()
  }

  const addManual = async (): Promise<void> => {
    if (adding) return
    setAdding(true)
    try {
      const lead = await window.stoneBridge.addManualLead({})
      onDataChanged()
      onOpenLead(lead.id)
    } catch (e) {
      setToast({ tone: 'danger', text: `Couldn’t add a lead: ${errorText(e)}` })
    } finally {
      setAdding(false)
    }
  }

  // One push at a time from this screen (main also serializes Google writes):
  // a second click can never append a duplicate row.
  const pushOne = async (lead: Lead): Promise<void> => {
    if (pushLock.current) return
    pushLock.current = true
    setPushingId(lead.id)
    try {
      setToast(describe(await window.stoneBridge.pushLead(lead.id)))
    } catch (e) {
      setToast({ tone: 'danger', text: `Push failed: ${errorText(e)}` })
    } finally {
      pushLock.current = false
      setPushingId(null)
      await afterChange()
    }
  }

  const pushAllApproved = async (): Promise<void> => {
    if (pushLock.current) return
    pushLock.current = true
    setPushAllBusy(true)
    try {
      setToast(summarize(await window.stoneBridge.pushAllApproved()))
    } catch (e) {
      setToast({ tone: 'danger', text: `Push failed: ${errorText(e)}` })
    } finally {
      pushLock.current = false
      setPushAllBusy(false)
      await afterChange()
    }
  }

  const editLead = async (lead: Lead, patch: Partial<Lead>): Promise<void> => {
    try {
      await window.stoneBridge.updateLead(lead.id, patch)
      await afterChange()
      if (lead.status === 'pushed') {
        setToast({
          tone: 'info',
          text: 'Saved. This lead is already in your Sheet — re-push it to update the row.',
          action: { label: 'Re-push', run: () => void pushOne({ ...lead, ...patch }) }
        })
      }
    } catch (e) {
      setToast({ tone: 'danger', text: `Edit failed: ${errorText(e)}` })
    }
  }

  const restore = async (lead: Lead): Promise<void> => {
    try {
      await window.stoneBridge.restoreLead(lead.id)
      setToast({ tone: 'ok', text: `Restored ${lead.name || 'the lead'}.` })
      await afterChange()
    } catch (e) {
      setToast({ tone: 'danger', text: `Restore failed: ${errorText(e)}` })
    }
  }

  const closeToast = useCallback(() => setToast(null), [])

  if (openLeadId) {
    return (
      <>
        <LeadDetail
          key={openLeadId}
          leadId={openLeadId}
          onBack={() => {
            onCloseLead()
            void reload()
          }}
          onChanged={onDataChanged}
          leaveGuard={leaveGuard}
        />
        <Toast msg={toast} onClose={closeToast} />
      </>
    )
  }

  const approved = counts.approved ?? 0
  const pushBusy = pushAllBusy || pushingId !== null
  const inTrash = current === 'trash'

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title">Leads</h1>
          <p className="t-meta mt-1">
            Check each lead against its transcript, approve it, then push it to your Google Sheet. Everything is kept on
            this Mac first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={addManual} disabled={adding}>
            <PlusIcon className="h-3.5 w-3.5" /> Add lead
          </button>
          <button
            className="btn-primary"
            onClick={pushAllApproved}
            disabled={pushBusy || approved === 0}
            title={approved === 0 ? 'Approve a lead first' : `Push ${plural(approved, 'approved lead')} to the Sheet`}
          >
            {pushAllBusy ? <SpinnerIcon className="h-3.5 w-3.5" /> : <UploadIcon className="h-3.5 w-3.5" />}
            {pushAllBusy ? 'Pushing…' : `Push approved${approved ? ` (${approved})` : ''}`}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter leads" className="flex items-center gap-0.5 rounded-[9px] bg-ink/[0.05] p-[3px]">
          {TABS.map((t) => (
            <Tab key={t.view} active={current === t.view} count={counts[t.view]} onClick={() => setView(t.view)}>
              {t.label}
            </Tab>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-[260px]">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className="input pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search name, phone, address"
            aria-label="Search leads"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          />
          {query && (
            <button
              className="btn-icon absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          aria-pressed={inTrash}
          onClick={() => setView(inTrash ? 'all' : 'trash')}
          className={'btn-quiet ' + (inTrash ? 'bg-ink/[0.08] text-ink' : '')}
        >
          <TrashIcon className="h-3.5 w-3.5" /> Trash{counts.trash ? ` (${counts.trash})` : ''}
        </button>
      </div>

      {inTrash && (
        <Notice tone="info">
          Leads in the Trash are hidden everywhere else. Restore one here, or open it to delete it permanently.
        </Notice>
      )}

      {loadError ? (
        <Notice
          tone="danger"
          title="Couldn’t load leads"
          action={
            <button className="btn-secondary btn-sm" onClick={() => void reload()}>
              Try again
            </button>
          }
        >
          {loadError}
        </Notice>
      ) : live === null ? (
        <div className="card space-y-px overflow-hidden" aria-label="Loading leads">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-sunken/70" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="max-w-[420px] text-[13px] text-ink-2">
            {search ? `No leads match “${search}”${current !== 'all' && !inTrash ? ' in this view' : ''}.` : EMPTY[current]}
          </p>
          {search && (
            <button className="btn-secondary btn-sm" onClick={() => setQuery('')}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className={loading ? 'opacity-80 transition-opacity' : 'transition-opacity'}>
          <LeadTable
            leads={rows}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={onOpenLead}
            onEdit={(l, p) => void editLead(l, p)}
            onPush={(l) => void pushOne(l)}
            onRestore={(l) => void restore(l)}
            pushingId={pushingId}
            pushLocked={pushBusy}
            trash={inTrash}
          />
        </div>
      )}
      <Toast msg={toast} onClose={closeToast} />
    </div>
  )
}

function Tab({
  active,
  count,
  onClick,
  children
}: {
  active: boolean
  count: number
  onClick: () => void
  children: string
}): JSX.Element {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-150 ' +
        (active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')
      }
    >
      {children}
      <span className={'tabular-nums ' + (active ? 'text-ink-2' : 'text-ink-3')}>{count}</span>
    </button>
  )
}
