import type { CSSProperties } from 'react'

export type Page = 'home' | 'backend'

interface Props {
  page: Page
  onNavigate: (p: Page) => void
}

function NavButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'relative px-4 py-2 text-sm font-medium tracking-wide transition ' +
        (active ? 'text-gold' : 'text-white/70 hover:text-white')
      }
    >
      {label}
      <span
        className={
          'absolute -bottom-[1px] left-3 right-3 h-[2px] rounded-full bg-gold transition-opacity ' +
          (active ? 'opacity-100' : 'opacity-0')
        }
      />
    </button>
  )
}

export default function TopNav({ page, onNavigate }: Props): JSX.Element {
  return (
    <header className="border-b border-gold/30 bg-navy">
      {/* Drag region for the frameless mac title bar. */}
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{ WebkitAppRegion: 'drag' } as unknown as CSSProperties}
      >
        <div className="flex items-center gap-3 pl-16">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-gold/60">
            <span className="font-display text-base font-semibold text-gold">S</span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold text-white">Stone Bridge</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/70">Call Capture</div>
          </div>
        </div>
        <nav
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as unknown as CSSProperties}
        >
          <NavButton active={page === 'home'} label="Home" onClick={() => onNavigate('home')} />
          <NavButton
            active={page === 'backend'}
            label="Backend"
            onClick={() => onNavigate('backend')}
          />
        </nav>
      </div>
    </header>
  )
}
