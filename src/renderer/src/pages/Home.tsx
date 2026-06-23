import { useCallback, useEffect, useRef, useState } from 'react'
import { useReadiness } from '../hooks/useReadiness'
import { useRecorder, type ConsentPayload } from '../hooks/useRecorder'
import ServiceStatusPanel from '../components/ServiceStatusPanel'
import DeviceSelector from '../components/DeviceSelector'
import LevelMeter from '../components/LevelMeter'
import ConsentGate from '../components/ConsentGate'
import RecordControl from '../components/RecordControl'
import StatusStrip from '../components/StatusStrip'
import RecentCaptures from '../components/RecentCaptures'

interface Props {
  onOpenBackend: () => void
  onOpenLead: (leadId: string) => void
}

/** Home = the recording console: select input, confirm consent, record. */
export default function Home({ onOpenBackend, onOpenLead }: Props): JSX.Element {
  const { readiness } = useReadiness()
  const audioMode = readiness?.audioMode ?? 'speakerphone'
  const rec = useRecorder(audioMode)
  const lastRefreshedLead = useRef<string | undefined>(undefined)

  const [consent, setConsent] = useState<ConsentPayload>({
    state: '',
    method: '',
    script_acknowledged: false,
    audible_played: false
  })
  const [consentOk, setConsentOk] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleStart = async (): Promise<void> => {
    await rec.start()
  }
  const handleStop = (): Promise<void> => rec.stop(consent)

  // Stable identity so ConsentGate doesn't re-render on every Home render.
  const handleConsentChange = useCallback(
    (payload: ConsentPayload, satisfied: boolean): void => {
      setConsent(payload)
      setConsentOk(satisfied)
    },
    []
  )

  // Refresh the recent-captures list when a new capture appears and again when
  // it finishes — not on every intermediate stage.
  useEffect(() => {
    const p = rec.state.progress
    if (!p?.leadId) return
    if (p.leadId !== lastRefreshedLead.current || p.stage === 'done') {
      lastRefreshedLead.current = p.leadId
      setRefreshKey((k) => k + 1)
    }
  }, [rec.state.progress?.leadId, rec.state.progress?.stage])

  const canRecord = consentOk && rec.state.monitoring && !rec.state.micBlocked
  const blockedReason = !consentOk
    ? 'Set the lead’s state and confirm consent (panel on the right) to enable recording.'
    : !rec.state.monitoring
      ? 'Select an input device and confirm the meter is moving.'
      : ''

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">
            Recording console
          </h1>
          <p className="mt-1 text-sm text-navy/55">
            Capture a seller call, then review and stage it in the Backend before it reaches your
            Google Sheet.
          </p>
        </div>
        <button className="btn-ghost" onClick={onOpenBackend}>
          Open Backend →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recording console */}
        <div className="space-y-5 lg:col-span-2">
          {rec.state.error && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {rec.state.error}
            </div>
          )}
          <div className="panel space-y-5 p-5">
            <DeviceSelector
              devices={rec.state.devices}
              deviceId={rec.state.deviceId}
              audioMode={audioMode}
              micBlocked={rec.state.micBlocked}
              onSelect={rec.selectDevice}
              onRefresh={rec.refreshDevices}
            />
            <LevelMeter
              register={rec.registerLevelListener}
              channels={rec.state.channels}
              audioMode={audioMode}
            />
            <div className="border-t border-navy/10 pt-4">
              <RecordControl
                canRecord={canRecord}
                recording={rec.state.recording}
                elapsedSec={rec.state.elapsedSec}
                blockedReason={blockedReason}
                register={rec.registerLevelListener}
                onStart={handleStart}
                onStop={handleStop}
              />
            </div>
          </div>

          <StatusStrip progress={rec.state.progress} onRetry={rec.retry} onOpenBackend={onOpenBackend} />
        </div>

        {/* Side column: Recent captures → Consent & compliance → Setup status */}
        <div className="space-y-5">
          <RecentCaptures refreshKey={refreshKey} onOpen={onOpenLead} />
          <ConsentGate
            operatorState={readiness?.operatorState ?? 'MA'}
            disabled={rec.state.recording}
            onChange={handleConsentChange}
          />
          {readiness && <ServiceStatusPanel readiness={readiness} />}
        </div>
      </div>
    </div>
  )
}
