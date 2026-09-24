import { useEffect, useId, useRef, useState } from 'react'

interface Props {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  /** Optional extra choice (e.g. "also remove the Sheet row"). Always starts unchecked unless told otherwise. */
  option?: { label: string; defaultChecked?: boolean }
  onCancel: () => void
  onConfirm: (optionChecked: boolean) => void
}

/**
 * Modal confirmation for genuinely destructive or irreversible actions only.
 * Dims the app to focus the decision; Esc, the scrim and Cancel all back out;
 * focus starts on the SAFE choice and stays trapped inside until it closes,
 * then returns to whatever opened it.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  option,
  onCancel,
  onConfirm
}: Props): JSX.Element {
  const [checked, setChecked] = useState(option?.defaultChecked ?? false)
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  // Latest onCancel without re-running the mount effect (which moves focus).
  const cancelCb = useRef(onCancel)
  cancelCb.current = onCancel

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ;(danger ? cancelRef : confirmRef).current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelCb.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const f = panelRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
    // Mount-only: focus placement + trap are set once for the dialog's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="anim-fade absolute inset-0 bg-navy/45" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="anim-pop relative w-full max-w-[420px] rounded-card border border-line bg-surface p-5 shadow-pop"
      >
        <h2 id={titleId} className="t-heading">
          {title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          {body}
        </p>
        {option && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded bg-sunken px-3 py-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[oklch(var(--gold-800))]"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {option.label}
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => onConfirm(checked)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
