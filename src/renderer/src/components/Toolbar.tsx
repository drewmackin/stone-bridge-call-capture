import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { AppReadiness } from '@shared/types'
import ServiceStatusPanel, { setupIssues } from './ServiceStatusPanel'
import { AlertIcon, CheckCircleIcon, ListIcon, MicIcon, RefreshIcon, SpinnerIcon } from './icons'
import { formatDuration } from '../lib/format'

export type Page = 'record' | 'leads'

const DRAG = { WebkitAppRegion: 'drag' } as unknown as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  /** Leads waiting on a review/approve decision — the Leads tab's count. */
  reviewCount: number
  recording: boolean
  elapsedSec: number
  readiness: AppReadiness | null
  readinessError: string | null
  checking: boolean
  onRecheck: () => void
}

/**
 * Translucent navy title bar (the window uses hiddenInset traffic lights):
 * wordmark · Record | Leads · live-call pill + setup status. The whole bar drags
 * the window; controls opt out.
 */
export default function Toolbar(p: Props): JSX.Element {
  return (
    <header
      className="material material-toolbar absolute inset-x-0 top-0 z-30 flex h-[var(--toolbar-h)] items-center gap-4 border-b border-white/[0.06] bg-navy/[0.93] pl-[84px] pr-4 backdrop-blur-xl backdrop-saturate-150"
      style={DRAG}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-gold-600/60">
          <span className="font-brand text-[15px] font-semibold leading-none text-gold-500">S</span>
        </div>
        <div className="hidden leading-none min-[1000px]:block">
          <div className="font-brand text-[15px] font-semibold text-white">Stone Bridge</div>
          <div className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-gold-500/80">
            Call Capture
          </div>
        </div>
      </div>

      <nav
        aria-label="Sections"
        className="mx-auto flex items-center gap-0.5 rounded-[9px] bg-white/[0.07] p-[3px]"
        style={NO_DRAG}
      >
        <Segment active={p.page === 'record'} onClick={() => p.onNavigate('record')} icon={<MicIcon className="h-3.5 w-3.5" />}>
          Record
        </Segment>
        <Segment active={p.page === 'leads'} onClick={() => p.onNavigate('leads')} icon={<ListIcon className="h-3.5 w-3.5" />}>
          Leads
          {p.reviewCount > 0 && (
            <>
              <span
                aria-hidden="true"
                className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-600 px-1.5 text-[11px] font-bold tabular-nums text-navy"
              >
                {p.reviewCount}
              </span>
              <span className="sr-only">, {p.reviewCount} to review</span>
            </>
          )}
        </Segment>
      </nav>

      <div className="flex items-center gap-2" style={NO_DRAG}>
        {p.recording && (
          <button
            onClick={() => p.onNavigate('record')}
            className="inline-flex h-7 items-center gap-2 rounded-full bg-rec px-3 text-[12px] font-semibold tabular-nums text-white transition hover:brightness-95"
            title="A call is recording — go to Record"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Recording {formatDuration(p.elapsedSec)}
          </button>
        )}
        <SetupStatus {...p} />
      </div>
    </header>
  )
}

function Segment({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: JSX.Element
  children: ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3.5 text-[13px] font-medium transition-colors duration-150 ' +
        (active ? 'bg-white/[0.16] text-white shadow-sm' : 'text-white/65 hover:bg-white/[0.06] hover:text-white')
      }
    >
      {icon}
      {children}
    </button>
  )
}

/** Toolbar status pill + popover with every service's detail. */
function SetupStatus({ readiness, readinessError, checking, onRecheck }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const issues = readiness ? setupIssues(readiness) : 0
  const label = checking && !readiness
    ? 'Checking…'
    : readinessError && !readiness
      ? 'Status unavailable'
      : issues
        ? `${issues} to set up`
        : 'All set'
  const tone = !readiness ? 'text-white/70' : issues ? 'text-gold-400' : 'text-white/80'

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition hover:bg-white/[0.08] ' + tone}
      >
        {checking && !readiness ? (
          <SpinnerIcon className="h-3.5 w-3.5" />
        ) : issues || !readiness ? (
          <AlertIcon className="h-3.5 w-3.5" />
        ) : (
          <CheckCircleIcon className="h-3.5 w-3.5 text-ok-dot" />
        )}
        {label}
      </button>
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Setup status"
          className="anim-pop absolute right-0 top-[calc(100%+8px)] w-[340px] origin-top-right rounded-card border border-line bg-surface p-4 text-ink shadow-pop outline-none"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="t-heading">Setup status</h2>
            <button className="btn-quiet btn-sm -mr-1.5" onClick={onRecheck} disabled={checking}>
              <RefreshIcon className={'h-3.5 w-3.5 ' + (checking ? 'animate-spin' : '')} /> Check again
            </button>
          </div>
          {readiness ? (
            <>
              <ServiceStatusPanel readiness={readiness} />
              <p className="t-meta mt-2 border-t border-line pt-2.5">
                Home state {readiness.operatorState} · {readiness.audioMode === 'loopback' ? 'loopback capture' : 'speakerphone capture'}
                <br />
                Recordings are kept in <span className="break-all font-mono text-[11px]">{readiness.recordingsDir}</span>
              </p>
            </>
          ) : (
            <p className="text-[13px] text-danger">{readinessError ?? 'Checking services…'}</p>
          )}
        </div>
      )}
    </div>
  )
}
