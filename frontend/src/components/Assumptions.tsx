import { api } from '../lib/api'
import { int, utcDate } from '../lib/format'
import { useStore } from '../lib/store'
import { useResource } from '../lib/useResource'
import { Note } from './ui'

/** Scientific assumptions and data-quality warnings, from the actual data. */
export function Assumptions({ compact = false }: { compact?: boolean }) {
  const dataset = useStore((s) => s.dataset)!
  const meta = dataset.meta
  const { data: sim } = useResource('simulation', api.simulationResults)
  const tle = meta.tle
  const dijkstraSteps = meta.frames.filter((f) => f.dijkstra_implausible.length > 0).length
  const gnnSteps = meta.frames.filter((f) => f.gnn_implausible.length > 0).length
  const daysPast = tle
    ? Math.round((new Date(meta.start).getTime() - new Date(tle.latest).getTime()) / 86_400_000)
    : null

  return (
    <div className="flex flex-col gap-2">
      <Note>
        <strong className="font-medium text-ink">Link range.</strong> Two satellites are linked when they are within{' '}
        {int(meta.link_distance_km)} km of each other and the straight line between them clears the Earth (Member 1’s
        network builder). The {int(meta.link_distance_km)} km limit is a prototype assumption, not a verified Starlink
        laser-link specification.
      </Note>
      <Note>
        <strong className="font-medium text-ink">Eclipse model.</strong> A satellite is eclipsed when it is on the
        night side and inside a cylinder of Earth’s radius ({meta.earth_radius_km} km) pointing away from the Sun. There
        is no penumbra and no atmospheric refraction, so states near the shadow edge are approximate.
      </Note>
      {tle && (
        <Note tone={daysPast && daysPast > 14 ? 'warn' : 'info'}>
          <strong className="font-medium">Positions are propagated, not tracked.</strong> All {int(tle.records)} TLEs in{' '}
          <code>{tle.file}</code> date from {utcDate(tle.earliest)} to {utcDate(tle.latest)}. The saved snapshots
          ({utcDate(meta.start)}) are about {daysPast} days past those epochs, and SGP4 errors grow with that gap, so the
          constellation’s geometry is representative rather than the exact positions on that date.
        </Note>
      )}
      <Note tone="warn">
        <strong className="font-medium">Implausible positions.</strong> {int(meta.implausible_satellites_any_step)}{' '}
        satellites have propagated altitudes below {meta.plausible_altitude_km[0]} km (many inside the Earth) or above{' '}
        {int(meta.plausible_altitude_km[1])} km in at least one snapshot, typical of decayed or stale TLEs. Member 1 removes
        only non-finite positions, so they stay in the graph. Those inside the Earth get no links, but those a few tens of
        kilometres above the surface do
        {dijkstraSteps > 0 && (
          <>
            , and the saved Dijkstra routes relay through them at {dijkstraSteps} of {meta.steps} steps (the saved GNN
            routes at {gnnSteps})
          </>
        )}
        . The viewer can hide them (display only).
      </Note>
      {sim && sim.summary_mismatches.length > 0 && (
        <Note tone="warn">
          <strong className="font-medium">summary.txt is out of date.</strong> {sim.summary_mismatches.length} of its
          averages do not match <code>simulation_results.csv</code>, which agrees with the saved snapshots (for example
          average GNN hops {sim.summary_mismatches.find((m) => m.key === 'avg_gnn_hops')?.summary_txt ?? '—'} in
          summary.txt against {sim.derived.avg_gnn_hops ?? '—'} in the CSV). The dashboard computes its averages from the
          CSV and leaves summary.txt unchanged.
        </Note>
      )}
      {!compact && (
        <Note>
          <strong className="font-medium text-ink">Visual approximations.</strong> The Earth imagery, city lights, star
          background, Sun glow and atmosphere are illustrations. The Earth’s orientation and the Sun direction are
          computed for each snapshot time with Skyfield, so day and night on the globe agree with the eclipse flags.
        </Note>
      )}
    </div>
  )
}
