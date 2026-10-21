const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3, minimumFractionDigits: 3 })

export const int = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : nf0.format(v))
export const fix1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : nf1.format(v))
export const fix2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : nf2.format(v))
export const fix3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : nf3.format(v))
export const km = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${nf0.format(v)} km`)
export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`
export const seconds = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : v >= 10 ? `${nf0.format(v)} s` : `${v.toFixed(1)} s`

/** "14:39:36 UTC" from an ISO timestamp, optionally offset by seconds. */
export function utcTime(iso: string, offsetSeconds = 0): string {
  const d = new Date(new Date(iso).getTime() + offsetSeconds * 1000)
  return `${d.toISOString().slice(11, 19)} UTC`
}

export function utcDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
