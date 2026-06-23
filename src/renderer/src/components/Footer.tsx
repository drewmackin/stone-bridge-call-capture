import { DISCLAIMER } from '@shared/compliance-text'

/** Persistent not-legal-advice disclaimer, present on every page. */
export default function Footer(): JSX.Element {
  return (
    <footer className="border-t border-gold/30 bg-navy px-6 py-2">
      <p className="mx-auto max-w-5xl text-[11px] leading-snug text-white/45">
        <span className="font-medium text-gold/80">Informational only — not legal advice. </span>
        {DISCLAIMER}
      </p>
    </footer>
  )
}
