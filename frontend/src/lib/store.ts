import { create } from 'zustand'
import type { AlgorithmKey, RouteJob, RouteJobResult, SatelliteDetail } from './api'
import type { Dataset } from './data'

// Playback time lives in a plain mutable object so the render loop can
// advance it every frame without re-rendering React. The store mirrors it
// at a low rate for the UI (timeline, clock readout).
export const clock = {
  t: 0, // fractional step index
  playing: false,
  speed: 1, // snapshot steps per second of wall time
  interpolate: true,
  loop: true,
}

export type RouteOverlay =
  | { kind: 'saved'; algorithm: 'gnn' | 'dijkstra' }
  | { kind: 'lab'; algorithm: AlgorithmKey }

export interface Layers {
  links: boolean
  neighbours: boolean
  savedGnn: boolean
  savedDijkstra: boolean
  shadow: boolean
  hopLabels: boolean
  hideImplausible: boolean
}

interface State {
  dataset: Dataset | null
  loadError: string | null
  loadStage: string

  time: number // mirror of clock.t (throttled)
  playing: boolean
  speed: number
  interpolate: boolean

  selected: number | null
  hovered: number | null
  detail: SatelliteDetail | null
  detailError: string | null
  detailLoading: boolean

  layers: Layers

  // Routing Lab
  labSource: string
  labTarget: string
  labStep: number
  labAlgorithms: AlgorithmKey[]
  labJob: RouteJob | null
  labResult: RouteJobResult | null
  labVisible: Partial<Record<AlgorithmKey, boolean>>

  cameraCommand: { kind: 'reset' | 'frameRoute' | 'frameSelected'; n: number } | null

  set: (p: Partial<State>) => void
  setLayer: (k: keyof Layers, v: boolean) => void
  seek: (t: number) => void
  play: (on?: boolean) => void
  setSpeed: (s: number) => void
  setInterpolate: (on: boolean) => void
  select: (i: number | null) => void
  camera: (kind: 'reset' | 'frameRoute' | 'frameSelected') => void
}

export const useStore = create<State>((set, get) => ({
  dataset: null,
  loadError: null,
  loadStage: 'Connecting to the OrbitNet API',

  time: 0,
  playing: false,
  speed: 1,
  interpolate: true,

  selected: null,
  hovered: null,
  detail: null,
  detailError: null,
  detailLoading: false,

  layers: {
    links: true,
    neighbours: true,
    savedGnn: true,
    savedDijkstra: false,
    shadow: false,
    hopLabels: false,
    hideImplausible: false,
  },

  labSource: '',
  labTarget: '',
  labStep: 0,
  labAlgorithms: ['gnn', 'dijkstra'],
  labJob: null,
  labResult: null,
  labVisible: {},

  cameraCommand: null,

  set: (p) => set(p),
  setLayer: (k, v) => set({ layers: { ...get().layers, [k]: v } }),
  seek: (t) => {
    const d = get().dataset
    const max = d ? d.steps - 1 : 0
    clock.t = Math.min(Math.max(t, 0), max)
    set({ time: clock.t })
  },
  play: (on) => {
    const next = on ?? !clock.playing
    const d = get().dataset
    if (next && d && clock.t >= d.steps - 1) clock.t = 0
    clock.playing = next
    set({ playing: next, time: clock.t })
  },
  setSpeed: (s) => {
    clock.speed = s
    set({ speed: s })
  },
  setInterpolate: (on) => {
    clock.interpolate = on
    set({ interpolate: on })
  },
  select: (i) => set({ selected: i, detail: i === null ? null : get().detail, detailError: null }),
  camera: (kind) => set({ cameraCommand: { kind, n: (get().cameraCommand?.n ?? 0) + 1 } }),
}))

export const currentStep = (t: number, steps: number) => Math.min(Math.floor(t + 1e-6), steps - 1)
