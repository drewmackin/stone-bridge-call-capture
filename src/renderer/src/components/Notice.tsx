import { useEffect, type ReactNode } from 'react'
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons'

export type Tone = 'info' | 'ok' | 'warn' | 'danger'

const TONE: Record<Tone, { box: string; icon: JSX.Element }> = {
  info: { box: 'border-info/20 bg-info-bg text-info', icon: <InfoIcon className="h-4 w-4" /> },
  ok: { box: 'border-ok/20 bg-ok-bg text-ok', icon: <CheckCircleIcon className="h-4 w-4" /> },
  warn: { box: 'border-warn/25 bg-warn-bg text-warn', icon: <AlertIcon className="h-4 w-4" /> },
  danger: { box: 'border-danger/25 bg-danger-bg text-danger', icon: <AlertIcon className="h-4 w-4" /> }
}

/** Inline status / warning / error message, placed next to what it's about. */
export function Notice({
  tone,
  title,
  children,
  action,
  onDismiss
}: {
  tone: Tone
  title?: string
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
}): JSX.Element {
  const t = TONE[tone]
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={'flex items-start gap-2.5 rounded border px-3 py-2.5 text-[13px] ' + t.box}
    >
      <span className="mt-px shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={'leading-snug ' + (title ? 'mt-0.5 text-ink-2' : '')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <button className="btn-icon -my-1 -mr-1 h-7 w-7" onClick={onDismiss} aria-label="Dismiss">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export interface ToastMsg {
  tone: Tone
  text: string
  action?: { label: string; run: () => void }
}

/**
 * Result of an action the operator just took, slid up from the bottom edge
 * (toast direction = up). Successes clear themselves; problems stay until read.
 */
export function Toast({ msg, onClose }: { msg: ToastMsg | null; onClose: () => void }): JSX.Element {
  useEffect(() => {
    if (!msg || msg.tone !== 'ok') return
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [msg, onClose])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--footer-h)+16px)] z-40 flex justify-center px-4"
    >
      {msg && (
        <div className="anim-rise pointer-events-auto w-full max-w-[560px] shadow-pop">
          <Notice
            tone={msg.tone}
            onDismiss={onClose}
            action={
              msg.action && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    msg.action?.run()
                    onClose()
                  }}
                >
                  {msg.action.label}
                </button>
              )
            }
          >
            {msg.text}
          </Notice>
        </div>
      )}
    </div>
  )
}
