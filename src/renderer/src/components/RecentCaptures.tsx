import { useEffect, useState } from 'react'
import type { Lead } from '@shared/types'
import StatusBadge from './StatusBadge'
import { ArrowRightIcon, SpinnerIcon } from './icons'
import { errorText, formatWhen } from '../lib/format'

interface Props {
  /** Bumped by the app whenever lead data may have changed. */
  version: number
  /** Lead currently being transcribed/extracted, if any. */
  processingId: string | null
  onOpen: (leadId: string) => void
  onSeeAll: () => void
}

export default function RecentCaptures({ version, processingId, onOpen, onSeeAll }: Props): JSX.Element {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.stoneBridge
      .listLeads({ sortBy: 'created_at', sortDir: 'desc' })
      .then((all) => {
        if (!active) return
        setLeads(all.slice(0, 6))
        setError(null)
      })
      .catch((e) => active && setError(errorText(e)))
    return () => {
      active = false
    }
  }, [version])

  return (
    <section className="card" aria-labelledby="recent-heading">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 id="recent-heading" className="t-heading">
          Recent calls
        </h2>
        <button className="btn-quiet btn-sm -mr-1.5" onClick={onSeeAll}>
          All leads <ArrowRightIcon className="h-3 w-3" />
        </button>
      </div>
      {error ? (
        <p className="px-4 pb-4 text-[12px] text-danger">Couldn’t load recent calls: {error}</p>
      ) : leads === null ? (
        <div className="space-y-2 px-4 pb-4" aria-label="Loading recent calls">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-sunken" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] leading-relaxed text-ink-3">
          No calls yet. Your first recording will show up here as soon as it’s saved.
        </p>
      ) : (
        <ul className="pb-1.5">
          {leads.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onOpen(l.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-sunken focus-visible:bg-sunken"
              >
                <div className="min-w-0 flex-1">
                  <div className={'truncate text-[13px] font-medium ' + (l.name ? 'text-ink' : 'not-captured')}>
                    {l.name || 'Name not captured'}
                  </div>
                  <div className="t-meta">{formatWhen(l.created_at)}</div>
                </div>
                {l.id === processingId ? (
                  <span className="badge bg-sunken text-ink-2">
                    <SpinnerIcon className="h-3 w-3" />
                    Processing
                  </span>
                ) : (
                  <StatusBadge lead={l} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
