import type { AppReadiness, JurisdictionRule } from '@shared/types'
import type { ConsentPayload, Recorder } from '../hooks/useRecorder'
import DeviceSelector from '../components/DeviceSelector'
import LevelMeter from '../components/LevelMeter'
import ConsentGate from '../components/ConsentGate'
import RecordControl from '../components/RecordControl'
import StatusStrip from '../components/StatusStrip'
import RecentCaptures from '../components/RecentCaptures'
import ServiceStatusPanel, { setupIssues } from '../components/ServiceStatusPanel'
import { Notice } from '../components/Notice'

interface Props {
  rec: Recorder
  consent: ConsentPayload
  leadState: string
  onLeadStateChange: (code: string) => void
  jurisdictions: JurisdictionRule[]
  operatorState: string
  readiness: AppReadiness | null
  version: number
  onOpenLead: (leadId: string) => void
  onOpenLeads: () => void
}

type Readiness = { tone: string; dot: string; text: string }

/**
 * Record = the call cockpit. Everything needed before the seller picks up —
 * microphone + live meter, seller's state + consent rule, the Record button —
 * sits in ONE card, above the fold at the smallest window size, in the order
 * it's used. The status line at the top answers "can I record right now?".
 */
export default function RecordPage({
  rec,
  consent,
  leadState,
  onLeadStateChange,
  jurisdictions,
  operatorState,
  readiness,
  version,
  onOpenLead,
  onOpenLeads
}: Props): JSX.Element {
  const s = rec.state
  const saving = s.progress?.stage === 'saving'
  const blockedBySave = !!s.saveError

  const canRecord = !!leadState && s.monitoring && !s.micBlocked && !blockedBySave
  const hint = s.recording
    ? 'Press stop when the call ends — it saves to disk right away.'
    : blockedBySave
      ? 'Save the last call before starting a new one.'
      : saving
        ? 'Saving the last call…'
        : s.micBlocked
          ? 'Allow microphone access to record.'
          : !s.monitoring
            ? 'Connecting to the microphone…'
            : !leadState
              ? 'Choose the seller’s state to record.'
              : 'Ready. Press to start recording when the seller picks up.'

  const status: Readiness = s.recording
    ? { tone: 'bg-danger-bg text-danger', dot: 'bg-rec animate-pulse', text: 'Recording' }
    : canRecord && !saving
      ? { tone: 'bg-ok-bg text-ok', dot: 'bg-ok-dot', text: 'Ready to record' }
      : s.micBlocked
        ? { tone: 'bg-danger-bg text-danger', dot: 'bg-danger', text: 'Microphone blocked' }
        : { tone: 'bg-sunken text-ink-2', dot: 'bg-ink-3', text: saving ? 'Saving…' : 'Not ready' }

  const issues = readiness ? setupIssues(readiness) : 0
  const processingId =
    s.progress && ['transcribing', 'extracting'].includes(s.progress.stage) ? s.progress.leadId : null

  return (
    <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        {s.error && !s.micBlocked && (
          <Notice tone="warn" title="Microphone problem">
            {s.error}
          </Notice>
        )}

        <section className="card" aria-labelledby="call-heading">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h1 id="call-heading" className="t-title text-[19px]">
              {s.recording ? 'Call in progress' : 'New call'}
            </h1>
            <span className={'badge h-6 px-2.5 text-[12px] ' + status.tone} role="status">
              <span className={'h-1.5 w-1.5 rounded-full ' + status.dot} aria-hidden="true" />
              {status.text}
            </span>
          </div>

          <div className="grid gap-4 px-5 pb-1 pt-4">
            <div className="grid gap-3">
              <DeviceSelector
                devices={s.devices}
                deviceId={s.deviceId}
                audioMode={readiness?.audioMode ?? 'speakerphone'}
                micBlocked={s.micBlocked}
                locked={s.recording}
                onSelect={rec.selectDevice}
                onReconnect={rec.reconnect}
              />
              <div className="rounded border border-line bg-sunken/60 px-3.5 py-3">
                <LevelMeter
                  register={rec.registerLevelListener}
                  channels={s.channels}
                  audioMode={readiness?.audioMode ?? 'speakerphone'}
                  active={s.monitoring}
                />
                <p className="t-meta mt-2">
                  Check it moves for <span className="font-semibold text-ink-2">both</span> voices before you record —
                  a silent meter means a silent recording.
                </p>
              </div>
            </div>

            <ConsentGate
              jurisdictions={jurisdictions}
              value={leadState}
              operatorState={operatorState}
              disabled={s.recording}
              onChange={onLeadStateChange}
            />
          </div>

          <div className="border-t border-line px-5 pb-3 pt-2">
            <RecordControl
              canRecord={canRecord}
              recording={s.recording}
              busy={saving}
              elapsedSec={s.elapsedSec}
              hint={hint}
              register={rec.registerLevelListener}
              onStart={() => void rec.start()}
              onStop={() => void rec.stop(consent)}
            />
          </div>
        </section>

        <StatusStrip
          progress={s.progress}
          saveError={s.saveError}
          onRetry={() => void rec.retry()}
          onOpenLead={onOpenLead}
          onDismiss={rec.dismissProgress}
        />
      </div>

      <aside className="min-w-0 space-y-4" aria-label="Recent activity and setup">
        <RecentCaptures version={version} processingId={processingId} onOpen={onOpenLead} onSeeAll={onOpenLeads} />
        {readiness && issues > 0 && (
          <section className="card px-4 pb-2 pt-3.5" aria-labelledby="setup-heading">
            <h2 id="setup-heading" className="t-heading">
              Finish setup
            </h2>
            <p className="t-meta mt-0.5">
              Calls still record and save; these steps unlock the rest of the pipeline.
            </p>
            <ServiceStatusPanel readiness={readiness} onlyProblems />
          </section>
        )}
      </aside>
    </div>
  )
}
