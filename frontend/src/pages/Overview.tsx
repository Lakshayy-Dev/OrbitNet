import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Assumptions } from '../components/Assumptions'
import { CHART, ChartBlock, StepLines } from '../components/charts'
import { PlaybackBar } from '../components/PlaybackBar'
import { Field, Panel, Swatch } from '../components/ui'
import { api } from '../lib/api'
import { fix1, int, km, pct, utcDate, utcTime } from '../lib/format'
import { currentStep, useStore } from '../lib/store'
import { useResource } from '../lib/useResource'

export default function Overview() {
  const dataset = useStore((s) => s.dataset)!
  const time = useStore((s) => s.time)
  const step = currentStep(time, dataset.steps)
  const meta = dataset.meta
  const f = meta.frames[step]
  const { data: routing } = useResource('routing-status', api.routingStatus, { refresh: true })
  const { data: sim } = useResource('simulation', api.simulationResults)

  const total = dataset.count
  const sunlitShare = f.sunlit / total
  const prepared = routing?.prepared_step?.step === step ? routing.prepared_step : null
  const avgDegree = f.full_graph_edges ? (2 * f.full_graph_edges) / (f.full_graph_nodes ?? total) : null
  const changes = meta.frames.filter((x) => x.route_changed).length

  const eclipseSeries = meta.frames.map((x) => ({ step: x.step, eclipsed: x.eclipsed }))

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-5 py-6 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[32px] font-semibold leading-tight">Constellation at step {step + 1}</h1>
            <p className="mt-1 text-ink-dim">
              {utcDate(f.timestamp)}, {utcTime(f.timestamp)}. Saved simulation snapshots from{' '}
              <code className="text-[13px] text-ink">{meta.snapshot_file}</code>
            </p>
          </div>
          <Link to="/viewer" className="flex items-center gap-1.5 rounded-md bg-signal px-3.5 py-2 text-[14px] font-semibold text-void hover:bg-[#6fe1fa]">
            Open the 3D viewer <ArrowRight size={16} />
          </Link>
        </header>

        <div className="mt-4">
          <PlaybackBar compact />
        </div>

        {/* Sunlit / eclipsed proportion: the headline state of the network. */}
        <section className="mt-6" aria-label="Sunlit and eclipsed satellites">
          <div className="flex items-baseline justify-between text-[14px]">
            <span className="flex items-center gap-2"><Swatch color="var(--color-sunlit)" /> Sunlit <span className="readout text-[20px]">{int(f.sunlit)}</span></span>
            <span className="readout text-[13px] text-ink-faint">{pct(sunlitShare)} of {int(total)} satellites</span>
            <span className="flex items-center gap-2"><span className="readout text-[20px]">{int(f.eclipsed)}</span> Eclipsed <Swatch color="var(--color-eclipsed)" /></span>
          </div>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-seam" role="img" aria-label={`${int(f.sunlit)} sunlit, ${int(f.eclipsed)} eclipsed`}>
            <div className="h-full bg-sunlit" style={{ width: `${sunlitShare * 100}%` }} />
            <div className="h-full w-[2px] bg-void" />
            <div className="h-full flex-1 bg-eclipsed" />
          </div>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Panel title="Network at this step">
            <dl className="divide-y divide-seam/50">
              <Field label="Satellites in the snapshot" value={int(total)} />
              <Field label="Links in Member 1’s full graph" value={int(f.full_graph_edges)} />
              <Field label="Average links per satellite" value={fix1(avgDegree)} />
              <Field label="Links saved for display" value={int(f.sampled_links)} hint={f.full_graph_edges ? pct(f.sampled_links / f.full_graph_edges, 1) : undefined} />
              <Field label="Connected components" value={prepared?.components != null ? int(prepared.components) : 'Not computed'}
                hint={prepared?.largest_component ? `largest ${int(prepared.largest_component)}` : undefined} />
              <Field label="Implausible positions" value={int(f.implausible)} tone={f.implausible ? 'text-warn' : undefined} />
            </dl>
            {!prepared && (
              <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
                Components need the full 1.3-million-link graph, which the snapshots do not store. They are counted when a
                Routing Lab request rebuilds this step with Member 1’s code.
              </p>
            )}
          </Panel>

          <Panel title="Saved simulation run" aside={<Link to="/simulation" className="text-signal hover:underline">Details</Link>}>
            <dl className="divide-y divide-seam/50">
              <Field label="Snapshots" value={`${meta.steps}, ${meta.step_seconds} s apart`} />
              <Field label="Time span" value={`${utcTime(meta.start)} to ${utcTime(meta.end)}`} />
              <Field label="Route endpoints" value={<><span className="text-source">{f.source}</span> <span className="text-ink-faint">to</span> <span className="text-dest">{f.target}</span></>} />
              <Field label="Route found at" value={sim ? `${sim.derived.available_steps} of ${sim.derived.steps} steps` : '—'} />
              <Field label="GNN route changed" value={`${changes} of ${meta.steps - 1} step transitions`} />
              <Field label="GNN model checkpoint" value={routing ? (routing.model_present ? 'Present' : 'Missing') : '—'}
                hint={routing?.model_path} tone={routing && !routing.model_present ? 'text-danger' : undefined} />
            </dl>
            <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
              The dashboard replays these results. It never starts the 20-step simulation by itself.
            </p>
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="Route at this step">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12.5px] text-ink-dim">
                  <th className="pb-1 font-normal" />
                  <th className="pb-1 text-right font-normal">Hops</th>
                  <th className="pb-1 text-right font-normal">Distance</th>
                  <th className="pb-1 text-right font-normal">Eclipsed satellites</th>
                  <th className="pb-1 text-right font-normal">Implausible altitude</th>
                </tr>
              </thead>
              <tbody className="readout text-[15px]">
                <tr className="border-t border-seam/50">
                  <td className="py-1.5 font-sans"><span className="flex items-center gap-2"><Swatch color={CHART.gnn} shape="line" />GNN</span></td>
                  <td className="text-right">{int(f.gnn_hops)}</td>
                  <td className="text-right">{km(f.gnn_distance_km)}</td>
                  <td className="text-right">{int(f.gnn_eclipsed)}</td>
                  <td className="text-right">{int(f.gnn_implausible.length)}</td>
                </tr>
                <tr className="border-t border-seam/50">
                  <td className="py-1.5 font-sans"><span className="flex items-center gap-2"><Swatch color={CHART.dijkstra} shape="line" />Dijkstra</span></td>
                  <td className="text-right">{int(f.dijkstra_hops)}</td>
                  <td className="text-right">{km(f.dijkstra_distance_km)}</td>
                  <td className="text-right">{int(f.dijkstra_eclipsed)}</td>
                  <td className={`text-right ${f.dijkstra_implausible.length ? 'text-warn' : ''}`}>{int(f.dijkstra_implausible.length)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
              From <code>simulation_results.csv</code>. Eclipsed satellites include the endpoints. “Implausible altitude” counts
              route satellites propagated below 100 km or above 2,000 km.
            </p>
          </Panel>

          <Panel title="Eclipsed satellites across the run">
            <ChartBlock
              title=""
              table={{ head: ['Step', 'Eclipsed'], rows: eclipseSeries.map((r) => [r.step + 1, r.eclipsed]) }}
            >
              <StepLines data={eclipseSeries} series={[{ key: 'eclipsed', label: 'Eclipsed', color: CHART.eclipsed }]}
                height={170} highlightStep={step} />
            </ChartBlock>
          </Panel>
        </div>

        <section className="mt-6">
          <h2 className="font-display text-[21px] font-semibold">Assumptions and data warnings</h2>
          <div className="mt-2">
            <Assumptions compact />
          </div>
        </section>
      </div>
    </div>
  )
}
