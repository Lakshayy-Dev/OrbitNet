import type { ReactNode } from 'react'
import { Assumptions } from '../components/Assumptions'
import { int } from '../lib/format'
import { useStore } from '../lib/store'

export default function About() {
  const dataset = useStore((s) => s.dataset)!
  const f0 = dataset.meta.frames[0]
  const degree = f0.full_graph_edges && f0.full_graph_nodes ? (2 * f0.full_graph_edges) / f0.full_graph_nodes : null

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <article className="mx-auto max-w-[860px] px-5 py-8 md:px-8">
        <h1 className="font-display text-[34px] font-semibold leading-tight">About OrbitNet</h1>
        <p className="mt-3 text-[16.5px] leading-relaxed text-ink">
          OrbitNet studies how to route data across a low-Earth-orbit constellation so that traffic avoids satellites that
          are in Earth’s shadow and short of energy. A graph neural network learns a cost for every inter-satellite link
          from each satellite’s position, eclipse state and energy, and routes follow the cheapest path under those learned
          costs. The constellation is modelled from {int(dataset.count)} Starlink orbits.
        </p>

        <Section title="How the pieces fit">
          <Pipeline />
          <p className="mt-3">
            The dashboard reads Member 3’s saved snapshots and results directly, and calls the members’ Python code through
            the API when a new route is requested. None of the members’ files are modified; the API adds their folders to
            Python’s import path and uses their functions as they are.
          </p>
        </Section>

        <Section title="Team contributions">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Member name="Member 1, Lakshay" role="Satellite network">
              Loads the TLE file, propagates every satellite with Skyfield (SGP4), flags eclipses, and links satellites
              within range that can see each other past the Earth. Output: a NetworkX graph through{' '}
              <code>get_network(timestamp)</code>.
            </Member>
            <Member name="Member 2, Krishna" role="GNN routing">
              Energy model, energy-aware link cost (the “teacher”), and the V5 model: two GraphSAGE layers (6 → 32 → 16)
              and a link-cost network (37 → 64 → 32 → 1) whose outputs drive a shortest-path search. Trained weights:{' '}
              <code>orbitnet_gnn_v5.pth</code>.
            </Member>
            <Member name="Member 3, Pavitra" role="Simulation and evaluation">
              The time-stepped simulation that carries energy between steps and compares the GNN with Dijkstra, scenario
              tests, metrics, plots, the reusable router adapter, and the saved snapshots this dashboard replays.
            </Member>
          </dl>
        </Section>

        <Section title="Technology">
          <ul className="list-disc space-y-1 pl-5">
            <li>Backend: Python, FastAPI, NetworkX, NumPy/SciPy, Skyfield, PyTorch and PyTorch Geometric (through the members’ code).</li>
            <li>Frontend: React, TypeScript, Vite, Tailwind CSS, three.js with React Three Fiber, Recharts.</li>
            <li>Runs locally with no paid services or API keys. Earth imagery is bundled (see <code>frontend/public/textures/NOTICE.md</code>).</li>
          </ul>
        </Section>

        <Section title="Why the 3D view moved from Plotly to WebGL">
          <p>
            The original Plotly animation sends whole traces through Plotly’s data pipeline for every frame, so the browser
            re-processes thousands of points and lines each time and playback stutters. Here the Earth, textures and
            geometry are uploaded to the graphics card once. All {int(dataset.count)} satellites are one draw call and the
            link sample is another; both read the same two position buffers (this snapshot and the next) and the graphics
            card blends between them. Advancing playback changes a single number per frame, and moving to a new snapshot
            uploads about 260 KB. The route is redrawn each frame from its 10 to 20 satellites.
          </p>
          <p className="mt-2">
            Motion between snapshots is interpolated along each satellite’s arc for display. Eclipse states and routes change
            only at the saved 30-second steps, and the step readout says when the view is between snapshots. Smooth motion
            can be turned off to show the saved positions only.
          </p>
        </Section>

        <Section title="Assumptions">
          <Assumptions />
        </Section>

        <Section title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The saved run covers {dataset.meta.steps} steps over about {Math.round(((dataset.meta.steps - 1) * dataset.meta.step_seconds) / 60)} minutes for one source and destination.</li>
            <li>
              Links depend only on distance and line of sight, so each satellite has on average {degree ? int(degree) : '—'}{' '}
              links. Real satellites carry a handful of laser terminals with pointing, capacity and latency limits, none of
              which are modelled.
            </li>
            <li>The energy model charges and drains linearly with sunlight and eclipse; there is no battery or load model.</li>
            <li>
              In Member 2’s evaluation the GNN’s routes cost more on average than both the energy-aware optimum it imitates
              and the shortest-distance baseline, and in the simulation its route changes at almost every step (see
              Performance).
            </li>
            <li>
              A Routing Lab request rebuilds a full step graph (about 1.3 million links, about 1.6 GB of memory in the API on the test machine)
              and scores every link with the GNN, which takes about a minute the first time for each step.
            </li>
            <li>The training script and training data for the V5 model are not in the repository, so training cannot be reproduced from it.</li>
            <li>Frame rates depend on the computer and browser. The viewer’s benchmark measures them on the machine in use.</li>
          </ul>
        </Section>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-[23px] font-semibold">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-ink-dim">{children}</div>
    </section>
  )
}

function Member({ name, role, children }: { name: string; role: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-signal/60 pl-3">
      <dt>
        <div className="text-[15px] font-medium text-ink">{role}</div>
        <div className="text-[13px] text-ink-faint">{name}</div>
      </dt>
      <dd className="mt-1 text-[14px] leading-snug">{children}</dd>
    </div>
  )
}

/** Data flow, left to right. Each stage names the actual files involved. */
function Pipeline() {
  const stages = [
    { title: 'Orbital data', body: 'data/starlink.tle, de421.bsp' },
    { title: 'Network', body: 'member_1(Lakshay)/orbitnet_interface.py' },
    { title: 'GNN and costs', body: 'member_2(Krishna)/gnn_model_v5.py, routing_cost.py' },
    { title: 'Simulation', body: 'Member_3(Pavitra)/simulation.py, router_adapter.py' },
    { title: 'Saved results', body: 'results/member3/*.pkl, *.csv' },
    { title: 'Dashboard', body: 'backend/ (FastAPI), frontend/ (React)' },
  ]
  return (
    <ol className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stages.map((s, i) => (
        <li key={s.title} className="relative rounded-md border border-seam bg-hull px-3 py-2">
          <div className="text-[14px] font-medium text-ink">{s.title}</div>
          <div className="mt-0.5 break-words text-[12px] leading-snug text-ink-faint">{s.body}</div>
          {i < stages.length - 1 && (
            <span aria-hidden className="absolute -right-2 top-1/2 hidden h-px w-2 bg-ink-faint lg:block" />
          )}
        </li>
      ))}
    </ol>
  )
}
