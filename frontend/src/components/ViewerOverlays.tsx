import { Download, Gauge, Layers as LayersIcon, LocateFixed, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fix1, int, km } from '../lib/format'
import { currentStep, useStore } from '../lib/store'
import { ROUTE_COLORS } from '../scene/GlobeScene'
import { hoverPoint } from '../scene/Picking'
import { BENCH_SECONDS, perf, useBench } from '../scene/perf'
import { Button, Swatch, Toggle } from './ui'

export function Legend() {
  const dataset = useStore((s) => s.dataset)!
  const time = useStore((s) => s.time)
  const step = currentStep(time, dataset.steps)
  const f = dataset.meta.frames[step]
  return (
    <div className="rounded-lg border border-seam bg-hull/90 px-3 py-2.5 text-[13px] backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5"><Swatch color="var(--color-sunlit)" /> Sunlit <span className="readout text-ink-dim">{int(f.sunlit)}</span></span>
        <span className="flex items-center gap-1.5"><Swatch color="var(--color-eclipsed)" /> Eclipsed <span className="readout text-ink-dim">{int(f.eclipsed)}</span></span>
      </div>
      <div className="mt-1 text-[12px] text-ink-faint">
        Faint blue lines: {int(f.sampled_links)} of {int(f.full_graph_edges)} links (the 1 % sample saved with each snapshot)
      </div>
    </div>
  )
}

export function SavedRouteCard() {
  const dataset = useStore((s) => s.dataset)!
  const time = useStore((s) => s.time)
  const layers = useStore((s) => s.layers)
  const step = currentStep(time, dataset.steps)
  const f = dataset.meta.frames[step]
  const prev = step > 0 ? dataset.meta.frames[step - 1] : null

  let kept: number | null = null
  let total = 0
  if (prev?.gnn_route && f.gnn_route) {
    const a = new Set(prev.gnn_route.slice(1, -1))
    const inner = f.gnn_route.slice(1, -1)
    total = inner.length
    kept = inner.filter((i) => a.has(i)).length
  }

  if (!layers.savedGnn && !layers.savedDijkstra) return null
  return (
    <div className="rounded-lg border border-seam bg-hull/90 px-3 py-2.5 backdrop-blur-sm">
      <div className="text-[12.5px] text-ink-dim">Saved simulation route, step {step + 1}</div>
      <div className="readout mt-0.5 text-[15px] leading-snug">
        <span className="text-source">{f.source}</span>
        <span className="text-ink-faint"> to </span>
        <span className="text-dest">{f.target}</span>
      </div>
      <table className="mt-1.5 w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-ink-faint">
            <th className="font-normal" />
            <th className="px-2 text-right font-normal">Hops</th>
            <th className="px-2 text-right font-normal">Distance</th>
            <th className="pl-2 text-right font-normal">Eclipsed</th>
          </tr>
        </thead>
        <tbody className="readout">
          {layers.savedGnn && (
            <tr>
              <td className="flex items-center gap-1.5 font-sans"><Swatch color={ROUTE_COLORS.gnn} shape="line" />GNN</td>
              <td className="px-2 text-right">{int(f.gnn_hops)}</td>
              <td className="px-2 text-right">{km(f.gnn_distance_km)}</td>
              <td className="pl-2 text-right">{int(f.gnn_eclipsed)}</td>
            </tr>
          )}
          {layers.savedDijkstra && (
            <tr>
              <td className="flex items-center gap-1.5 font-sans"><Swatch color={ROUTE_COLORS.dijkstra} shape="line" />Dijkstra</td>
              <td className="px-2 text-right">{int(f.dijkstra_hops)}</td>
              <td className="px-2 text-right">{km(f.dijkstra_distance_km)}</td>
              <td className="pl-2 text-right">{int(f.dijkstra_eclipsed)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {layers.savedGnn && kept !== null && (
        <div className={`mt-1.5 text-[12.5px] ${f.route_changed ? 'text-signal' : 'text-ink-dim'}`}>
          {f.route_changed
            ? `GNN route changed: ${total - kept} of ${total} relays replaced since step ${step}`
            : 'GNN route unchanged since the previous step'}
        </div>
      )}
      <div className="mt-1 text-[11.5px] text-ink-faint">Eclipsed = satellites on the route in shadow, endpoints included</div>
    </div>
  )
}

export function LayersMenu() {
  const [open, setOpen] = useState(false)
  const layers = useStore((s) => s.layers)
  const { setLayer, camera } = useStore.getState()
  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <Button onClick={() => setOpen((v) => !v)} title="Choose what is drawn">
          <LayersIcon size={15} /> Layers
        </Button>
        <Button onClick={() => camera('reset')} title="Return to the default view of the route">
          <LocateFixed size={15} /> Reset view
        </Button>
      </div>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-[270px] rounded-lg border border-seam bg-hull/97 p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink-dim">Show</span>
            <button type="button" aria-label="Close layers" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink"><X size={15} /></button>
          </div>
          <Toggle label="Saved GNN route" swatch={ROUTE_COLORS.gnn} checked={layers.savedGnn} onChange={(v) => setLayer('savedGnn', v)} />
          <Toggle label="Saved Dijkstra route" swatch={ROUTE_COLORS.dijkstra} checked={layers.savedDijkstra} onChange={(v) => setLayer('savedDijkstra', v)} />
          <Toggle label="Link sample" checked={layers.links} onChange={(v) => setLayer('links', v)} />
          <Toggle label="Links of the selected satellite" checked={layers.neighbours} onChange={(v) => setLayer('neighbours', v)} />
          <Toggle label="Hop numbers on the route" checked={layers.hopLabels} onChange={(v) => setLayer('hopLabels', v)} />
          <Toggle label="Earth’s shadow (eclipse model)" checked={layers.shadow} onChange={(v) => setLayer('shadow', v)}
            hint="The cylinder Member 1's eclipse detector uses: Earth's radius, pointing away from the Sun" />
          <Toggle label="Hide implausible positions" checked={layers.hideImplausible} onChange={(v) => setLayer('hideImplausible', v)}
            hint="Display only. Satellites below 100 km or above 2,000 km altitude, from stale TLEs." />
        </div>
      )}
    </div>
  )
}

export function FindSatellite() {
  const dataset = useStore((s) => s.dataset)!
  const select = useStore((s) => s.select)
  const camera = useStore((s) => s.camera)
  const [q, setQ] = useState('')
  const [miss, setMiss] = useState(false)
  const submit = () => {
    const term = q.trim().toUpperCase()
    if (!term) return
    let idx = dataset.indexOf.get(term) ?? dataset.indexOf.get(`STARLINK-${term}`)
    if (idx === undefined) idx = dataset.ids.findIndex((id) => id.toUpperCase().startsWith(term))
    if (idx === undefined || idx < 0) {
      setMiss(true)
      return
    }
    setMiss(false)
    select(idx)
    window.setTimeout(() => camera('frameSelected'), 50)
  }
  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-2.5 top-2 text-ink-faint" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setMiss(false) }}
        placeholder="Find a satellite, e.g. 1008"
        aria-label="Find a satellite by ID"
        className={`w-[220px] max-sm:w-[calc(100vw-24px)] rounded-md border bg-hull/90 py-1.5 pl-8 pr-2 text-[14px] text-ink placeholder:text-ink-faint ${miss ? 'border-danger' : 'border-seam'}`}
      />
      {miss && <div className="absolute top-9 text-[12px] text-danger">No satellite matches “{q}”</div>}
    </form>
  )
}

export function HoverTooltip() {
  const dataset = useStore((s) => s.dataset)!
  const hovered = useStore((s) => s.hovered)
  const selected = useStore((s) => s.selected)
  const time = useStore((s) => s.time)
  if (hovered === null || hovered === selected) return null
  const step = currentStep(time, dataset.steps)
  const ecl = dataset.eclipse[step * dataset.count + hovered]
  return (
    <div
      className="pointer-events-none absolute z-20 rounded border border-seam bg-void/90 px-2 py-1 text-[12.5px]"
      style={{ left: hoverPoint.x + 14, top: hoverPoint.y + 10 }}
    >
      <div className="readout text-[14px]">{dataset.ids[hovered]}</div>
      <div className="flex items-center gap-1.5 text-ink-dim">
        <Swatch color={ecl ? 'var(--color-eclipsed)' : 'var(--color-sunlit)'} />
        {ecl ? 'Eclipsed' : 'Sunlit'}. Click for details
      </div>
    </div>
  )
}

export function FpsMeter() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (ref.current) ref.current.textContent = `${perf.fps.toFixed(0)} fps (${perf.frameMs.toFixed(1)} ms)`
    }, 500)
    return () => window.clearInterval(id)
  }, [])
  return <span ref={ref} className="readout text-[12.5px] text-ink-dim" aria-live="off" />
}

export function BenchmarkControl() {
  const bench = useBench()
  const [open, setOpen] = useState(false)
  const r = bench.result
  const download = () => {
    if (!r) return
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `orbitnet-benchmark-${r.when.slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-seam bg-hull/90 px-2 py-1">
        <FpsMeter />
        <button type="button" className="flex items-center gap-1 text-[12.5px] text-signal hover:underline" onClick={() => setOpen((v) => !v)}>
          <Gauge size={13} /> Benchmark
        </button>
      </div>
      {open && (
        <div className="absolute bottom-10 right-0 z-30 w-[300px] rounded-lg border border-seam bg-hull/97 p-3 text-[13px] shadow-2xl">
          <p className="text-ink-dim">
            Plays the snapshots at 2 steps/s while the camera orbits for {BENCH_SECONDS} s, then reports frame rates
            measured in this browser.
          </p>
          {bench.running ? (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded bg-seam">
                <div className="h-full bg-signal" style={{ width: `${bench.progress * 100}%` }} />
              </div>
              <div className="mt-1 text-ink-faint">Measuring… keep this tab in front</div>
            </div>
          ) : (
            <Button className="mt-2" kind="primary" onClick={() => bench.start()}>Run benchmark</Button>
          )}
          {r && !bench.running && (
            <div className="mt-3">
              <dl className="readout grid grid-cols-2 gap-x-3 text-[13.5px]">
                <dt className="font-sans text-ink-dim">Average</dt><dd className="text-right">{fix1(r.avgFps)} fps</dd>
                <dt className="font-sans text-ink-dim">Median</dt><dd className="text-right">{fix1(r.medianFps)} fps</dd>
                <dt className="font-sans text-ink-dim">1 % low</dt><dd className="text-right">{fix1(r.low1Fps)} fps</dd>
                <dt className="font-sans text-ink-dim">95th pct frame</dt><dd className="text-right">{fix1(r.p95FrameMs)} ms</dd>
                <dt className="font-sans text-ink-dim">Draw calls</dt><dd className="text-right">{r.drawCalls}</dd>
                <dt className="font-sans text-ink-dim">Canvas</dt><dd className="text-right">{r.canvas}</dd>
              </dl>
              <div className="mt-1 break-words text-[11.5px] text-ink-faint">{r.gpu}</div>
              <Button className="mt-2" onClick={download}><Download size={14} /> Save result as JSON</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
