import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'
import { EARTH_R } from './frame'

// Route labels are plain DOM elements over the canvas. Routes publish what
// to label (rarely: when a route changes) and where (every frame, into a
// Map); one projector inside the canvas moves the elements. This avoids a
// separate React root per label.

export interface LabelSpec {
  key: string
  kind: 'source' | 'dest' | 'hop'
  text: string
}

interface LabelState {
  groups: Record<string, LabelSpec[]>
  setGroup: (group: string, specs: LabelSpec[]) => void
  clearGroup: (group: string) => void
}

export const useLabels = create<LabelState>((set) => ({
  groups: {},
  setGroup: (group, specs) => set((s) => ({ groups: { ...s.groups, [group]: specs } })),
  clearGroup: (group) =>
    set((s) => {
      const next = { ...s.groups }
      delete next[group]
      return { groups: next }
    }),
}))

export const labelPositions = new Map<string, THREE.Vector3>()
const labelElements = new Map<string, HTMLDivElement>()

/** DOM layer; place it as a sibling of the <Canvas> inside a positioned box. */
export function LabelLayer() {
  const groups = useLabels((s) => s.groups)
  const specs = Object.values(groups).flat()
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {specs.map((s) => (
        <div
          key={s.key}
          ref={(el) => {
            if (el) labelElements.set(s.key, el)
            else labelElements.delete(s.key)
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ visibility: 'hidden' }}
        >
          {s.kind === 'hop' ? (
            <div className="readout -translate-x-1/2 -translate-y-[160%] rounded bg-void/80 px-1 text-[11px] text-ink">{s.text}</div>
          ) : (
            <EndpointLabel kind={s.kind} id={s.text} />
          )}
        </div>
      ))}
    </div>
  )
}

function EndpointLabel({ kind, id }: { kind: 'source' | 'dest'; id: string }) {
  const tone = kind === 'source' ? 'border-source text-source' : 'border-dest text-dest'
  return (
    <div className="relative -translate-x-1/2 -translate-y-1/2">
      <div className={`h-5 w-5 rounded-full border-2 ${tone}`} />
      <div className={`absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap rounded border bg-void/85 px-1.5 py-0.5 text-[11px] leading-tight ${tone}`}>
        <span className="text-ink-dim">{kind === 'source' ? 'Source' : 'Destination'}</span>{' '}
        <span className="readout text-[12px] text-ink">{id}</span>
      </div>
    </div>
  )
}

/** Inside the <Canvas>: projects label anchors to the screen each frame. */
export function LabelProjector() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = new THREE.Vector3()
  const dir = new THREE.Vector3()

  useEffect(() => () => labelElements.forEach((el) => (el.style.visibility = 'hidden')), [])

  useFrame(() => {
    const cam = camera.position
    labelElements.forEach((el, key) => {
      const p = labelPositions.get(key)
      if (!p) {
        el.style.visibility = 'hidden'
        return
      }
      v.copy(p).project(camera)
      if (v.z < -1 || v.z > 1) {
        el.style.visibility = 'hidden'
        return
      }
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      // Dim labels whose anchor is behind the Earth.
      dir.copy(p).sub(cam)
      const dist = dir.length()
      dir.divideScalar(dist)
      const b = cam.dot(dir)
      const c = cam.lengthSq() - EARTH_R * EARTH_R
      const disc = b * b - c
      const hidden = disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < dist
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      el.style.opacity = hidden ? '0.35' : '1'
      el.style.visibility = 'visible'
    })
  })
  return null
}
