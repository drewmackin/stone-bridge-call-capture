import type { Lead } from '@shared/types'

const STATUS_STYLES: Record<Lead['status'], string> = {
  new: 'bg-sky-100 text-sky-700',
  reviewed: 'bg-violet-100 text-violet-700',
  pushed: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-navy/10 text-navy/50'
}

export default function StatusBadge({ lead }: { lead: Lead }): JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {lead.needs_review && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          review
        </span>
      )}
      <span
        className={
          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
          STATUS_STYLES[lead.status]
        }
      >
        {lead.status}
      </span>
    </div>
  )
}
