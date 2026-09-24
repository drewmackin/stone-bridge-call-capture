// =============================================================================
// Display formatting shared by every screen: dates read the way people say them
// ("Today 9:42 AM"), US numbers in (617) 555-0142 form, clean error text.
// =============================================================================

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const fullDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "Today 9:42 AM" · "Yesterday 4:05 PM" · "Mon, Sep 21 · 2:12 PM" · "Sep 18, 2025". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  if (days === 0) return `Today ${time.format(d)}`
  if (days === 1) return `Yesterday ${time.format(d)}`
  if (d.getFullYear() === new Date().getFullYear()) return `${dayMonth.format(d)} · ${time.format(d)}`
  return fullDate.format(d)
}

/** Local meeting time ("2026-07-02T15:00:00", no zone) → "Thu, Jul 2 · 3:00 PM". */
export function formatMeeting(local: string): string {
  if (!local) return ''
  const d = new Date(local.length === 16 ? local + ':00' : local)
  if (Number.isNaN(d.getTime())) return local
  return `${dayMonth.format(d)} · ${time.format(d)}`
}

/** +16175550142 → (617) 555-0142; anything else is returned untouched. */
export function formatPhone(e164: string, raw = ''): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '')
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`
  return e164 || raw
}

/** 0:07 · 12:48 · 1:02:10 */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/**
 * Error text for people: drops Electron's IPC wrapper ("Error invoking remote
 * method 'x': Error: …") so the operator sees the real cause.
 */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(\w*Error):\s*/, '')
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`
}
