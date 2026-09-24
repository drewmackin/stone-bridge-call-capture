import { useEffect, useId, useState } from 'react'
import { DISCLAIMER } from '@shared/compliance-text'
import { ChevronDownIcon, ChevronUpIcon } from './icons'

/**
 * The not-legal-advice notice stays on every screen, as one quiet line; the full
 * text opens in place (and closes with Esc) instead of permanently taking four
 * lines of the window.
 */
export default function Footer(): JSX.Element {
  const [open, setOpen] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <footer className="material material-footer absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl">
      {open && (
        <p id={id} className="anim-fade mx-auto max-w-[1080px] px-6 pb-1 pt-3 text-[12px] leading-relaxed text-ink-2">
          {DISCLAIMER}
        </p>
      )}
      <div className="mx-auto flex h-[var(--footer-h)] max-w-[1080px] items-center gap-2 px-6 text-[11.5px] text-ink-3">
        <span>
          <span className="font-semibold text-ink-2">Informational only — not legal advice.</span> Consent rules
          vary by state and change over time.
        </span>
        <button
          className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-ink-2 hover:bg-ink/[0.06] hover:text-ink"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide notice' : 'Full notice'}
          {open ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronUpIcon className="h-3 w-3" />}
        </button>
      </div>
    </footer>
  )
}
