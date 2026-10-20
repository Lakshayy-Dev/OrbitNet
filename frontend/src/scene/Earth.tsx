import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clock, useStore } from '../lib/store'
import { EARTH_R, earthMatrixAt, gcrsToWorld, sunDirectionAt } from './frame'
import { atmosphereFragment, atmosphereVertex, earthFragment, earthVertex } from './shaders'

const tmpSun = new THREE.Vector3()
const tmpSunW = new THREE.Vector3()
const tmpMat = new THREE.Matrix4()

/**
 * Earth, atmosphere, the Sun and the star background.
 *
 * The Earth mesh sits in an Earth-fixed frame whose orientation in GCRS is
 * the saved ITRS→GCRS matrix for the current time, so the texture's
 * continents line up with the satellites' inertial positions. The day/night
 * boundary uses the same Sun vector as Member 1's eclipse detector.
 */
export function Earth() {
  const dataset = useStore((s) => s.dataset)
  const showShadow = useStore((s) => s.layers.shadow)
  const camera = useThree((s) => s.camera)
  const [day, night, water, sky] = useLoader(THREE.TextureLoader, [
    '/textures/earth-blue-marble.jpg',
    '/textures/earth-night.jpg',
    '/textures/earth-water.png',
    '/textures/night-sky.png',
  ])

  // Colour space must be set before the first upload, i.e. during render.
  useMemo(() => {
    for (const t of [day, night, sky]) t.colorSpace = THREE.SRGBColorSpace
    for (const t of [day, night, water]) t.anisotropy = 8
    return true
  }, [day, night, water, sky])

  const earthFrame = useRef<THREE.Group>(null)
  const sunSprite = useRef<THREE.Sprite>(null)
  const shadow = useRef<THREE.Group>(null)

  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          uDay: { value: day },
          uNight: { value: night },
          uWater: { value: water },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uCamPos: { value: new THREE.Vector3() },
          uNightBoost: { value: 1.1 },
        },
      }),
    [day, night, water],
  )

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        uniforms: {
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uCamPos: { value: new THREE.Vector3() },
        },
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  const sunTexture = useMemo(() => makeSunTexture(), [])

  useFrame(() => {
    if (!dataset) return
    const t = clock.interpolate ? clock.t : Math.floor(clock.t + 1e-6)
    if (earthFrame.current) {
      earthFrame.current.matrix.copy(earthMatrixAt(dataset, t, tmpMat))
      earthFrame.current.matrixWorldNeedsUpdate = true
    }
    sunDirectionAt(dataset, t, tmpSun)
    gcrsToWorld(tmpSun, tmpSunW)
    earthMaterial.uniforms.uSunDir.value.copy(tmpSunW)
    earthMaterial.uniforms.uCamPos.value.copy(camera.position)
    atmosphereMaterial.uniforms.uSunDir.value.copy(tmpSunW)
    atmosphereMaterial.uniforms.uCamPos.value.copy(camera.position)
    if (sunSprite.current) sunSprite.current.position.copy(tmpSunW).multiplyScalar(420)
    if (shadow.current) {
      // Member 1's cylindrical shadow: radius = Earth radius, along −Sun.
      shadow.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpSunW.clone().negate())
    }
  })

  return (
    <>
      {/* Star background (decorative). */}
      <mesh renderOrder={-10}>
        <sphereGeometry args={[900, 48, 24]} />
        <meshBasicMaterial map={sky} side={THREE.BackSide} depthWrite={false} color="#6d7a96" />
      </mesh>

      {/* The Sun, far away along the real Sun direction. */}
      <sprite ref={sunSprite} scale={[70, 70, 1]}>
        <spriteMaterial map={sunTexture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* Earth-fixed frame inside the GCRS frame. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={earthFrame} matrixAutoUpdate={false}>
          {/* SphereGeometry is Y-up with longitude 0 on +X; rotate it so the
              north pole is +Z (ITRS) and longitude 90°E is +Y. */}
          <mesh rotation={[Math.PI / 2, 0, 0]} material={earthMaterial}>
            <sphereGeometry args={[EARTH_R, 160, 80]} />
          </mesh>
        </group>
      </group>

      <mesh material={atmosphereMaterial} renderOrder={1}>
        <sphereGeometry args={[EARTH_R * 1.045, 96, 48]} />
      </mesh>

      <group ref={shadow} visible={showShadow}>
        <mesh position={[0, 22, 0]} renderOrder={2}>
          <cylinderGeometry args={[EARTH_R, EARTH_R, 44, 64, 1, true]} />
          <meshBasicMaterial color="#0b1a33" transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[EARTH_R * 0.995, EARTH_R * 1.01, 128]} />
          <meshBasicMaterial color="#7586a6" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}

function makeSunTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,250,1)')
  g.addColorStop(0.08, 'rgba(255,248,225,1)')
  g.addColorStop(0.16, 'rgba(255,214,150,0.55)')
  g.addColorStop(0.4, 'rgba(255,170,90,0.12)')
  g.addColorStop(1, 'rgba(255,150,80,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
