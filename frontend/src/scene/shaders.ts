// GLSL shared by satellites and links. Both read the same two position
// buffers (step k and step k+1) and blend them on the GPU, so advancing
// playback only changes one uniform per frame. Mirrors arcLerpKm() in
// lib/data.ts.
export const orbitChunk = /* glsl */ `
  attribute vec3 posA;
  attribute vec3 posB;
  uniform float uMix;
  uniform float uScale;

  vec3 orbitPosition() {
    if (uMix <= 0.0) return posA * uScale;
    float ra = length(posA);
    float rb = length(posB);
    vec3 ua = posA / ra;
    vec3 ub = posB / rb;
    if (dot(ua, ub) < 0.9393727) {          // cos(0.35 rad): implausible jump
      return (uMix < 0.5 ? posA : posB) * uScale;
    }
    vec3 u = normalize(mix(ua, ub, uMix));
    return u * mix(ra, rb, uMix) * uScale;
  }
`

export const satelliteVertex = /* glsl */ `
  ${orbitChunk}
  attribute float aEcl;   // 1 = eclipsed at the current step
  attribute float aFlag;  // 0 none, 1 neighbour, 2 route relay, 3 selected
  attribute float aBad;   // 1 = implausible propagated position
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uHideBad;
  uniform vec3 uSunlit;
  uniform vec3 uEclipsed;
  uniform vec3 uNeighbour;
  uniform float uDim;     // 0..1, dims ordinary satellites while a route is shown
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;

  void main() {
    vec3 p = orbitPosition();
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = uSize;
    vColor = aEcl > 0.5 ? uEclipsed : uSunlit;
    vAlpha = mix(1.0, 0.72, uDim);
    vRing = 0.0;

    if (aFlag > 2.5) {
      size *= 3.2; vColor = vec3(1.0); vAlpha = 1.0; vRing = 1.0;
    } else if (aFlag > 1.5) {
      size *= 1.6; vAlpha = 1.0;
    } else if (aFlag > 0.5) {
      size *= 1.45; vColor = mix(vColor, uNeighbour, 0.75); vAlpha = 1.0;
    }

    if (aBad > 0.5 && uHideBad > 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // outside the clip volume
    }

    float px = size * uPixelRatio * (14.0 / max(-mv.z, 0.001));
    gl_PointSize = clamp(px, 1.8 * uPixelRatio, (aFlag > 2.5 ? 26.0 : 11.0) * uPixelRatio);
  }
`

export const satelliteFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float a;
    if (vRing > 0.5) {
      float ring = smoothstep(0.5, 0.44, r) * smoothstep(0.30, 0.36, r);
      float dot_ = smoothstep(0.17, 0.12, r);
      a = max(ring, dot_);
    } else {
      a = smoothstep(0.5, 0.32, r);
    }
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`

export const linkVertex = /* glsl */ `
  ${orbitChunk}
  void main() {
    vec3 p = orbitPosition();
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

export const linkFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`

// Earth: day texture on the sunlit side, city lights on the night side,
// a soft terminator, ocean glint and a thin limb tint. Lighting is computed
// from the same Sun vector that Member 1's eclipse model uses.
export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform vec3 uSunDir;      // world space, unit
  uniform vec3 uCamPos;
  uniform float uNightBoost;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    float ndl = dot(n, uSunDir);
    float day = smoothstep(-0.08, 0.18, ndl);

    vec3 dayCol = texture2D(uDay, vUv).rgb;
    vec3 nightCol = texture2D(uNight, vUv).rgb;
    float water = texture2D(uWater, vUv).r;

    // Lambert with a little ambient so the night side is not pure black.
    vec3 lit = dayCol * (0.10 + 1.05 * max(ndl, 0.0));
    vec3 night = dayCol * 0.012 + nightCol * vec3(1.0, 0.82, 0.55) * uNightBoost;

    // Ocean glint.
    vec3 v = normalize(uCamPos - vPosW);
    vec3 h = normalize(uSunDir + v);
    float spec = pow(max(dot(n, h), 0.0), 260.0) * water * day * 0.14;

    vec3 col = mix(night, lit, day) + vec3(0.85, 0.9, 1.0) * spec;

    // Warm band along the terminator.
    float band = smoothstep(0.22, 0.0, abs(ndl - 0.02));
    col += vec3(0.30, 0.12, 0.04) * band * 0.07;

    // Limb tint.
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col += vec3(0.25, 0.55, 1.0) * fres * (0.15 + 0.55 * day);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uCamPos;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(uCamPos - vPosW);
    // Back faces of a slightly larger sphere: brightest just outside the limb.
    float limb = pow(1.0 - abs(dot(n, v)), 2.4);
    float sun = smoothstep(-0.35, 0.45, dot(n, uSunDir));
    vec3 col = mix(vec3(0.05, 0.12, 0.35), vec3(0.32, 0.62, 1.0), sun);
    float alpha = limb * (0.18 + 0.82 * sun);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`
