import { create } from 'zustand'

// Frame-time bookkeeping written by the render loop (no React updates).
export const perf = {
  fps: 0,
  frameMs: 0,
  frames: 0,
  stepUploads: 0,
  drawCalls: 0,
  triangles: 0,
  points: 0,
  lines: 0,
  // rolling window
  _acc: 0,
  _n: 0,
}

export interface BenchmarkResult {
  when: string
  durationS: number
  frames: number
  avgFps: number
  medianFps: number
  low1Fps: number // 1% low: FPS at the 99th-percentile frame time
  p95FrameMs: number
  maxFrameMs: number
  drawCalls: number
  points: number
  lines: number
  triangles: number
  stepUploads: number
  playbackStepsPerSecond: number
  interpolate: boolean
  linksShown: boolean
  canvas: string
  devicePixelRatio: number
  gpu: string
  userAgent: string
}

interface BenchState {
  running: boolean
  progress: number
  result: BenchmarkResult | null
  start: () => void
  set: (p: Partial<BenchState>) => void
}

export const useBench = create<BenchState>((set) => ({
  running: false,
  progress: 0,
  result: null,
  start: () => set({ running: true, progress: 0, result: null }),
  set: (p) => set(p),
}))

export const BENCH_SECONDS = 20
