import { useEffect, useState } from 'react'
import type { Lead } from '@shared/types'
import StatusBadge from './StatusBadge'

interface Props {
  refreshKey: number
  onOpen: (leadId: string) => void
}

export default function RecentCaptures({ refreshKey, onOpen }: Props): JSX.Element {
  const [leads, setLeads] = useState<Lead[]>([])

  useEffect(() => {
    window.stoneBridge
      .listLeads({ sortBy: 'created_at', sortDir: 'desc' })
      .then((all) => setLeads(all.slice(0, 6)))
      .catch(() => setLeads([]))
  }, [refreshKey])

  return (
    <div className="panel p-5">
      <h2 className="panel-heading mb-3 text-xl">Recent captures</h2>
      {leads.length === 0 ? (
        <p className="text-sm text-navy/45">No captures yet.</p>
      ) : (
        <ul className="divide-y divide-navy/5">
          {leads.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onOpen(l.id)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-parchment/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-navy">
                    {l.name || <span className="not-captured">name not captured</span>}
                  </div>
                  <div className="text-xs text-navy/50">
                    {new Date(l.created_at).toLocaleString()}
                  </div>
                </div>
                <StatusBadge lead={l} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
