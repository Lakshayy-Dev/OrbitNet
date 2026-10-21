import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { positionAt } from '../lib/data'
import { clock, currentStep, useStore } from '../lib/store'
import { KM, gcrsToWorld } from './frame'
import { labelPositions, useLabels, type LabelSpec } from './labels'

const MAX_POINTS = 96
const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export interface RoutePathProps {
  /** Route (satellite indices, source first) for a given integer step. */
  resolve: (step: number) => number[] | null
  color: string
  /** Core width in CSS pixels. */
  width: number
  /** The primary route gets the glow, direction cues and endpoint labels. */
  primary?: boolean
  /** Draw at reduced strength at these steps (e.g. a lab route away from its step). */
  dimAt?: (step: number) => boolean
  name: string
}

interface Built {
  line: Line2
  geom: LineGeometry
  mat: LineMaterial
}

function buildLine(mat: LineMaterial): Built {
  const geom = new LineGeometry()
  geom.setPositions(new Float32Array(MAX_POINTS * 3))
  const line = new Line2(geom, mat)
  line.computeLineDistances()
  line.frustumCulled = false
  return { line, geom, mat }
}

/** Write points (world space) into a Line2 geometry without reallocating. */
function writeLine(b: Built, pts: Float32Array, n: number) {
  const start = b.geom.attributes.instanceStart as THREE.InterleavedBufferAttribute
  const buf = start.data.array as Float32Array
  const segs = Math.max(n - 1, 0)
  for (let i = 0; i < segs; i++) {
    buf[i * 6 + 0] = pts[i * 3 + 0]
    buf[i * 6 + 1] = pts[i * 3 + 1]
    buf[i * 6 + 2] = pts[i * 3 + 2]
    buf[i * 6 + 3] = pts[i * 3 + 3]
    buf[i * 6 + 4] = pts[i * 3 + 4]
    buf[i * 6 + 5] = pts[i * 3 + 5]
  }
  start.data.needsUpdate = true
  const dist = b.geom.attributes.instanceDistanceStart as THREE.InterleavedBufferAttribute | undefined
  if (dist) {
    const d = dist.data.array as Float32Array
    let acc = 0
    for (let i = 0; i < segs; i++) {
      const dx = pts[i * 3 + 3] - pts[i * 3]
      const dy = pts[i * 3 + 4] - pts[i * 3 + 1]
      const dz = pts[i * 3 + 5] - pts[i * 3 + 2]
      d[i * 2] = acc
      acc += Math.hypot(dx, dy, dz)
      d[i * 2 + 1] = acc
    }
    dist.data.needsUpdate = true
  }
  b.geom.instanceCount = segs
}

export function RoutePath({ resolve, color, width, primary = false, dimAt, name }: RoutePathProps) {
  const dataset = useStore((s) => s.dataset)!
  const hopLabels = useStore((s) => s.layers.hopLabels)
  const ids = dataset.ids
  const size = useThree((s) => s.size)

  const [indices, setIndices] = useState<number[] | null>(() => resolve(currentStep(clock.t, dataset.steps)))
  const indicesRef = useRef(indices)
  const prevRef = useRef<number[] | null>(null)
  const changeAt = useRef(-1e9)
  const lastStep = useRef(-1)

  // Recompute when the resolver itself changes (e.g. a new lab result).
  useEffect(() => {
    const k = currentStep(clock.t, dataset.steps)
    const next = resolve(k)
    indicesRef.current = next
    setIndices(next)
    lastStep.current = k
  }, [resolve, dataset.steps])

  const col = useMemo(() => new THREE.Color(color), [color])

  const lines = useMemo(() => {
    const mk = (opts: ConstructorParameters<typeof LineMaterial>[0]) => buildLine(new LineMaterial(opts))
    const core = mk({ color: col.getHex(), linewidth: width, transparent: true, opacity: 1, depthWrite: false })
    const ghost = mk({
      color: col.getHex(), linewidth: Math.max(1.5, width * 0.6), transparent: true, opacity: 0.22,
      depthTest: false, depthWrite: false, dashed: true, dashSize: 0.12, gapSize: 0.1,
    })
    const glow = primary
      ? mk({ color: col.getHex(), linewidth: width * 4.5, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending })
      : null
    const flow = primary
      ? mk({ color: 0xffffff, linewidth: Math.max(1.5, width * 0.5), transparent: true, opacity: 0.95, depthWrite: false, dashed: true, dashSize: 0.16, gapSize: 0.55 })
      : null
    const previous = mk({ color: col.getHex(), linewidth: Math.max(1.5, width * 0.7), transparent: true, opacity: 0, depthWrite: false })
    ghost.line.renderOrder = 5
    if (glow) glow.line.renderOrder = 6
    previous.line.renderOrder = 6
    core.line.renderOrder = 7
    if (flow) flow.line.renderOrder = 8
    return { core, ghost, glow, flow, previous }
  }, [col, width, primary])

  useEffect(() => {
    for (const b of Object.values(lines)) b?.mat.resolution.set(size.width, size.height)
  }, [lines, size])

  useEffect(
    () => () => {
      for (const b of Object.values(lines)) {
        b?.geom.dispose()
        b?.mat.dispose()
      }
    },
    [lines],
  )

  // Direction chevrons and relay markers.
  const chevrons = useMemo(() => {
    const g = new THREE.ConeGeometry(0.05, 0.17, 10)
    g.rotateX(Math.PI / 2) // point along +Z
    const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false })
    const mesh = new THREE.InstancedMesh(g, m, MAX_POINTS)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.renderOrder = 9
    return mesh
  }, [col])
  const relays = useMemo(() => {
    const g = new THREE.SphereGeometry(0.038, 12, 8)
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true })
    const mesh = new THREE.InstancedMesh(g, m, MAX_POINTS)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.renderOrder = 9
    return mesh
  }, [])
  useEffect(() => () => {
    chevrons.geometry.dispose(); (chevrons.material as THREE.Material).dispose()
    relays.geometry.dispose(); (relays.material as THREE.Material).dispose()
  }, [chevrons, relays])

  // Publish endpoint (and optional hop) labels to the DOM label layer.
  useEffect(() => {
    const { setGroup, clearGroup } = useLabels.getState()
    if (!primary || !indices || indices.length < 2) {
      clearGroup(name)
      return
    }
    const specs: LabelSpec[] = [
      { key: `${name}:src`, kind: 'source', text: ids[indices[0]] },
      { key: `${name}:dst`, kind: 'dest', text: ids[indices[indices.length - 1]] },
    ]
    if (hopLabels) {
      for (let i = 1; i < indices.length - 1; i++) specs.push({ key: `${name}:hop:${i}`, kind: 'hop', text: String(i) })
    }
    setGroup(name, specs)
  }, [indices, primary, hopLabels, name, ids])
  useEffect(() => () => useLabels.getState().clearGroup(name), [name])
  const pts = useMemo(() => new Float32Array(MAX_POINTS * 3), [])
  const prevPts = useMemo(() => new Float32Array(MAX_POINTS * 3), [])
  const tmp = useMemo(() => [0, 0, 0], [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const fwd = useMemo(() => new THREE.Vector3(0, 0, 1), [])

  const fill = (route: number[], out: Float32Array) => {
    const n = Math.min(route.length, MAX_POINTS)
    for (let i = 0; i < n; i++) {
      positionAt(dataset, route[i], clock.t, clock.interpolate, tmp)
      gcrsToWorld(tmp, v).multiplyScalar(KM)
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z
    }
    return n
  }

  useFrame((state, delta) => {
    const k = currentStep(clock.t, dataset.steps)
    if (k !== lastStep.current) {
      lastStep.current = k
      const next = resolve(k)
      const cur = indicesRef.current
      const same = !!next && !!cur && next.length === cur.length && next.every((x, i) => x === cur[i])
      if (!same) {
        prevRef.current = cur
        changeAt.current = state.clock.elapsedTime
        indicesRef.current = next
        setIndices(next)
      }
    }

    const route = indicesRef.current
    const all = [lines.core, lines.ghost, lines.glow, lines.flow].filter(Boolean) as Built[]
    if (!route || route.length < 2) {
      for (const b of all) b.line.visible = false
      lines.previous.line.visible = false
      chevrons.count = 0
      relays.count = 0
      return
    }

    const dim = dimAt?.(k) ?? false
    const n = fill(route, pts)

    // Reveal the new route from source to destination after a change.
    const since = state.clock.elapsedTime - changeAt.current
    const reveal = reducedMotion ? 1 : Math.min(1, since / 0.7)
    const eased = 1 - Math.pow(1 - reveal, 3)
    let shown = n
    if (eased < 1) {
      let total = 0
      const segLen: number[] = []
      for (let i = 0; i < n - 1; i++) {
        const l = Math.hypot(pts[i * 3 + 3] - pts[i * 3], pts[i * 3 + 4] - pts[i * 3 + 1], pts[i * 3 + 5] - pts[i * 3 + 2])
        segLen.push(l)
        total += l
      }
      let remain = eased * total
      shown = 1
      for (let i = 0; i < n - 1; i++) {
        if (remain >= segLen[i]) {
          remain -= segLen[i]
          shown = i + 2
        } else {
          const f = segLen[i] > 0 ? remain / segLen[i] : 0
          pts[(i + 1) * 3] = pts[i * 3] + (pts[(i + 1) * 3] - pts[i * 3]) * f
          pts[(i + 1) * 3 + 1] = pts[i * 3 + 1] + (pts[(i + 1) * 3 + 1] - pts[i * 3 + 1]) * f
          pts[(i + 1) * 3 + 2] = pts[i * 3 + 2] + (pts[(i + 1) * 3 + 2] - pts[i * 3 + 2]) * f
          shown = i + 2
          break
        }
      }
    }

    for (const b of all) {
      writeLine(b, pts, shown)
      b.line.visible = true
    }
    lines.core.mat.opacity = dim ? 0.4 : 1
    lines.ghost.mat.opacity = dim ? 0.1 : 0.22
    if (lines.glow) lines.glow.mat.opacity = dim ? 0.06 : 0.22
    if (lines.flow) {
      lines.flow.mat.opacity = dim ? 0.3 : 0.95
      if (!reducedMotion) lines.flow.mat.dashOffset -= delta * 0.9
    }

    // Previous route fades out for a second after a change.
    const prev = prevRef.current
    const fade = Math.max(0, 1 - since / 1.1)
    if (prev && prev.length > 1 && fade > 0 && !reducedMotion) {
      const pn = fill(prev, prevPts)
      writeLine(lines.previous, prevPts, pn)
      lines.previous.mat.opacity = 0.45 * fade
      lines.previous.line.visible = true
    } else {
      lines.previous.line.visible = false
    }

    // Chevrons at 60 % along each fully drawn segment, pointing downstream.
    let c = 0
    if (primary) {
      for (let i = 0; i < shown - 1 && i < n - 1; i++) {
        const ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2]
        const bx = pts[i * 3 + 3], by = pts[i * 3 + 4], bz = pts[i * 3 + 5]
        dummy.position.set(ax + (bx - ax) * 0.6, ay + (by - ay) * 0.6, az + (bz - az) * 0.6)
        v.set(bx - ax, by - ay, bz - az)
        if (v.lengthSq() < 1e-8) continue
        dummy.quaternion.setFromUnitVectors(fwd, v.normalize())
        dummy.scale.setScalar(dim ? 0.7 : 1)
        dummy.updateMatrix()
        chevrons.setMatrixAt(c++, dummy.matrix)
      }
    }
    chevrons.count = c
    chevrons.instanceMatrix.needsUpdate = true
    ;(chevrons.material as THREE.MeshBasicMaterial).opacity = dim ? 0.35 : 1

    // Relay markers (not the endpoints).
    let r = 0
    for (let i = 1; i < Math.min(shown, n) - 1; i++) {
      dummy.position.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])
      dummy.quaternion.identity()
      dummy.scale.setScalar(primary ? 1 : 0.8)
      dummy.updateMatrix()
      relays.setMatrixAt(r++, dummy.matrix)
    }
    relays.count = r
    relays.instanceMatrix.needsUpdate = true

    // Move label anchors (endpoints use the true positions, not the reveal).
    if (primary) {
      const setPos = (key: string, i: number) => {
        let p = labelPositions.get(key)
        if (!p) {
          p = new THREE.Vector3()
          labelPositions.set(key, p)
        }
        positionAt(dataset, route[i], clock.t, clock.interpolate, tmp)
        gcrsToWorld(tmp, p).multiplyScalar(KM)
      }
      setPos(`${name}:src`, 0)
      setPos(`${name}:dst`, n - 1)
      if (hopLabels) for (let i = 1; i < n - 1; i++) setPos(`${name}:hop:${i}`, i)
    }
  })

  if (!indices || indices.length < 2) return null

  return (
    <group name={name}>
      {lines.ghost && <primitive object={lines.ghost.line} />}
      {lines.glow && <primitive object={lines.glow.line} />}
      <primitive object={lines.previous.line} />
      <primitive object={lines.core.line} />
      {lines.flow && <primitive object={lines.flow.line} />}
      <primitive object={chevrons} />
      <primitive object={relays} />
    </group>
  )
}

