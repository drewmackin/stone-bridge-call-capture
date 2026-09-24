import type { Lead } from '@shared/types'
import { AlertIcon, CheckIcon, SheetIcon, TrashIcon } from './icons'

// One vocabulary everywhere: the data's "reviewed" is shown as "Approved" (it is
// what "approved for push" means), "pushed" as "In Sheet". Every badge pairs an
// icon or word with its color, so status never relies on color alone.
const LABEL: Record<Lead['status'], string> = {
  new: 'New',
  reviewed: 'Approved',
  pushed: 'In Sheet',
  archived: 'Archived'
}

export function statusLabel(status: Lead['status']): string {
  return LABEL[status]
}

export default function StatusBadge({ lead }: { lead: Lead }): JSX.Element {
  if (lead.deleted_at) {
    return (
      <span className="badge bg-ink/[0.07] text-ink-2">
        <TrashIcon className="h-3 w-3" />
        In Trash
      </span>
    )
  }
  if (lead.needs_review && lead.status === 'new') {
    return (
      <span className="badge bg-warn-bg text-warn">
        <AlertIcon className="h-3 w-3" />
        Needs review
      </span>
    )
  }
  switch (lead.status) {
    case 'new':
      return <span className="badge bg-info-bg text-info">New</span>
    case 'reviewed':
      return (
        <span className="badge bg-gold-100 text-gold-900">
          <CheckIcon className="h-3 w-3" />
          Approved
        </span>
      )
    case 'pushed':
      return (
        <span className="badge bg-ok-bg text-ok">
          <SheetIcon className="h-3 w-3" />
          In Sheet
        </span>
      )
    default:
      return <span className="badge bg-ink/[0.07] text-ink-2">Archived</span>
  }
}
