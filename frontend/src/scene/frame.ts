import * as THREE from 'three'
import type { Dataset } from '../lib/data'

// Scene units: 1 unit = 1000 km. The saved data is in GCRS (Earth-centred
// inertial, Z towards the celestial north pole). three.js is Y-up, so every
// GCRS-frame object lives inside a group rotated −90° about X, which maps
// GCRS (x, y, z) to scene (x, z, −y).
export const KM = 0.001
export const EARTH_RADIUS_KM = 6378.137
export const EARTH_R = EARTH_RADIUS_KM * KM

export function gcrsToWorld(v: ArrayLike<number> | THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return out.set(v.x, v.z, -v.y)
  return out.set(v[0], v[2], -v[1])
}

/** Sun direction (GCRS unit vector) at fractional step t. */
export function sunDirectionAt(d: Dataset, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const k = Math.min(Math.floor(t), d.steps - 1)
  const k2 = Math.min(k + 1, d.steps - 1)
  const f = t - k
  const a = d.meta.frames[k].sun_direction
  const b = d.meta.frames[k2].sun_direction
  return out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f).normalize()
}

/**
 * ITRS→GCRS rotation (Earth orientation) at fractional step t, as a Matrix4.
 * The Earth turns about 0.125° per 30 s step, so element-wise interpolation
 * between the saved matrices stays orthonormal to ~1e-6.
 */
export function earthMatrixAt(d: Dataset, t: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const k = Math.min(Math.floor(t), d.steps - 1)
  const k2 = Math.min(k + 1, d.steps - 1)
  const f = t - k
  const A = d.meta.frames[k].itrs_to_gcrs
  const B = d.meta.frames[k2].itrs_to_gcrs
  const m = (r: number, c: number) => A[r][c] + (B[r][c] - A[r][c]) * f
  return out.set(
    m(0, 0), m(0, 1), m(0, 2), 0,
    m(1, 0), m(1, 1), m(1, 2), 0,
    m(2, 0), m(2, 1), m(2, 2), 0,
    0, 0, 0, 1,
  )
}
