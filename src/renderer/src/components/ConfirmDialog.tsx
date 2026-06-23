import { useState } from 'react'

interface Props {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  /** Optional extra checkbox (e.g. "also remove the Sheet row"). */
  option?: { label: string; defaultChecked?: boolean }
  onCancel: () => void
  onConfirm: (optionChecked: boolean) => void
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  option,
  onCancel,
  onConfirm
}: Props): JSX.Element {
  const [checked, setChecked] = useState(option?.defaultChecked ?? false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="font-display text-xl font-semibold text-navy">{title}</h3>
        <p className="mt-2 text-sm text-navy/70">{body}</p>
        {option && (
          <label className="mt-3 flex items-center gap-2 rounded-md bg-parchment/60 p-2 text-sm text-navy">
            <input
              type="checkbox"
              className="h-4 w-4 accent-gold"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {option.label}
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={
              danger
                ? 'inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700'
                : 'btn-gold px-4 py-2 text-sm'
            }
            onClick={() => onConfirm(checked)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
