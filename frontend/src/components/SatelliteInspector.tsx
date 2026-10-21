import { Crosshair, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { fix1, int, km } from '../lib/format'
import { currentStep, useStore } from '../lib/store'
import { Button, Field, Note, Swatch } from './ui'

/** Fetch details for the selected satellite whenever the snapshot step changes. */
export function useSatelliteDetail() {
  const dataset = useStore((s) => s.dataset)!
  const selected = useStore((s) => s.selected)
  const time = useStore((s) => s.time)
  const set = useStore((s) => s.set)
  const step = currentStep(time, dataset.steps)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (selected === null) {
      set({ detail: null, detailError: null, detailLoading: false })
      return
    }
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    set({ detailLoading: true, detailError: null })
    const id = dataset.ids[selected]
    const timer = window.setTimeout(() => {
      api
        .satellite(id, step, ctrl.signal)
        .then((d) => set({ detail: d, detailLoading: false }))
        .catch((e: Error) => {
          if (e.name === 'AbortError') return
          set({ detailError: e.message, detailLoading: false })
        })
    }, 80)
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [selected, step, dataset, set])
}

export function SatelliteInspector({ onUseInRouting }: { onUseInRouting?: (role: 'source' | 'target', id: string) => void }) {
  const dataset = useStore((s) => s.dataset)!
  const selected = useStore((s) => s.selected)
  const detail = useStore((s) => s.detail)
  const error = useStore((s) => s.detailError)
  const loading = useStore((s) => s.detailLoading)
  const { select, camera } = useStore.getState()
  const [showAll, setShowAll] = useState(false)

  if (selected === null) return null
  const id = dataset.ids[selected]
  const d = detail && detail.index === selected ? detail : null

  return (
    <aside className="flex max-h-full flex-col rounded-lg border border-seam bg-hull/95 backdrop-blur-sm" aria-label="Satellite details">
      <header className="flex items-start justify-between gap-2 border-b border-seam/70 px-4 py-3">
        <div>
          <div className="text-[12.5px] text-ink-dim">Selected satellite</div>
          <h2 className="readout text-[21px] font-semibold leading-tight">{id}</h2>
        </div>
        <div className="flex gap-1">
          <button type="button" className="rounded p-1.5 text-ink-dim hover:bg-hull-2 hover:text-ink" title="Turn the view towards this satellite" aria-label="Centre view on satellite" onClick={() => camera('frameSelected')}>
            <Crosshair size={16} />
          </button>
          <button type="button" className="rounded p-1.5 text-ink-dim hover:bg-hull-2 hover:text-ink" title="Close" aria-label="Close details" onClick={() => select(null)}>
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <Note tone="error">{error}</Note>}
        {!d && !error && <div className="py-6 text-[13px] text-ink-dim">{loading ? 'Loading details…' : ''}</div>}
        {d && (
          <>
            <div className="mb-3 flex items-center gap-2 text-[14px]">
              <Swatch color={d.eclipsed ? 'var(--color-eclipsed)' : 'var(--color-sunlit)'} />
              {d.eclipsed ? 'In Earth’s shadow (eclipsed)' : 'In sunlight'}
              <span className="text-ink-faint">at step {d.step + 1}</span>
            </div>
            {!d.plausible && (
              <div className="mb-3">
                <Note tone="warn">
                  This propagated position is not physically plausible (altitude {km(d.altitude_km)}). It most likely comes
                  from a stale or decayed TLE. It is shown as saved and is part of Member 1’s graph.
                </Note>
              </div>
            )}
            <dl>
              <Field label="Altitude" value={km(d.altitude_km)} />
              <Field label="Latitude, longitude" value={`${fix1(d.geocentric_lat_deg)}°, ${fix1(d.geocentric_lon_deg)}°`} hint="geocentric" />
              <Field label="Energy level" value={fix1(d.energy)} hint="of 100" />
              <Field label="Linked satellites" value={int(d.neighbour_count)} />
              <Field label="of which eclipsed" value={int(d.eclipsed_neighbours)} />
            </dl>
            <details className="mt-1 text-[13px] text-ink-dim">
              <summary className="cursor-pointer py-1 text-ink-dim hover:text-ink">Position (GCRS, km)</summary>
              <div className="readout grid grid-cols-3 gap-1 py-1 text-ink">
                {d.position_km.map((c, i) => (
                  <span key={i}>{['x', 'y', 'z'][i]} {int(c)}</span>
                ))}
              </div>
            </details>

            {d.on_saved_routes.length > 0 && (
              <p className="mt-2 text-[13px] text-ink-dim">
                {d.on_saved_routes.map((r) => `${r.route === 'gnn' ? 'GNN' : 'Dijkstra'} route hop ${r.hop}`).join(', ')} in the saved simulation.
              </p>
            )}

            {onUseInRouting && (
              <div className="mt-3 flex gap-2">
                <Button onClick={() => onUseInRouting('source', id)}>
                  <Swatch color="var(--color-source)" /> Use as source
                </Button>
                <Button onClick={() => onUseInRouting('target', id)}>
                  <Swatch color="var(--color-dest)" /> Use as destination
                </Button>
              </div>
            )}

            <h3 className="mt-4 text-[13px] font-medium text-ink">Nearest linked satellites</h3>
            <p className="text-[12px] leading-snug text-ink-faint">{d.neighbour_source}.</p>
            <ul className="mt-1.5 divide-y divide-seam/60">
              {(showAll ? d.neighbours : d.neighbours.slice(0, 8)).map((n) => (
                <li key={n.index}>
                  <button
                    type="button"
                    onClick={() => select(n.index)}
                    className="flex w-full items-center justify-between gap-2 py-1 text-left text-[13px] hover:text-signal"
                  >
                    <span className="flex items-center gap-2">
                      <Swatch color={n.eclipsed ? 'var(--color-eclipsed)' : 'var(--color-sunlit)'} />
                      <span className="readout">{n.id}</span>
                    </span>
                    <span className="readout text-ink-dim">{km(n.distance_km)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {d.neighbours.length > 8 && (
              <button type="button" className="mt-1 text-[13px] text-signal hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${d.neighbours.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
