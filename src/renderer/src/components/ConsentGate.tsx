import { useEffect, useMemo, useState } from 'react'
import type { JurisdictionRule } from '@shared/types'
import { effectiveRule } from '../lib/consent'
import type { ConsentPayload } from '../hooks/useRecorder'

interface Props {
  operatorState: string
  disabled: boolean
  onChange: (payload: ConsentPayload, satisfied: boolean) => void
}

/**
 * Consent & compliance reference. Shows the lead's state and the applicable
 * recording-consent rule, and records the state + method with each capture. The
 * operator gives the notice verbally on the call — there is no on-screen script
 * or attestation checkbox, and recording is not blocked on one.
 */
export default function ConsentGate({ operatorState, disabled, onChange }: Props): JSX.Element {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRule[]>([])
  const [stateCode, setStateCode] = useState<string>(operatorState)

  useEffect(() => {
    window.stoneBridge.getJurisdictions().then(setJurisdictions).catch(() => setJurisdictions([]))
  }, [])

  const rule = useMemo(
    () => effectiveRule(jurisdictions, stateCode, operatorState),
    [jurisdictions, stateCode, operatorState]
  )

  // Record the chosen state + method with each capture. Satisfied as long as a
  // state is set (it defaults to your home state, so recording isn't gated on a
  // click). script_acknowledged / audible_played are retained as false audit
  // fields now that the on-screen script and disclosure were removed.
  useEffect(() => {
    onChange(
      {
        state: stateCode,
        method: 'verbal notice given on the call',
        script_acknowledged: false,
        audible_played: false
      },
      !!stateCode
    )
  }, [stateCode, onChange])

  const ruleColor =
    rule.effective === 'all-party'
      ? 'bg-amber-50 border-amber-300 text-amber-900'
      : 'bg-emerald-50 border-emerald-300 text-emerald-900'

  return (
    <div className="panel p-5">
      <h2 className="panel-heading mb-4 text-lg">Consent &amp; compliance</h2>
      <div className="space-y-3">
        <div>
          <label className="field-label">Lead’s state</label>
          <select
            className="input"
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select…</option>
            {jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {j.state}
              </option>
            ))}
          </select>
        </div>

        <div className={'rounded-lg border p-3 ' + ruleColor}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {rule.effective === 'all-party' ? 'All-party consent required' : 'One-party consent'}
            </span>
            {rule.jurisdiction && (
              <a
                href={rule.jurisdiction.source_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[11px] underline opacity-80 hover:opacity-100"
              >
                {rule.jurisdiction.statute}
              </a>
            )}
          </div>
          <p className="mt-1 text-xs opacity-90">{rule.reason}</p>
        </div>
      </div>
    </div>
  )
}
