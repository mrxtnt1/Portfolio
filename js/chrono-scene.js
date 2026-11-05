/* ==========================================================================
   CHRONO SCENE · the persistent Three.js layer
   - a time tunnel of stars, streaks and gates (warps on every section jump)
   - a chronograph rig (dial, bezel, gyroscope rings) that frames each portrait
   - the hero portrait as a shader plane: materialises from a portal, ripples
     under the cursor, splits RGB, rim-lit in brass (past) and flux (future)
   ========================================================================== */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

THREE.ColorManagement.enabled = false;

const C = { void: 0x05060c, brass: 0xf0b35a, flux: 0x62e8ff, ivory: 0xede7da, rift: 0x8a6cff };
const color = (hex) => new THREE.Color(hex);

const NOISE = /* glsl */`
  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  // WebGL can only use a cross-origin photo when it is requested with CORS
  if (new URL(src, document.baseURI).origin !== window.location.origin) img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not load ' + src));
  img.src = src;
});

const ease = {
  inOut: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 4),
  in: (k) => k * k * k,
};

/* ---------- canvas textures ---------- */
function dialTexture(text, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const m = size / 2;
  const R = m - 4;
  g.translate(m, m);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  const ring = (r, w, dash) => { g.beginPath(); g.setLineDash(dash || []); g.lineWidth = w; g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); };
  ring(R - 2, 2.5);
  ring(R * .81, 1.5);
  ring(R * .79, 1, [2, 10]);
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const major = i % 20 === 0;
    const mid = i % 5 === 0;
    const len = major ? 42 : mid ? 22 : 10;
    g.lineWidth = major ? 4 : mid ? 2 : 1.2;
    g.globalAlpha = major ? 1 : mid ? .8 : .5;
    g.beginPath();
    g.moveTo(Math.sin(a) * (R - 10), -Math.cos(a) * (R - 10));
    g.lineTo(Math.sin(a) * (R - 10 - len), -Math.cos(a) * (R - 10 - len));
    g.stroke();
  }
  g.globalAlpha = 1;
  // curved text band
  const fontPx = Math.round(size * .026);
  g.font = `400 ${fontPx}px "Martian Mono", ui-monospace, monospace`;
  const rText = R * .855;
  const circ = Math.PI * 2 * rText;
  let str = text;
  while (g.measureText(str + text).width < circ * .98) str += text;
  const widths = [...str].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0);
  const extra = (circ - total) / widths.length;
  let ang = 0;
  [...str].forEach((ch, i) => {
    const w = widths[i] + extra;
    g.save();
    g.rotate(ang + (w / 2) / rText);
    g.fillText(ch, -widths[i] / 2, -rText + fontPx * .36);
    g.restore();
    ang += w / rText;
  });
  // cardinal markers
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -R * .78);
    g.lineTo(-9, -R * .78 + 18);
    g.lineTo(9, -R * .78 + 18);
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(.18, 'rgba(255,255,255,.85)');
  grd.addColorStop(.45, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* ========================================================================== */
export async function createChronoScene({ canvas, portraitSrc, ringText, lite = false, reduced = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(C.void, 1);
  const PIXEL_BUDGET = lite ? 1.4e6 : 3.2e6; // keeps GPU memory low so the page's photos never get evicted
  const pickDpr = () => Math.max(.75, Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.5, Math.sqrt(PIXEL_BUDGET / (window.innerWidth * window.innerHeight))));
  let DPR = pickDpr();
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const BASE_FOV = 35;
  const CAM_Z = 10;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, .1, 400);
  camera.position.set(0, 0, CAM_Z);

  const uniformsCommon = {
    uBrass: { value: color(C.brass) },
    uFlux: { value: color(C.flux) },
    uIvory: { value: color(C.ivory) },
    uRift: { value: color(C.rift) },
    uVoid: { value: color(C.void) },
  };

  const state = {
    time: 0, travel: 0, rise: 0,
    reveal: 0, portal: 0, rings: 0, ringsTarget: 0,
    hover: 0, hoverTarget: 0, glitch: 0, spin: 1,
    warpT: 99, warpDur: 1.3, warpAmp: 0, warpLevel: 0,
    pointer: new THREE.Vector2(0, 0), pointerSmooth: new THREE.Vector2(0, 0),
    ndc: new THREE.Vector2(9, 9), pointerMoved: false,
    mouseUv: new THREE.Vector2(.5, .6),
    mode: 'none', anchor: null,
    target: { x: 0, y: 0, s: 1, ringY: 0, orbitY: 0 },
    focus: new THREE.Vector2(.42, .2), focusTarget: new THREE.Vector2(.42, .2),
    nextGlitch: 6,
    introHide: 0, flash: 0,
  };

  /* ---------- tweens ---------- */
  const tweens = new Set();
  const tween = (key, to, dur, fn = ease.inOut) => new Promise((resolve) => {
    for (const t of tweens) if (t.key === key) { tweens.delete(t); t.resolve(); }
    if (dur <= 0) { state[key] = to; resolve(); return; }
    tweens.add({ key, from: state[key], to, dur, t: 0, fn, resolve });
  });

  /* ---------- background nebula ---------- */
  const bgMat = new THREE.ShaderMaterial({
    uniforms: { ...uniformsCommon, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uWarp: { value: 0 }, uFocus: { value: state.focus } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec2 uRes; uniform float uTime, uWarp; uniform vec2 uFocus;
      uniform vec3 uVoid, uRift, uBrass, uFlux;
      ${NOISE}
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y;
        float r = length(p);
        float n = noise(p * 2.6 + uTime * 0.025) * 0.6 + noise(p * 6.0 - uTime * 0.02) * 0.3;
        vec3 c = uVoid;
        c += uRift * 0.17 * exp(-length(p - uFocus) * 2.1) * (0.6 + n);
        c += uBrass * 0.075 * exp(-length(p - vec2(-uFocus.x * 1.3, -0.45)) * 2.6) * (0.55 + n);
        c += uFlux * (0.025 + 0.16 * uWarp) * exp(-r * (3.4 - uWarp * 1.6));
        c *= 1.0 - 0.6 * smoothstep(0.35, 1.3, r);
        c += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthWrite: false, depthTest: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  const finishMat = new THREE.ShaderMaterial({
    uniforms: { ...uniformsCommon, uRes: bgMat.uniforms.uRes, uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec2 uRes; uniform float uTime, uFlash; uniform vec3 uVoid, uFlux;
      ${NOISE}
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes;
        vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y;
        float vig = smoothstep(0.45, 1.25, length(p)) * 0.55;
        float grain = hash(floor(gl_FragCoord.xy * 0.75) + floor(uTime * 14.0) * 13.7);
        float ga = 0.035;
        float a = clamp(vig + ga + uFlash, 0.0, 1.0);
        vec3 c = (uVoid * vig + vec3(grain) * ga + mix(uFlux, vec3(1.0), 0.6) * uFlash) / max(a, 1e-4);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, depthTest: false,
  });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finishMat);
  finish.frustumCulled = false;
  finish.renderOrder = 100;
  scene.add(finish);

  /* ---------- tunnel: stars + streaks ---------- */
  const DEPTH = 170;
  const tunnel = new THREE.Group();
  scene.add(tunnel);
  const N = lite ? 750 : 1700;
  const starPos = new Float32Array(N * 3);
  const starSize = new Float32Array(N);
  const starTint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 3.2 + Math.pow(Math.random(), .65) * 40;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = Math.sin(a) * r;
    starPos[i * 3 + 2] = Math.random() * DEPTH;
    starSize[i] = .5 + Math.pow(Math.random(), 3) * 2.6;
    starTint[i] = Math.random();
  }
  const tunnelUniforms = { ...uniformsCommon, uTravel: { value: 0 }, uDepth: { value: DEPTH }, uPR: { value: DPR }, uCamZ: { value: CAM_Z }, uStreak: { value: 0 }, uStreakA: { value: 0 } };
  const zChunk = /* glsl */`
    float zz = mod(p.z + uTravel, uDepth);
    p.z = uCamZ + 2.0 - uDepth + zz;
    float fade = smoothstep(0.0, 45.0, zz) * (1.0 - smoothstep(uDepth - 9.0, uDepth - 2.0, zz));
  `;
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(starTint, 1));
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: tunnelUniforms,
    vertexShader: /* glsl */`
      uniform float uTravel, uDepth, uPR, uCamZ;
      attribute float aSize; attribute float aTint;
      varying float vA; varying float vTint;
      void main(){
        vec3 p = position;
        ${zChunk}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uPR * (80.0 / max(-mv.z, 0.5)), 0.0, 7.0 * uPR);
        vA = fade; vTint = aTint;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uIvory, uBrass, uFlux;
      varying float vA; varying float vTint;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 c = vTint < 0.72 ? uIvory : (vTint < 0.87 ? uBrass : uFlux);
        gl_FragColor = vec4(c, a * vA * 0.85);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -5;
  tunnel.add(stars);

  const M = Math.floor(N * .55);
  const streakPos = new Float32Array(M * 6);
  const streakEnd = new Float32Array(M * 2);
  const streakTint = new Float32Array(M * 2);
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < 2; k++) {
      streakPos.set([starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2]], (i * 2 + k) * 3);
      streakEnd[i * 2 + k] = k;
      streakTint[i * 2 + k] = starTint[i];
    }
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('aEnd', new THREE.BufferAttribute(streakEnd, 1));
  streakGeo.setAttribute('aTint', new THREE.BufferAttribute(streakTint, 1));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.ShaderMaterial({
    uniforms: tunnelUniforms,
    vertexShader: /* glsl */`
      uniform float uTravel, uDepth, uCamZ, uStreak;
      attribute float aEnd; attribute float aTint;
      varying float vA; varying float vTint;
      void main(){
        vec3 p = position;
        ${zChunk}
        p.z -= aEnd * uStreak;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vA = fade * (1.0 - aEnd); vTint = aTint;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uIvory, uBrass, uFlux; uniform float uStreakA;
      varying float vA; varying float vTint;
      void main(){
        vec3 c = vTint < 0.6 ? uIvory : (vTint < 0.8 ? uBrass : uFlux);
        gl_FragColor = vec4(c, vA * uStreakA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  streaks.frustumCulled = false;
  streaks.renderOrder = -4;
  tunnel.add(streaks);

  // time gates: rings with tick marks that fly past during a jump
  const gates = [];
  const circlePts = Array.from({ length: 181 }, (_, i) => { const a = (i / 180) * Math.PI * 2; return new THREE.Vector3(Math.cos(a), Math.sin(a), 0); });
  const gateGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
  const tickPts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const l = i % 4 === 0 ? .9 : .95;
    tickPts.push(new THREE.Vector3(Math.cos(a) * l, Math.sin(a) * l, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
  }
  const gateTickGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.LineBasicMaterial({ color: i % 2 ? C.flux : C.brass, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const gate = new THREE.Group();
    gate.add(new THREE.Line(gateGeo, mat), new THREE.LineSegments(gateTickGeo, mat));
    gate.scale.setScalar(7.5 + (i % 3) * .9);
    gate.userData = { z0: (i / 5) * DEPTH, mat, spin: (i % 2 ? 1 : -1) * .05 };
    gate.renderOrder = -3;
    tunnel.add(gate);
    gates.push(gate);
  }

  /* ---------- wormhole: the opening scene flies through it ---------- */
  const WORM_LEN = 150;
  const wormU = { ...uniformsCommon, uTime: { value: 0 }, uTravel: { value: 0 }, uAlpha: { value: 0 } };
  const worm = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, WORM_LEN, lite ? 48 : 96, 1, true), new THREE.ShaderMaterial({
    uniforms: wormU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uTravel, uAlpha; uniform vec3 uBrass, uFlux, uRift, uIvory;
      varying vec2 vUv;
      ${NOISE}
      void main(){
        float ang = vUv.x * 6.2831853;
        float d = vUv.y;                       // 1 = mouth by the camera, 0 = far end
        float z = (1.0 - d) * 60.0 + uTravel;
        float sw = sin(ang * 4.0 + z * 0.32 + uTime * 1.6);
        float bands = pow(sw * 0.5 + 0.5, 3.0);
        float rings = pow(abs(sin(z * 0.85)), 22.0);
        float n = noise(vec2(vUv.x * 28.0, z * 0.7));
        vec3 col = mix(uRift, uFlux, bands);
        col = mix(col, uBrass, rings * 0.9);
        col += uIvory * pow(n, 6.0) * 1.4;
        float a = 0.16 + bands * 0.55 + rings * 0.7 + pow(n, 5.0);
        a *= smoothstep(0.0, 0.35, d) * (1.0 - 0.6 * smoothstep(0.9, 1.0, d));
        gl_FragColor = vec4(col, a * uAlpha);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  worm.rotation.x = Math.PI / 2;
  worm.position.z = CAM_Z + 2 - WORM_LEN / 2;
  worm.frustumCulled = false;
  worm.renderOrder = -2;
  worm.visible = false;
  scene.add(worm);
  const wormCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdffbff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  wormCore.position.z = CAM_Z + 6 - WORM_LEN;
  wormCore.renderOrder = -1;
  wormCore.visible = false;
  scene.add(wormCore);
  const intro = { active: false, t: 0, dur: 2.6, resolve: null };

  /* ---------- chronograph rig ---------- */
  const chrono = new THREE.Group();
  scene.add(chrono);
  const tilt = new THREE.Group();
  chrono.add(tilt);
  const rig = new THREE.Group();
  tilt.add(rig);
  const glowTex = glowTexture();
  const additive = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...opts });

  const DIAL_OUT = 2.0;
  const dialMat = additive({ map: dialTexture(ringText), color: C.brass, opacity: .7 });
  const dial = new THREE.Mesh(new THREE.RingGeometry(DIAL_OUT * .76, DIAL_OUT, 160, 1), dialMat);
  dial.position.z = -.75;
  dial.renderOrder = 3;
  rig.add(dial);

  const bezelPts = [];
  for (let i = 0; i < 96; i++) {
    if (i > 66) continue; // open arc, like a chronograph bezel
    const a = (i / 96) * Math.PI * 2;
    const l = i % 6 === 0 ? 2.07 : 2.12;
    bezelPts.push(new THREE.Vector3(Math.cos(a) * l, Math.sin(a) * l, 0), new THREE.Vector3(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0));
  }
  const bezelMat = new THREE.LineBasicMaterial({ color: C.flux, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
  const bezel = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bezelPts), bezelMat);
  bezel.position.z = -.4;
  bezel.renderOrder = 3;
  rig.add(bezel);

  const orbit = new THREE.Group();
  tilt.add(orbit);
  const gyros = [];
  const makeGyro = (r, tube, col, tiltX, tiltZ, speed, beads) => {
    const g = new THREE.Group();
    const tiltG = new THREE.Group();
    tiltG.rotation.set(tiltX, 0, tiltZ);
    g.add(tiltG);
    const inner = new THREE.Group();
    tiltG.add(inner);
    const mat = additive({ color: col, opacity: .75 });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 220), mat);
    torus.renderOrder = 4;
    inner.add(torus);
    const beadMats = [];
    for (let i = 0; i < beads; i++) {
      const bm = new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const b = new THREE.Sprite(bm);
      const a = (i / beads) * Math.PI * 2;
      b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      b.scale.setScalar(.28);
      b.renderOrder = 5;
      inner.add(b);
      beadMats.push(bm);
    }
    g.userData = { inner, speed, mat, beadMats };
    orbit.add(g);
    gyros.push(g);
  };
  makeGyro(2.05, .006, C.flux, 1.38, .16, .5, 2);
  makeGyro(2.22, .0045, C.brass, 1.26, -.24, -.34, 1);

  /* ---------- portrait ---------- */
  const img = await loadImage(portraitSrc);
  const tex = new THREE.Texture(img);
  tex.needsUpdate = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const PH = 3.6;
  const PW = PH * (img.naturalWidth / img.naturalHeight);

  // tiny alpha map so hover only triggers on the silhouette, not the empty corners
  const aCan = document.createElement('canvas');
  aCan.width = 160;
  aCan.height = Math.round(160 * img.naturalHeight / img.naturalWidth);
  const aCtx = aCan.getContext('2d', { willReadFrequently: true });
  aCtx.drawImage(img, 0, 0, aCan.width, aCan.height);
  const alphaData = aCtx.getImageData(0, 0, aCan.width, aCan.height).data;

  const pUniforms = {
    ...uniformsCommon,
    uTex: { value: tex }, uTime: { value: 0 }, uHover: { value: 0 }, uReveal: { value: 0 }, uGlitch: { value: 0 },
    uMouse: { value: state.mouseUv }, uAspect: { value: PW / PH },
  };
  const portraitVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const portraitFrag = /* glsl */`
    uniform sampler2D uTex; uniform float uTime, uHover, uReveal, uGlitch, uAspect;
    uniform vec2 uMouse; uniform vec3 uBrass, uFlux;
    varying vec2 vUv;
    ${NOISE}
    void main(){
      vec2 uv = vUv;
      // materialise from the bottom up with a noisy, glowing edge
      float n = noise(vUv * vec2(14.0, 22.0)) * 0.10 + noise(vUv * vec2(52.0, 74.0)) * 0.05;
      float edge = uReveal * 1.32 - 0.14;
      float diff = edge - (vUv.y + n);
      float vis = smoothstep(0.0, 0.012, diff);
      float band = (1.0 - smoothstep(0.0, 0.07, diff)) * step(0.0, diff) * (1.0 - step(0.999, uReveal));
      // time-instability slices
      float slice = floor(vUv.y * 46.0);
      float gt = floor(uTime * 16.0);
      float g = step(1.0 - 0.24 * uGlitch, hash(vec2(slice, gt))) * uGlitch;
      uv.x += (hash(vec2(slice + 7.3, gt)) - 0.5) * 0.09 * g;
      // ripple from the cursor
      vec2 d = (uv - uMouse) * vec2(uAspect, 1.0);
      float dist = length(d);
      float wave = sin(dist * 42.0 - uTime * 6.5) * exp(-dist * 5.0) * 0.0065 * uHover;
      uv += (d / max(dist, 1e-4)) * wave * vec2(1.0 / uAspect, 1.0);
      float ca = 0.0024 * uHover + 0.014 * uGlitch;
      vec4 base = texture2D(uTex, uv);
      vec4 rs = texture2D(uTex, uv + vec2(ca, 0.0));
      vec4 bs = texture2D(uTex, uv - vec2(ca, 0.0));
      float bottom = smoothstep(0.02, 0.24, vUv.y + (noise(vUv * vec2(30.0, 8.0) + uTime * 0.15) - 0.5) * 0.08);
      #ifdef DEPTH_ONLY
        if (base.a * vis * bottom < 0.5) discard;
        gl_FragColor = vec4(0.0);
      #else
        vec3 c = vec3(rs.r, base.g, bs.b);
        float a = max(base.a, max(rs.a, bs.a));
        float o = 0.011;
        float aR = texture2D(uTex, uv + vec2(o, 0.0)).a;
        float aL = texture2D(uTex, uv - vec2(o, 0.0)).a;
        float aU = texture2D(uTex, uv + vec2(0.0, o * 0.8)).a;
        float rimR = base.a * (1.0 - aR);
        float rimL = base.a * (1.0 - aL);
        float rimT = base.a * (1.0 - aU);
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, c * vec3(0.86, 0.93, 1.1), (1.0 - lum) * 0.5);
        c *= mix(0.6, 1.0, smoothstep(0.0, 0.42, vUv.y));
        c += uFlux * rimR * (0.7 + 0.6 * uHover) + uBrass * rimL * (0.7 + 0.6 * uHover) + mix(uBrass, uFlux, vUv.x) * rimT * 0.4;
        float scan = sin(vUv.y * 720.0 + uTime * 2.0) * 0.5 + 0.5;
        c *= 1.0 - scan * (0.03 + 0.07 * uHover);
        float sweep = fract(uTime * 0.11);
        float sb = exp(-abs(vUv.y - (1.15 - sweep * 1.3)) * 55.0);
        c += uFlux * sb * (0.08 + 0.25 * uHover) * base.a;
        c = mix(c, uFlux * 1.3 + 0.25, band * 0.9);
        a *= vis * bottom;
        a = max(a, band * base.a * 0.95);
        if (a < 0.01) discard;
        gl_FragColor = vec4(c, a);
      #endif
    }`;
  const pGeo = new THREE.PlaneGeometry(PW, PH);
  const portraitDepth = new THREE.Mesh(pGeo, new THREE.ShaderMaterial({ uniforms: pUniforms, vertexShader: portraitVert, fragmentShader: portraitFrag, defines: { DEPTH_ONLY: 1 }, colorWrite: false }));
  portraitDepth.renderOrder = 1;
  const portrait = new THREE.Mesh(pGeo, new THREE.ShaderMaterial({ uniforms: pUniforms, vertexShader: portraitVert, fragmentShader: portraitFrag, transparent: true, depthWrite: false }));
  portrait.renderOrder = 2;
  const figure = new THREE.Group();
  figure.add(portraitDepth, portrait);
  tilt.add(figure);

  /* ---------- portal under the portrait ---------- */
  const portalG = new THREE.Group();
  portalG.position.y = -PH / 2 + .1;
  figure.add(portalG);
  const portalUniforms = { ...uniformsCommon, uTime: { value: 0 }, uHover: { value: 0 }, uInt: { value: 0 } };
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.ShaderMaterial({
    uniforms: portalUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uHover, uInt; uniform vec3 uBrass, uFlux;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float sp = 1.4 + uHover * 3.2;
        float spiral = sin(ang * 5.0 + log(r + 0.002) * 9.0 - uTime * sp);
        float rings = sin(r * 40.0 - uTime * (2.6 + uHover * 5.0));
        float core = exp(-r * 5.0);
        float rim = smoothstep(0.84, 0.93, r) * (1.0 - smoothstep(0.93, 1.0, r));
        float ticks = step(0.9, fract(ang * 60.0 / 6.2831)) * smoothstep(0.7, 0.75, r) * (1.0 - smoothstep(0.8, 0.82, r));
        float s = smoothstep(0.25, 1.0, spiral) * (1.0 - r) * 0.65;
        float rr = smoothstep(0.75, 1.0, rings) * (1.0 - r) * 0.3;
        vec3 col = mix(uFlux, uBrass, smoothstep(0.15, 0.85, r));
        float a = (s + rr + rim * 0.75 + ticks * 0.6 + core * 0.9) * (1.0 - smoothstep(0.97, 1.0, r)) * uInt * (0.85 + uHover * 0.6);
        gl_FragColor = vec4(col + core * 0.6, a);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  disc.rotation.x = -Math.PI / 2 + .3;
  disc.scale.setScalar(PW * .5);
  disc.renderOrder = 6;
  portalG.add(disc);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(PW * .34, PW * .48, 2.3, 64, 1, true), new THREE.ShaderMaterial({
    uniforms: portalUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uHover, uInt; uniform vec3 uBrass, uFlux;
      varying vec2 vUv;
      void main(){
        float y = vUv.y;
        float fade = pow(1.0 - y, 2.4);
        float streak = 0.5 + 0.5 * sin(vUv.x * 6.2831 * 22.0 + uTime * 0.8) * sin(vUv.x * 6.2831 * 7.0 - uTime * 0.5);
        float flow = 0.65 + 0.35 * sin(y * 28.0 - uTime * 4.0);
        vec3 c = mix(uBrass, uFlux, clamp(y * 1.4, 0.0, 1.0));
        gl_FragColor = vec4(c, fade * streak * flow * 0.16 * uInt * (1.0 + uHover));
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.position.y = 1.15;
  beam.renderOrder = 7;
  portalG.add(beam);

  const P = lite ? 140 : 280;
  const seeds = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    seeds[i * 3] = Math.random() * Math.PI * 2;
    seeds[i * 3 + 1] = Math.sqrt(Math.random()) * PW * .45;
    seeds[i * 3 + 2] = Math.random();
  }
  const riseGeo = new THREE.BufferGeometry();
  riseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 3), 3));
  riseGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const riseUniforms = { ...uniformsCommon, uRise: { value: 0 }, uPR: { value: DPR }, uInt: { value: 0 } };
  const rise = new THREE.Points(riseGeo, new THREE.ShaderMaterial({
    uniforms: riseUniforms,
    vertexShader: /* glsl */`
      uniform float uRise, uPR;
      attribute vec3 aSeed;
      varying float vA; varying float vT;
      void main(){
        float H = 3.4;
        float h = mod(aSeed.z * H + uRise * (0.55 + aSeed.y * 0.25), H);
        float t = h / H;
        float r = aSeed.y * (1.0 - t * 0.4);
        float ang = aSeed.x + t * 1.6;
        vec3 p = vec3(cos(ang) * r, h, sin(ang) * r * 0.7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + aSeed.z * 2.6) * uPR * (11.0 / max(-mv.z, 0.5));
        vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.45, 1.0, t));
        vT = aSeed.z;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBrass, uFlux; uniform float uInt;
      varying float vA; varying float vT;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(mix(uBrass, uFlux, step(0.5, vT)), a * vA * uInt);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  rise.frustumCulled = false;
  rise.renderOrder = 8;
  portalG.add(rise);

  // anchors for the HTML tags around the hero portrait (in figure space)
  const tagAnchors = [
    new THREE.Vector3(-PW * .2, PH * .3, .1),
    new THREE.Vector3(-PW * .4, PH * .02, .1),
    new THREE.Vector3(-PW * .44, -PH * .26, .1),
  ];

  /* ---------- layout: map an HTML element onto the 3D world ---------- */
  function viewHalf() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * CAM_Z;
    return { halfH, halfW: halfH * (window.innerWidth / window.innerHeight) };
  }
  function computeTarget() {
    const el = state.anchor;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const { halfH, halfW } = viewHalf();
    const px2w = (2 * halfH) / window.innerHeight;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    state.target.x = (cx / window.innerWidth * 2 - 1) * halfW;
    state.target.y = -(cy / window.innerHeight * 2 - 1) * halfH;
    if (state.mode === 'hero') {
      const s = Math.min((r.height * px2w * .8) / PH, (r.width * px2w * .95) / PW);
      state.target.s = s;
      state.target.y += r.height * px2w * .05; // lift so the portal sits inside the stage
      state.target.ringY = .5;
      state.target.orbitY = -.25;
    } else {
      const R = Math.max(r.width, r.height) * .6 * px2w;
      state.target.s = R / 2.2;
      state.target.ringY = 0;
      state.target.orbitY = 0;
    }
  }

  function focus(el, mode) {
    state.anchor = el;
    state.mode = mode;
    computeTarget();
    state.ringsTarget = mode === 'hero' ? 1 : mode === 'frame' ? .4 : 0;
  }

  /* ---------- input ---------- */
  const raycaster = new THREE.Raycaster();
  let hovered = false;
  window.addEventListener('pointermove', (e) => {
    state.pointer.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
    state.ndc.copy(state.pointer);
    state.pointerMoved = true;
  }, { passive: true });
  window.addEventListener('pointerleave', () => { state.ndc.set(9, 9); state.pointerMoved = true; });

  function hitTest() {
    if (state.mode !== 'hero' || state.reveal < .9) return false;
    raycaster.setFromCamera(state.ndc, camera);
    const hit = raycaster.intersectObject(portrait, false)[0];
    if (!hit || !hit.uv) return false;
    const px = Math.min(aCan.width - 1, Math.floor(hit.uv.x * aCan.width));
    const py = Math.min(aCan.height - 1, Math.floor((1 - hit.uv.y) * aCan.height));
    if (alphaData[(py * aCan.width + px) * 4 + 3] < 70) return false;
    state.mouseUv.lerp(hit.uv, .35);
    return true;
  }

  /* ---------- resize ---------- */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    DPR = pickDpr();
    renderer.setPixelRatio(DPR);
    tunnelUniforms.uPR.value = DPR;
    riseUniforms.uPR.value = DPR;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    bgMat.uniforms.uRes.value.copy(size);
    computeTarget();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- loop ---------- */
  let follow = 3.6; // how fast the rig chases its anchor (faster when the page scrolls natively)
  const tmpV = new THREE.Vector3();
  let frameCb = null;
  let last = performance.now();
  let running = true;
  let firstFrame = true;

  function update(dt) {
    state.time += dt;
    const t = state.time;

    for (const tw of tweens) {
      tw.t += dt;
      const k = Math.min(tw.t / tw.dur, 1);
      state[tw.key] = tw.from + (tw.to - tw.from) * tw.fn(k);
      if (k >= 1) { tweens.delete(tw); tw.resolve(); }
    }

    // warp envelope
    state.warpT += dt;
    const wk = Math.min(state.warpT / state.warpDur, 1);
    state.warpLevel = state.warpT < state.warpDur ? state.warpAmp * Math.pow(Math.sin(Math.PI * wk), 1.6) : 0;
    const speed = (reduced ? .8 : 3.2) + state.warpLevel * 150;
    state.travel += speed * dt;
    tunnelUniforms.uTravel.value = state.travel;
    tunnelUniforms.uStreak.value = Math.min(speed * .09, 16);
    tunnelUniforms.uStreakA.value = Math.min(Math.max((speed - 7) / 45, 0), 1) * .9;
    // opening scene: fly through the wormhole, flash, arrive
    let introFov = 0;
    if (intro.active) {
      intro.t += dt;
      const ik = Math.min(intro.t / intro.dur, 1);
      const sm = (a, b, x) => { const u = Math.min(Math.max((x - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
      const vis = sm(0, .12, ik) * (1 - sm(.82, .97, ik));
      wormU.uAlpha.value = vis;
      wormU.uTime.value = t;
      wormU.uTravel.value += dt * (14 + 70 * ik * ik);
      wormCore.material.opacity = sm(0, .2, ik) * (1 - sm(.9, 1, ik));
      wormCore.scale.setScalar(3 + 70 * Math.pow(ik, 4));
      camera.rotation.z = Math.sin(ik * Math.PI) * .85;
      introFov = 34 * (1 - sm(.7, 1, ik));
      state.warpLevel = Math.max(state.warpLevel, .9 * vis);
      state.flash = sm(.78, .88, ik) * (1 - sm(.88, 1, ik));
      if (ik >= 1) {
        intro.active = false;
        worm.visible = false;
        wormCore.visible = false;
        camera.rotation.z = 0;
        state.flash = 0;
        tween('introHide', 0, 1.4, ease.out);
        if (intro.resolve) intro.resolve();
      }
    }
    finishMat.uniforms.uFlash.value = state.flash;
    finishMat.uniforms.uTime.value = t;
    camera.fov = BASE_FOV + state.warpLevel * 14 + introFov;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uWarp.value = state.warpLevel;
    bgMat.uniforms.uTime.value = t;

    // pointer smoothing + parallax on the tunnel
    state.pointerSmooth.lerp(state.pointer, 1 - Math.exp(-dt * 3));
    tunnel.position.x = -state.pointerSmooth.x * 1.4;
    tunnel.position.y = -state.pointerSmooth.y * .9;
    state.focus.lerp(state.focusTarget, 1 - Math.exp(-dt * 1.5));

    gates.forEach((g) => {
      const zz = ((g.userData.z0 + state.travel) % DEPTH + DEPTH) % DEPTH;
      g.position.z = CAM_Z + 2 - DEPTH + zz;
      g.rotation.z += g.userData.spin * dt * (1 + state.warpLevel * 20);
      const f = Math.min(zz / 50, 1) * (1 - Math.min(Math.max((zz - (DEPTH - 14)) / 10, 0), 1));
      g.userData.mat.opacity = f * (.12 + state.warpLevel * .55);
    });

    // rig follows its anchor
    const k = 1 - Math.exp(-dt * follow);
    chrono.position.x += (state.target.x - chrono.position.x) * k;
    chrono.position.y += (state.target.y - chrono.position.y) * k;
    const s = chrono.scale.x + (state.target.s - chrono.scale.x) * k;
    chrono.scale.setScalar(s);
    rig.position.y += (state.target.ringY - rig.position.y) * k;
    orbit.position.y += (state.target.orbitY - orbit.position.y) * k;

    state.rings += (state.ringsTarget - state.rings) * (1 - Math.exp(-dt * 2.4));
    const ringA = state.rings * (1 - state.introHide);
    dialMat.opacity = .62 * ringA;
    bezelMat.opacity = .5 * ringA;
    state.spin += ((1 + state.hover * 2.2 + state.warpLevel * 10) - state.spin) * (1 - Math.exp(-dt * 4));
    dial.rotation.z -= dt * .045 * state.spin;
    bezel.rotation.z += dt * .07 * state.spin;
    gyros.forEach((g) => {
      g.rotation.y += dt * g.userData.speed * .6 * state.spin;
      g.userData.inner.rotation.z += dt * g.userData.speed * 1.4 * state.spin;
      g.userData.mat.opacity = .5 * ringA;
      g.userData.beadMats.forEach((m) => { m.opacity = ringA; });
    });

    // tilt toward the pointer + idle float
    tilt.rotation.y += ((state.pointerSmooth.x * .22) - tilt.rotation.y) * k;
    tilt.rotation.x += ((-state.pointerSmooth.y * .1) - tilt.rotation.x) * k;
    figure.position.y = Math.sin(t * .9) * .035;

    // hover
    if (state.pointerMoved || state.mode === 'hero') {
      hovered = hitTest();
      state.pointerMoved = false;
    }
    state.hoverTarget = hovered ? 1 : 0;
    state.hover += (state.hoverTarget - state.hover) * (1 - Math.exp(-dt * 5));

    // random tiny glitches = time instability
    if (!reduced && state.mode === 'hero' && t > state.nextGlitch) {
      state.nextGlitch = t + 5 + Math.random() * 6;
      state.glitch = Math.max(state.glitch, .35);
    }
    state.glitch = Math.max(0, state.glitch - dt * 1.8);

    pUniforms.uTime.value = t;
    pUniforms.uHover.value = state.hover;
    pUniforms.uReveal.value = state.reveal;
    pUniforms.uGlitch.value = state.glitch;
    portalUniforms.uTime.value = t;
    portalUniforms.uHover.value = state.hover;
    portalUniforms.uInt.value = state.portal;
    state.rise += dt * (.32 + state.hover * 1.4 + state.warpLevel * 2);
    riseUniforms.uRise.value = state.rise;
    riseUniforms.uInt.value = state.portal;

    figure.visible = state.reveal > .001 || state.portal > .001;
  }

  let tagSide = 1; // -1 mirrors the floating tags to the other side of the portrait (right-to-left layouts)
  function project(v) {
    tmpV.copy(v);
    tmpV.x *= tagSide;
    tmpV.applyMatrix4(figure.matrixWorld).project(camera);
    return { x: (tmpV.x + 1) / 2 * window.innerWidth, y: (1 - tmpV.y) / 2 * window.innerHeight };
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    if (firstFrame) { firstFrame = false; canvas.classList.add('is-live'); }
    if (frameCb) frameCb();
  }
  requestAnimationFrame(loop);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    document.documentElement.classList.add('no-webgl');
  });

  /* ---------- public API ---------- */
  return {
    focus,
    relayout: computeTarget,
    setFocusPoint(x, y) { state.focusTarget.set(x, y); },
    setFollow(v) { follow = v; },
    setTagSide(s) { tagSide = s < 0 ? -1 : 1; },
    materialize(dur = 2) {
      tween('portal', 1, dur * .5, ease.out);
      return tween('reveal', 1, dur, ease.inOut);
    },
    dematerialize(dur = .7) {
      tween('portal', 0, dur, ease.in);
      return tween('reveal', 0, dur, ease.in);
    },
    warp(amp = 1, dur = 1.3) {
      if (reduced) return;
      state.warpT = 0;
      state.warpAmp = amp;
      state.warpDur = dur;
    },
    glitch(v = 1) { if (!reduced) state.glitch = Math.max(state.glitch, v); },
    get hovered() { return hovered && state.mode === 'hero'; },
    get revealed() { return state.reveal; },
    enterWormhole(dur = 2.6) {
      if (reduced) return Promise.resolve();
      intro.active = true;
      intro.t = 0;
      intro.dur = dur;
      state.introHide = 1;
      worm.visible = true;
      wormCore.visible = true;
      return new Promise((resolve) => { intro.resolve = resolve; });
    },
    tagPositions() { figure.updateMatrixWorld(); return tagAnchors.map(project); },
    onFrame(cb) { frameCb = cb; },
  };
}
