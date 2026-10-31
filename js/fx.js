// 見た目を底上げする部品: ポストエフェクト・空・宇宙の背景・星・パーティクル
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded, hashStr } from './util.js?v=33';

// ---------- ポストエフェクト ----------
// 1.0 を超える光 (発光・太陽・星) だけをにじませるので、キャラのイラストの白は光らない
const GRADE = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.22 }, sat: { value: 1.08 }, grain: { value: 0.012 }, tint: { value: new THREE.Color(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, sat, grain; uniform vec3 tint; varying vec2 vUv;
    // 明るい所だけを丸める (暗部〜中間はイラストの色のまま)
    vec3 shoulder(vec3 c) {
      const float s = 0.76, desat = 0.15;
      float peak = max(c.r, max(c.g, c.b));
      if (peak < s) return c;
      float d = 1.0 - s;
      float np = 1.0 - d * d / (peak + d - s);
      c *= np / peak;
      float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
      return mix(c, vec3(np), g);
    }
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * tint;
      c = shoulder(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      vec2 q = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q));
      c += (rnd(vUv * 917.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'ultra' ? 4 : 2 });
    this.composer = new EffectComposer(renderer, rt);
    this.render_ = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.0);
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.render_);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize();
  }
  resize() {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
  }
  render(scene, camera, dt, bloom = 0.32) {
    this.render_.scene = scene;
    this.render_.camera = camera;
    this.bloom.strength = bloom;
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 10;
    this.composer.render(dt);
  }
  dispose() { this.composer.dispose(); }
}

// 動かない建物や木を、材質ごとに1つの形にまとめる (描く回数が大幅に減って軽くなる)
export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || Array.isArray(m.material)) return;
    const key = m.material.uuid + (m.castShadow ? ':c' : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const mtx = new THREE.Matrix4();
  for (const list of groups.values()) {
    const geos = list.map((m) => {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      return g.applyMatrix4(mtx.multiplyMatrices(inv, m.matrixWorld));
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = true;
    for (const m of list) m.parent.remove(m);
    root.add(mesh);
  }
  return root;
}

// ---------- ノイズ ----------
// 端がつながるノイズ (地面・岩・雲の模様)
function tileNoise(size, cells, rnd) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
    const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const sx = smooth(fx - Math.floor(fx)), sy = smooth(fy - Math.floor(fy));
    const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
const texCache = new Map();
// 灰色の模様のテクスチャ。material.color と掛け合わさって世界線の地面の色になる
export function noiseTexture(kind = 'ground') {
  if (texCache.has(kind)) return texCache.get(kind);
  const size = 512;
  const rnd = seeded(hashStr('noise:' + kind));
  const oct = [[6, 0.5], [14, 0.27], [32, 0.15], [76, 0.08]].map(([c, a]) => [tileNoise(size, c, rnd), a]);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const lo = kind === 'rock' ? 0.55 : 0.82, span = 1.0 - lo;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0;
    for (const [f, a] of oct) n += f(x, y) * a;
    if (kind === 'rock') n = 0.65 * n + 0.35 * (Math.sin((y / size) * Math.PI * 2 * 12 + n * 7) * 0.5 + 0.5); // 地層の筋
    const v = Math.round(255 * (lo + span * Math.min(1, n * 1.15)));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace; // 明るさの模様としてそのまま掛ける
  t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}

// ふわふわした雲のテクスチャ
export function cloudTexture() {
  if (texCache.has('cloud')) return texCache.get('cloud');
  const rnd = seeded(hashStr('cloud'));
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = 90 + rnd() * 332, y = 118 + (rnd() - 0.5) * 80 * Math.sin(((x - 90) / 332) * Math.PI), r = 26 + rnd() * 58 * Math.sin(((x - 90) / 332) * Math.PI);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set('cloud', t);
  return t;
}

// ---------- 空 ----------
export class SkyDome {
  constructor(radius) {
    this.u = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 }, time: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top, horizon, bottom, sunDir, sunCol; uniform float night, time; varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.45));
          // 太陽 (夜は月になる)
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (smoothstep(0.9993, 0.9996, s) * 5.0 + pow(s, 260.0) * 0.5 + pow(s, 18.0) * 0.12);
          // 星
          if (night > 0.01 && h > -0.1) {
            vec3 g = floor(d * 170.0);
            float r = hash(g);
            if (r > 0.986) {
              vec3 f = fract(d * 170.0) - 0.5;
              float tw = 0.7 + 0.3 * sin(time * (1.0 + r * 3.0) + r * 90.0);
              c += vec3(0.85, 0.92, 1.0) * smoothstep(0.42, 0.0, length(f)) * night * tw * (r > 0.996 ? 2.6 : 1.1) * smoothstep(-0.1, 0.15, h);
            }
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}

// ---------- 宇宙の背景 (星雲を1枚の絵に焼いて使い回す) ----------
const nebulaCache = new Map();
export function nebulaTexture(renderer, key, cols) {
  if (nebulaCache.has(key)) return nebulaCache.get(key);
  const rt = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, depthBuffer: false });
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  rt.texture.generateMipmaps = false;
  const m = new THREE.ShaderMaterial({
    uniforms: { c0: { value: new THREE.Color(cols[0]) }, c1: { value: new THREE.Color(cols[1]) }, c2: { value: new THREE.Color(cols[2]) }, seed: { value: (hashStr(key) % 1000) / 37 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform vec3 c0, c1, c2; uniform float seed; varying vec2 vUv;
      float hash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 11.1; a *= 0.5; } return s; }
      void main() {
        float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415926;
        vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
        vec3 p = d * 3.4 + seed;
        vec3 q = vec3(fbm(p), fbm(p + 5.2), fbm(p + 9.7));
        float n = fbm(p + q * 2.2);
        float n2 = fbm(p * 1.7 - q * 1.4 + 3.0);
        float dust = smoothstep(0.42, 0.72, n);
        vec3 c = c0 * (0.4 + 0.6 * n);
        c = mix(c, c1, dust * 0.75);
        c = mix(c, c2, smoothstep(0.5, 0.8, n2) * dust * 0.8);
        c *= 0.35 + 0.95 * smoothstep(0.25, 0.75, n);
        // 暗い筋 (宇宙の塵)
        c *= 1.0 - 0.6 * smoothstep(0.52, 0.74, fbm(p * 2.6 + 20.0));
        gl_FragColor = vec4(c * 0.62, 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  const cam = new THREE.Camera();
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  m.dispose();
  nebulaCache.set(key, rt.texture);
  return rt.texture;
}

// カメラについてくる星空。またたき、明るい星はブルームでにじむ
export function starLayer(n, r, seedKey = 'stars') {
  const rnd = seeded(hashStr(seedKey));
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ex = new Float32Array(n * 2);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(a) * r, z * r, s * Math.sin(a) * r], i * 3);
    c.setHSL(rnd() < 0.7 ? 0.58 + rnd() * 0.07 : 0.06 + rnd() * 0.08, 0.5 + rnd() * 0.4, 0.75 + rnd() * 0.2);
    const big = rnd() ** 6;
    col.set([c.r, c.g, c.b], i * 3);
    ex.set([1 + big * 3.4, rnd() * 6.28], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 2));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pr: { value: Math.min(devicePixelRatio, 2) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aColor; attribute vec2 aEx; uniform float time, pr; varying vec3 vC; varying float vK;
      void main() {
        vC = aColor;
        vK = (0.72 + 0.28 * sin(time * (0.6 + aEx.y * 0.35) + aEx.y * 9.0)) * (1.0 + (aEx.x - 1.2) * 0.75);
        gl_PointSize = aEx.x * pr * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vK;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.4);
        gl_FragColor = vec4(vC * vK * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -5;
  return p;
}

// カメラのまわりを漂う宇宙の塵。動くとすれ違うので、進んでいる感じが出る
export function spaceDust(n, box, color = '#bcd0ff') {
  const rnd = seeded(hashStr('dust'));
  const pos = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([rnd() * box, rnd() * box, rnd() * box], i * 3); s[i] = 0.5 + rnd() * 1.6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { cam: { value: new THREE.Vector3() }, box: { value: box }, col: { value: new THREE.Color(color) }, pr: { value: Math.min(devicePixelRatio, 2) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aS; uniform vec3 cam; uniform float box, pr; varying float vA;
      void main() {
        vec3 p = mod(position - cam, box) - box * 0.5;
        vA = 1.0 - smoothstep(0.25, 0.5, length(p) / box);
        vec4 mv = modelViewMatrix * vec4(p + cam, 1.0);
        gl_PointSize = clamp(aS * pr * 300.0 / max(-mv.z, 1.0), 1.0, 7.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 col; varying float vA;
      void main() {
        float a = pow(max(0.0, 1.0 - length(gl_PointCoord - 0.5) * 2.0), 2.0) * vA * 0.75;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// 球のふちが光る大気 (shell=true は外側へにじむ光輪)
export function atmosphere(color, { shell = false, power = 3, k = 1.3 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, power: { value: power }, k: { value: k } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: shell ? THREE.BackSide : THREE.FrontSide,
    vertexShader: `
      varying vec3 vN, vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform vec3 col; uniform float power, k; varying vec3 vN, vV;
      void main() {
        float d = abs(dot(normalize(vN), normalize(vV)));
        float a = ${shell ? 'pow(d, power) * smoothstep(0.0, 0.5, d)' : 'pow(1.0 - d, power)'};
        gl_FragColor = vec4(col * a * k, a);
        #include <colorspace_fragment>
      }`,
  });
}

// 星の表面: 地面の色の模様と、ゆっくり回る雲の層
export function planetMaterial(ground, opts = {}) {
  const t = noiseTexture('ground').clone();
  t.needsUpdate = true;
  t.repeat.set(3, 2);
  return new THREE.MeshStandardMaterial({ map: t, color: ground, emissive: ground, emissiveMap: t, emissiveIntensity: 0.28, roughness: 0.75, ...opts });
}

// ポータルの渦
export function portalMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, time: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 col; uniform float time; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p), a = atan(p.y, p.x);
        float w = sin(a * 3.0 + 9.0 * r - time * 3.2) * 0.5 + 0.5;
        float w2 = sin(a * 5.0 - 13.0 * r - time * 2.1) * 0.5 + 0.5;
        float core = smoothstep(0.55, 0.0, r);
        vec3 c = col * (0.5 + w * 0.8) + vec3(1.0) * (w2 * w * 0.5 + core * 1.1);
        float alpha = smoothstep(1.0, 0.8, r) * (0.55 + 0.45 * w);
        gl_FragColor = vec4(c * 1.35, alpha);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- パーティクル (紙吹雪・火花・花火) ----------
export class Bursts {
  constructor(scene, cap = 2600) {
    this.cap = cap;
    this.n = 0;
    this.p = new Float32Array(cap * 3);
    this.c = new Float32Array(cap * 3);
    this.a = new Float32Array(cap * 2); // サイズ, 透明度
    this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.g = new Float32Array(cap); // 重力
    this.d = new Float32Array(cap); // 空気抵抗
    this.next = 0;
    this.rockets = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      // 明るい空でも色が白く飛ばないよう、加算ではなく透過で重ねる (色は事前にアルファを掛けてある)
      uniforms: { pr: { value: Math.min(devicePixelRatio, 2) } }, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: `
        attribute vec3 aColor; attribute vec2 aA; uniform float pr; varying vec3 vC; varying float vA;
        void main() {
          vC = aColor; vA = aA.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aA.x * pr * 420.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          if (vA <= 0.0) discard;
          float a = smoothstep(1.0, 0.45, length(gl_PointCoord - 0.5) * 2.0) * vA;
          gl_FragColor = vec4(vC * a, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
  }
  // 1粒ぶん (古いものから上書きする)
  spawn(x, y, z, vx, vy, vz, col, size, life, g, d) {
    const i = this.next;
    this.next = (i + 1) % this.cap;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.c.set([col.r, col.g, col.b], i * 3);
    this.a[i * 2] = size; this.a[i * 2 + 1] = 1;
    this.life[i] = this.max[i] = life;
    this.g[i] = g; this.d[i] = d;
  }
  burst(x, y, z, { n = 40, speed = 8, up = 0, colors = ['#ffffff'], size = 0.5, life = 1.2, g = 9, drag = 1.4, hdr = 1.6 } = {}) {
    const cs = colors.map((k) => new THREE.Color(k).multiplyScalar(hdr));
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = speed * (0.35 + Math.random() * 0.65);
      this.spawn(x, y, z, s * Math.cos(a) * v, u * v + up, s * Math.sin(a) * v, cs[i % cs.length], size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), g, drag);
    }
  }
  // 紙吹雪: 空から広くひらひら降る
  confetti(x, y, z, r, n = 140) {
    const cs = ['#ff5a7a', '#ffd84a', '#5ad0ff', '#7ae08a', '#c88aff', '#ffffff'].map((k) => new THREE.Color(k));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      this.spawn(x + Math.cos(a) * rr, y + Math.random() * 10, z + Math.sin(a) * rr, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, cs[i % cs.length], 0.45 + Math.random() * 0.3, 3 + Math.random() * 1.6, 3.4, 1.2);
    }
  }
  // 花火: 打ち上げて開く
  firework(x, z, h, color) {
    this.rockets.push({ x, y: 0, z, h, vy: h / 1.1, color, t: 0 });
  }
  update(dt) {
    for (const r of [...this.rockets]) {
      r.y += r.vy * dt;
      this.spawn(r.x, r.y, r.z, 0, -1, 0, new THREE.Color('#ffd8a0').multiplyScalar(2), 0.4, 0.5, 0, 1);
      if (r.y >= r.h) {
        this.rockets.splice(this.rockets.indexOf(r), 1);
        this.burst(r.x, r.y, r.z, { n: 170, speed: 26, colors: [r.color, r.color, '#ffffff'], size: 0.8, life: 1.7, g: 6, drag: 1.5, hdr: 2.4 });
      }
    }
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.a[i * 2 + 1] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.d[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.g[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.a[i * 2 + 1] = Math.min(1, (this.life[i] / this.max[i]) * 1.6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
  }
}
