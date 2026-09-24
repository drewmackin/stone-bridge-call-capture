import { useEffect, useRef, useState } from 'react'
import type { Lead } from '@shared/types'
import StatusBadge from './StatusBadge'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, RefreshIcon, RestoreIcon, SpinnerIcon, UploadIcon } from './icons'
import { formatPhone, formatWhen } from '../lib/format'

export type SortCol = 'name' | 'created_at' | 'status'

interface Props {
  leads: Lead[]
  sortBy: SortCol
  sortDir: 'asc' | 'desc'
  onSort: (col: SortCol) => void
  onOpen: (id: string) => void
  /** Inline edit a single field (name/address) from the list. */
  onEdit: (lead: Lead, patch: Partial<Lead>) => void
  /** Push one lead to the Sheet (and calendar). */
  onPush: (lead: Lead) => void
  onRestore: (lead: Lead) => void
  /** Lead currently being pushed, and whether ANY push is running (all push buttons wait). */
  pushingId: string | null
  pushLocked: boolean
  trash: boolean
}

/** Cell text that becomes an input on click; Enter/blur saves, Esc cancels. */
function EditableCell({
  value,
  label,
  onSave,
  readOnly
}: {
  value: string
  label: string
  onSave: (v: string) => void
  readOnly: boolean
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  if (readOnly) {
    return <span className={value ? 'line-clamp-2 break-words' : 'not-captured'}>{value || 'not captured'}</span>
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          cancelled.current = false
          setEditing(true)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`Edit ${label}: ${value || 'not captured'}`}
        className="group/edit -mx-1.5 flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-left transition-colors hover:bg-gold-100"
      >
        <span className={value ? 'line-clamp-2 break-words' : 'not-captured'}>{value || 'not captured'}</span>
        <PencilIcon className="mt-0.5 h-3 w-3 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" />
      </button>
    )
  }
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (!cancelled.current && draft.trim() !== value) onSave(draft.trim())
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          setDraft(value)
          setEditing(false)
        }
      }}
      className="input h-8 px-2"
    />
  )
}

function SortHeader({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
  className = ''
}: {
  label: string
  col: SortCol
  sortBy: SortCol
  sortDir: 'asc' | 'desc'
  onSort: (c: SortCol) => void
  className?: string
}): JSX.Element {
  const active = sortBy === col
  return (
    <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className={'px-3 py-2.5 ' + className}>
      <button className="t-label inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(col)}>
        {label}
        {active ? (
          sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-gold-800" /> : <ChevronDownIcon className="h-3 w-3 text-gold-800" />
        ) : (
          <ChevronDownIcon className="h-3 w-3 opacity-0" />
        )}
      </button>
    </th>
  )
}

function RowAction({
  lead,
  trash,
  pushing,
  locked,
  onPush,
  onOpen,
  onRestore
}: {
  lead: Lead
  trash: boolean
  pushing: boolean
  locked: boolean
  onPush: () => void
  onOpen: () => void
  onRestore: () => void
}): JSX.Element | null {
  if (trash) {
    return (
      <button className="btn-secondary btn-sm" onClick={onRestore}>
        <RestoreIcon className="h-3.5 w-3.5" /> Restore
      </button>
    )
  }
  if (pushing) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 px-2 text-[12px] font-medium text-ink-2">
        <SpinnerIcon className="h-3.5 w-3.5" /> Pushing…
      </span>
    )
  }
  switch (lead.status) {
    case 'new':
      // An extraction the AI flagged is never one click from the Sheet.
      return lead.needs_review ? (
        <button className="btn-secondary btn-sm" onClick={onOpen}>
          Review
        </button>
      ) : (
        <button className="btn-secondary btn-sm" onClick={onPush} disabled={locked} title="Approve this lead and push it to the Sheet">
          <UploadIcon className="h-3.5 w-3.5" /> Approve &amp; push
        </button>
      )
    case 'reviewed':
      return (
        <button className="btn-primary btn-sm" onClick={onPush} disabled={locked}>
          <UploadIcon className="h-3.5 w-3.5" /> Push
        </button>
      )
    case 'pushed':
      return (
        <span className="inline-flex items-center gap-1">
          <span className="t-meta tabular-nums">{lead.sheet_row != null ? `Row ${lead.sheet_row}` : ''}</span>
          <button
            className="btn-icon h-7 w-7"
            onClick={onPush}
            disabled={locked}
            aria-label={`Re-push ${lead.name || 'this lead'} to the Sheet`}
            title="Re-push the latest details to the Sheet"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      )
    default:
      return null
  }
}

export default function LeadTable({
  leads,
  sortBy,
  sortDir,
  onSort,
  onOpen,
  onEdit,
  onPush,
  onRestore,
  pushingId,
  pushLocked,
  trash
}: Props): JSX.Element {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
        <colgroup>
          <col className="w-[132px]" />
          <col className="w-[22%]" />
          <col className="w-[130px]" />
          <col />
          <col className="w-[150px]" />
          <col className="w-[150px]" />
        </colgroup>
        <thead className="border-b border-line bg-sunken/70">
          <tr>
            <SortHeader label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="pl-4" />
            <SortHeader label="Name" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <th scope="col" className="t-label px-3 py-2.5">
              Phone
            </th>
            <th scope="col" className="t-label px-3 py-2.5">
              Property
            </th>
            <SortHeader label="Captured" col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <th scope="col" className="px-3 py-2.5 pr-4 text-right">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {leads.map((l) => (
            <tr
              key={l.id}
              tabIndex={0}
              aria-label={`Open ${l.name || 'unnamed lead'}`}
              onClick={() => onOpen(l.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(l.id)
              }}
              className="cursor-pointer align-top transition-colors duration-100 hover:bg-gold-50 focus-visible:bg-gold-50 focus-visible:outline-offset-[-2px]"
            >
              <td className="py-3 pl-4 pr-3">
                <StatusBadge lead={l} />
              </td>
              <td className="px-3 py-2.5 font-medium text-ink">
                <EditableCell value={l.name} label="name" readOnly={trash} onSave={(v) => onEdit(l, { name: v })} />
              </td>
              <td className="px-3 py-3 tabular-nums text-ink-2">
                {l.phone_e164 || l.phone_raw ? (
                  <span className={'block truncate ' + (l.phone_ambiguous ? 'text-warn' : '')} title={l.phone_ambiguous ? 'Unclear — check the transcript' : undefined}>
                    {formatPhone(l.phone_e164, l.phone_raw)}
                  </span>
                ) : (
                  <span className="not-captured">not captured</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-ink-2">
                <EditableCell value={l.address} label="property address" readOnly={trash} onSave={(v) => onEdit(l, { address: v })} />
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-ink-3">{formatWhen(l.created_at)}</td>
              <td className="px-3 py-2 pr-4 text-right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <RowAction
                  lead={l}
                  trash={trash}
                  pushing={pushingId === l.id}
                  locked={pushLocked}
                  onPush={() => onPush(l)}
                  onOpen={() => onOpen(l.id)}
                  onRestore={() => onRestore(l)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
