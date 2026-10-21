import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { stepEclipse, stepPositions } from '../lib/data'
import { clock, currentStep, useStore } from '../lib/store'
import { KM } from './frame'
import { linkFragment, linkVertex, satelliteFragment, satelliteVertex } from './shaders'
import { perf } from './perf'

const SUNLIT = new THREE.Color('#ffb45c')
const ECLIPSED = new THREE.Color('#7586a6')
const NEIGHBOUR = new THREE.Color('#e6eeff')

/**
 * All satellites (one THREE.Points draw call) and the saved link sample (one
 * THREE.LineSegments draw call). Both share the posA/posB buffers.
 *
 * Per frame: one uniform (uMix). Per snapshot step: two 128 KB position
 * uploads, one 10 KB eclipse upload and a new link index buffer.
 */
export function Constellation() {
  const dataset = useStore((s) => s.dataset)!
  const layers = useStore((s) => s.layers)
  const selected = useStore((s) => s.selected)
  const detail = useStore((s) => s.detail)
  const labResult = useStore((s) => s.labResult)
  const gl = useThree((s) => s.gl)

  const N = dataset.count

  // Shared GPU buffers.
  const shared = useMemo(() => {
    const posA = new THREE.BufferAttribute(new Float32Array(N * 3), 3)
    const posB = new THREE.BufferAttribute(new Float32Array(N * 3), 3)
    posA.setUsage(THREE.DynamicDrawUsage)
    posB.setUsage(THREE.DynamicDrawUsage)
    const ecl = new THREE.BufferAttribute(new Float32Array(N), 1)
    const flag = new THREE.BufferAttribute(new Float32Array(N), 1)
    const bad = new THREE.BufferAttribute(Float32Array.from(dataset.implausible), 1)
    ecl.setUsage(THREE.DynamicDrawUsage)
    flag.setUsage(THREE.DynamicDrawUsage)
    return { posA, posB, ecl, flag, bad }
  }, [N, dataset])

  const uniforms = useMemo(
    () => ({
      uMix: { value: 0 },
      uScale: { value: KM },
    }),
    [],
  )

  const points = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('posA', shared.posA)
    g.setAttribute('posB', shared.posB)
    g.setAttribute('aEcl', shared.ecl)
    g.setAttribute('aFlag', shared.flag)
    g.setAttribute('aBad', shared.bad)
    // three.js needs a "position" attribute for bookkeeping; it is unused by the shader.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
    const m = new THREE.ShaderMaterial({
      vertexShader: satelliteVertex,
      fragmentShader: satelliteFragment,
      uniforms: {
        ...uniforms,
        uSize: { value: 4.4 },
        uPixelRatio: { value: gl.getPixelRatio() },
        uHideBad: { value: 0 },
        uSunlit: { value: SUNLIT },
        uEclipsed: { value: ECLIPSED },
        uNeighbour: { value: NEIGHBOUR },
        uDim: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    p.renderOrder = 3
    return p
  }, [shared, uniforms, N, gl])

  const makeLines = (color: string, opacity: number, renderOrder: number) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('posA', shared.posA)
    g.setAttribute('posB', shared.posB)
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: linkVertex,
      fragmentShader: linkFragment,
      uniforms: {
        ...uniforms,
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
    })
    const l = new THREE.LineSegments(g, m)
    l.frustumCulled = false
    l.renderOrder = renderOrder
    return l
  }

  const links = useMemo(() => makeLines('#4a86c4', 0.16, 2), [shared, uniforms, N]) // eslint-disable-line react-hooks/exhaustive-deps
  const neighbourLinks = useMemo(() => makeLines('#c9d8ff', 0.3, 4), [shared, uniforms, N]) // eslint-disable-line react-hooks/exhaustive-deps

  // Upload step k / k+1 data when the integer step changes.
  const loadedStep = useRef(-1)
  const uploadStep = (k: number) => {
    const k2 = Math.min(k + 1, dataset.steps - 1)
    ;(shared.posA.array as Float32Array).set(stepPositions(dataset, k))
    ;(shared.posB.array as Float32Array).set(stepPositions(dataset, k2))
    shared.posA.needsUpdate = true
    shared.posB.needsUpdate = true
    const e = stepEclipse(dataset, k)
    const ea = shared.ecl.array as Float32Array
    for (let i = 0; i < N; i++) ea[i] = e[i]
    shared.ecl.needsUpdate = true
    links.geometry.setIndex(new THREE.BufferAttribute(dataset.links[k], 1))
    loadedStep.current = k
    perf.stepUploads++
  }

  // Flags: neighbours, route relays, selection.
  const routeIndices = useMemo(() => {
    const set = new Set<number>()
    if (labResult) {
      for (const r of Object.values(labResult.routes)) r?.indices?.forEach((i) => set.add(i))
    }
    return set
  }, [labResult])

  const savedRouteStep = useRef(-1)
  const applyFlags = (k: number) => {
    const fa = shared.flag.array as Float32Array
    fa.fill(0)
    if (layers.neighbours && detail && detail.index === selected) {
      for (const n of detail.neighbours) fa[n.index] = 1
    }
    const frame = dataset.meta.frames[k]
    if (layers.savedGnn && frame.gnn_route) for (const i of frame.gnn_route) fa[i] = 2
    if (layers.savedDijkstra && frame.dijkstra_route) for (const i of frame.dijkstra_route) fa[i] = 2
    routeIndices.forEach((i) => (fa[i] = 2))
    if (selected !== null) fa[selected] = 3
    shared.flag.needsUpdate = true
    savedRouteStep.current = k
  }

  useEffect(() => {
    applyFlags(currentStep(clock.t, dataset.steps))
    // Neighbour links of the selected satellite.
    if (selected !== null && detail && detail.index === selected && layers.neighbours) {
      const idx = new Uint32Array(detail.neighbours.length * 2)
      detail.neighbours.forEach((n, j) => {
        idx[j * 2] = selected
        idx[j * 2 + 1] = n.index
      })
      neighbourLinks.geometry.setIndex(new THREE.BufferAttribute(idx, 1))
    } else {
      neighbourLinks.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(0), 1))
    }
  }, [selected, detail, layers.neighbours, layers.savedGnn, layers.savedDijkstra, routeIndices]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = points.material as THREE.ShaderMaterial
    m.uniforms.uHideBad.value = layers.hideImplausible ? 1 : 0
  }, [layers.hideImplausible, points])

  useEffect(() => {
    links.visible = layers.links
  }, [layers.links, links])

  useEffect(
    () => () => {
      points.geometry.dispose()
      ;(points.material as THREE.Material).dispose()
      links.geometry.dispose()
      ;(links.material as THREE.Material).dispose()
      neighbourLinks.geometry.dispose()
      ;(neighbourLinks.material as THREE.Material).dispose()
    },
    [points, links, neighbourLinks],
  )

  useFrame(() => {
    const k = currentStep(clock.t, dataset.steps)
    if (k !== loadedStep.current) {
      uploadStep(k)
      applyFlags(k)
    }
    const mix = clock.interpolate ? Math.min(Math.max(clock.t - k, 0), 1) : 0
    uniforms.uMix.value = mix
    const m = points.material as THREE.ShaderMaterial
    const routeShown = layers.savedGnn || layers.savedDijkstra || routeIndices.size > 0
    m.uniforms.uDim.value = routeShown ? 1 : 0
    ;(links.material as THREE.ShaderMaterial).uniforms.uOpacity.value = routeShown ? 0.11 : 0.16
  })

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <primitive object={links} />
      <primitive object={neighbourLinks} />
      <primitive object={points} />
    </group>
  )
}
