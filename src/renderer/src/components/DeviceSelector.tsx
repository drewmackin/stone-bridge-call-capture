interface Props {
  devices: MediaDeviceInfo[]
  deviceId: string
  audioMode: 'speakerphone' | 'loopback'
  micBlocked: boolean
  onSelect: (id: string) => void
  onRefresh: () => void
}

export default function DeviceSelector({
  devices,
  deviceId,
  audioMode,
  micBlocked,
  onSelect,
  onRefresh
}: Props): JSX.Element {
  const hint =
    audioMode === 'speakerphone'
      ? 'Put the phone on speaker and pick the microphone that hears the room (built-in or USB mic).'
      : 'Pick your combined/aggregate device (mic + system audio) so both sides are captured.'

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="field-label">Input source</label>
        <button className="text-xs text-navy/50 hover:text-gold" onClick={onRefresh}>
          ↻ refresh
        </button>
      </div>
      <select
        className="input"
        value={deviceId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={devices.length === 0}
      >
        {devices.length === 0 && <option value="">No input devices found</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone (${d.deviceId.slice(0, 6)}…)`}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-navy/50">{hint}</p>
      {micBlocked && (
        <p className="mt-1 text-xs font-medium text-amber-600">
          Microphone access is blocked. Grant it in System Settings → Privacy &amp; Security →
          Microphone, then click refresh.
        </p>
      )}
    </div>
  )
}
