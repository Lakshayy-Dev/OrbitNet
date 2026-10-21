import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { AlgorithmKey } from '../lib/api'
import { positionAt } from '../lib/data'
import { clock, currentStep, useStore } from '../lib/store'
import { Constellation } from './Constellation'
import { Earth } from './Earth'
import { gcrsToWorld } from './frame'
import { perf, useBench, BENCH_SECONDS, type BenchmarkResult } from './perf'
import { Picking } from './Picking'
import { LabelLayer, LabelProjector } from './labels'
import { RoutePath } from './RoutePath'

export const ROUTE_COLORS: Record<AlgorithmKey, string> = {
  gnn: '#38d3f5',
  dijkstra: '#ff7ac6',
  teacher: '#9ae66e',
  eclipse_avoiding: '#a5b4ff',
}

export function GlobeScene({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-full w-full ${className}`}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 38, near: 0.05, far: 3000, position: [0, 6, 24] }}
        onCreated={({ gl }) => {
          gl.setClearColor('#03060d')
        }}
      >
        <Suspense fallback={null}>
          <SceneContents />
        </Suspense>
      </Canvas>
      <LabelLayer />
    </div>
  )
}

function SceneContents() {
  const dataset = useStore((s) => s.dataset)
  if (!dataset) return null
  return (
    <>
      <Earth />
      <Constellation />
      <Routes />
      <Picking />
      <PlaybackDriver />
      <CameraRig />
      <StatsDriver />
      <LabelProjector />
    </>
  )
}

function Routes() {
  const dataset = useStore((s) => s.dataset)!
  const layers = useStore((s) => s.layers)
  const labResult = useStore((s) => s.labResult)
  const labVisible = useStore((s) => s.labVisible)
  const frames = dataset.meta.frames

  const savedGnn = useCallback((k: number) => frames[k]?.gnn_route ?? null, [frames])
  const savedDij = useCallback((k: number) => frames[k]?.dijkstra_route ?? null, [frames])

  const lab = useMemo(() => {
    if (!labResult) return []
    const order: AlgorithmKey[] = ['gnn', 'dijkstra', 'teacher', 'eclipse_avoiding']
    return order
      .map((a) => labResult.routes[a])
      .filter((r): r is NonNullable<typeof r> => !!r && r.available && !!r.indices && labVisible[r.algorithm] !== false)
      .map((r) => ({
        key: r.algorithm,
        indices: r.indices as number[],
        resolve: () => r.indices as number[],
        dimAt: (k: number) => k !== labResult.step,
      }))
  }, [labResult, labVisible])

  const labPrimary = lab[0]?.key
  const savedPrimary = !labPrimary

  return (
    <>
      {layers.savedDijkstra && (
        <RoutePath name="saved-dijkstra" resolve={savedDij} color={ROUTE_COLORS.dijkstra} width={3}
          primary={savedPrimary && !layers.savedGnn} />
      )}
      {layers.savedGnn && (
        <RoutePath name="saved-gnn" resolve={savedGnn} color={ROUTE_COLORS.gnn} width={4.5} primary={savedPrimary} />
      )}
      {lab.map((r) => (
        <RoutePath key={`${labResult?.step}-${r.key}-${r.indices.join(',')}`} name={`lab-${r.key}`}
          resolve={r.resolve} dimAt={r.dimAt} color={ROUTE_COLORS[r.key]}
          width={r.key === labPrimary ? 4.5 : 3} primary={r.key === labPrimary} />
      ))}
    </>
  )
}

/** Advances playback time; mirrors it to React at ~12 Hz. */
function PlaybackDriver() {
  const dataset = useStore((s) => s.dataset)!
  const set = useStore((s) => s.set)
  const lastPublish = useRef(0)
  useFrame((state, delta) => {
    const max = dataset.steps - 1
    if (clock.playing) {
      clock.t += Math.min(delta, 0.1) * clock.speed
      if (clock.t >= max) {
        if (clock.loop) clock.t = 0
        else {
          clock.t = max
          clock.playing = false
          set({ playing: false })
        }
      }
    }
    const now = state.clock.elapsedTime
    if (now - lastPublish.current > 0.08) {
      lastPublish.current = now
      if (Math.abs(useStore.getState().time - clock.t) > 1e-4) set({ time: clock.t })
    }
  })
  return null
}

const DEFAULT_DISTANCE = 26

/** Far enough that the Earth plus the satellite shell fits the narrower axis. */
function fitDistance(camera: THREE.Camera): number {
  const cam = camera as THREE.PerspectiveCamera
  if (!cam.isPerspectiveCamera) return DEFAULT_DISTANCE
  const halfV = THREE.MathUtils.degToRad(cam.fov / 2)
  const halfH = Math.atan(Math.tan(halfV) * cam.aspect)
  const needed = 7.4 / Math.tan(Math.min(halfV, halfH))
  return Math.max(DEFAULT_DISTANCE, needed)
}

function routeDirection(): THREE.Vector3 {
  const { dataset, labResult } = useStore.getState()
  const dir = new THREE.Vector3()
  if (!dataset) return dir.set(0, 0.3, 1).normalize()
  const k = currentStep(clock.t, dataset.steps)
  const route = labResult?.routes.gnn?.indices ?? Object.values(labResult?.routes ?? {}).find((r) => r?.indices)?.indices
    ?? dataset.meta.frames[k].gnn_route
  if (!route?.length) return dir.set(0, 0.3, 1).normalize()
  const tmp = [0, 0, 0]
  const v = new THREE.Vector3()
  for (const i of route) {
    positionAt(dataset, i, clock.t, clock.interpolate, tmp)
    dir.add(gcrsToWorld(tmp, v).normalize())
  }
  return dir.normalize()
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const command = useStore((s) => s.cameraCommand)
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; t0: number } | null>(null)
  const clockRef = useThree((s) => s.clock)

  const goTo = (pos: THREE.Vector3) => {
    anim.current = {
      from: camera.position.clone(),
      to: pos,
      fromT: controls.current?.target.clone() ?? new THREE.Vector3(),
      t0: clockRef.elapsedTime,
    }
  }

  // Development-only handle for automated visual checks.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__orbitnet = { camera, clock, store: useStore }
  }, [camera])

  // Initial framing: look at the saved route.
  const framed = useRef(false)
  useEffect(() => {
    if (framed.current) return
    framed.current = true
    const dir = routeDirection()
    camera.position.copy(dir.multiplyScalar(fitDistance(camera)).add(new THREE.Vector3(0, 3, 0)))
    camera.lookAt(0, 0, 0)
  }, [camera])

  useEffect(() => {
    if (!command) return
    const { dataset, selected } = useStore.getState()
    if (command.kind === 'reset' || command.kind === 'frameRoute') {
      const dir = routeDirection()
      goTo(dir.multiplyScalar(fitDistance(camera)).add(new THREE.Vector3(0, 3, 0)))
    } else if (command.kind === 'frameSelected' && dataset && selected !== null) {
      const tmp = [0, 0, 0]
      positionAt(dataset, selected, clock.t, clock.interpolate, tmp)
      const dir = gcrsToWorld(tmp, new THREE.Vector3()).normalize()
      goTo(dir.multiplyScalar(17))
    }
  }, [command]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((state) => {
    const a = anim.current
    if (!a) return
    const f = Math.min(1, (state.clock.elapsedTime - a.t0) / 0.9)
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2
    // Move along an arc around the Earth rather than through it.
    const r = THREE.MathUtils.lerp(a.from.length(), a.to.length(), e)
    const dir = a.from.clone().normalize().lerp(a.to.clone().normalize(), e).normalize()
    camera.position.copy(dir.multiplyScalar(r))
    controls.current?.target.lerpVectors(a.fromT, new THREE.Vector3(), e)
    if (f >= 1) anim.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      minDistance={7.4}
      maxDistance={140}
    />
  )
}

/** FPS readout and the benchmark run. */
function StatsDriver() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const bench = useBench()
  const samples = useRef<number[]>([])
  const startState = useRef<{ playing: boolean; speed: number; t: number; elapsed: number } | null>(null)

  useFrame((state, delta) => {
    perf._acc += delta
    perf._n++
    perf.frames++
    if (perf._acc >= 0.5) {
      perf.fps = perf._n / perf._acc
      perf.frameMs = (perf._acc / perf._n) * 1000
      perf._acc = 0
      perf._n = 0
    }
    perf.drawCalls = gl.info.render.calls
    perf.triangles = gl.info.render.triangles
    perf.points = gl.info.render.points
    perf.lines = gl.info.render.lines

    if (!bench.running) return
    if (!startState.current) {
      startState.current = { playing: clock.playing, speed: clock.speed, t: clock.t, elapsed: state.clock.elapsedTime }
      samples.current = []
      perf.stepUploads = 0
      clock.playing = true
      clock.speed = 2
      return
    }
    samples.current.push(delta * 1000)
    // Orbit the camera while playback runs.
    const angle = delta * 0.25
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
    const elapsed = state.clock.elapsedTime - startState.current.elapsed
    useBench.getState().set({ progress: Math.min(1, elapsed / BENCH_SECONDS) })
    if (elapsed >= BENCH_SECONDS) {
      const s = samples.current.slice(2).sort((a, b) => a - b)
      const avgMs = s.reduce((a, b) => a + b, 0) / s.length
      const pct = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
      const ctx = gl.getContext()
      const ext = ctx.getExtension('WEBGL_debug_renderer_info')
      const gpu = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable'
      const { layers } = useStore.getState()
      const result: BenchmarkResult = {
        when: new Date().toISOString(),
        durationS: elapsed,
        frames: s.length,
        avgFps: 1000 / avgMs,
        medianFps: 1000 / pct(50),
        low1Fps: 1000 / pct(99),
        p95FrameMs: pct(95),
        maxFrameMs: s[s.length - 1],
        drawCalls: gl.info.render.calls,
        points: gl.info.render.points,
        lines: gl.info.render.lines,
        triangles: gl.info.render.triangles,
        stepUploads: perf.stepUploads,
        playbackStepsPerSecond: 2,
        interpolate: clock.interpolate,
        linksShown: layers.links,
        canvas: `${gl.domElement.width}×${gl.domElement.height}`,
        devicePixelRatio: gl.getPixelRatio(),
        gpu,
        userAgent: navigator.userAgent,
      }
      const st = startState.current
      clock.playing = st.playing
      clock.speed = st.speed
      startState.current = null
      useBench.getState().set({ running: false, progress: 1, result })
      try {
        localStorage.setItem('orbitnet-benchmark', JSON.stringify(result))
      } catch {
        /* storage unavailable */
      }
    }
  })
  return null
}
