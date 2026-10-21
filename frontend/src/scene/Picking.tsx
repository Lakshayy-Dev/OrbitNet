import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { positionAt } from '../lib/data'
import { clock, useStore } from '../lib/store'
import { EARTH_R, KM, gcrsToWorld } from './frame'

export const hoverPoint = { x: 0, y: 0 }

/**
 * Click / hover picking for 10,706 points without a per-frame cost: on demand,
 * project every satellite at the current playback time to the screen, keep
 * those not hidden behind Earth, and take the nearest within a few pixels.
 */
export function Picking() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const dataset = useStore((s) => s.dataset)!
  const select = useStore((s) => s.select)
  const set = useStore((s) => s.set)
  const down = useRef<{ x: number; y: number } | null>(null)
  const lastHover = useRef(0)

  useEffect(() => {
    const el = gl.domElement
    const tmp = [0, 0, 0]
    const w = new THREE.Vector3()
    const p = new THREE.Vector3()
    const toPoint = new THREE.Vector3()

    const pick = (clientX: number, clientY: number, radiusPx: number): number | null => {
      const rect = el.getBoundingClientRect()
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const camPos = camera.position
      const hide = useStore.getState().layers.hideImplausible
      let best = -1
      let bestScore = Infinity
      for (let i = 0; i < dataset.count; i++) {
        if (hide && dataset.implausible[i]) continue
        positionAt(dataset, i, clock.t, clock.interpolate, tmp)
        gcrsToWorld(tmp, w).multiplyScalar(KM)
        p.copy(w).project(camera)
        if (p.z < -1 || p.z > 1) continue
        const sx = (p.x * 0.5 + 0.5) * rect.width
        const sy = (-p.y * 0.5 + 0.5) * rect.height
        const d2 = (sx - mx) ** 2 + (sy - my) ** 2
        if (d2 > radiusPx * radiusPx) continue
        // Hidden behind the Earth?
        toPoint.copy(w).sub(camPos)
        const dist = toPoint.length()
        toPoint.divideScalar(dist)
        const b = camPos.dot(toPoint)
        const c = camPos.lengthSq() - EARTH_R * EARTH_R
        const disc = b * b - c
        if (disc > 0) {
          const tHit = -b - Math.sqrt(disc)
          if (tHit > 0 && tHit < dist - 1e-3) continue
        }
        const score = d2 + dist * 0.5
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      }
      return best >= 0 ? best : null
    }

    const onDown = (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      const d = down.current
      down.current = null
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return // a drag, not a click
      const hit = pick(e.clientX, e.clientY, 10)
      select(hit)
    }
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return
      const now = performance.now()
      if (now - lastHover.current < 60) return
      lastHover.current = now
      const hit = pick(e.clientX, e.clientY, 8)
      const rect = el.getBoundingClientRect()
      hoverPoint.x = e.clientX - rect.left
      hoverPoint.y = e.clientY - rect.top
      if (hit !== useStore.getState().hovered) set({ hovered: hit })
      el.style.cursor = hit !== null ? 'pointer' : 'grab'
    }
    const onLeave = () => set({ hovered: null })

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.style.cursor = 'grab'
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [camera, gl, dataset, select, set])

  return null
}
