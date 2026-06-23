import type { PipelineProgress, ProcessingStage } from '@shared/types'

interface Props {
  progress: PipelineProgress | null
  onRetry: () => void
  onOpenBackend: () => void
}

const STEPS: { key: ProcessingStage; label: string }[] = [
  { key: 'saving', label: 'Saving' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'done', label: 'Done' }
]

function stageIndex(stage: ProcessingStage): number {
  const i = STEPS.findIndex((s) => s.key === stage)
  return i === -1 ? 0 : i
}

export default function StatusStrip({ progress, onRetry, onOpenBackend }: Props): JSX.Element | null {
  if (!progress || progress.stage === 'idle') return null

  const isError = progress.stage === 'error'
  const idx = stageIndex(progress.stage)

  return (
    <div
      className={
        'rounded-lg border p-4 ' +
        (isError ? 'border-amber-300 bg-amber-50' : 'border-navy/10 bg-white')
      }
    >
      {!isError && (
        <div className="mb-3 flex items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex flex-1 items-center gap-2">
              <div
                className={
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ' +
                  (i < idx
                    ? 'bg-emerald-500 text-white'
                    : i === idx
                      ? 'bg-gold text-navy'
                      : 'bg-navy/10 text-navy/40')
                }
              >
                {i < idx ? '✓' : i + 1}
              </div>
              <span className={'text-xs ' + (i <= idx ? 'text-navy' : 'text-navy/40')}>
                {step.label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-navy/10" />}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={'text-sm font-medium ' + (isError ? 'text-amber-800' : 'text-navy')}>
            {isError ? 'Something went wrong' : progress.message}
          </p>
          {isError && <p className="mt-0.5 text-xs text-amber-700">{progress.message}</p>}
          {isError && progress.audioPathSafe && (
            <p className="mt-1 text-[11px] text-emerald-700">
              ✓ Your recording is safely saved on disk — nothing was lost.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {isError && progress.retryable && (
            <button className="btn-gold px-3 py-1.5 text-sm" onClick={onRetry}>
              Retry
            </button>
          )}
          {progress.stage === 'done' && (
            <button className="btn-ghost" onClick={onOpenBackend}>
              Open in Backend →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
