// 3つの画面: 宇宙 (世界団の球体) → 世界団 (世界線の球体) → 世界線 (地上の様子)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildProp, buildHouse, buildWorkplace, buildTent, buildPortal, buildMonster, mat } from './props.js';
import { colorOf, luminance, FONT, clamp, escapeHtml, MIN_PER_DAY } from './util.js';
import { CATS } from './sim.js';

// 外側は CSS2DRenderer が位置決めに使うので、ホバー時の拡大などは内側に掛ける
function label(html, cls) {
  const el = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = cls;
  inner.innerHTML = html;
  el.appendChild(inner);
  const o = new CSS2DObject(el);
  o.inner = inner;
  return o;
}

function starfield(n = 2500, r = 900) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(r * (0.6 + Math.random() * 0.4));
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.2, 0.6, 0.7 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
}

function dotTexture(soft = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(soft ? 0.4 : 0.8, 'rgba(255,255,255,.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}
const DOT = dotTexture();

// ---------- 共通の土台 ----------
class BaseView {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 5000);
    this.controls = new OrbitControls(this.camera, app.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.bound = 300;
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  pick(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o;
    }
    return null;
  }
  // WASD 移動・QE 回転
  keyMove(dt) {
    const k = this.app.keys;
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const rot = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    const zoom = (k.KeyF ? 1 : 0) - (k.KeyR ? 1 : 0);
    if (!f && !r && !rot && !zoom) return false;
    const cam = this.camera, tgt = this.controls.target;
    const off = cam.position.clone().sub(tgt);
    const dist = off.length();
    if (f || r) {
      const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const mv = fwd.multiplyScalar(f).add(right.multiplyScalar(r)).multiplyScalar(dist * 0.9 * dt);
      tgt.add(mv);
      const len = Math.hypot(tgt.x, tgt.z);
      if (len > this.bound) { tgt.x *= this.bound / len; tgt.z *= this.bound / len; }
      this.app.stopFollow();
    }
    if (rot) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * 1.6 * dt);
    if (zoom) off.multiplyScalar(1 + zoom * 1.4 * dt);
    off.clampLength(this.controls.minDistance, this.controls.maxDistance);
    cam.position.copy(tgt).add(off);
    return true;
  }
  update(dt) {
    this.keyMove(dt);
    this.controls.update();
  }
  hover(ndc) {
    const o = this.pick(ndc);
    if (o !== this.hovered) {
      this.hovered?.userData.onHover?.(false);
      this.hovered = o;
      o?.userData.onHover?.(true);
    }
    return !!o;
  }
  click(ndc) {
    const o = this.pick(ndc);
    o?.userData.onClick?.();
    return !!o;
  }
  dispose() {
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.scene.clear();
  }
}

// ---------- 宇宙: 世界団の球体 ----------
export class UniverseView extends BaseView {
  constructor(app) {
    super(app);
    this.kind = 'universe';
    const { model } = app;
    this.scene.background = new THREE.Color('#04050d');
    this.scene.add(starfield());
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    const sun = new THREE.PointLight('#ffffff', 2.5, 0, 0);
    this.scene.add(sun);
    const n = model.dans.length;
    this.spheres = [];
    model.dans.forEach((d, i) => {
      const a = (i / n) * Math.PI * 2;
      const R = 70;
      const radius = 8 + Math.sqrt(d.worlds.length) * 1.8;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * R, Math.sin(i * 1.7) * 10, Math.sin(a) * R);
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32),
        new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.25, roughness: 0.35, transparent: true, opacity: 0.55 }));
      g.add(core);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.18, 32, 24),
        new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.12, side: THREE.BackSide }));
      g.add(halo);
      // 中に浮かぶ世界線のつぶ
      const inner = new THREE.Group();
      for (const wid of d.worlds) {
        const w = model.worlds.get(wid);
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.sqrt(w.residents.length) * 0.15, 12, 8),
          new THREE.MeshStandardMaterial({ color: w.theme.ground, emissive: w.theme.ground, emissiveIntensity: 0.6 }));
        const v = new THREE.Vector3(w.pos.x, w.pos.y, w.pos.z);
        const maxR = Math.max(1, ...d.worlds.map((id) => { const p = model.worlds.get(id).pos; return Math.hypot(p.x, p.y, p.z); }));
        v.multiplyScalar((radius * 0.75) / maxR);
        s.position.copy(v);
        inner.add(s);
      }
      g.add(inner);
      const chars = model.chars.filter((c) => c.dan === d.id).length;
      const lb = label(`<b>${escapeHtml(d.id)}</b><small>（${escapeHtml(d.yomi)}）</small><span>世界線 ${d.worlds.length} ・ キャラ ${chars}</span>`, 'dan-label');
      lb.position.set(0, radius * 1.35, 0);
      g.add(lb);
      g.userData = {
        pick: true, inner, core,
        onHover: (on) => { core.material.emissiveIntensity = on ? 0.6 : 0.25; lb.inner.classList.toggle('hot', on); },
        onClick: () => app.openDan(d.id),
      };
      this.scene.add(g);
      this.pickables.push(g);
      this.spheres.push(g);
    });
    this.camera.position.set(0, 70, 160);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 30;
    this.controls.maxDistance = 500;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.4;
    this.bound = 200;
  }
  update(dt) {
    super.update(dt);
    for (const s of this.spheres) s.userData.inner.rotation.y += dt * 0.15;
  }
}

// ---------- 世界団: 世界線の球体 ----------
export class ClusterView extends BaseView {
  constructor(app, danId) {
    super(app);
    this.kind = 'dan';
    this.danId = danId;
    const { model, sim } = app;
    const dan = model.danById.get(danId);
    this.scene.background = new THREE.Color('#05061a');
    this.scene.add(starfield());
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#334', 1.4));
    const dl = new THREE.DirectionalLight('#ffffff', 1.2);
    dl.position.set(50, 100, 30);
    this.scene.add(dl);

    this.nodes = new Map();
    let maxR = 10;
    const linePts = [];
    for (const wid of dan.worlds) {
      const w = model.worlds.get(wid);
      const r = 4 + Math.sqrt(w.residents.length) * 1.1;
      const g = new THREE.Group();
      g.position.set(w.pos.x, w.pos.y, w.pos.z);
      const sph = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20),
        new THREE.MeshStandardMaterial({ color: w.theme.ground, emissive: w.theme.ground, emissiveIntensity: 0.35, roughness: 0.6 }));
      g.add(sph);
      const atm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 24, 16),
        new THREE.MeshBasicMaterial({ color: w.theme.sky, transparent: true, opacity: 0.18, side: THREE.BackSide }));
      g.add(atm);
      if (w.num > 0) {
        // 魔物の多さ = 赤い輪
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, 0.06 + Math.min(0.5, w.num / 80), 6, 40),
          new THREE.MeshBasicMaterial({ color: '#ff4a6a', transparent: true, opacity: 0.25 + Math.min(0.6, w.num / 50) }));
        ring.rotation.x = Math.PI / 2.3;
        g.add(ring);
      }
      const lb = label('', 'world-label');
      lb.position.set(0, r * 1.5 + 1, 0);
      g.add(lb);
      g.userData = {
        pick: true,
        onHover: (on) => { sph.material.emissiveIntensity = on ? 0.8 : 0.35; lb.inner.classList.toggle('hot', on); },
        onClick: () => app.openWorld(wid),
      };
      this.scene.add(g);
      this.pickables.push(g);
      this.nodes.set(wid, { g, lb, w, r, last: '' });
      maxR = Math.max(maxR, Math.hypot(w.pos.x, w.pos.z) + r);
      for (const nb of w.neighbors) if (nb > wid) {
        const o = model.worlds.get(nb);
        linePts.push(w.pos.x, w.pos.y, w.pos.z, o.pos.x, o.pos.y, o.pos.z);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#8fa0ff', transparent: true, opacity: 0.35 })));

    // 英字グループの目印
    const groups = new Map();
    for (const wid of dan.worlds) {
      const w = model.worlds.get(wid);
      if (!groups.has(w.letter)) groups.set(w.letter, []);
      groups.get(w.letter).push(w.pos);
    }
    for (const [letter, ps] of groups) {
      if (ps.length < 2) continue;
      const c = ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length, z: a.z + p.z / ps.length }), { x: 0, y: 0, z: 0 });
      const lb = label(escapeHtml(letter), 'letter-label');
      lb.position.set(c.x, c.y - 10, c.z);
      this.scene.add(lb);
    }

    this.comets = [];
    this.cometGeo = new THREE.SphereGeometry(0.7, 10, 8);
    this.unsub = sim.listen((e) => {
      if (e.extra?.kind !== 'travel') return;
      const a = this.nodes.get(e.extra.from), b = this.nodes.get(e.extra.to);
      if (!a || !b) return;
      const m = new THREE.Mesh(this.cometGeo, new THREE.MeshBasicMaterial({ color: '#fff6a0' }));
      this.scene.add(m);
      this.comets.push({ m, a: a.g.position.clone(), b: b.g.position.clone(), t: 0 });
    });

    this.camera.position.set(0, maxR * 0.6, maxR * 1.1);
    this.controls.minDistance = 10;
    this.controls.maxDistance = maxR * 5;
    this.bound = maxR * 1.2;
    this.refreshT = 0;
    this.refresh();
  }
  refresh() {
    const { sim } = this.app;
    const show = this.app.settings.worldNames;
    for (const [wid, n] of this.nodes) {
      const present = sim.charsIn(wid);
      const visitors = present.filter((c) => c.home !== wid).length;
      const mons = sim.monsters.get(wid).length;
      const html = (show ? `<b>${escapeHtml(n.w.name)}</b><small>${escapeHtml(wid)}</small>` : '')
        + `<span>👤${present.length}${visitors ? ` 🧳${visitors}` : ''}${mons ? ` 👾${mons}` : ''}</span>`;
      if (html !== n.last) { n.lb.inner.innerHTML = html; n.last = html; }
    }
  }
  update(dt) {
    super.update(dt);
    if ((this.refreshT -= dt) < 0) { this.refresh(); this.refreshT = 0.5; }
    for (const n of this.nodes.values()) n.g.rotation.y += dt * 0.2;
    this.comets = this.comets.filter((c) => {
      c.t += dt / 1.6;
      if (c.t >= 1) { this.scene.remove(c.m); c.m.material.dispose(); return false; }
      c.m.position.lerpVectors(c.a, c.b, c.t);
      c.m.position.y += Math.sin(c.t * Math.PI) * 6;
      return true;
    });
  }
  dispose() {
    this.unsub();
    super.dispose();
  }
}

// ---------- キャラクターの見た目 ----------
const texCache = new Map();
const loader = new THREE.TextureLoader();

function kanjiTexture(c) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 160;
  const ctx = cv.getContext('2d');
  const c1 = colorOf(c.colors[0], '#dddddd'), c2 = colorOf(c.colors[1], '#ffffff');
  ctx.beginPath();
  ctx.arc(80, 80, 74, 0, Math.PI * 2);
  if (c1 === 'rainbow') {
    const g = ctx.createLinearGradient(0, 0, 160, 160);
    ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'].forEach((col, i) => g.addColorStop(i / 4, col));
    ctx.fillStyle = g;
  } else ctx.fillStyle = c1;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = c2 === 'rainbow' ? '#ffffff' : c2;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.arc(80, 80, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = c1 === 'rainbow' || luminance(c1) > 0.55 ? '#222' : '#fff';
  ctx.font = `800 92px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.kanji, 80, 86);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function charTexture(c) {
  if (texCache.has(c.id)) return texCache.get(c.id);
  let entry;
  if (c.img) {
    const t = loader.load(c.img, (tx) => { entry.aspect = tx.image.width / tx.image.height; entry.ready = true; });
    t.colorSpace = THREE.SRGBColorSpace;
    entry = { tex: t, aspect: 1, ready: false };
  } else entry = { tex: kanjiTexture(c), aspect: 1, ready: true };
  texCache.set(c.id, entry);
  return entry;
}

const PARTICLES = {
  snow: { color: '#ffffff', size: 0.6, vy: -2, sway: 1 },
  ember: { color: '#ff8a3a', size: 0.5, vy: 2.5, sway: 0.6 },
  bubble: { color: '#bfefff', size: 0.7, vy: 1.6, sway: 1 },
  petal: { color: '#ffc0d8', size: 0.6, vy: -1.2, sway: 2 },
  leaf: { color: '#b8e070', size: 0.5, vy: -1, sway: 2 },
  star: { color: '#fff6c0', size: 0.7, vy: 0, sway: 0, twinkle: true },
  spark: { color: '#c8f0ff', size: 0.5, vy: 0.3, sway: 0.4, twinkle: true },
  dust: { color: '#d8ccb0', size: 0.4, vy: -0.2, sway: 1.2 },
  ash: { color: '#888888', size: 0.45, vy: -0.8, sway: 0.8 },
  rain: { color: '#9ad0ff', size: 0.35, vy: -14, sway: 0 },
  note: { color: '#ffe04a', size: 0.8, vy: 1.2, sway: 1 },
  wisp: { color: '#9ab8ff', size: 0.9, vy: 0.5, sway: 1.5, twinkle: true },
  heart: { color: '#ff7aa0', size: 0.7, vy: 1, sway: 1 },
  paper: { color: '#fffdf0', size: 0.6, vy: -0.7, sway: 1.6 },
};

// ---------- 世界線: 地上の様子 ----------
export class WorldView extends BaseView {
  constructor(app, worldId) {
    super(app);
    this.kind = 'world';
    this.worldId = worldId;
    const { model } = app;
    const w = (this.world = model.worlds.get(worldId));
    const th = w.theme;
    const geo = w.geo;
    const R = geo.R;
    this.bound = R;
    this.skyDay = new THREE.Color(th.sky);
    this.skyNight = new THREE.Color(th.sky).lerp(new THREE.Color('#050818'), 0.82);
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.clone(), R * 1.6, R * 4.5);

    this.hemi = new THREE.HemisphereLight('#ffffff', th.ground, 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.4);
    this.sun.position.set(R * 0.6, R, R * 0.3);
    this.scene.add(this.hemi, this.sun);

    // 浮島
    const ground = new THREE.Color(th.ground);
    const island = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 2, 96), [
      mat(ground.clone().multiplyScalar(0.7).getStyle()), mat(th.ground), mat(th.ground),
    ]);
    top.position.y = -1;
    island.add(top);
    const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.97, R * 0.7, 14, 3), mat(ground.clone().multiplyScalar(0.45).getStyle()));
    under.rotation.x = Math.PI;
    under.position.y = -2 - R * 0.35;
    island.add(under);
    // 地面のまだら模様
    const patchGeo = new THREE.CircleGeometry(1, 18);
    for (let i = 0; i < Math.round(R * 0.6); i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R * 0.92;
      const col = ground.clone().offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.1);
      const p = new THREE.Mesh(patchGeo, new THREE.MeshLambertMaterial({ color: col }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(Math.cos(a) * rr, 0.01 + i * 0.0003, Math.sin(a) * rr);
      p.scale.setScalar(2 + Math.random() * R * 0.06);
      island.add(p);
    }
    // 広場と道
    const plazaCol = ground.clone().lerp(new THREE.Color('#f4ead0'), 0.45);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(geo.plazaR, 40), new THREE.MeshLambertMaterial({ color: plazaCol }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.06;
    island.add(plaza);
    const roadMat = new THREE.MeshLambertMaterial({ color: plazaCol.clone().multiplyScalar(0.92) });
    for (const p of Object.values(geo.portals)) {
      const len = Math.hypot(p.x, p.z) - geo.plazaR;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -Math.atan2(p.z, p.x) + Math.PI / 2;
      const mid = (geo.plazaR + len / 2) / Math.hypot(p.x, p.z);
      road.position.set(p.x * mid, 0.05, p.z * mid);
      island.add(road);
    }
    this.scene.add(island);

    // ランドマーク
    const lm = buildProp(th.landmark, null, 0.7);
    lm.scale.setScalar(clamp(geo.plazaR / 4, 1.6, 3));
    this.scene.add(lm);
    this.animated = [];
    if (lm.userData.spin || lm.userData.float || lm.userData.flicker) this.animated.push(lm);

    // 家
    for (const id of w.residents) {
      const c = model.charById.get(id);
      const h = geo.homes[id];
      const house = buildHouse(colorOf(c.colors[0], '#cccccc'), colorOf(c.colors[1] || c.colors[0], '#c0503a') === 'rainbow' ? '#c080ff' : colorOf(c.colors[1] || c.colors[0], '#c0503a'));
      // 家は住人の立ち位置より少し外側に置き、玄関を広場に向ける
      const k = 1 + 2.8 / Math.max(1, Math.hypot(h.x, h.z));
      house.position.set(h.x * k, 0, h.z * k);
      house.rotation.y = Math.atan2(-h.x, -h.z);
      this.scene.add(house);
    }
    for (const wp of geo.works) {
      const b = buildWorkplace(th.ground);
      b.position.set(wp.x, 0, wp.z);
      b.rotation.y = Math.atan2(-wp.x, -wp.z);
      this.scene.add(b);
    }
    if (geo.pond) {
      const p = buildProp('pond', null, 0.5);
      p.position.set(geo.pond.x, 0, geo.pond.z);
      p.scale.setScalar(1.6);
      this.scene.add(p);
    }
    for (const p of geo.props) {
      const o = buildProp(p.kind, p.color, p.seed);
      o.position.set(p.x, 0, p.z);
      o.rotation.y = p.rot;
      o.scale.multiplyScalar(p.s);
      o.userData.phase = p.seed * 10;
      this.scene.add(o);
      if (o.userData.spin || o.userData.float || o.userData.flicker || o.userData.sway || o.userData.pulse) this.animated.push(o);
    }

    // ポータル
    this.portalLabels = [];
    for (const [nid, p] of Object.entries(geo.portals)) {
      const o = model.worlds.get(nid);
      const pg = buildPortal(o.theme.ground);
      pg.position.set(p.x, 0, p.z);
      pg.rotation.y = Math.atan2(-p.x, -p.z);
      const lb = label(`→ ${escapeHtml(o.name)}`, 'portal-label');
      lb.position.set(0, 7.6, 0);
      pg.add(lb);
      this.portalLabels.push(lb);
      pg.userData.pick = true;
      pg.userData.onClick = () => app.openWorld(nid);
      pg.userData.onHover = (on) => lb.inner.classList.toggle('hot', on);
      this.pickables.push(pg);
      this.animated.push(pg);
      this.scene.add(pg);
    }

    // パーティクル
    const pt = PARTICLES[th.particle];
    if (pt) {
      const n = Math.min(900, Math.round(R * 5));
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
        pos.set([Math.cos(a) * rr, Math.random() * 30, Math.sin(a) * rr], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.particles = new THREE.Points(g, new THREE.PointsMaterial({ color: pt.color, size: pt.size, map: DOT, transparent: true, depthWrite: false, opacity: 0.85 }));
      this.particles.userData.spec = pt;
      this.scene.add(this.particles);
    }

    this.charObjs = new Map();
    this.monObjs = new Map();
    this.tents = new Map();
    this.fx = [];
    this.fxSeen = new Set();
    this.shadowGeo = new THREE.CircleGeometry(0.9, 16);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    this.camera.position.set(0, R * 0.55, R * 0.95);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 5;
    this.controls.maxDistance = R * 2.8;
    this.controls.maxPolarAngle = 1.42;
    this.elapsed = 0;
    this.applyLabelSettings();
  }

  applyLabelSettings() {
    for (const lb of this.portalLabels) lb.visible = this.app.settings.worldNames;
  }

  focusOn(x, z, dist = 26) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.setLength(dist);
    this.controls.target.set(x, 0, z);
    this.camera.position.set(x, 0, z).add(off);
  }

  makeCharObj(c) {
    const g = new THREE.Group();
    const tex = charTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tex, transparent: true, alphaTest: 0.05 }));
    g.add(sp);
    const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.04;
    g.add(sh);
    const nameEl = document.createElement('div');
    nameEl.className = 'clabel';
    const nl = new CSS2DObject(nameEl);
    g.add(nl);
    const bub = document.createElement('div');
    bub.className = 'bubble';
    const bl = new CSS2DObject(bub);
    bl.visible = false;
    g.add(bl);
    sp.userData.charId = c.id;
    g.userData = {
      pick: true, sp, nl, bl, tex, last: '', bubLast: '', phase: Math.random() * 10,
      onClick: () => this.app.selectChar(c.id),
      onHover: (on) => nameEl.classList.toggle('hot', on),
    };
    g.position.set(c.x, 0, c.z);
    this.scene.add(g);
    this.pickables.push(g);
    return g;
  }

  removeObj(map, id) {
    const o = map.get(id);
    if (!o) return;
    o.traverse((x) => { if (x.isCSS2DObject && x.element.parentNode) x.element.parentNode.removeChild(x.element); });
    this.scene.remove(o);
    const i = this.pickables.indexOf(o);
    if (i >= 0) this.pickables.splice(i, 1);
    map.delete(id);
  }

  update(dt) {
    const { sim, settings } = this.app;
    this.elapsed += dt;
    // 追跡
    const sel = this.app.selected ? this.app.model.charById.get(this.app.selected) : null;
    if (this.app.following && sel) {
      if (sel.world !== this.worldId) { this.app.openWorld(sel.world, { keepFollow: true }); return; }
      const tgt = this.controls.target;
      const nx = tgt.x + (sel.x - tgt.x) * Math.min(1, dt * 4), nz = tgt.z + (sel.z - tgt.z) * Math.min(1, dt * 4);
      this.camera.position.x += nx - tgt.x;
      this.camera.position.z += nz - tgt.z;
      tgt.x = nx; tgt.z = nz;
    }
    super.update(dt);

    // 昼夜
    const h = sim.hour;
    const day = h < 5 || h > 20 ? 0 : h < 7 ? (h - 5) / 2 : h > 18 ? (20 - h) / 2 : 1;
    const dusk = Math.max(0, 1 - Math.abs(h - 18.3) / 1.4) * 0.5 + Math.max(0, 1 - Math.abs(h - 5.8) / 1) * 0.3;
    const sky = this.skyNight.clone().lerp(this.skyDay, day).lerp(new THREE.Color('#ff8a5a'), dusk * 0.5);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.45 + 0.75 * day;
    this.sun.intensity = 0.25 + 1.3 * day;
    this.sun.color.set(day > 0.3 ? '#fff6e8' : '#8aa0ff');
    const a = ((h - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(a) * this.bound, Math.abs(Math.sin(a)) * this.bound + 20, this.bound * 0.3);

    // 動く小物
    const t = this.elapsed;
    for (const o of this.animated) {
      const u = o.userData;
      if (u.spin) u.spin.rotation[u.spinAxis || 'y'] += dt * (u.spinAxis ? -0.5 : 0.8);
      if (u.float) o.children[0].position.y = (o.children[0].userData.baseY ??= o.children[0].position.y) + Math.sin(t * 1.2 + (u.phase || 0)) * u.float;
      if (u.sway) o.rotation.z = Math.sin(t * 1.5 + (u.phase || 0)) * 0.08;
      if (u.flicker) o.scale.y = (u.baseS ??= o.scale.y) * (1 + Math.sin(t * 13 + (u.phase || 0)) * 0.08);
      if (u.pulse) o.scale.x = o.scale.z = (u.baseS ??= o.scale.x) * (1 + Math.max(0, Math.sin(t * 6 + (u.phase || 0))) * 0.04);
      if (u.portalDisc) u.portalDisc.material.opacity = 0.3 + Math.sin(t * 3) * 0.12;
    }
    if (this.particles) this.updateParticles(dt, t);

    // キャラクター
    const here = new Set();
    for (const c of this.app.model.chars) {
      if (c.world !== this.worldId) continue;
      here.add(c.id);
      let o = this.charObjs.get(c.id);
      if (!o) { o = this.makeCharObj(c); this.charObjs.set(c.id, o); }
      const u = o.userData;
      const dx = c.x - o.position.x, dz = c.z - o.position.z;
      if (dx * dx + dz * dz > 400) o.position.set(c.x, 0, c.z);
      else { o.position.x += dx * Math.min(1, dt * 8); o.position.z += dz * Math.min(1, dt * 8); }
      const H = 3.2 + (c.rank - 1) * 0.12;
      const W = H * (u.tex.ready ? u.tex.aspect : 1) * (c.img ? 1 : 0.92);
      const down = c.state === 'down', lying = down || c.state === 'camp' || c.state === 'sleep';
      u.sp.material.rotation = lying ? Math.PI / 2 : 0;
      u.sp.scale.set(c.img ? W : H * 0.92, c.img ? H : H * 0.92, 1);
      const bob = c.walking ? Math.abs(Math.sin(t * 9 + u.phase)) * 0.35 : 0;
      u.sp.position.y = (lying ? Math.min(W, H) * 0.5 * 0.9 : (c.img ? H : H * 0.92) / 2) + bob;
      u.sp.material.color.set(down ? '#8a8a8a' : c.state === 'sleep' || c.state === 'camp' ? '#9aa6d0' : '#ffffff');
      u.sp.material.opacity = down ? 0.75 : 1;
      if (c.act.kind === 'fight') u.sp.position.x = Math.sin(t * 30) * 0.12;
      else u.sp.position.x = 0;
      u.nl.position.y = (lying ? H * 0.55 : H) + 0.7;
      const camD = this.camera.position.distanceTo(o.position);
      u.nl.visible = (settings.names && camD < 110) || c.id === this.app.selected || o === this.hovered;
      const d = sim.displayAct(c);
      const visitor = c.home !== this.worldId;
      const html = `<i style="background:${CATS[d.cat]?.color || '#999'}">${d.icon}</i>${visitor ? '🧳' : ''}${escapeHtml(c.name)}`;
      if (html !== u.last) { o.userData.nl.element.innerHTML = html; u.last = html; }
      if (c.bubble && camD < 160) {
        u.bl.visible = true;
        u.bl.position.y = H + 2.2;
        if (u.bubLast !== c.bubble.text) { u.bl.element.textContent = c.bubble.text; u.bubLast = c.bubble.text; }
      } else u.bl.visible = false;
      // テント
      if (c.state === 'camp' && !c.partyLeader) {
        if (!this.tents.has(c.id)) {
          const tent = buildTent(colorOf(c.colors[0], '#e0a040') === 'rainbow' ? '#c080ff' : colorOf(c.colors[0], '#e0a040'));
          tent.position.set(c.x + 2.2, 0, c.z - 1.2);
          this.scene.add(tent);
          this.tents.set(c.id, tent);
        }
      } else if (this.tents.has(c.id)) { this.scene.remove(this.tents.get(c.id)); this.tents.delete(c.id); }
    }
    for (const id of [...this.charObjs.keys()]) if (!here.has(id)) this.removeObj(this.charObjs, id);
    for (const id of [...this.tents.keys()]) if (!here.has(id)) { this.scene.remove(this.tents.get(id)); this.tents.delete(id); }

    // 選択リング
    const so = sel && this.charObjs.get(sel.id);
    this.selRing.visible = !!so;
    if (so) {
      this.selRing.position.set(so.position.x, 0.08, so.position.z);
      this.selRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    }

    // 魔物
    const mons = sim.monsters.get(this.worldId);
    const alive = new Set();
    for (const m of mons) {
      alive.add(m.id);
      let o = this.monObjs.get(m.id);
      if (!o) {
        o = buildMonster(m.boss);
        o.position.set(m.x, 0, m.z);
        const lb = label(`${m.boss ? '大魔物' : '魔物'} ${m.power}`, 'mon-label');
        lb.position.y = m.boss ? 2.4 : 2.8;
        o.add(lb);
        o.userData.lb = lb;
        this.scene.add(o);
        this.monObjs.set(m.id, o);
      }
      o.position.x += (m.x - o.position.x) * Math.min(1, dt * 6);
      o.position.z += (m.z - o.position.z) * Math.min(1, dt * 6);
      o.userData.body.position.y = 1 + Math.sin(t * 3 + m.id) * 0.2;
      o.rotation.y += dt * (m.engagedBy ? 6 : 0.6);
      o.userData.lb.visible = settings.names;
    }
    for (const id of [...this.monObjs.keys()]) if (!alive.has(id)) this.removeObj(this.monObjs, id);

    // 移動エフェクト (光の柱)
    for (const e of sim.effects) {
      if (e.world !== this.worldId) continue;
      const key = `${e.t}:${e.x}:${e.z}`;
      if (this.fxSeen.has(key)) continue;
      this.fxSeen.add(key);
      const big = e.kind === 'dan';
      const m = new THREE.Mesh(new THREE.CylinderGeometry(big ? 3 : 1.6, big ? 3 : 1.6, big ? 200 : 30, 20, 1, true),
        new THREE.MeshBasicMaterial({ color: big ? '#e8d0ff' : '#fff6a0', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(e.x, big ? 100 : 15, e.z);
      this.scene.add(m);
      this.fx.push({ m, life: big ? 3 : 1.5, max: big ? 3 : 1.5 });
    }
    this.fx = this.fx.filter((f) => {
      f.life -= dt;
      f.m.material.opacity = Math.max(0, f.life / f.max) * 0.7;
      if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; }
      return true;
    });
  }

  updateParticles(dt, t) {
    const spec = this.particles.userData.spec;
    const arr = this.particles.geometry.attributes.position.array;
    const R = this.bound;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += spec.vy * dt;
      if (spec.sway) { arr[i] += Math.sin(t + i) * spec.sway * dt; arr[i + 2] += Math.cos(t * 0.7 + i) * spec.sway * dt; }
      if (arr[i + 1] < 0) arr[i + 1] = 30;
      if (arr[i + 1] > 30) arr[i + 1] = 0;
      if (arr[i] * arr[i] + arr[i + 2] * arr[i + 2] > R * R) { arr[i] *= -0.9; arr[i + 2] *= -0.9; }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    if (spec.twinkle) this.particles.material.opacity = 0.6 + Math.sin(t * 2) * 0.3;
  }
}
