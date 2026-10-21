import { ArrowLeftRight, Check, ChevronDown, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNavigate } from 'react-router-dom'
import { PlaybackBar } from '../components/PlaybackBar'
import { SatelliteInspector, useSatelliteDetail } from '../components/SatelliteInspector'
import { SatellitePicker } from '../components/SatellitePicker'
import { HoverTooltip } from '../components/ViewerOverlays'
import { Button, Note, Swatch } from '../components/ui'
import { api, type AlgorithmKey, type RouteJobResult, type RouteResult } from '../lib/api'
import { fix2, fix3, int, km, seconds, utcTime } from '../lib/format'
import { clock, currentStep, useStore } from '../lib/store'
import { useResource } from '../lib/useResource'
import { GlobeScene, ROUTE_COLORS } from '../scene/GlobeScene'

const ALGOS: { key: AlgorithmKey; label: string; blurb: string }[] = [
  { key: 'gnn', label: 'GNN (V5)', blurb: 'Member 2’s trained model scores every link; shortest path on those scores.' },
  { key: 'dijkstra', label: 'Shortest distance', blurb: 'Dijkstra on link length in km. The simulation’s baseline.' },
  { key: 'teacher', label: 'Energy-aware optimum', blurb: 'Dijkstra on Member 2’s energy-aware cost, the GNN’s training target.' },
  { key: 'eclipse_avoiding', label: 'Eclipse-avoiding reference', blurb: 'Member 3’s reference: distance plus a large penalty per eclipsed hop.' },
]

export default function RoutingLab() {
  useSatelliteDetail()
  const navigate = useNavigate()
  const dataset = useStore((s) => s.dataset)!
  // Subscribe only to the fields this page uses (not the playback clock).
  const s = useStore(
    useShallow((st) => ({
      labJob: st.labJob, labResult: st.labResult, labStep: st.labStep, labSource: st.labSource,
      labTarget: st.labTarget, labAlgorithms: st.labAlgorithms, set: st.set, camera: st.camera,
    })),
  )
  const { data: status } = useResource('routing-status', api.routingStatus, { refresh: true })
  const [formError, setFormError] = useState<string | null>(null)

  // Default the step to whatever the viewer is showing.
  useEffect(() => {
    if (!s.labJob && !s.labResult) s.set({ labStep: currentStep(clock.t, dataset.steps) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll a running job (also resumes after navigating away and back).
  const job = s.labJob
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    const id = window.setInterval(async () => {
      try {
        const next = await api.routeJob(job.id)
        useStore.getState().set({ labJob: next })
        if (next.status === 'done' && next.result) showResult(next.result)
      } catch (e) {
        useStore.getState().set({ labJob: { ...job, status: 'error', error: (e as Error).message } })
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [job?.id, job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const showResult = (r: RouteJobResult) => {
    const st = useStore.getState()
    st.set({ labResult: r, labVisible: {} })
    st.play(false)
    st.seek(r.step)
    st.setLayer('savedGnn', false)
    st.setLayer('savedDijkstra', false)
    window.setTimeout(() => useStore.getState().camera('frameRoute'), 60)
  }

  const running = job && (job.status === 'queued' || job.status === 'running')
  const prepared = status?.prepared_step?.step === s.labStep

  const submit = async () => {
    setFormError(null)
    const source = s.labSource.trim()
    const target = s.labTarget.trim()
    if (!dataset.indexOf.has(source)) return setFormError(`Choose a source satellite from the snapshots (“${source || 'empty'}” is not one).`)
    if (!dataset.indexOf.has(target)) return setFormError(`Choose a destination satellite from the snapshots (“${target || 'empty'}” is not one).`)
    if (source === target) return setFormError('Source and destination must be different satellites.')
    if (!s.labAlgorithms.length) return setFormError('Choose at least one algorithm.')
    try {
      const j = await api.createRoute({ step: s.labStep, source, target, algorithms: s.labAlgorithms })
      s.set({ labJob: j })
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  const saved = dataset.meta.frames[s.labStep]
  const toggleAlgo = (k: AlgorithmKey) =>
    s.set({ labAlgorithms: s.labAlgorithms.includes(k) ? s.labAlgorithms.filter((a) => a !== k) : [...s.labAlgorithms, k] })

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left: request and results */}
      <section className="scroll-quiet order-2 min-h-0 overflow-y-auto border-seam lg:order-1 lg:w-[440px] lg:shrink-0 lg:border-r">
        <div className="px-5 py-5">
          <h1 className="font-display text-[28px] font-semibold leading-tight">Routing lab</h1>
          <p className="mt-1 text-[14px] text-ink-dim">
            Route between any two satellites at a saved step with the project’s own routing code. Nothing here is
            precomputed.
          </p>

          <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <label className="text-[13px] text-ink-dim">
              Snapshot step
              <select
                value={s.labStep}
                onChange={(e) => s.set({ labStep: Number(e.target.value) })}
                className="readout mt-1 block w-full rounded-md border border-seam bg-hull-2 px-2.5 py-1.5 text-[15px] text-ink"
              >
                {dataset.meta.frames.map((f) => (
                  <option key={f.step} value={f.step}>
                    Step {f.step + 1}, {utcTime(f.timestamp)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <SatellitePicker label="Source" tone="source" value={s.labSource} onChange={(v) => s.set({ labSource: v })} />
              <button type="button" title="Swap source and destination" aria-label="Swap source and destination"
                onClick={() => s.set({ labSource: s.labTarget, labTarget: s.labSource })}
                className="mb-1 rounded-md p-1.5 text-ink-dim hover:bg-hull-2 hover:text-ink">
                <ArrowLeftRight size={16} />
              </button>
              <SatellitePicker label="Destination" tone="dest" value={s.labTarget} onChange={(v) => s.set({ labTarget: v })} />
            </div>
            {saved.source && saved.target && (s.labSource !== saved.source || s.labTarget !== saved.target) && (
              <button type="button" className="self-start text-[13px] text-signal hover:underline"
                onClick={() => s.set({ labSource: saved.source!, labTarget: saved.target! })}>
                Use the simulation’s pair ({saved.source} to {saved.target})
              </button>
            )}

            <fieldset>
              <legend className="mb-1 text-[13px] text-ink-dim">Algorithms</legend>
              <div className="flex flex-col gap-1">
                {ALGOS.map((a) => (
                  <label key={a.key} className="flex cursor-pointer gap-2.5 rounded-md px-2 py-1.5 hover:bg-hull-2">
                    <input type="checkbox" checked={s.labAlgorithms.includes(a.key)} onChange={() => toggleAlgo(a.key)}
                      className="mt-1 accent-[var(--color-signal)]" />
                    <span>
                      <span className="flex items-center gap-2 text-[14.5px] text-ink">
                        <Swatch color={ROUTE_COLORS[a.key]} shape="line" /> {a.label}
                      </span>
                      <span className="block text-[12.5px] leading-snug text-ink-faint">{a.blurb}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {status && !status.model_present && s.labAlgorithms.includes('gnn') && (
              <Note tone="error">The GNN checkpoint {status.model_path} is missing, so the GNN route cannot be computed.</Note>
            )}
            {formError && <Note tone="error">{formError}</Note>}

            <Button type="submit" kind="primary" disabled={!!running} className="py-2">
              {running ? 'Routing…' : 'Find route'}
            </Button>
            {!running && (
              <p className="text-[12.5px] leading-snug text-ink-faint">
                {prepared
                  ? `Step ${s.labStep + 1}’s full network is already in memory, so this takes a few seconds per algorithm.`
                  : `The first request for a step rebuilds its full network with Member 1’s code (about 20 s on the test machine) and, for the GNN, scores all 1.3 million links (about 40 s). Later requests on the same step take seconds.`}
              </p>
            )}
          </form>

          {running && job && (
            <div className="mt-4 rounded-md border border-seam bg-hull-2/60 p-3" aria-live="polite">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink">{job.stage}</span>
                <span className="readout text-ink-dim">{seconds(job.elapsed_s)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-seam">
                <div className="h-full bg-signal transition-[width] duration-700" style={{ width: `${Math.max(4, job.progress * 100)}%` }} />
              </div>
            </div>
          )}
          {job?.status === 'error' && (
            <div className="mt-4"><Note tone="error">{job.error}</Note></div>
          )}

          {s.labResult && <Results result={s.labResult} />}
        </div>
      </section>

      {/* Right: the route in 3D */}
      <section className="relative order-1 h-[52vh] min-h-[320px] flex-1 lg:order-2 lg:h-auto">
        <GlobeScene />
        <HoverTooltip />
        <div className="pointer-events-none absolute right-3 top-3 bottom-[96px] w-[320px] max-w-[calc(100%-24px)] [&>*]:pointer-events-auto">
          <SatelliteInspector
            onUseInRouting={(role, id) => s.set(role === 'source' ? { labSource: id } : { labTarget: id })}
          />
        </div>
        <div className="absolute left-3 top-3 flex gap-2">
          <Button onClick={() => s.camera('frameRoute')}>Frame route</Button>
          <Button kind="ghost" onClick={() => navigate('/viewer')}>Open in viewer</Button>
        </div>
        <div className="absolute inset-x-3 bottom-3">
          <PlaybackBar compact />
        </div>
      </section>
    </div>
  )
}

function Results({ result }: { result: RouteJobResult }) {
  const dataset = useStore((s) => s.dataset)!
  const visible = useStore((s) => s.labVisible)
  const set = useStore((s) => s.set)
  const [open, setOpen] = useState<AlgorithmKey | null>(null)
  const routes = ALGOS.map((a) => result.routes[a.key]).filter(Boolean) as RouteResult[]
  const frame = dataset.meta.frames[result.step]
  const savedPair = result.saved_simulation_pair
  const isSavedPair = savedPair && savedPair.source === result.source && savedPair.target === result.target
  const same = (a?: number[] | null, b?: number[] | null) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i])
  const pc = result.network.position_check

  return (
    <div className="mt-6">
      <h2 className="font-display text-[20px] font-semibold">
        Step {result.step + 1}: <span className="readout text-source">{result.source}</span>{' '}
        <span className="text-ink-faint">to</span> <span className="readout text-dest">{result.target}</span>
      </h2>

      <div className="scroll-quiet mt-2 overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-dim">
              <th className="pb-1 font-normal" />
              <th className="whitespace-nowrap px-1.5 pb-1 text-right font-normal">Hops</th>
              <th className="whitespace-nowrap px-1.5 pb-1 text-right font-normal">Distance km</th>
              <th className="whitespace-nowrap px-1.5 pb-1 text-right font-normal" title="Satellites on the route that are eclipsed, endpoints included">Eclipsed</th>
              <th className="whitespace-nowrap px-1.5 pb-1 text-right font-normal" title="Sum of Member 2's routing_cost over the route's links">Cost</th>
              <th className="pb-1 font-normal"><span className="sr-only">Show on globe</span></th>
            </tr>
          </thead>
          <tbody className="readout text-[14.5px]">
            {routes.map((r) => (
              <tr key={r.algorithm} className="border-t border-seam/50 align-top">
                <td className="py-1.5 pr-1 font-sans text-[13.5px] leading-tight">
                  <span className="flex items-start gap-2"><span className="mt-[7px]"><Swatch color={ROUTE_COLORS[r.algorithm]} shape="line" /></span>{ALGOS.find((a) => a.key === r.algorithm)?.label}</span>
                </td>
                {r.available ? (
                  <>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right">{int(r.hops)}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right">{int(r.distance_km)}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right">{int(r.eclipsed_satellites)}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 text-right">{fix3(r.energy_aware_cost)}</td>
                    <td className="py-1.5 pl-1.5 text-right">
                      <button type="button" className="text-ink-dim hover:text-ink" title={visible[r.algorithm] === false ? 'Show on globe' : 'Hide on globe'}
                        aria-label={visible[r.algorithm] === false ? 'Show route' : 'Hide route'}
                        onClick={() => set({ labVisible: { ...visible, [r.algorithm]: visible[r.algorithm] === false } })}>
                        {visible[r.algorithm] === false ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="py-1.5 text-right font-sans text-[13px] text-warn">{r.message}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">
        Cost is Member 2’s energy-aware link cost (distance/2000 + 0.3 × energy penalty + 0.2 × eclipse penalty) summed
        along each route; lower is better. It is the quantity the GNN was trained to approximate.
      </p>

      {isSavedPair && (
        <div className="mt-3 flex flex-col gap-1 text-[13px]">
          {result.routes.gnn?.available && (
            <CheckLine ok={same(result.routes.gnn.indices, frame.gnn_route)}
              yes="GNN route is identical to the one the saved simulation found at this step"
              no="GNN route differs from the saved simulation’s route at this step" />
          )}
          {result.routes.dijkstra?.available && (
            <CheckLine ok={same(result.routes.dijkstra.indices, frame.dijkstra_route)}
              yes="Shortest-distance route is identical to the saved simulation’s"
              no="Shortest-distance route differs from the saved simulation’s" />
          )}
        </div>
      )}

      {routes.filter((r) => r.available && r.implausible_satellites?.length).map((r) => (
        <div key={`w-${r.algorithm}`} className="mt-2">
          <Note tone="warn">
            <TriangleAlert size={13} className="mr-1 inline" />
            The {ALGOS.find((a) => a.key === r.algorithm)?.label.toLowerCase()} route relays through{' '}
            {r.implausible_satellites!.join(', ')}, whose propagated altitude is not physically plausible.
          </Note>
        </div>
      ))}

      {/* Per-route hop lists */}
      <div className="mt-4 flex flex-col gap-1.5">
        {routes.filter((r) => r.available).map((r) => (
          <div key={`h-${r.algorithm}`} className="rounded-md border border-seam">
            <button type="button" onClick={() => setOpen(open === r.algorithm ? null : r.algorithm)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] hover:bg-hull-2">
              <span className="flex items-center gap-2"><Swatch color={ROUTE_COLORS[r.algorithm]} shape="line" />
                {ALGOS.find((a) => a.key === r.algorithm)?.label}: hop by hop</span>
              <ChevronDown size={15} className={`transition-transform ${open === r.algorithm ? 'rotate-180' : ''}`} />
            </button>
            {open === r.algorithm && (
              <div className="border-t border-seam px-3 py-2">
                <ol className="text-[13px]">
                  {r.nodes!.map((n, i) => (
                    <li key={n.id} className="flex items-center justify-between gap-2 py-0.5">
                      <span className="flex items-center gap-2">
                        <span className="readout w-5 text-right text-ink-faint">{i}</span>
                        <Swatch color={n.eclipsed ? 'var(--color-eclipsed)' : 'var(--color-sunlit)'} />
                        <button type="button" className="readout hover:text-signal" onClick={() => useStore.getState().select(n.index)}>{n.id}</button>
                        {n.plausible === false && <span className="text-[11.5px] text-warn">{int(n.altitude_km)} km alt.</span>}
                      </span>
                      <span className="readout text-ink-dim">
                        {i < r.links!.length ? `${km(r.links![i].distance_km)} →` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                <dl className="readout mt-2 grid grid-cols-2 gap-x-3 text-[13px] text-ink-dim">
                  {r.gnn_cost != null && (<><dt className="font-sans">GNN cost (model)</dt><dd className="text-right text-ink">{fix3(r.gnn_cost)}</dd></>)}
                  <dt className="font-sans">Lowest energy on route</dt><dd className="text-right text-ink">{fix2(r.min_energy_on_route)}</dd>
                  <dt className="font-sans">Energy drawn (Member 2 model)</dt><dd className="text-right text-ink">{fix2(r.communication_energy)}</dd>
                  <dt className="font-sans">Path search time</dt><dd className="text-right text-ink">{seconds(r.route_seconds)}</dd>
                </dl>
              </div>
            )}
          </div>
        ))}
      </div>

      <details className="mt-4 text-[13px] text-ink-dim">
        <summary className="cursor-pointer hover:text-ink">How this was computed</summary>
        <div className="mt-2 flex flex-col gap-1.5 leading-snug">
          <p>
            Full network rebuilt with Member 1’s <code>get_network</code> for {utcTime(result.timestamp)}:{' '}
            {int(result.network.nodes)} satellites, {int(result.network.edges)} links, {int(result.network.components)}{' '}
            connected components (largest {int(result.network.largest_component)}), in {seconds(result.network.rebuild_seconds)}.
          </p>
          <CheckLine ok={pc.matches_snapshot}
            yes={`Rebuilt positions match the saved snapshot (largest difference ${pc.max_position_difference_km?.toExponential(1)} km)`}
            no={`Rebuilt positions differ from the saved snapshot (largest difference ${pc.max_position_difference_km?.toFixed(3)} km; ${pc.nodes_not_in_snapshot} satellites not in the snapshot)`} />
          {result.network.gnn_scoring_seconds != null && <p>GNN link scoring took {seconds(result.network.gnn_scoring_seconds)}.</p>}
          <p>{result.energy_state}</p>
        </div>
      </details>
    </div>
  )
}

function CheckLine({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <div className={`flex items-start gap-1.5 ${ok ? 'text-teacher' : 'text-warn'}`}>
      {ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0" />}
      <span>{ok ? yes : no}</span>
    </div>
  )
}
