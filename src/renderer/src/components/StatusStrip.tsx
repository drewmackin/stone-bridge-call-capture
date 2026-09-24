import type { PipelineProgress, ProcessingStage } from '@shared/types'
import { ArrowRightIcon, CheckIcon, FileAudioIcon, SpinnerIcon, XIcon } from './icons'
import { Notice } from './Notice'

interface Props {
  progress: PipelineProgress | null
  /** A finished call is still in memory because saving it failed. */
  saveError: string | null
  onRetry: () => void
  onOpenLead: (leadId: string) => void
  onDismiss: () => void
}

const STEPS: { key: ProcessingStage; label: string }[] = [
  { key: 'transcribing', label: 'Transcribe the call' },
  { key: 'extracting', label: 'Pull out lead details and grade the call' }
]
const ORDER: ProcessingStage[] = ['saving', 'transcribing', 'extracting', 'done']
const rank = (s: ProcessingStage): number => Math.max(0, ORDER.indexOf(s))

/**
 * After the call: "Saved to disk" first — the relief that the recording is safe
 * is the one moment worth marking — then transcribe → extract → one clear next
 * step. Announced politely to screen readers as it advances.
 */
export default function StatusStrip({ progress, saveError, onRetry, onOpenLead, onDismiss }: Props): JSX.Element | null {
  if (saveError) {
    return (
      <Notice
        tone="danger"
        title="This call isn’t saved yet"
        action={
          <button className="btn-primary btn-sm" onClick={onRetry}>
            Retry save
          </button>
        }
      >
        {saveError} The audio is still held in memory — keep the app open and retry.
      </Notice>
    )
  }
  if (!progress || progress.stage === 'idle') return null

  if (progress.stage === 'error') {
    return (
      <Notice
        tone="warn"
        title="Processing stopped"
        onDismiss={onDismiss}
        action={
          progress.retryable || progress.leadId ? (
            <div className="flex gap-2">
              {progress.leadId && (
                <button className="btn-secondary btn-sm" onClick={() => onOpenLead(progress.leadId)}>
                  Open lead
                </button>
              )}
              {progress.retryable && (
                <button className="btn-primary btn-sm" onClick={onRetry}>
                  Retry
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        <span className="block">{progress.message}</span>
        {progress.audioPathSafe && (
          <span className="mt-1 flex items-center gap-1.5 font-medium text-ok">
            <CheckIcon className="h-3.5 w-3.5" /> The recording is safely saved — nothing was lost.
          </span>
        )}
      </Notice>
    )
  }

  const saved = rank(progress.stage) >= rank('transcribing')
  const done = progress.stage === 'done'
  const cur = rank(progress.stage)

  return (
    <section className="card anim-rise overflow-hidden" aria-live="polite" aria-label="Call processing">
      <div
        className={
          'flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold ' +
          (saved ? 'bg-ok-bg text-ok' : 'bg-sunken text-ink-2')
        }
      >
        {saved ? <FileAudioIcon className="h-4 w-4" /> : <SpinnerIcon className="h-4 w-4" />}
        <span className="flex-1">{saved ? 'Saved to disk — the recording is safe' : 'Saving the recording…'}</span>
        {done && (
          <button className="btn-icon -my-1 -mr-2 h-7 w-7 text-ok hover:text-ok" onClick={onDismiss} aria-label="Dismiss">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <ol className="divide-y divide-line">
        {STEPS.map((s) => {
          const sr = rank(s.key)
          const st = done || cur > sr ? 'done' : cur === sr ? 'active' : 'todo'
          return (
            <li key={s.key} className={'flex items-center gap-2.5 px-4 py-2.5 text-[13px] ' + (st === 'todo' ? 'text-ink-3' : 'text-ink')}>
              {st === 'done' ? (
                <CheckIcon className="h-4 w-4 text-ok" />
              ) : st === 'active' ? (
                <SpinnerIcon className="h-4 w-4 text-gold-800" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-line-strong" aria-hidden="true" />
              )}
              <span className="flex-1">{s.label}</span>
              {st === 'active' && progress.message && (
                <span className="t-meta hidden truncate sm:block">{progress.message}</span>
              )}
            </li>
          )
        })}
        {done && (
          <li className="flex items-center gap-3 bg-gold-50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">Lead ready to review</p>
              {progress.message && <p className="t-meta truncate">{progress.message}</p>}
            </div>
            <button className="btn-primary" onClick={() => onOpenLead(progress.leadId)}>
              Review lead <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        )}
      </ol>
    </section>
  )
}
