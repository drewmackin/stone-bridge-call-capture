// =============================================================================
// Inline-SVG icon set (Lucide geometry), one uniform 1.75 stroke — the app's
// only icon family; no emoji or text glyphs as icons. Decorative by default
// (aria-hidden); the control that holds an icon carries the accessible name.
// Size via className (h-/w-); color inherits via currentColor.
// =============================================================================

import type { ReactNode } from 'react'

interface IconProps {
  className?: string
}

function Svg({ className = 'h-4 w-4', children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export const MicIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
)
export const MicOffIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m2 2 20 20M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.7" />
    <path d="M19 11a7 7 0 0 1-1.1 3.7M5 11a7 7 0 0 0 11.4 5.4M12 18v3" />
  </Svg>
)
export const RefreshIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 3v5h-5M3 21v-5h5" />
  </Svg>
)
export const ShieldIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3Z" />
  </Svg>
)
export const CheckIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
export const CheckCircleIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.3 2.4 2.4 4.6-4.9" />
  </Svg>
)
export const ArrowRightIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)
export const ChevronLeftIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
)
export const ChevronUpIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m18 15-6-6-6 6" />
  </Svg>
)
export const ChevronDownIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const SpinnerIcon = ({ className = 'h-4 w-4' }: IconProps): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className + ' animate-spin'}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)
export const PlusIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const SearchIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const XIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
)
export const UploadIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M12 15V4M7 9l5-5 5 5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
)
export const TrashIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
)
export const RestoreIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
)
export const CalendarIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
)
export const SheetIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M3.5 9.5h17M3.5 15h17M9.5 9.5v11" />
  </Svg>
)
export const AlertIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Svg>
)
export const InfoIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
)
export const ExternalIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
)
export const FileAudioIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13v3M12 11v7M15 13v3" />
  </Svg>
)
export const ListIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Svg>
)
export const GaugeIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 13 3.5-3.5" />
    <circle cx="12" cy="13" r="1" />
  </Svg>
)
export const PencilIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
  </Svg>
)
