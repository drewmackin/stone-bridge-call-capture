import { useId } from 'react'
import { MicOffIcon, RefreshIcon } from './icons'

interface Props {
  devices: MediaDeviceInfo[]
  deviceId: string
  audioMode: 'speakerphone' | 'loopback'
  micBlocked: boolean
  /** Locked while recording — swapping the input would cut the call. */
  locked: boolean
  onSelect: (id: string) => void
  onReconnect: () => void
}

export default function DeviceSelector({
  devices,
  deviceId,
  audioMode,
  micBlocked,
  locked,
  onSelect,
  onReconnect
}: Props): JSX.Element {
  const id = useId()
  const hint =
    audioMode === 'speakerphone'
      ? 'Phone on speaker, next to the mic that hears the room.'
      : 'Use the combined device (mic + system audio) so both sides are captured.'

  return (
    <div>
      <label htmlFor={id} className="t-label">
        Microphone
      </label>
      <div className="mt-2 flex gap-2">
        <select
          id={id}
          className="input"
          value={deviceId}
          onChange={(e) => onSelect(e.target.value)}
          disabled={devices.length === 0 || locked}
          title={locked ? 'The microphone can’t change while a call is recording' : undefined}
        >
          {devices.length === 0 && <option value="">No microphone found</option>}
          {devices.map((d, i) => (
            <option key={d.deviceId || `device-${i}`} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
        <button
          className="btn-secondary w-9 shrink-0 px-0"
          onClick={onReconnect}
          disabled={locked}
          aria-label="Refresh microphones"
          title="Refresh microphones"
        >
          <RefreshIcon className="h-4 w-4" />
        </button>
      </div>
      {micBlocked ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-danger">
          <MicOffIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            No microphone access. Allow it in System Settings → Privacy &amp; Security → Microphone, then press
            refresh.
          </span>
        </p>
      ) : (
        <p className="t-meta mt-2">{hint}</p>
      )}
    </div>
  )
}
