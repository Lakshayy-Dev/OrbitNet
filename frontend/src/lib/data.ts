import { api, type Meta } from './api'

// Everything the 3D view needs, loaded once (about 6 MB) and kept in typed
// arrays. Positions are the saved GCRS coordinates in km.
export interface Dataset {
  meta: Meta
  ids: string[]
  indexOf: Map<string, number>
  implausible: Uint8Array // per satellite: 1 if implausible at any step
  steps: number
  count: number
  positions: Float32Array // steps × count × 3
  eclipse: Uint8Array // steps × count
  energy: Float32Array // steps × count
  links: Uint32Array[] // per step, flat pairs (a, b)
}

export async function loadDataset(onProgress?: (label: string) => void): Promise<Dataset> {
  onProgress?.('Loading snapshot index')
  const [meta, sats] = await Promise.all([api.meta(), api.satellites()])

  onProgress?.('Loading satellite positions, eclipse states and links')
  const [posBuf, eclBuf, enBuf, linkBuf] = await Promise.all([
    api.positions(),
    api.eclipse(),
    api.energy(),
    api.links(),
  ])

  const steps = meta.steps
  const count = meta.satellites
  const positions = new Float32Array(posBuf)
  const eclipse = new Uint8Array(eclBuf)
  const energy = new Float32Array(enBuf)

  if (positions.length !== steps * count * 3) {
    throw new Error(`Position data has ${positions.length} values; expected ${steps * count * 3}.`)
  }
  if (eclipse.length !== steps * count) {
    throw new Error('Eclipse data does not match the snapshot index.')
  }

  const linkView = new Uint32Array(linkBuf)
  const linkSteps = linkView[0]
  const offsets = linkView.subarray(1, 1 + linkSteps + 1)
  const body = linkView.subarray(1 + linkSteps + 1)
  const links: Uint32Array[] = []
  for (let k = 0; k < linkSteps; k++) {
    links.push(body.subarray(offsets[k] * 2, offsets[k + 1] * 2))
  }

  const indexOf = new Map<string, number>()
  sats.ids.forEach((id, i) => indexOf.set(id, i))

  return {
    meta,
    ids: sats.ids,
    indexOf,
    implausible: Uint8Array.from(sats.implausible),
    steps,
    count,
    positions,
    eclipse,
    energy,
    links,
  }
}

export function stepPositions(d: Dataset, step: number): Float32Array {
  const n = d.count * 3
  return d.positions.subarray(step * n, (step + 1) * n)
}

export function stepEclipse(d: Dataset, step: number): Uint8Array {
  return d.eclipse.subarray(step * d.count, (step + 1) * d.count)
}

/**
 * Position of one satellite at fractional time `t` (in steps), in km.
 *
 * At whole steps this is exactly the saved position. Between two saved
 * snapshots the direction is interpolated along the arc between them
 * (normalised linear interpolation) and the radius linearly. Over one 30 s
 * step a Starlink satellite moves about 1.9° of arc, where the arc and this
 * interpolation differ by well under 1 km. Positions that jump more than
 * MAX_COS_ARC apart between steps (corrupt TLEs) are not interpolated.
 * Must match the GLSL in scene/shaders.ts.
 */
export const MAX_COS_ARC = Math.cos(0.35) // ~20°

export function positionAt(d: Dataset, index: number, t: number, interpolate: boolean, out: number[] = [0, 0, 0]) {
  const k = Math.min(Math.floor(t), d.steps - 1)
  const k2 = Math.min(k + 1, d.steps - 1)
  const f = interpolate ? Math.min(Math.max(t - k, 0), 1) : 0
  const a = (k * d.count + index) * 3
  const b = (k2 * d.count + index) * 3
  const P = d.positions
  return arcLerpKm(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], f, out)
}

export function arcLerpKm(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  f: number, out: number[] = [0, 0, 0],
) {
  if (f <= 0) {
    out[0] = ax; out[1] = ay; out[2] = az
    return out
  }
  const ra = Math.hypot(ax, ay, az)
  const rb = Math.hypot(bx, by, bz)
  const cos = (ax * bx + ay * by + az * bz) / (ra * rb)
  if (cos < MAX_COS_ARC) {
    // Not a plausible 30 s orbital motion: switch at the halfway point.
    const useA = f < 0.5
    out[0] = useA ? ax : bx; out[1] = useA ? ay : by; out[2] = useA ? az : bz
    return out
  }
  const ux = (ax / ra) * (1 - f) + (bx / rb) * f
  const uy = (ay / ra) * (1 - f) + (by / rb) * f
  const uz = (az / ra) * (1 - f) + (bz / rb) * f
  const r = (ra + (rb - ra) * f) / Math.hypot(ux, uy, uz)
  out[0] = ux * r; out[1] = uy * r; out[2] = uz * r
  return out
}
