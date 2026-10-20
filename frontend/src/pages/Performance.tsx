import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, ChartBlock, SimpleBars, StepLines } from '../components/charts'
import { Note, Swatch } from '../components/ui'
import { api, type SimulationResults } from '../lib/api'
import { fix1, fix2, fix3, int, km, pct, seconds } from '../lib/format'
import { useStore } from '../lib/store'
import { useResource } from '../lib/useResource'

export default function Performance() {
  const dataset = useStore((s) => s.dataset)!
  const { data: sim, error: simErr } = useResource('simulation', api.simulationResults)
  const { data: ev, error: evErr } = useResource('gnn-eval', api.gnnEvaluation)
  const { data: sc } = useResource('scenarios', api.scenarios)

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-5 py-6 md:px-8">
        <h1 className="font-display text-[32px] font-semibold leading-tight">How the routes compare</h1>
        <p className="mt-1 max-w-[70ch] text-ink-dim">
          Results the team already produced, read from the saved files. Averages are recomputed from the rows shown;
          nothing on this page is estimated.
        </p>

        {simErr && <div className="mt-4"><Note tone="error">{simErr}</Note></div>}
        {sim && <DynamicSection sim={sim} implausibleSteps={dataset.meta.frames.filter((f) => f.dijkstra_implausible.length).map((f) => f.step + 1)} gnnImplausible={dataset.meta.frames.filter((f) => f.gnn_implausible.length).length} />}

        {evErr && <div className="mt-4"><Note tone="error">{evErr}</Note></div>}
        {ev && <StaticSection ev={ev} />}

        {sc && (
          <section className="mt-10">
            <h2 className="font-display text-[23px] font-semibold">Controlled scenario tests</h2>
            <p className="mt-1 max-w-[72ch] text-[14px] text-ink-dim">
              {sc.notes.join(' ')} They check behaviour on known topologies; they are not orbital results.
            </p>
            <div className="scroll-quiet mt-3 overflow-x-auto rounded-lg border border-seam">
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead className="bg-hull-2 text-left text-[12.5px] text-ink-dim">
                  <tr>
                    {['Scenario', 'Eclipsed nodes', 'Dijkstra route', 'GNN route', 'Eclipsed on GNN route', 'Eclipse-avoiding reference'].map((h) => (
                      <th key={h} className="px-3 py-2 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sc.rows.map((r) => (
                    <tr key={String(r.scenario)} className="border-t border-seam/60">
                      <td className="px-3 py-1.5">{String(r.scenario).replace(/_/g, ' ')}</td>
                      <td className="readout px-3 py-1.5">{r.eclipsed_nodes}</td>
                      <td className="readout px-3 py-1.5">{r.dijkstra_route}</td>
                      <td className="readout px-3 py-1.5">{r.gnn_route}</td>
                      <td className="readout px-3 py-1.5">{r.gnn_eclipsed}</td>
                      <td className="readout px-3 py-1.5">{r.eclipse_avoiding_reference_route || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const d = sc.rows.find((r) => r.scenario === 'difficult_routing')
              if (!d || !d.eclipse_avoiding_reference_route) return null
              const gnnAvoided = Number(d.gnn_eclipsed) === 0
              return (
                <p className="mt-2 max-w-[72ch] text-[13.5px] text-ink-dim">
                  In the “difficult routing” case an eclipse-free path exists ({d.eclipse_avoiding_reference_route}), but
                  the GNN {gnnAvoided ? 'took it' : `chose ${d.gnn_route}, which passes through ${d.gnn_eclipsed} eclipsed satellite`}
                  {gnnAvoided ? '.' : ', the same as the shortest-distance route.'}
                </p>
              )
            })()}
          </section>
        )}

        <section className="mt-10 mb-4">
          <h2 className="font-display text-[23px] font-semibold">Source files</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {['simulation_results.csv', 'evaluation_results_v5.csv', 'scenario_results.csv', 'summary.txt', 'route_distance.png', 'route_hops.png', 'eclipse_usage.png', 'network_eclipse_count.png'].map((f) => (
              <a key={f} href={`/api/results/files/${f}`} className="flex items-center gap-1.5 rounded-md border border-seam bg-hull-2 px-2.5 py-1 text-[13px] text-ink-dim hover:border-ink-faint hover:text-ink">
                <Download size={13} /> {f}
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Readout({ label, a, b, aLabel = 'GNN', bLabel = 'Dijkstra', foot }: { label: string; a: string; b?: string; aLabel?: string; bLabel?: string; foot?: string }) {
  return (
    <div className="border-l border-seam pl-3">
      <div className="text-[13px] text-ink-dim">{label}</div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
        <span className="readout text-[24px] leading-tight text-ink">{a}</span>
        {b !== undefined && <span className="readout text-[15px] text-ink-dim">{bLabel} {b}</span>}
      </div>
      <div className="text-[12px] text-ink-faint">{b !== undefined ? aLabel : ''}{foot ? `${b !== undefined ? '. ' : ''}${foot}` : ''}</div>
    </div>
  )
}

function DynamicSection({ sim, implausibleSteps, gnnImplausible }: {
  sim: SimulationResults
  implausibleSteps: number[]
  gnnImplausible: number
}) {
  const d = sim.derived
  const steps = sim.steps
  const series = [
    { key: 'gnn', label: 'GNN', color: CHART.gnn },
    { key: 'dijkstra', label: 'Dijkstra (shortest distance)', color: CHART.dijkstra },
  ]
  const rows = (g: keyof (typeof steps)[number], k: keyof (typeof steps)[number]) =>
    steps.map((s) => ({ step: s.step, gnn: s[g] as number | null, dijkstra: s[k] as number | null }))
  const lenDiff = d.avg_gnn_distance_km && d.avg_dijkstra_distance_km ? d.avg_gnn_distance_km / d.avg_dijkstra_distance_km - 1 : null
  const clip = d.median_gnn_compute_ms ? Math.ceil((d.median_gnn_compute_ms / 1000) * 1.6 / 10) * 10 : undefined
  const computeRows = steps.map((s) => ({ step: s.step, seconds: s.gnn_compute_ms != null ? s.gnn_compute_ms / 1000 : null }))
  const relayRows = steps.slice(1).map((s) => ({ step: s.step, kept: s.relays_kept_from_previous }))
  const relaysTotal = steps[1]?.relays_total ?? 0

  return (
    <section className="mt-8">
      <h2 className="font-display text-[23px] font-semibold">Dynamic simulation, {d.steps} steps</h2>
      <p className="mt-1 max-w-[72ch] text-[14px] text-ink-dim">
        One source and destination ({steps[0]?.source} to {steps[0]?.target}) routed every {dataset_step_seconds(steps)} s
        as the constellation moves. From <code>simulation_results.csv</code>, the same run as the saved snapshots.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <Readout label="Average route length" a={km(d.avg_gnn_distance_km)} b={km(d.avg_dijkstra_distance_km)} />
        <Readout label="Average hops" a={fix1(d.avg_gnn_hops)} b={fix1(d.avg_dijkstra_hops)} />
        <Readout label="Average eclipsed satellites on the route" a={fix2(d.avg_gnn_eclipsed)} b={fix2(d.avg_dijkstra_eclipsed)} />
        <Readout label="Steps with a route" a={`${d.available_steps} of ${d.steps}`} foot="GNN" />
        <Readout label="GNN route changes" a={`${d.route_changes} of ${(d.steps ?? 1) - 1}`} foot={`about ${fix1(d.avg_relays_kept)} of ${relaysTotal} relays kept per step`} />
        <Readout label="GNN time per step" a={seconds((d.median_gnn_compute_ms ?? 0) / 1000)} foot={`median; slowest step ${seconds((d.max_gnn_compute_ms ?? 0) / 1000)}`} />
      </div>

      <div className="mt-5 max-w-[78ch] text-[14.5px] leading-relaxed text-ink">
        <p>
          Over this run the GNN’s routes were {pct(Math.abs(lenDiff ?? 0), 1)} {lenDiff && lenDiff > 0 ? 'longer' : 'shorter'} than
          the shortest-distance routes on average, used {fix1((d.avg_dijkstra_hops ?? 0) - (d.avg_gnn_hops ?? 0))} fewer hops,
          and passed through {fix2(d.avg_gnn_eclipsed)} eclipsed satellites against {fix2(d.avg_dijkstra_eclipsed)} for
          Dijkstra. The GNN route changed at {d.route_changes} of the {(d.steps ?? 1) - 1} step-to-step transitions, keeping on average{' '}
          {fix1(d.avg_relays_kept)} of its {relaysTotal} relays, so it is not stable from one 30-second step to the next.
        </p>
      </div>

      {implausibleSteps.length > 0 && (
        <div className="mt-3 max-w-[78ch]">
          <Note tone="warn">
            The saved Dijkstra routes relay through satellites with implausible propagated altitudes (decayed TLEs)
            at steps{' '}
            {implausibleSteps.join(', ')} ({implausibleSteps.length} of {d.steps}); the GNN routes do so at {gnnImplausible}.
            The baseline’s distance figures at those steps therefore rely on satellites that could not be there.
          </Note>
        </div>
      )}

      <div className="mt-6 grid gap-x-8 gap-y-8 lg:grid-cols-2">
        <ChartBlock title="Route length per step"
          table={{ head: ['Step', 'GNN km', 'Dijkstra km'], rows: steps.map((s) => [s.step + 1, int(s.gnn_distance_km), int(s.dijkstra_distance_km)]) }}>
          <StepLines data={rows('gnn_distance_km', 'dijkstra_distance_km')} series={series} unit="km" />
        </ChartBlock>
        <ChartBlock title="Hops per step"
          table={{ head: ['Step', 'GNN', 'Dijkstra'], rows: steps.map((s) => [s.step + 1, s.gnn_hops ?? '—', s.dijkstra_hops ?? '—']) }}>
          <StepLines data={rows('gnn_hops', 'dijkstra_hops')} series={series} yDomain={[0, 'auto']} />
        </ChartBlock>
        <ChartBlock title="Eclipsed satellites on the route" caption="Endpoints included, as counted by Member 3’s simulation."
          table={{ head: ['Step', 'GNN', 'Dijkstra'], rows: steps.map((s) => [s.step + 1, s.gnn_eclipsed ?? '—', s.dijkstra_eclipsed ?? '—']) }}>
          <StepLines data={rows('gnn_eclipsed', 'dijkstra_eclipsed')} series={series} yDomain={[0, 'auto']} />
        </ChartBlock>
        <ChartBlock title={`GNN relays kept from the previous step (of ${relaysTotal})`}
          caption="Relays are the route satellites between source and destination."
          table={{ head: ['Step', 'Relays kept'], rows: relayRows.map((r) => [r.step + 1, r.kept ?? '—']) }}>
          <SimpleBars data={relayRows} valueKey="kept" categoryKey="step" color={CHART.gnn} categoryFormat={(c) => String(Number(c) + 1)} />
        </ChartBlock>
        <ChartBlock title="GNN computation time per step"
          caption={`Scoring ~1.3 million links plus the path search, on the machine that ran the simulation. Bars above ${clip} s are cut at the top edge. Dijkstra time was not logged.`}
          table={{ head: ['Step', 'Seconds'], rows: computeRows.map((r) => [r.step + 1, r.seconds != null ? r.seconds.toFixed(1) : '—']) }}>
          <SimpleBars data={computeRows} valueKey="seconds" categoryKey="step" color={CHART.gnn} unit="s" clipAt={clip}
            categoryFormat={(c) => String(Number(c) + 1)} />
        </ChartBlock>
      </div>

      {sim.summary_mismatches.length > 0 && (
        <div className="mt-6 max-w-[78ch]">
          <Note tone="warn">
            <code>results/member3/summary.txt</code> does not match this CSV ({sim.summary_mismatches.length} values differ,
            e.g. average GNN distance {km(sim.summary_mismatches.find((m) => m.key === 'avg_gnn_distance_km')?.summary_txt)} in
            summary.txt against {km(d.avg_gnn_distance_km)} here). It appears to come from an earlier run, so these figures
            use the CSV, which agrees with the saved snapshots.
          </Note>
        </div>
      )}
    </section>
  )
}

function dataset_step_seconds(steps: { timestamp: string }[]) {
  if (steps.length < 2) return '—'
  return Math.round((new Date(steps[1].timestamp).getTime() - new Date(steps[0].timestamp).getTime()) / 1000)
}

function StaticSection({ ev }: { ev: Awaited<ReturnType<typeof api.gnnEvaluation>> }) {
  const d = ev.derived
  // Histogram of the GNN / optimum cost ratio.
  const width = 0.025
  const bins: { bin: string; count: number; from: number }[] = []
  for (let lo = 1; lo < 1.3 - 1e-9; lo += width) bins.push({ bin: `${lo.toFixed(3)}`, count: 0, from: lo })
  bins.push({ bin: '≥1.300', count: 0, from: 1.3 })
  for (const r of ev.rows) {
    const x = r.gnn_teacher_ratio
    const i = x >= 1.3 ? bins.length - 1 : Math.max(0, Math.floor((x - 1) / width + 1e-9))
    bins[Math.min(i, bins.length - 1)].count++
  }
  const n = d.tests ?? ev.rows.length
  const cheaper = Math.round((d.gnn_cheaper_than_baseline ?? 0) * n)

  return (
    <section className="mt-12">
      <h2 className="font-display text-[23px] font-semibold">Static evaluation, {n} random pairs</h2>
      <p className="mt-1 max-w-[72ch] text-[14px] text-ink-dim">{ev.notes.join(' ')}</p>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Readout label="Energy-aware optimum (teacher)" a={fix3(d.avg_teacher_cost)} foot="average route cost" />
        <Readout label="GNN" a={fix3(d.avg_gnn_cost)} foot={`${pct((d.gnn_over_teacher ?? 1) - 1, 1)} above the optimum`} />
        <Readout label="Shortest distance (baseline)" a={fix3(d.avg_baseline_cost)} foot={`${pct((d.baseline_over_teacher ?? 1) - 1, 1)} above the optimum`} />
        <Readout label="GNN cheaper than baseline" a={`${cheaper} of ${n}`} foot="pairs" />
      </div>

      <div className="mt-5 max-w-[78ch] text-[14.5px] leading-relaxed text-ink">
        <p>
          On this test the GNN’s routes cost on average {pct((d.gnn_over_teacher ?? 1) - 1, 1)} more than the energy-aware
          optimum it was trained to imitate, while the plain shortest-distance route cost{' '}
          {pct((d.baseline_over_teacher ?? 1) - 1, 1)} more. The GNN came within 5 % of the optimum on{' '}
          {pct(d.within_5pct)} of pairs, within 10 % on {pct(d.within_10pct)} and within 20 % on {pct(d.within_20pct)}. It used
          fewer hops ({fix2(d.avg_gnn_hops)} against {fix2(d.avg_teacher_hops)} for the optimum and{' '}
          {fix2(d.avg_baseline_hops)} for the baseline) and longer distances ({km(d.avg_gnn_distance_km)} against{' '}
          {km(d.avg_teacher_distance_km)} and {km(d.avg_baseline_distance_km)}).
        </p>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <ChartBlock title="GNN route cost relative to the optimum"
          caption="Each bar counts test pairs whose GNN route cost falls in that range, as a multiple of the optimum’s cost. 1.000 means the GNN matched the optimum."
          table={{ head: ['Ratio from', 'Pairs'], rows: bins.map((b) => [b.bin, b.count]) }}>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 8, right: 12, bottom: 0, left: -10 }} barCategoryGap={2}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="bin" stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 11, fontFamily: 'Barlow Condensed' }} tickLine={false} interval={1} />
                <YAxis stroke={CHART.axis} tick={{ fill: CHART.axis, fontSize: 12, fontFamily: 'Barlow Condensed' }} tickLine={false} allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: '#fff', fillOpacity: 0.04 }}
                  content={({ active, payload }) => active && payload?.length ? (
                    <div className="rounded-md border border-seam bg-void/95 px-2.5 py-1.5 text-[12.5px]">
                      <div className="text-ink-dim">Ratio {payload[0].payload.bin}{payload[0].payload.from < 1.3 ? ` to ${(payload[0].payload.from + width).toFixed(3)}` : ''}</div>
                      <div className="readout text-[14px] text-ink">{payload[0].value} pairs</div>
                    </div>
                  ) : null} />
                <Bar dataKey="count" fill={CHART.gnn} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartBlock>

        <ChartBlock title="Averages per route"
          table={{ head: ['', 'Optimum', 'GNN', 'Baseline'], rows: [
            ['Cost', fix3(d.avg_teacher_cost), fix3(d.avg_gnn_cost), fix3(d.avg_baseline_cost)],
            ['Distance km', int(d.avg_teacher_distance_km), int(d.avg_gnn_distance_km), int(d.avg_baseline_distance_km)],
            ['Hops', fix2(d.avg_teacher_hops), fix2(d.avg_gnn_hops), fix2(d.avg_baseline_hops)],
          ] }}>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] text-ink-dim">
                <th className="pb-1 font-normal" />
                <th className="pb-1 text-right font-normal"><span className="inline-flex items-center gap-1.5"><Swatch color={CHART.teacher} shape="line" />Optimum</span></th>
                <th className="pb-1 text-right font-normal"><span className="inline-flex items-center gap-1.5"><Swatch color={CHART.gnn} shape="line" />GNN</span></th>
                <th className="pb-1 text-right font-normal"><span className="inline-flex items-center gap-1.5"><Swatch color={CHART.dijkstra} shape="line" />Baseline</span></th>
              </tr>
            </thead>
            <tbody className="readout text-[15px]">
              <tr className="border-t border-seam/60"><td className="py-1.5 font-sans text-[13.5px] text-ink-dim">Cost</td><td className="text-right">{fix3(d.avg_teacher_cost)}</td><td className="text-right">{fix3(d.avg_gnn_cost)}</td><td className="text-right">{fix3(d.avg_baseline_cost)}</td></tr>
              <tr className="border-t border-seam/60"><td className="py-1.5 font-sans text-[13.5px] text-ink-dim">Distance</td><td className="text-right">{km(d.avg_teacher_distance_km)}</td><td className="text-right">{km(d.avg_gnn_distance_km)}</td><td className="text-right">{km(d.avg_baseline_distance_km)}</td></tr>
              <tr className="border-t border-seam/60"><td className="py-1.5 font-sans text-[13.5px] text-ink-dim">Hops</td><td className="text-right">{fix2(d.avg_teacher_hops)}</td><td className="text-right">{fix2(d.avg_gnn_hops)}</td><td className="text-right">{fix2(d.avg_baseline_hops)}</td></tr>
            </tbody>
          </table>
        </ChartBlock>
      </div>
    </section>
  )
}
