import { useId, useMemo } from 'react'
import type { JurisdictionRule } from '@shared/types'
import { effectiveRule } from '../lib/consent'
import { ExternalIcon, ShieldIcon } from './icons'

interface Props {
  jurisdictions: JurisdictionRule[]
  /** The lead's (seller's) state code — controlled by the app so it survives page switches. */
  value: string
  operatorState: string
  disabled: boolean
  onChange: (code: string) => void
}

/**
 * Seller's state + the recording-consent rule that applies, right where the call
 * is started. The state and the method below are logged with every capture.
 * The operator gives notice verbally on the call — there is no on-screen script
 * or attestation checkbox, and recording is not blocked on one.
 */
export default function ConsentGate({ jurisdictions, value, operatorState, disabled, onChange }: Props): JSX.Element {
  const id = useId()
  const rule = useMemo(
    () => effectiveRule(jurisdictions, value, operatorState),
    [jurisdictions, value, operatorState]
  )
  const allParty = rule.effective === 'all-party'

  return (
    <div>
      <label htmlFor={id} className="t-label">
        Seller’s state
      </label>
      <div className="mt-2 grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] items-center gap-2">
        <select
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || jurisdictions.length === 0}
          title={disabled ? 'The state is fixed for the call in progress' : undefined}
        >
          {jurisdictions.length === 0 && <option value="">Loading states…</option>}
          {jurisdictions.length > 0 && <option value="">Choose a state…</option>}
          {jurisdictions.map((j) => (
            <option key={j.code} value={j.code}>
              {j.state}
            </option>
          ))}
        </select>
        <div
          className={
            'flex h-9 min-w-0 items-center gap-1.5 rounded px-2.5 text-[12px] font-semibold ' +
            (allParty ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok')
          }
        >
          <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">{allParty ? 'All-party consent' : 'One-party consent'}</span>
          {rule.jurisdiction && (
            <a
              href={rule.jurisdiction.source_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex min-w-0 items-center gap-1 text-[11.5px] font-medium underline decoration-current/40 underline-offset-2 hover:decoration-current"
              title={`Open ${rule.jurisdiction.statute}`}
            >
              <span className="truncate">{rule.jurisdiction.statute}</span>
              <ExternalIcon className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>
      </div>
      <p className="t-meta mt-2" title="The state and method are saved with every recording">
        {rule.reason} Logged: {value || '—'} · verbal notice.
      </p>
    </div>
  )
}
