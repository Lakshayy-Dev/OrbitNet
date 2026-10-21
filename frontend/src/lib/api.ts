// Typed access to the FastAPI backend. All data comes from the team's saved
// results or from the project's own routing code; nothing is generated here.

export interface Frame {
  step: number
  timestamp: string
  sun_direction: [number, number, number]
  itrs_to_gcrs: number[][]
  gnn_route: number[] | null
  dijkstra_route: number[] | null
  gnn_implausible: number[]
  dijkstra_implausible: number[]
  sampled_links: number
  eclipsed: number
  sunlit: number
  implausible: number
  full_graph_nodes: number | null
  full_graph_edges: number | null
  source: string | null
  target: string | null
  gnn_distance_km: number | null
  dijkstra_distance_km: number | null
  gnn_hops: number | null
  dijkstra_hops: number | null
  gnn_eclipsed: number | null
  dijkstra_eclipsed: number | null
  route_changed: boolean | null
  gnn_compute_ms: number | null
  path_available: boolean | null
}

export interface Meta {
  satellites: number
  steps: number
  step_seconds: number
  start: string
  end: string
  frame: string
  earth_radius_km: number
  link_distance_km: number
  plausible_altitude_km: [number, number]
  implausible_satellites_any_step: number
  frames: Frame[]
  snapshot_file: string
  load_seconds: number
  tle: { file: string; records: number; earliest: string; latest: string } | null
  simulation_defaults: { step_seconds?: number; steps?: number; initial_energy?: number; communication_cost?: number; error?: string } | null
}

export interface Neighbour {
  index: number
  id: string
  distance_km: number
  eclipsed: boolean
}

export interface SatelliteDetail {
  id: string
  index: number
  step: number
  timestamp: string
  position_km: [number, number, number]
  radius_km: number
  altitude_km: number
  geocentric_lat_deg: number
  geocentric_lon_deg: number
  eclipsed: boolean
  energy: number
  plausible: boolean
  neighbour_count: number
  eclipsed_neighbours: number
  neighbour_source: string
  neighbours: Neighbour[]
  on_saved_routes: { route: 'gnn' | 'dijkstra'; hop: number }[]
}

export type AlgorithmKey = 'gnn' | 'dijkstra' | 'teacher' | 'eclipse_avoiding'

export interface RouteNode {
  id: string
  index: number
  eclipsed: boolean
  energy: number
  altitude_km: number
  plausible: boolean | null
}

export interface RouteLink {
  from: string
  to: string
  distance_km: number
  routing_cost: number | null
  gnn_cost: number | null
}

export interface RouteResult {
  algorithm: AlgorithmKey
  label: string
  source: string
  weight: string
  available: boolean
  message?: string
  path?: string[]
  indices?: number[]
  nodes?: RouteNode[]
  links?: RouteLink[]
  hops?: number
  distance_km?: number
  eclipsed_satellites?: number
  energy_aware_cost?: number | null
  gnn_cost?: number | null
  min_energy_on_route?: number | null
  implausible_satellites?: string[]
  communication_energy?: number
  route_seconds?: number
}

export interface RouteJobResult {
  step: number
  timestamp: string
  source: string
  target: string
  routes: Partial<Record<AlgorithmKey, RouteResult>>
  network: {
    nodes: number
    edges: number
    components: number | null
    largest_component: number | null
    rebuild_seconds: number
    gnn_scoring_seconds: number | null
    teacher_cost_seconds: number | null
    position_check: {
      nodes_rebuilt: number
      nodes_in_snapshot: number
      nodes_not_in_snapshot: number
      max_position_difference_km: number | null
      matches_snapshot: boolean
    }
  }
  energy_state: string
  saved_simulation_pair: { source: string; target: string } | null
}

export interface RouteJob {
  id: string
  step: number
  source: string
  target: string
  algorithms: AlgorithmKey[]
  status: 'queued' | 'running' | 'done' | 'error'
  stage: string
  progress: number
  elapsed_s: number
  result: RouteJobResult | null
  error: string | null
}

export interface RoutingStatus {
  model_path: string
  model_present: boolean
  router_loaded: boolean
  router_error: string | null
  algorithms: Record<AlgorithmKey, { label: string; source: string; weight: string }>
  prepared_step: null | {
    step: number
    nodes: number
    edges: number
    rebuild_seconds: number
    components: number | null
    largest_component: number | null
    gnn_ready: boolean
    gnn_seconds: number | null
    teacher_ready: boolean
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function check(res: Response): Promise<Response> {
  if (res.ok) return res
  let message = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
  } catch {
    /* keep status text */
  }
  throw new ApiError(res.status, message)
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'The OrbitNet API is not reachable. Start the backend on port 8000 (see README).')
  }
  return (await check(res)).json() as Promise<T>
}

async function getBinary(path: string): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(path)
  } catch {
    throw new ApiError(0, 'The OrbitNet API is not reachable. Start the backend on port 8000 (see README).')
  }
  return (await check(res)).arrayBuffer()
}

export const api = {
  health: () => getJSON<{ ok: boolean; error: string | null; missing_inputs: string[]; model_present: boolean }>('/api/health'),
  meta: () => getJSON<Meta>('/api/meta'),
  satellites: () => getJSON<{ ids: string[]; implausible: number[] }>('/api/satellites'),
  positions: () => getBinary('/api/snapshots/positions.bin'),
  eclipse: () => getBinary('/api/snapshots/eclipse.bin'),
  energy: () => getBinary('/api/snapshots/energy.bin'),
  links: () => getBinary('/api/snapshots/links.bin'),
  satellite: (id: string, step: number, signal?: AbortSignal) =>
    getJSON<SatelliteDetail>(`/api/satellites/${encodeURIComponent(id)}?step=${step}`, { signal }),
  routingStatus: () => getJSON<RoutingStatus>('/api/routing/status'),
  createRoute: (body: { step: number; source: string; target: string; algorithms: AlgorithmKey[] }) =>
    getJSON<RouteJob>('/api/routes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  routeJob: (id: string) => getJSON<RouteJob>(`/api/routes/${id}`),
  simulationResults: () => getJSON<SimulationResults>('/api/results/simulation'),
  gnnEvaluation: () => getJSON<GnnEvaluation>('/api/results/gnn-evaluation'),
  scenarios: () => getJSON<{ rows: Record<string, string | number | null>[]; notes: string[]; source_files: string[] }>('/api/results/scenarios'),
}

export interface SimulationStep {
  step: number
  timestamp: string
  source: string
  target: string
  nodes: number
  edges: number
  network_eclipsed: number
  gnn_distance_km: number | null
  dijkstra_distance_km: number | null
  gnn_hops: number | null
  dijkstra_hops: number | null
  gnn_eclipsed: number | null
  dijkstra_eclipsed: number | null
  gnn_cost: number | null
  route_changed: boolean
  gnn_compute_ms: number | null
  path_available: boolean
  relays_kept_from_previous: number | null
  relays_total: number
}

export interface SimulationResults {
  source_files: string[]
  summary: Record<string, number | string>
  derived: Record<string, number | null>
  summary_mismatches: { key: string; summary_txt: number; from_csv: number }[]
  steps: SimulationStep[]
  notes: string[]
}

export interface GnnEvaluation {
  source_files: string[]
  rows: {
    source: string
    target: string
    teacher_cost: number
    gnn_cost: number
    baseline_cost: number
    gnn_teacher_ratio: number
    gnn_difference_percent: number
    teacher_distance: number
    gnn_distance: number
    baseline_distance: number
    teacher_hops: number
    gnn_hops: number
    baseline_hops: number
  }[]
  derived: Record<string, number | null>
  notes: string[]
}
