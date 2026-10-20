import { useEffect, useRef } from 'react'
import { PlaybackBar } from '../components/PlaybackBar'
import { HoverTooltip } from '../components/ViewerOverlays'
import { Note, Swatch } from '../components/ui'
import { api } from '../lib/api'
import { fix1, int, seconds, utcDate, utcTime } from '../lib/format'
import { currentStep, useStore } from '../lib/store'
import { useResource } from '../lib/useResource'
import { GlobeScene } from '../scene/GlobeScene'

export default function Simulation() {
  const dataset = useStore((s) => s.dataset)!
  const time = useStore((s) => s.time)
  const seek = useStore((s) => s.seek)
  const play = useStore((s) => s.play)
  const step = currentStep(time, dataset.steps)
  const meta = dataset.meta
  const cfg = meta.simulation_defaults ?? {}
  const { data: sim } = useResource('simulation', api.simulationResults)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  useEffect(() => {
    rowRefs.current[step]?.scrollIntoView({ block: 'nearest' })
  }, [step])

  const perStep = cfg.step_seconds ? cfg.step_seconds / 60 : null

  return (
    <div className="flex h-full flex-col xl:flex-row">
      <section className="relative h-[46vh] min-h-[300px] xl:h-auto xl:flex-1">
        <GlobeScene />
        <HoverTooltip />
        <div className="absolute inset-x-3 bottom-3">
          <PlaybackBar />
        </div>
      </section>

      <section className="scroll-quiet min-h-0 flex-1 overflow-y-auto border-seam xl:w-[520px] xl:flex-none xl:border-l">
        <div className="px-5 py-5">
          <h1 className="font-display text-[28px] font-semibold leading-tight">Simulation replay</h1>
          <p className="mt-1 text-[14px] text-ink-dim">
            Member 3’s run of {meta.steps} steps on {utcDate(meta.start)}, {utcTime(meta.start)} to {utcTime(meta.end)},
            replayed from the saved snapshots. Each step rebuilt the network, updated satellite energy and routed the same
            pair with the GNN and with Dijkstra.
          </p>

          <h2 className="mt-5 text-[15px] font-medium">Step log</h2>
          <div className="scroll-quiet mt-1.5 max-h-[340px] overflow-auto rounded-lg border border-seam">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-hull-2 text-left text-[12px] text-ink-dim">
                <tr>
                  <th className="px-2 py-1.5 font-normal">Step</th>
                  <th className="px-2 py-1.5 font-normal">Time</th>
                  <th className="px-2 py-1.5 text-right font-normal">Eclipsed</th>
                  <th className="px-2 py-1.5 text-right font-normal">GNN hops</th>
                  <th className="px-2 py-1.5 text-right font-normal">GNN km</th>
                  <th className="px-2 py-1.5 text-right font-normal">Dijkstra km</th>
                  <th className="px-2 py-1.5 font-normal">Route</th>
                </tr>
              </thead>
              <tbody className="readout text-[13.5px]">
                {meta.frames.map((f, i) => (
                  <tr
                    key={f.step}
                    ref={(el) => { rowRefs.current[i] = el }}
                    onClick={() => { play(false); seek(i) }}
                    className={`cursor-pointer border-t border-seam/50 ${i === step ? 'bg-signal/12 text-ink' : 'text-ink-dim hover:bg-hull-2'}`}
                  >
                    <td className="px-2 py-1">{f.step + 1}</td>
                    <td className="px-2 py-1">{utcTime(f.timestamp).replace(' UTC', '')}</td>
                    <td className="px-2 py-1 text-right">{int(f.eclipsed)}</td>
                    <td className="px-2 py-1 text-right">{int(f.gnn_hops)}</td>
                    <td className="px-2 py-1 text-right">{int(f.gnn_distance_km)}</td>
                    <td className="px-2 py-1 text-right">{int(f.dijkstra_distance_km)}</td>
                    <td className="px-2 py-1 font-sans text-[12.5px]">{i === 0 ? 'first' : f.route_changed ? <span className="text-signal">changed</span> : 'same'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[12px] text-ink-faint">Click a row to jump to that step. Arrow keys step through snapshots; space plays or pauses.</p>

          <h2 className="mt-6 text-[15px] font-medium">Configuration</h2>
          <dl className="readout mt-1 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[14px]">
            <dt className="font-sans text-ink-dim">Step length</dt><dd className="text-right">{cfg.step_seconds ?? meta.step_seconds} s</dd>
            <dt className="font-sans text-ink-dim">Steps</dt><dd className="text-right">{meta.steps}</dd>
            <dt className="font-sans text-ink-dim">Source and destination</dt>
            <dd className="text-right"><span className="text-source">{meta.frames[0].source}</span> <span className="font-sans text-ink-faint">to</span> <span className="text-dest">{meta.frames[0].target}</span></dd>
            <dt className="font-sans text-ink-dim">Starting energy</dt><dd className="text-right">{fix1(cfg.initial_energy)}</dd>
            <dt className="font-sans text-ink-dim">Charge per step in sunlight</dt><dd className="text-right">{perStep ? `+${fix1(2 * perStep)}` : '—'}</dd>
            <dt className="font-sans text-ink-dim">Drain per step in eclipse</dt><dd className="text-right">{perStep ? `−${fix1(1 * perStep)}` : '—'}</dd>
            <dt className="font-sans text-ink-dim">Cost per satellite on the route</dt><dd className="text-right">{fix1(cfg.communication_cost)}</dd>
            <dt className="font-sans text-ink-dim">Median GNN time per step</dt><dd className="text-right">{sim ? seconds((sim.derived.median_gnn_compute_ms ?? 0) / 1000) : '—'}</dd>
          </dl>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">
            Energy values are from <code>OrbitNetSimulation</code> in <code>Member_3(Pavitra)/simulation.py</code>, which scales
            Member 2’s energy model (+2 per minute in sunlight, −1 per minute in eclipse) to the step length.
          </p>

          <div className="mt-5 flex items-center gap-4 text-[13px] text-ink-dim">
            <span className="flex items-center gap-1.5"><Swatch color="var(--color-sunlit)" /> Sunlit</span>
            <span className="flex items-center gap-1.5"><Swatch color="var(--color-eclipsed)" /> Eclipsed</span>
            <span className="flex items-center gap-1.5"><Swatch color="#38d3f5" shape="line" /> Saved GNN route</span>
          </div>

          <h2 className="mt-6 text-[15px] font-medium">Running a new simulation</h2>
          <div className="mt-1.5 flex flex-col gap-2">
            <Note>
              The dashboard does not start simulations. To produce a new run, use Member 3’s script from the project root:
              <code className="mt-1.5 block rounded bg-void px-2 py-1 text-[12.5px] text-ink">python "Member_3(Pavitra)/main.py"</code>
            </Note>
            <Note tone="warn">
              <code>main.py</code> overwrites <code>results/member3/</code>, including the snapshots this dashboard replays.
              With the median step time above plus about 20 s per network rebuild, {meta.steps} steps take roughly{' '}
              {sim?.derived.median_gnn_compute_ms ? `${Math.round((meta.steps * (sim.derived.median_gnn_compute_ms / 1000 + 20)) / 60)} minutes` : 'tens of minutes'}{' '}
              on a laptop. Copy the folder first if you want to keep this run. Restart the API afterwards to load the new
              snapshots.
            </Note>
          </div>
        </div>
      </section>
    </div>
  )
}
