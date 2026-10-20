import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'

/** Type-ahead satellite ID field over the 10,706 IDs in the snapshots. */
export function SatellitePicker({
  label, value, onChange, tone,
}: { label: string; value: string; onChange: (v: string) => void; tone: 'source' | 'dest' }) {
  const dataset = useStore((s) => s.dataset)!
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = `pick-${tone}`

  const matches = useMemo(() => {
    const q = value.trim().toUpperCase()
    if (!q) return []
    const out: string[] = []
    for (const sat of dataset.ids) {
      const up = sat.toUpperCase()
      if (up === q || up.startsWith(q) || up.startsWith(`STARLINK-${q}`)) out.push(sat)
      if (out.length >= 8) break
    }
    return out
  }, [value, dataset])

  const valid = dataset.indexOf.has(value.trim())
  const ring = tone === 'source' ? 'focus-within:border-source' : 'focus-within:border-dest'

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 flex items-center gap-2 text-[13px] text-ink-dim">
        <span className={`h-2.5 w-2.5 rounded-full border-2 ${tone === 'source' ? 'border-source' : 'border-dest'}`} />
        {label}
      </label>
      <div className={`rounded-md border bg-hull-2 ${valid || !value ? 'border-seam' : 'border-warn/60'} ${ring}`}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={`${id}-list`}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="e.g. STARLINK-1008"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!open || !matches.length) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); onChange(matches[active]); setOpen(false) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          className="readout w-full bg-transparent px-2.5 py-1.5 text-[15px] text-ink outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-ink-faint"
        />
      </div>
      {open && matches.length > 0 && !(matches.length === 1 && matches[0] === value) && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-seam bg-hull shadow-xl">
          {matches.map((m, i) => (
            <li key={m} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false) }}
                className={`readout block w-full px-2.5 py-1 text-left text-[14px] ${i === active ? 'bg-hull-2 text-ink' : 'text-ink-dim'}`}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && !valid && <div className="mt-1 text-[12px] text-warn">Not an ID in the snapshots</div>}
    </div>
  )
}
