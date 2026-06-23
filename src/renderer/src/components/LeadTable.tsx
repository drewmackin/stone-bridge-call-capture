import { useEffect, useState } from 'react'
import type { Lead } from '@shared/types'

interface Props {
  leads: Lead[]
  sortBy: keyof Lead
  sortDir: 'asc' | 'desc'
  onSort: (col: keyof Lead) => void
  onOpen: (id: string) => void
  /** Inline edit a single field (name/address) from the list. */
  onEdit: (id: string, patch: Partial<Lead>) => void
  /** Approve + push a single lead to the Sheet (and calendar). */
  onApprove: (id: string) => void
  /** Lead id currently being pushed (shows a spinner on its button). */
  busyId?: string | null
}

function SyncDot({ lead }: { lead: Lead }): JSX.Element {
  const synced = lead.sheet_row != null
  return (
    <span
      title={synced ? `Mirrored to Sheet (row ${lead.sheet_row})` : 'Local only — not yet pushed'}
      className={'inline-block h-2 w-2 rounded-full ' + (synced ? 'bg-emerald-500' : 'bg-navy/20')}
    />
  )
}

/** A table cell whose text turns into an input on click; saves on blur/Enter. */
function EditableCell({
  value,
  placeholder,
  onSave
}: {
  value: string
  placeholder: string
  onSave: (v: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  if (!editing) {
    return (
      <button
        type="button"
        title="Click to edit"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className="-mx-1 rounded px-1 text-left hover:bg-gold/10"
      >
        {value || <span className="not-captured">{placeholder}</span>}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onSave(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className="w-full rounded border border-gold/60 bg-white px-2 py-1 text-sm outline-none focus:border-gold"
    />
  )
}

function Th({
  label,
  col,
  sortBy,
  sortDir,
  onSort
}: {
  label: string
  col?: keyof Lead
  sortBy: keyof Lead
  sortDir: 'asc' | 'desc'
  onSort: (c: keyof Lead) => void
}): JSX.Element {
  const active = col && sortBy === col
  return (
    <th className="px-4 py-3 font-medium">
      {col ? (
        <button className="flex items-center gap-1 hover:text-navy" onClick={() => onSort(col)}>
          {label}
          <span className={active ? 'text-gold' : 'text-transparent'}>
            {active && sortDir === 'asc' ? '▲' : '▼'}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  )
}

export default function LeadTable({
  leads,
  sortBy,
  sortDir,
  onSort,
  onOpen,
  onEdit,
  onApprove,
  busyId
}: Props): JSX.Element {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-navy/10 bg-parchment/60 text-xs uppercase tracking-wide text-navy/45">
          <tr>
            <Th label="" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <Th label="Name" col="name" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <Th label="Phone" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <Th label="Address" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <Th label="Captured" col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
            <Th label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-navy/5">
          {leads.map((l) => (
            <tr
              key={l.id}
              onClick={() => onOpen(l.id)}
              className="cursor-pointer hover:bg-parchment/50"
            >
              <td className="px-4 py-3">
                <SyncDot lead={l} />
              </td>
              <td className="px-4 py-2 font-medium text-navy">
                <EditableCell
                  value={l.name}
                  placeholder="not captured"
                  onSave={(v) => onEdit(l.id, { name: v })}
                />
              </td>
              <td className="px-4 py-3 text-navy/80">
                {l.phone_e164 || l.phone_raw || <span className="not-captured">not captured</span>}
              </td>
              <td className="px-4 py-2 text-navy/80">
                <EditableCell
                  value={l.address}
                  placeholder="not captured"
                  onSave={(v) => onEdit(l.id, { address: v })}
                />
              </td>
              <td className="px-4 py-3 text-navy/60">{new Date(l.created_at).toLocaleString()}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {l.status === 'pushed' ? (
                  <button
                    onClick={() => onApprove(l.id)}
                    disabled={busyId === l.id}
                    title="Already pushed — click to re-push the latest"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                  >
                    {busyId === l.id ? 'Pushing…' : '✓ Pushed · re-push'}
                  </button>
                ) : (
                  <button
                    onClick={() => onApprove(l.id)}
                    disabled={busyId === l.id}
                    className="btn-gold px-3 py-1.5 text-xs"
                  >
                    {busyId === l.id ? 'Pushing…' : 'Approve & Push →'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
