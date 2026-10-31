// 3つの画面: 宇宙 (世界団の球体) → 世界団 (世界線の球体) → 世界線 (地上の様子)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildProp, buildHouse, buildWorkplace, buildTent, buildPortal, buildMonster, buildRaidBoss, buildTreasureMark, buildCake, buildFlag, mat } from './props.js?v=37';
import { TYPE_COLOR } from './types.js?v=37';
import { SkyDome, Bursts, noiseTexture, cloudTexture, nebulaTexture, starLayer, spaceDust, atmosphere, planetMaterial, hazeMaterial, batchStatic } from './fx.js?v=37';

// その場から動かない行動 (うろうろしない)
const STAY_KINDS = new Set(['fight', 'defend', 'raid', 'dig', 'sleep', 'camp', 'contest', 'battle', 'portal']);
// 行動中にときどき浮かぶ絵文字
const AMBIENT = {
  daily: ['😋', '☕', '😌'], hobby: ['🎵', '✨', '😊'], work: ['💦', '🔨', '📦'], sabori: ['💤', '😪', '🎮'], social: ['💬', '😆', '🎶'],
  training: ['🔥', '💪'], shopping: ['🛍️', '😍'], explore: ['👀', '❓', '🧭'], help: ['👍', '😊'], event: ['🎉', '🎈', '🥳'],
};
import { colorOf, luminance, FONT, clamp, escapeHtml, hashStr, MIN_PER_DAY, ultraUp } from './util.js?v=37';
import { CATS } from './sim.js?v=37';

// グラフィック設定 (低・中・高・超高・最高)
const gfx = () => window.app?.settings?.gfx || 'high';
const GFX_STARS = { low: 0.4, mid: 0.7, high: 1, ultra: 1.6, max: 1.6 };

// 外側は CSS2DRenderer が位置決めに使うので、ホバー時の拡大などは内側に掛ける
function label(html, cls) {
  const el = document.createElement('div');
  el.className = 'lbl-anchor';
  const inner = document.createElement('div');
  inner.className = cls;
  inner.innerHTML = html;
  el.appendChild(inner);
  const o = new CSS2DObject(el);
  o.inner = inner;
  return o;
}

function starfield(n = 2500, r = 900) {
  n = Math.round(n * (GFX_STARS[gfx()] ?? 1));
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
// 昼の明るさ (夜 0 〜 昼 1)
const daylight = (h) => (h < 5 || h > 20 ? 0 : h < 7 ? (h - 5) / 2 : h > 18 ? (20 - h) / 2 : 1);
// 寝ている人・倒れている人のコマはやや暗くする
const sleepTint = (c) => (c.state === 'down' ? '#8a8a8a' : c.state === 'sleep' || c.state === 'camp' ? '#9aa6d0' : '#ffffff');

// カメラの移動がこれより遠いと、宇宙から観戦中はワープを見せる
const WARP_DIST = 180;

// ---------- 共通の土台 ----------
class BaseView {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 30000);
    this.controls = new OrbitControls(this.camera, app.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.pickables = [];
    this.owned = []; // この画面だけで使うテクスチャ (閉じる時に片付ける)
    this.occluders = []; // おまかせ観戦中、邪魔なら隠す球 ({ g, lb, r, fade })
    this.quality = gfx();
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.bound = 300;
    // おまかせ観戦中に手で動かしたら、しばらくは自動カメラを止める
    this.userHold = 0;
    this.controls.addEventListener('start', () => { this.userHold = 6; });
  }
  // 宇宙の背景: 星雲の絵 + またたく星 + すれ違う塵
  spaceBackdrop(key, cols, fallback) {
    if (this.quality === 'low') { this.scene.add(fallback); return; }
    this.scene.background = nebulaTexture(this.app.renderer, key, cols);
    this.stars = starLayer(ultraUp(this.quality) ? 5200 : this.quality === 'high' ? 3800 : 2400, 20000, key);
    this.scene.add(this.stars);
    if (this.quality !== 'mid') {
      this.dust = spaceDust(600, 140);
      this.scene.add(this.dust);
    }
  }
  // 毎フレームの最後に、カメラについてくるものを動かす
  postUpdate(dt) {
    if (this.stars) {
      this.stars.position.copy(this.camera.position);
      this.stars.material.uniforms.time.value += dt;
    }
    if (this.dust) this.dust.material.uniforms.cam.value.copy(this.camera.position);
    if (this.sky) {
      this.sky.mesh.position.copy(this.camera.position);
      this.sky.u.time.value += dt;
    }
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
    this.cinematic(dt);
    this.controls.update();
  }
  // おまかせ観戦のカメラワーク: 距離・角度をなめらかに合わせ、ゆっくり回り込む
  cinematic(dt) {
    const shot = this.app.director?.on && this.app.director.shot;
    if (!shot || this.framing) return;
    if (this.userHold > 0) { this.userHold -= dt; return; }
    const tgt = this.controls.target;
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(tgt));
    const k = 1 - Math.exp(-dt * 1.1);
    sph.theta += shot.orbit * dt;
    sph.phi += (clamp(Math.PI / 2 - shot.elev, 0.15, this.controls.maxPolarAngle) - sph.phi) * k;
    sph.radius += (clamp(shot.dist, this.controls.minDistance, this.controls.maxDistance) - sph.radius) * k;
    this.camera.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(sph));
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
  // 移動中のキャラのコマ (世界団マップ・宇宙マップ共通)
  // filter(tr, stage) でこの画面に出すかを決め、posOf(tr, f, stage) でその段階の中の位置を返す
  syncTravelers(filter, posOf, size) {
    const { model, sim } = this.app;
    this.tokens ??= new Map();
    const seen = new Set();
    for (const c of model.chars) {
      const tr = c.transit;
      if (!tr) continue;
      const { stage, f } = sim.transitStage(tr);
      if (!filter(tr, stage)) continue;
      seen.add(c.id);
      let tk = this.tokens.get(c.id);
      if (!tk) { tk = this.makeToken(c, size); this.tokens.set(c.id, tk); }
      tk.g.position.copy(posOf(tr, f, stage));
      const pts = [];
      for (let i = 0; i <= 20; i++) pts.push(posOf(tr, (f * i) / 20, stage));
      tk.trail.geometry.setFromPoints(pts);
      // 宇宙では世界線や世界団に比べて小さく映す。引いた時に見失わないよう、ごく小さな下限だけ設ける
      const camD = this.camera.position.distanceTo(tk.g.position);
      const H = Math.max(size, camD * 0.008) * (c.id === this.app.selected ? 1.4 : 1);
      tk.sp.scale.set(H * (tk.tex.ready && c.img ? tk.tex.aspect : 1), H, 1);
      tk.glowSp.scale.setScalar(H * 2.2);
      tk.lb.position.y = H * 0.75;
      const left = Math.max(1, Math.ceil(tr.end - sim.t));
      const html = `${tr.kind === 'dan' ? '🌌' : '🌀'} ${escapeHtml(c.name)}${c.party.length ? ` +${c.party.length}` : ''}<small>→ ${escapeHtml(sim.wname(tr.to))}（あと${left}分）</small>`;
      if (html !== tk.last) { tk.lb.inner.innerHTML = html; tk.last = html; }
    }
    for (const [id, tk] of this.tokens) {
      if (seen.has(id)) continue;
      tk.g.traverse((x) => { if (x.isCSS2DObject && x.element.parentNode) x.element.parentNode.removeChild(x.element); });
      this.scene.remove(tk.g, tk.trail);
      tk.trail.geometry.dispose();
      this.pickables.splice(this.pickables.indexOf(tk.g), 1);
      this.tokens.delete(id);
    }
  }
  makeToken(c, size) {
    const g = new THREE.Group();
    const tex = charTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tex, transparent: true, alphaTest: 0.05, depthTest: false }));
    sp.renderOrder = 10;
    sp.scale.setScalar(size);
    g.add(sp);
    const glowSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: new THREE.Color('#fff3a0').multiplyScalar(2.2), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glowSp.scale.setScalar(size * 2.2);
    g.add(glowSp);
    g.renderOrder = 10;
    const lb = label('', 'travel-label');
    lb.position.y = size * 0.75;
    g.add(lb);
    const c1 = colorOf(c.colors[0], '#fff3a0');
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(c1 === 'rainbow' ? '#ffffff' : c1).multiplyScalar(2.2), transparent: true, opacity: 0.9 }));
    g.userData = { pick: true, onClick: () => this.app.selectChar(c.id), onHover: (on) => lb.inner.classList.toggle('hot', on) };
    this.scene.add(g, trail);
    this.pickables.push(g);
    return { g, sp, glowSp, lb, tex, trail, last: '' };
  }
  // 追跡中のキャラが移動中ならコマを追いかけ、到着したら世界線へ
  followTraveler(dt) {
    const { app } = this;
    if (!app.following || !app.selected) return;
    const c = app.model.charById.get(app.selected);
    if (!app.isShowing(app.viewFor(c))) { app.goToChar(c, true); return true; }
    const tk = this.tokens?.get(c.transit ? c.id : c.partyLeader);
    if (!tk || this.travelAnchors?.()) return;
    const tgt = this.controls.target;
    const p = tk.g.position;
    // マップに切り替わった直後や遠く離れている時は、すぐにキャラの近くへカメラを移す
    if (!this.followSnapped || tgt.distanceTo(p) > 400) {
      this.followSnapped = true;
      const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(tgt));
      sph.radius = this.kind === 'universe' ? 90 : 60;
      sph.phi = Math.PI / 2 - 0.4;
      tgt.copy(p);
      this.camera.position.copy(p).add(new THREE.Vector3().setFromSpherical(sph));
      return;
    }
    // コマの動き自体がなめらかなので、遅れずぴったり追うほうがブレない
    const delta = p.clone().sub(tgt);
    tgt.add(delta);
    this.camera.position.add(delta);
  }

  // ---------- おまかせ観戦のカメラ (世界団マップ・宇宙マップ共通) ----------
  // 画面のうち、パネルやバーに隠れていない範囲 (cx, cy は中心、fx, fy は画面に対する割合)
  clearArea() {
    const rect = (id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return r?.width ? r : null; };
    const W = innerWidth, H = innerHeight;
    const l = rect('events')?.right ?? 0, r = rect('info')?.left ?? W;
    const t = Math.max(rect('top')?.bottom ?? 0, H * 0.07), b = Math.min(rect('help')?.top ?? H, H * 0.93);
    return { cx: (l + r) / W - 1, cy: 1 - (t + b) / H, fx: Math.max(0.3, (r - l) / W), fy: Math.max(0.3, (b - t) / H) };
  }
  // 半分の幅 hw・半分の高さ hh の物が、隠れていない範囲に収まるカメラの距離
  fitDist(hw, hh, area) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(hw / (tan * this.camera.aspect * area.fx), hh / (tan * area.fy));
  }
  // 移動の構図: 出発 A と到着 B を結ぶ線を真横から見て、2つが同時に入る距離まで引く
  frameTravel({ key, world, A, B, r: tok }, dt) {
    this.travelFocus = [A, B, tok].filter(Boolean);
    if (this.userHold > 0) { this.userHold -= dt; return; }
    const cam = this.camera, tgt = this.controls.target, area = this.clearArea();
    const mid = A.p.clone().add(B.p).multiplyScalar(0.5);
    const len = A.p.distanceTo(B.p) || 1;
    const u = B.p.clone().sub(A.p).divideScalar(len);
    const Y = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(u, Y);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const lift = new THREE.Vector3().crossVectors(side, u);
    const place = (a) => {
      const dir = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(lift, Math.sin(a));
      const right = new THREE.Vector3().crossVectors(Y, dir).normalize(), up = new THREE.Vector3().crossVectors(dir, right);
      const reach = (axis) => Math.max(...[A, B].map((n) => Math.abs(n.p.clone().sub(mid).dot(axis)) + n.r));
      return mid.clone().addScaledVector(dir, this.fitDist(reach(right), reach(up) + len * 0.12, area) * 1.06);
    };
    let k = 1 - Math.exp(-dt * 2.5);
    if (this.travelKey !== key) {
      if (!this.readyToCut(mid, dt)) return;
      this.travelKey = key;
      this.travelT = 0;
      this.travelAng = this.clearestAngle(place, [A, B]);
      k = 1; // 新しい移動はそのまま切り替える
    }
    this.shotWorld = world;
    this.travelT += dt;
    tgt.lerp(mid, k);
    cam.position.lerp(place(this.travelAng + Math.sin(this.travelT * 0.22) * 0.07), k);
  }
  // 宇宙から観戦中に遠くへ切り替える時は、星が流れるワープの一番濃い瞬間にカメラを移す
  readyToCut(to, dt) {
    if (this.warpWait > 0) { this.warpWait -= dt; return this.warpWait <= 0; }
    if (!this.app.spaceWatch || this.shotWorld === undefined || this.controls.target.distanceTo(to) < WARP_DIST) return true;
    this.app.sound.play('warp');
    this.app.ui.warp(true);
    this.warpWait = 0.3;
    return false;
  }
  // 手前に他の球が来にくい向きを選ぶ (それでも重なる分は unblock で隠す)
  clearestAngle(place, ends) {
    const seg = new THREE.Line3(), hit = new THREE.Vector3();
    const score = (a) => {
      seg.start.copy(place(a));
      let n = 0;
      for (const e of ends) {
        seg.end.copy(e.p);
        for (const o of this.occluders) {
          if (ends.some((f) => f.p === o.g.position)) continue;
          if (seg.closestPointToPoint(o.g.position, true, hit).distanceTo(o.g.position) < o.r) n++;
        }
      }
      return n;
    };
    const P = Math.PI;
    const tries = [0.42, P - 0.42, 0.85, P - 0.85, 0.15, P - 0.15, 1.25];
    return tries.reduce((best, a) => { const s = score(a); return s < best.s ? { a, s } : best; }, { a: tries[0], s: Infinity }).a;
  }
  // 見たい物 focus ([{ p, r }]) の手前に重なる球と、近くを横切る移動中のコマを隠す
  unblock(focus, dt) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // カメラから見た位置。sx, sy, rad は画面の縦の半分を 1 とした大きさ
    const look = (p, r) => {
      const v = p.clone().applyMatrix4(cam.matrixWorldInverse), d = -v.z;
      return { d, sx: v.x / (d * tan), sy: v.y / (d * tan), rad: r / (d * tan) };
    };
    const fs = focus.map((f) => look(f.p, f.r)).filter((f) => f.d > 0);
    const near = Math.min(Infinity, ...fs.map((f) => f.d));
    const k = Math.min(1, dt * 7);
    let hidden = false;
    const apply = (o, hide, set) => {
      o.fade = (o.fade ?? 1) + ((hide ? 0 : 1) - (o.fade ?? 1)) * k;
      if (!hide && o.fade > 0.995) o.fade = 1;
      if (o.fade < 1) hidden = true;
      set(o.fade, o.fade > 0.03);
    };
    const dist = (a, b) => Math.hypot(a.sx - b.sx, a.sy - b.sy);
    for (const o of this.occluders) {
      const v = look(o.g.position, o.r);
      const mine = focus.some((f) => f.p === o.g.position);
      const inside = cam.position.distanceTo(o.g.position) < o.r;
      const front = v.d > 0 && v.d < near;
      // 見たい物に手前から重なる球、またはカメラのすぐ前で画面を大きくふさぐ球
      const hide = !mine && fs.length > 0 && (inside || (front && (v.rad > 0.5 || fs.some((f) => dist(v, f) < v.rad + f.rad + 0.04))));
      apply(o, hide, (f, vis) => { o.g.scale.setScalar(Math.max(f, 0.001)); o.g.visible = vis; if (o.lb) o.lb.visible = vis; });
    }
    if (this.tokens) {
      const c = this.app.selected && this.app.model.charById.get(this.app.selected);
      const mine = c && (c.partyLeader || c.id);
      for (const [id, tk] of this.tokens) {
        const v = look(tk.g.position, 0);
        const hide = id !== mine && fs.length > 0 && v.d > 0 && fs.some((f) => dist(v, f) < f.rad + 0.14);
        apply(tk, hide, (f, vis) => { tk.g.scale.setScalar(Math.max(f, 0.001)); tk.g.visible = vis; tk.lb.visible = vis; tk.trail.visible = vis; });
      }
    }
    return hidden;
  }
  // おまかせ観戦中は、パネルに隠れていない範囲の真ん中を画面の中心にして、邪魔な物をよける
  stageCamera(dt) {
    const on = this.app.director.on, cam = this.camera;
    const a = on ? this.clearArea() : { cx: 0, cy: 0 };
    const W = innerWidth, H = innerHeight, k = 1 - Math.exp(-dt * 5);
    this.shiftX = (this.shiftX ?? 0) + (-a.cx * W / 2 - (this.shiftX ?? 0)) * k;
    this.shiftY = (this.shiftY ?? 0) + (a.cy * H / 2 - (this.shiftY ?? 0)) * k;
    if (on || Math.hypot(this.shiftX, this.shiftY) > 0.5) cam.setViewOffset(W, H, this.shiftX, this.shiftY, W, H);
    else if (cam.view?.enabled) cam.clearViewOffset();
    if (on || this.hiding) this.hiding = this.unblock(on ? this.focusList() : [], dt);
  }
  focusList() { return this.travelFocus ?? []; }
  travelerFocus(c) {
    const tk = this.tokens?.get(c.partyLeader || c.id);
    return tk ? { p: tk.g.position, r: 0.5 } : null;
  }

  dispose() {
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o.isCSS2DObject && o.element.parentNode) o.element.parentNode.removeChild(o.element);
    });
    this.scene.clear();
    for (const x of this.owned) x.dispose();
  }
}

// ---------- 宇宙: 世界団の球体 ----------
export class UniverseView extends BaseView {
  constructor(app) {
    super(app);
    this.kind = 'universe';
    const { model } = app;
    this.scene.background = new THREE.Color('#04050d');
    this.spaceBackdrop('universe', ['#080a22', '#3a1d6e', '#1f6a8a'], starfield(5000, 9000));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    const sun = new THREE.PointLight('#ffffff', 2.5, 0, 0);
    this.scene.add(sun);
    this.spheres = [];
    this.danPos = new Map();
    // 世界団の位置は model で決めてある (しょ = シーズン1 は遠く離れている)
    const box = new THREE.Box3();
    model.dans.forEach((d, i) => {
      const radius = (8 + Math.sqrt(d.worlds.length) * 1.8) * 3;
      const g = new THREE.Group();
      g.position.set(d.pos.x, d.pos.y, d.pos.z);
      box.expandByPoint(g.position);
      this.danPos.set(d.id, { p: g.position, r: radius });
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32),
        new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.25, roughness: 0.35, transparent: true, opacity: 0.55 }));
      g.add(core);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.01, 48, 32), atmosphere(d.color, { power: 2.4, k: 1.7 })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.4, 32, 24), atmosphere(d.color, { shell: true, power: 2.6, k: 0.8 })));
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
      this.occluders.push({ g, lb, r: radius * 1.4 });
      g.userData = {
        pick: true, inner, core,
        onHover: (on) => { core.material.emissiveIntensity = on ? 0.6 : 0.25; lb.inner.classList.toggle('hot', on); },
        onClick: () => app.openDan(d.id),
      };
      this.scene.add(g);
      this.pickables.push(g);
      this.spheres.push(g);
    });
    // 隣どうしの世界団をつなぐ線 (ここしか行き来できない)
    const lp = [];
    for (const d of model.dans) for (const nb of d.neighbors) if (nb > d.id) {
      const o = model.danById.get(nb);
      lp.push(d.pos.x, d.pos.y, d.pos.z, o.pos.x, o.pos.y, o.pos.z);
      const far = d.season !== o.season;
      const mid = label(`${far ? '🌠 シーズンをまたぐ' : '🛸'} ${far ? 120 : 40}pt`, 'route-label');
      mid.position.set((d.pos.x + o.pos.x) / 2, (d.pos.y + o.pos.y) / 2 + 12, (d.pos.z + o.pos.z) / 2);
      this.scene.add(mid);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineDashedMaterial({ color: '#9fb0ff', transparent: true, opacity: 0.35, dashSize: 12, gapSize: 8 })).computeLineDistances());
    const center = box.getCenter(new THREE.Vector3());
    const span = box.getSize(new THREE.Vector3()).length();
    this.camera.position.set(center.x, center.y + span * 0.55, center.z + span * 0.95);
    this.controls.target.copy(center);
    this.controls.minDistance = 30;
    this.controls.maxDistance = span * 3;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
    this.bound = span;
  }
  update(dt) {
    const { model } = this.app;
    const danOf = (wid) => this.danPos.get(model.worlds.get(wid).dan);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.syncTravelers((tr, stage) => tr.kind === 'dan' && stage === 'space', (tr, f) => {
      const A = danOf(tr.from), B = danOf(tr.to);
      a.copy(A.p); b.copy(B.p);
      const dir = b.clone().sub(a).normalize();
      a.addScaledVector(dir, A.r * 1.3); b.addScaledVector(dir, -B.r * 1.3);
      return a.clone().lerp(b, f).add(new THREE.Vector3(0, Math.sin(f * Math.PI) * a.distanceTo(b) * 0.08, 0));
    }, 2);
    if (this.app.following || this.app.director.on) this.controls.autoRotate = false;
    if (this.followTraveler(dt)) return;
    this.frameShot(dt);
    super.update(dt);
    this.stageCamera(dt);
    for (const s of this.spheres) s.userData.inner.rotation.y += dt * 0.15;
  }
  // 世界団どうしの移動を映す時は、出発と到着の世界団を同時に入れる
  travelAnchors() {
    const { app } = this;
    const c = app.director.on && app.following && app.selected && app.model.charById.get(app.selected);
    const tr = c && app.sim.transitOf(c);
    if (!tr || app.sim.transitStage(tr).stage !== 'space') return null;
    const at = (wid) => { const d = this.danPos.get(app.model.worlds.get(wid).dan); return { p: d.p, r: d.r * 1.4 }; };
    return { key: `${tr.from}>${tr.to}`, world: tr.to, A: at(tr.from), B: at(tr.to), r: this.travelerFocus(c) };
  }
  frameShot(dt) {
    const an = this.travelAnchors();
    this.framing = !!an;
    this.travelFocus = null;
    if (an) this.frameTravel(an, dt);
    else this.travelKey = null;
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
    this.scene.add(new THREE.HemisphereLight('#c8d4ff', '#223', 0.7));
    const dl = new THREE.DirectionalLight('#fff4e0', 2.6);
    dl.position.set(50, 100, 30);
    this.scene.add(dl);

    this.nodes = new Map();
    // 超高以上: 球を透かして、中に世界線の様子 (島・家・キャラ) を小さく映す
    this.ultra = ultraUp(gfx());
    this.max = gfx() === 'max';
    this.miniChars = new Map();
    this.miniMons = new Map();
    let maxR = 10;
    const linePts = [];
    for (const wid of dan.worlds) {
      const w = model.worlds.get(wid);
      const r = 4 + Math.sqrt(w.residents.length) * 1.1;
      const g = new THREE.Group();
      g.position.set(w.pos.x, w.pos.y, w.pos.z);
      const sph = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20),
        planetMaterial(w.theme.ground, this.ultra ? { transparent: true, opacity: 0.1, depthWrite: false } : {}));
      this.owned.push(sph.material.map);
      g.add(sph);
      // 大気: ふちの光と、外へにじむ光輪
      const air = new THREE.Color(w.theme.sky).lerp(new THREE.Color(w.theme.ground), 0.3).lerp(new THREE.Color('#ffffff'), 0.25);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.005, 32, 20), atmosphere(air, { power: 3, k: 1.5 })));
      const mini = this.ultra ? buildMini(w, r) : null;
      if (mini) g.add(mini);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.3, 24, 16), atmosphere(air, { shell: true, power: 3, k: 0.75 })));
      let ring = null;
      if (w.danger > 0) {
        // 魔物の多さ = 赤い輪
        ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, 0.06 + w.danger / 80, 6, 40),
          new THREE.MeshBasicMaterial({ color: '#ff4a6a', transparent: true, opacity: 0.25 + Math.min(0.6, w.danger / 50) }));
        ring.rotation.x = Math.PI / 2.3;
        g.add(ring);
      }
      const lb = label('', 'world-label');
      lb.position.set(0, r * 1.5 + 1, 0);
      g.add(lb);
      g.userData = {
        pick: true,
        onHover: (on) => { sph.material.emissiveIntensity = on ? 0.8 : 0.28; lb.inner.classList.toggle('hot', on); },
        onClick: () => app.openWorld(wid),
      };
      this.scene.add(g);
      this.pickables.push(g);
      this.occluders.push({ g, lb, r: r * 1.35 });
      this.nodes.set(wid, { g, lb, w, r, mini, ring, detail: null, lod: 0, last: '' });
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
    this.letters = [];
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
      this.letters.push(lb);
    }

    const hue = new THREE.Color(dan.color);
    this.spaceBackdrop('dan:' + danId, ['#070a1e', hue.clone().multiplyScalar(0.4).getStyle(), '#6a2a8a'], starfield(3000, Math.max(900, maxR * 5)));
    this.maxR = maxR;
    this.camera.position.set(0, maxR * 0.6, maxR * 1.1);
    this.controls.minDistance = this.ultra ? 2 : 10;
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
      const raid = sim.raidAt(wid);
      const hd = sim.hordeAt(wid), race = sim.races.find((r) => r.world === wid);
      const html = (raid ? `<em class="raid">🐉 レイド${raid.phase === 'fight' ? '激闘中' : '発生中'}</em>` : '')
        + (hd ? `<em class="raid">🛡️ 防衛戦</em>` : '')
        + (race ? `<em class="raid race">🗺️ 宝探し</em>` : '')
        + (sim.parties.some((p) => p.world === wid) ? `<em class="raid fest">🎂 誕生日会</em>` : '')
        + (sim.contests.some((c) => c.started && c.world === wid) ? `<em class="raid fest">🚩 対抗戦</em>` : '')
        + (show ? `<b>${escapeHtml(n.w.name)}</b><small>${escapeHtml(wid)}</small>` : '')
        + `<span>👤${present.length}${visitors ? ` 🧳${visitors}` : ''}${mons ? ` 👾${mons}` : ''}</span>`;
      if (html !== n.last) { n.lb.inner.innerHTML = html; n.last = html; }
      if (n.haze?.visible) this.tintHaze(n);
    }
  }
  update(dt) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const { model, spaceWatch } = this.app;
    // 宇宙から観戦中は世界線の中に入らないので、降りる間も到着の世界線のそばに出しておく
    this.syncTravelers((tr, stage) => {
      if (tr.kind === 'line') return this.nodes.has(tr.from) && (stage !== 'down' || spaceWatch);
      return (this.nodes.has(tr.from) && (stage === 'up' || stage === 'exit')) || (this.nodes.has(tr.to) && (stage === 'enter' || (stage === 'down' && spaceWatch)));
    }, (tr, f, stage) => {
      if (tr.kind === 'line') {
        const A = this.nodes.get(tr.from), B = this.nodes.get(tr.to);
        a.copy(A.g.position); b.copy(B.g.position);
        const dir = b.clone().sub(a).normalize();
        a.addScaledVector(dir, A.r); b.addScaledVector(dir, -B.r);
        const k = stage === 'up' ? 0 : stage === 'down' ? 1 : f;
        return a.clone().lerp(b, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * a.distanceTo(b) * 0.12, 0));
      }
      // 世界団の移動: 世界線から世界団のふちへ / ふちから行き先の世界線へ
      if (stage === 'enter' || stage === 'down') {
        const B = this.nodes.get(tr.to);
        const k = stage === 'down' ? 1 : f;
        a.copy(this.edgeToward(tr.fromDan ?? model.worlds.get(tr.from).dan)); b.copy(B.g.position);
        return a.clone().lerp(b, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 20, 0));
      }
      const A = this.nodes.get(tr.from);
      a.copy(A.g.position); b.copy(this.edgeToward(tr.toDan ?? model.worlds.get(tr.to).dan));
      const k = stage === 'up' ? 0 : f;
      return a.clone().lerp(b, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 20, 0));
    }, 1);
    if (this.ultra) { this.updateMiniLod(); this.updateMiniChars(); }
    if (this.max) { this.updateMiniMonsters(); this.updateMiniDust(dt); }
    if (this.followTraveler(dt)) return;
    this.frameShot(dt);
    super.update(dt);
    this.stageCamera(dt);
    if (this.ultra) this.hideLabelsOnGround(dt);
    if ((this.refreshT -= dt) < 0) { this.refresh(); this.refreshT = 0.5; }
    for (const n of this.nodes.values()) n.g.rotation.y += dt * (this.ultra ? 0.05 : 0.2);
  }
  // 世界団の外へ出る/外から入る時の、世界団のふちの点 (相手の世界団のある方向)
  edgeToward(danId) {
    const { model } = this.app;
    const me = model.danById.get(this.danId).pos, o = model.danById.get(danId).pos;
    return new THREE.Vector3(o.x - me.x, (o.y - me.y) * 0.3, o.z - me.z).normalize().multiplyScalar(this.maxR * 1.25);
  }
  // 移動中のキャラを映す時の、画面に同時に入れる2か所
  travelAnchors() {
    const { app } = this;
    const c = app.director.on && app.following && app.selected && app.model.charById.get(app.selected);
    const tr = c && app.sim.transitOf(c);
    if (!tr) return null;
    const { stage } = app.sim.transitStage(tr);
    const at = (wid) => { const n = this.nodes.get(wid); return n && { p: n.g.position, r: n.r * 1.35 }; };
    const worldOf = (wid) => app.model.worlds.get(wid).dan;
    const edge = (dan) => ({ p: this.edgeToward(dan), r: this.maxR * 0.06 });
    const r = this.travelerFocus(c);
    if (tr.kind === 'line') return at(tr.from) && at(tr.to) && { key: `${tr.from}>${tr.to}`, world: tr.to, A: at(tr.from), B: at(tr.to), r };
    if (stage === 'enter' || stage === 'down') return at(tr.to) && { key: `in:${tr.to}`, world: tr.to, A: edge(tr.fromDan ?? worldOf(tr.from)), B: at(tr.to), r };
    return at(tr.from) && { key: `out:${tr.from}`, world: tr.to, A: at(tr.from), B: edge(tr.toDan ?? worldOf(tr.to)), r };
  }
  frameShot(dt) {
    const an = this.travelAnchors();
    this.framing = !!an;
    this.travelFocus = null;
    if (an) return this.frameTravel(an, dt);
    this.travelKey = null;
    // 宇宙から観戦: 映したいキャラ・場所を、透けた世界線の中に追いかける
    const p = this.spaceTarget();
    if (!p) return;
    const tgt = this.controls.target, cam = this.camera;
    const wid = this.spaceWorld();
    if (wid !== this.shotWorld) {
      if (!this.readyToCut(p, dt)) return;
      // 別の世界線へ移る時は途中を飛ばす。遠すぎる/近すぎる所から寄っていかないよう、距離もここで決める
      this.shotWorld = wid;
      const off = cam.position.clone().sub(tgt).setLength(this.spaceShot().dist);
      tgt.copy(p);
      cam.position.copy(p).add(off);
    }
    // 映す世界線が変わったら、どこなのかを一瞬出す
    if (wid !== this.titledWorld) {
      this.titledWorld = wid;
      this.app.ui.titleCard(this.app.model.worlds.get(wid), true);
    }
    const d = p.sub(tgt).multiplyScalar(Math.min(1, dt * 4));
    tgt.add(d);
    cam.position.add(d);
  }
  focusList() {
    if (this.travelFocus) return this.travelFocus;
    const n = this.nodes.get(this.spaceWorld());
    return n ? [{ p: n.g.position, r: n.r * 1.35 }] : [];
  }
  spaceTarget() {
    const { app } = this;
    if (!this.ultra || !app.spaceWatch) return null;
    const c = app.selected && app.model.charById.get(app.selected);
    // キャラの絵は遠いと出ていないので、居場所は島の座標から求める
    if (c && !app.sim.transitOf(c) && this.nodes.has(c.world)) return this.nodes.get(c.world).mini.localToWorld(new THREE.Vector3(c.x, 3.5, c.z));
    const n = this.watch && this.nodes.get(this.watch.world);
    return n ? n.mini.localToWorld(new THREE.Vector3(this.watch.x, 0, this.watch.z)) : null;
  }
  // 島の地面に重なる他の世界線の文字を隠す
  hideLabelsOnGround(dt) {
    if ((this.groundT = (this.groundT ?? 0) - dt) > 0) return;
    this.groundT = 0.1;
    const W = innerWidth, H = innerHeight, cam = this.camera, v = new THREE.Vector3();
    const screen = (p, dy = 0) => {
      v.copy(p);
      v.y += dy;
      v.project(cam);
      return v.z < 1 ? { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H } : null;
    };
    // 画面に大きく映っている島を、画面上の楕円として求める
    const islands = [];
    for (const n of this.nodes.values()) {
      if (!n.g.visible) continue;
      const rim = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        rim.push(screen(new THREE.Vector3(n.g.position.x + Math.cos(a) * n.r * 0.8, n.g.position.y, n.g.position.z + Math.sin(a) * n.r * 0.8)));
      }
      if (rim.some((q) => !q)) continue;
      const xs = rim.map((q) => q.x), ys = rim.map((q) => q.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x1 - x0 < 50) continue; // 小さな島は文字をふさがない
      islands.push({ n, x: (x0 + x1) / 2, y: (y0 + y1) / 2, a: (x1 - x0) / 2, b: Math.max(y1 - y0, 1) / 2 });
    }
    // 文字の大きさの分 (hw, hh) だけ広げて重なりを調べる
    const onGround = (q, own, hw, hh) => !!q && islands.some((o) => o.n !== own && ((q.x - o.x) / (o.a + hw)) ** 2 + ((q.y - o.y) / (o.b + hh)) ** 2 < 1);
    const mark = (lb, hide) => {
      if (lb.onGround === hide) return;
      lb.onGround = hide;
      lb.inner.classList.toggle('on-ground', hide);
    };
    for (const n of this.nodes.values()) {
      const q = screen(n.g.position, n.r * 1.5 + 1);
      if (q) q.y -= 12; // 文字は基準の点の上側に出る
      mark(n.lb, onGround(q, n, 42, 12));
    }
    for (const lb of this.letters) {
      const q = screen(lb.position);
      if (q) q.y -= 35;
      mark(lb, onGround(q, null, 25, 30));
    }
  }
  // 今映している世界線
  spaceWorld() {
    const { app } = this;
    const c = app.selected && app.model.charById.get(app.selected);
    return c && !app.sim.transitOf(c) && this.nodes.has(c.world) ? c.world : this.watch?.world;
  }
  // 宇宙から観戦中のカメラの距離: 場所なら球全体がパネルに隠れず入る距離、キャラならその半分まで寄る
  spaceShot() {
    const { app } = this;
    const wid = this.spaceWorld();
    const n = wid && this.nodes.get(wid);
    if (!n) return null;
    const fit = this.fitDist(n.r * 1.1, n.r * 1.1, this.clearArea());
    return app.selected && wid === app.model.charById.get(app.selected).world ? { dist: fit * 0.5, elev: 0.5, orbit: 0.07 } : { dist: fit, elev: 0.7, orbit: 0.05 };
  }
  // カメラからの距離で、球の中に映す物を変える (遠い: 地面だけ / 中くらい: 地面とキャラ / 近い: 建物や木も)
  updateMiniLod() {
    const cam = this.camera.position;
    const tier = this.max ? 1 : 0;
    let built = false;
    for (const n of this.nodes.values()) {
      const d = cam.distanceTo(n.g.position) / n.r;
      // 境目で切り替わり続けないよう、下げる時は少し余裕を持たせる
      const slack = (lod) => (n.lod > lod ? 1.15 : 1);
      const lod = d < MINI_NEAR[tier] * slack(1) ? 2 : d < MINI_MID[tier] * slack(0) ? 1 : 0;
      if (this.max) this.showAir(n, lod > 0);
      // 観戦で寄った時は、赤い輪が手前をふさがないようにする
      if (n.ring) n.ring.visible = lod < 2 || !this.app.director.on;
      // 建物の組み立ては1コマに1つだけ (順番に現れるので、止まって見えない)
      if (lod === 2 && !n.detail) {
        if (built) continue;
        built = true;
        n.detail = buildMiniDetail(n.w, this.app.model, this.max);
        // クリックの判定は外側の球で足りる。細かい形まで調べると、マウスを動かすたびに重くなる
        n.detail.traverse((m) => { m.raycast = () => {}; });
        n.mini.add(n.detail);
      }
      if (n.detail) n.detail.visible = lod === 2;
      n.lod = lod;
    }
  }
  // 中くらいの距離まで: 世界線の空の色の霧と塵 (最高設定)
  showAir(n, on) {
    if (on && !n.haze) {
      if (!this.hazeGeo) this.owned.push(this.hazeGeo = new THREE.SphereGeometry(1, 32, 20));
      n.haze = new THREE.Mesh(this.hazeGeo, hazeMaterial(n.w.theme.sky));
      n.haze.scale.setScalar(n.r * 1.002);
      n.haze.raycast = () => {};
      n.g.add(n.haze);
      this.owned.push(n.haze.material);
      n.dust = miniDust(n.w, n.mini.scale.x);
      if (n.dust) { n.mini.add(n.dust); this.owned.push(n.dust.geometry, n.dust.material); }
      this.tintHaze(n);
    }
    if (n.haze) n.haze.visible = on;
    if (n.dust) n.dust.visible = on;
  }
  // 霧の色は世界線の中の空と同じように昼夜で変わる
  tintHaze(n) {
    const night = new THREE.Color(n.w.theme.sky).lerp(new THREE.Color('#050818'), 0.95);
    n.haze.material.uniforms.col.value.copy(night).lerp(new THREE.Color(n.w.theme.sky), daylight(this.app.sim.hour));
  }
  updateMiniDust(dt) {
    const t = performance.now() / 1000;
    for (const n of this.nodes.values()) {
      if (!n.lod || !n.dust) continue;
      const { spec } = n.dust.userData, H = n.w.geo.R * 0.45;
      const arr = n.dust.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += Math.sin(t + i) * spec.sway * dt;
        arr[i + 1] = (arr[i + 1] + spec.vy * dt + H) % H;
      }
      n.dust.geometry.attributes.position.needsUpdate = true;
    }
  }
  // 近くの世界線の魔物: 戦っている魔物と、残りの一部を映す (最高設定)
  updateMiniMonsters() {
    const { sim } = this.app;
    const seen = new Set();
    for (const n of this.nodes.values()) {
      if (n.lod !== 2) continue;
      let rest = MINI_MONSTERS;
      for (const m of sim.monsters.get(n.w.id) || []) {
        if (m.dead || (!m.engagedBy && rest-- <= 0)) continue;
        seen.add(m.id);
        let o = this.miniMons.get(m.id);
        if (!o) {
          o = buildMonster(m.boss, TYPE_COLOR[m.type?.[0]]);
          o.traverse((x) => { x.raycast = () => {}; });
          o.scale.multiplyScalar(2.2); // キャラのコマに負けない大きさに
          this.miniMons.set(m.id, o);
        }
        if (o.parent !== n.mini) n.mini.add(o);
        o.position.set(m.x, 0, m.z);
      }
    }
    for (const [id, o] of this.miniMons) if (!seen.has(id)) { o.parent?.remove(o); this.miniMons.delete(id); }
  }
  // 世界線の中にいるキャラを、小さな島の上に映す
  updateMiniChars() {
    const { model } = this.app;
    const seen = new Set();
    for (const c of model.chars) {
      const n = this.nodes.get(c.world);
      if (!n || !n.lod) continue;
      seen.add(c.id);
      let sp = this.miniChars.get(c.id);
      if (!sp) {
        const tex = charTexture(c);
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.tex, transparent: true, alphaTest: 0.05 }));
        sp.userData.tex = tex;
        this.miniChars.set(c.id, sp);
      }
      if (sp.parent !== n.mini) n.mini.add(sp);
      const H = 7 * (c.state === 'down' ? 0.6 : 1);
      sp.scale.set(H * (sp.userData.tex.ready && c.img ? sp.userData.tex.aspect : 1), H, 1);
      sp.position.set(c.x, H / 2, c.z);
      sp.material.rotation = c.state === 'sleep' || c.state === 'camp' || c.state === 'down' ? Math.PI / 2 : 0;
      if (this.max) sp.material.color.set(sleepTint(c));
    }
    for (const [id, sp] of this.miniChars) if (!seen.has(id)) { sp.parent?.remove(sp); sp.material.dispose(); this.miniChars.delete(id); }
  }
}

// 球の半径の何倍まで近づいたら建物 / キャラを映すか ([超高, 最高])
const MINI_NEAR = [7, 14], MINI_MID = [26, 34];
// 最高設定で1つの世界線に映す、戦っていない魔物の数
const MINI_MONSTERS = 6;

// 世界団マップの球の中に置く、世界線の縮小模型の地面 (超高以上)
function buildMini(w, r) {
  const { geo, theme: th } = w;
  const g = new THREE.Group();
  const ground = new THREE.Color(th.ground);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(geo.R, geo.R * 0.97, 2, 48), [
    mat(ground.clone().multiplyScalar(0.7).getStyle()), mat(th.ground), mat(th.ground),
  ]);
  top.position.y = -1;
  g.add(top);
  const under = new THREE.Mesh(new THREE.ConeGeometry(geo.R * 0.97, geo.R * 0.5, 10), mat(ground.clone().multiplyScalar(0.45).getStyle()));
  under.rotation.x = Math.PI;
  under.position.y = -2 - geo.R * 0.25;
  g.add(under);
  g.scale.setScalar((r * 0.8) / geo.R);
  return g;
}

// 模型の建物や木。近づいた世界線の分だけ組み立てる
function buildMiniDetail(w, model, max) {
  const { geo, theme: th } = w;
  const g = new THREE.Group();
  const lm = buildProp(th.landmark, null, 0.7);
  lm.scale.setScalar(clamp(geo.plazaR / 4, 1.6, 3));
  g.add(lm);
  for (const id of w.residents) {
    const c = model.charById.get(id);
    const h = geo.homes[id];
    const roof = colorOf(c.colors[1] || c.colors[0], '#c0503a');
    const house = buildHouse(colorOf(c.colors[0], '#cccccc'), roof === 'rainbow' ? '#c080ff' : roof);
    const k = 1 + 2.8 / Math.max(1, Math.hypot(h.x, h.z));
    house.position.set(h.x * k, 0, h.z * k);
    house.rotation.y = Math.atan2(-h.x, -h.z);
    g.add(house);
  }
  for (const wp of geo.works) {
    const b = buildWorkplace(th.ground);
    b.position.set(wp.x, 0, wp.z);
    g.add(b);
  }
  // 自然物などは多いので一部だけ
  for (const p of geo.props.slice(0, max ? 110 : 30)) {
    const o = buildProp(p.kind, p.color, p.seed);
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.rot;
    o.scale.multiplyScalar(p.s);
    g.add(o);
  }
  batchStatic(g);
  if (max) g.add(miniGrass(geo, new THREE.Color(th.ground)));
  return g;
}

// 模型の草むら (最高設定)
function miniGrass(geo, ground) {
  const n = Math.round(Math.min(320, geo.R * 6));
  const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.35, 1.7, 4), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), n);
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = geo.plazaR + 1 + Math.sqrt(Math.random()) * (geo.R * 0.96 - geo.plazaR - 1);
    d.position.set(Math.cos(a) * rr, 0.5, Math.sin(a) * rr);
    d.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
    d.scale.setScalar(0.6 + Math.random() * 0.9);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, col.copy(ground).offsetHSL((Math.random() - 0.5) * 0.05, 0.05, 0.03 + Math.random() * 0.1));
  }
  return im;
}

// 模型の中を舞う塵 (最高設定)。世界線の中と同じ種類の粒を、数を減らして島の大きさに合わせて出す
function miniDust(w, scale) {
  const pt = PARTICLES[w.theme.particle];
  if (!pt) return null;
  const { R } = w.geo;
  const n = Math.round(Math.min(160, R * 1.6)), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R * 0.92;
    pos.set([Math.cos(a) * rr, Math.random() * R * 0.45, Math.sin(a) * rr], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: pt.color, size: pt.size * scale * 3, map: DOT, transparent: true, depthWrite: false, opacity: 0.85 }));
  p.userData.spec = pt;
  p.raycast = () => {};
  return p;
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
    this.skyNight = new THREE.Color(th.sky).lerp(new THREE.Color('#050818'), 0.95);
    this.scene.background = this.skyDay.clone();
    this.scene.fog = new THREE.Fog(this.skyDay.clone(), R * 2.6, R * 7);

    this.hemi = new THREE.HemisphereLight('#ffffff', th.ground, 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.4);
    this.sun.position.set(R * 0.6, R, R * 0.3);
    this.scene.add(this.hemi, this.sun);
    const q = this.quality;
    this.groundCol = new THREE.Color(th.ground);
    // 影
    if (q === 'high' || ultraUp(q)) {
      const s = this.sun.shadow;
      this.sun.castShadow = true;
      s.mapSize.setScalar(ultraUp(q) ? 4096 : 2048);
      const span = R * 1.15;
      Object.assign(s.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: R * 5 });
      s.camera.updateProjectionMatrix();
      s.bias = -0.0004;
      s.normalBias = 0.5;
      this.shadowT = 0;
    }
    if (q !== 'low') {
      this.sky = new SkyDome(25000);
      this.scene.add(this.sky.mesh);
      // 雲: 島のまわりと、下に広がる雲海
      this.clouds = new THREE.Group();
      const ctex = cloudTexture();
      for (let i = 0; i < 26; i++) {
        const low = i < 12, a = Math.random() * Math.PI * 2, rr = R * (low ? 1.5 + Math.random() * 3 : 2.6 + Math.random() * 2.4);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, opacity: low ? 0.75 : 0.5, depthWrite: false, fog: false }));
        const s = R * (low ? 1 + Math.random() : 0.5 + Math.random() * 0.7);
        sp.scale.set(s * 2, s, 1);
        sp.position.set(Math.cos(a) * rr, low ? -R * (1 + Math.random() * 0.8) : R * (0.25 + Math.random() * 0.7), Math.sin(a) * rr);
        this.clouds.add(sp);
      }
      this.scene.add(this.clouds);
    }
    this.bursts = new Bursts(this.scene, q === 'low' ? 500 : 2600);

    // 浮島
    const ground = new THREE.Color(th.ground);
    const island = new THREE.Group();
    const texOf = (kind, rx, ry) => {
      const t = noiseTexture(kind).clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      this.owned.push(t);
      return t;
    };
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 2, 96), [
      new THREE.MeshStandardMaterial({ color: ground.clone().multiplyScalar(0.72), map: texOf('rock', 6, 0.4), roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: ground, map: texOf('ground', R / 14, R / 14), roughness: 0.95 }),
      mat(th.ground),
    ]);
    top.position.y = -1;
    top.receiveShadow = true;
    island.add(top);
    // 島の下の岩: 不ぞろいに削って地層の模様をつける
    const coneGeo = new THREE.ConeGeometry(R * 0.97, R * 0.75, 28, 6);
    const cp = coneGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i), k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.1 * (0.5 - y / (R * 0.75));
      cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k);
    }
    coneGeo.computeVertexNormals();
    const under = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ color: ground.clone().multiplyScalar(0.5), map: texOf('rock', 4, 1.2), roughness: 1, flatShading: true }));
    under.rotation.x = Math.PI;
    under.position.y = -2 - R * 0.375;
    island.add(under);
    // 島のまわりに浮かぶ岩
    this.rocks = [];
    if (q !== 'low') {
      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: ground.clone().multiplyScalar(0.55), map: under.material.map, roughness: 1, flatShading: true });
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, rr = R * (1.14 + Math.random() * 0.6), s = R * (0.02 + Math.random() * 0.07);
        const m = new THREE.Mesh(rockGeo, rockMat);
        m.position.set(Math.cos(a) * rr, -R * (0.05 + Math.random() * 0.4), Math.sin(a) * rr);
        m.scale.set(s, s * 0.7, s);
        m.rotation.set(Math.random(), Math.random() * 6, Math.random());
        island.add(m);
        this.rocks.push({ m, y: m.position.y, p: Math.random() * 6, s });
      }
    }
    // 草むら (高以上)
    if (q === 'high' || ultraUp(q)) {
      const n = Math.round(R * (ultraUp(q) ? 22 : 12));
      const im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 1, 4), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), n);
      const d = new THREE.Object3D(), col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = geo.plazaR + 1 + Math.sqrt(Math.random()) * (R * 0.96 - geo.plazaR - 1);
        d.position.set(Math.cos(a) * rr, 0.3, Math.sin(a) * rr);
        d.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6, (Math.random() - 0.5) * 0.5);
        d.scale.setScalar(0.5 + Math.random() * 0.9);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, col.copy(ground).offsetHSL((Math.random() - 0.5) * 0.05, 0.05, 0.03 + Math.random() * 0.1));
      }
      island.add(im);
    }
    // 地面のまだら模様
    const nPatch = Math.round(R * 0.6);
    const patches = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), nPatch);
    patches.receiveShadow = true;
    const pd = new THREE.Object3D();
    pd.rotation.x = -Math.PI / 2;
    for (let i = 0; i < nPatch; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R * 0.92;
      pd.position.set(Math.cos(a) * rr, 0.01 + i * 0.0003, Math.sin(a) * rr);
      pd.scale.setScalar(2 + Math.random() * R * 0.06);
      pd.updateMatrix();
      patches.setMatrixAt(i, pd.matrix);
      patches.setColorAt(i, ground.clone().offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.1));
    }
    island.add(patches);
    // 広場と道
    const plazaCol = ground.clone().lerp(new THREE.Color('#f4ead0'), 0.45);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(geo.plazaR, 40), new THREE.MeshLambertMaterial({ color: plazaCol }));
    plaza.receiveShadow = true;
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.06;
    island.add(plaza);
    const roadMat = new THREE.MeshLambertMaterial({ color: plazaCol.clone().multiplyScalar(0.92) });
    for (const p of Object.values(geo.portals)) {
      const len = Math.hypot(p.x, p.z) - geo.plazaR;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len), roadMat);
      road.receiveShadow = true;
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

    // 家 (動かないものは staticRoot に集めて、最後に1つにまとめる)
    const staticRoot = new THREE.Group();
    for (const id of w.residents) {
      const c = model.charById.get(id);
      const h = geo.homes[id];
      const house = buildHouse(colorOf(c.colors[0], '#cccccc'), colorOf(c.colors[1] || c.colors[0], '#c0503a') === 'rainbow' ? '#c080ff' : colorOf(c.colors[1] || c.colors[0], '#c0503a'));
      // 家は住人の立ち位置より少し外側に置き、玄関を広場に向ける
      const k = 1 + 2.8 / Math.max(1, Math.hypot(h.x, h.z));
      house.position.set(h.x * k, 0, h.z * k);
      house.rotation.y = Math.atan2(-h.x, -h.z);
      staticRoot.add(house);
    }
    for (const wp of geo.works) {
      const b = buildWorkplace(th.ground);
      b.position.set(wp.x, 0, wp.z);
      b.rotation.y = Math.atan2(-wp.x, -wp.z);
      staticRoot.add(b);
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
      if (o.userData.spin || o.userData.float || o.userData.flicker || o.userData.sway || o.userData.pulse) {
        this.scene.add(o);
        this.animated.push(o);
      } else staticRoot.add(o);
    }
    this.scene.add(batchStatic(staticRoot));

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
      const n = Math.round(Math.min(900, R * 5) * (GFX_STARS[gfx()] ?? 1));
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
    this.floats = [];
    this.monObjs = new Map();
    this.raidObjs = new Map();
    this.eventObjs = new Map();
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

  charPoint(c) {
    const tr = this.app.sim.transitOf(c);
    const p = tr && this.flightPos(tr);
    if (p) return { x: p.x, y: p.y + 1.5, z: p.z };
    return { x: c.x, y: 0, z: c.z };
  }
  // キャラを外側から島の中心に向かって見る構図で映す
  frameChar(c, dist = 24) {
    const p = this.charPoint(c);
    const len = Math.hypot(p.x, p.z);
    const dx = len > 1 ? p.x / len : 0, dz = len > 1 ? p.z / len : 1;
    this.controls.target.set(p.x, p.y, p.z);
    this.camera.position.set(p.x + dx * dist * 0.85, p.y + dist * 0.45, p.z + dz * dist * 0.85);
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
      pick: true, sp, sh, nl, bl, tex, last: '', bubLast: '', phase: Math.random() * 10, emoteN: c.emote?.n, hitT: Math.random(),
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
      if (!this.app.isShowing(this.app.viewFor(sel))) { this.app.goToChar(sel, true); return; }
      // 飛んでいる間はぴったり、歩いている間はなめらかに追う
      const p = this.charPoint(sel);
      const k = sim.transitOf(sel) ? 1 : Math.min(1, dt * 4);
      const tgt = this.controls.target;
      const delta = new THREE.Vector3((p.x - tgt.x) * k, (p.y - tgt.y) * k, (p.z - tgt.z) * k);
      tgt.add(delta);
      this.camera.position.add(delta);
    }
    super.update(dt);

    // 昼夜
    const h = sim.hour;
    const day = daylight(h);
    const dusk = Math.max(0, 1 - Math.abs(h - 18.3) / 1.4) * 0.5 + Math.max(0, 1 - Math.abs(h - 5.8) / 1) * 0.3;
    const sky = this.skyNight.clone().lerp(this.skyDay, day).lerp(new THREE.Color('#ff8a5a'), dusk * 0.5);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    if (this.sky) {
      const u = this.sky.u;
      const white = new THREE.Color('#ffffff');
      u.top.value.copy(sky).offsetHSL(0, 0.12 * day, -0.1 * day).multiplyScalar(0.8 + 0.2 * day);
      u.horizon.value.copy(sky).lerp(white, 0.38 * day).lerp(new THREE.Color('#ffb080'), dusk * 0.45);
      u.bottom.value.copy(u.horizon.value).lerp(this.groundCol, 0.12).multiplyScalar(0.85 + 0.15 * day);
      this.scene.fog.color.copy(u.horizon.value);
      u.night.value = 1 - day;
      u.sunCol.value.set(day > 0.3 ? '#fff0d8' : '#c8d8ff').lerp(new THREE.Color('#ff9a5a'), dusk).multiplyScalar(day > 0.3 ? 1 : 0.55);
      const cc = new THREE.Color('#ffffff').lerp(new THREE.Color('#ffb48a'), dusk).lerp(this.skyNight.clone().multiplyScalar(2.2), 1 - day);
      for (const s of this.clouds.children) s.material.color.copy(cc);
      this.clouds.rotation.y += dt * 0.006;
    }
    for (const r of this.rocks) r.m.position.y = r.y + Math.sin(this.elapsed * 0.5 + r.p) * r.s * 0.25;
    // 環境光を控えめにして、太陽の光と影で立体感を出す
    this.hemi.intensity = 0.42 + 0.48 * day;
    this.sun.intensity = 0.3 + 2.3 * day;
    this.sun.color.set(day > 0.3 ? '#fff4e2' : '#8aa0ff').lerp(new THREE.Color('#ff9a5a'), dusk * 0.8);
    const a = ((h - 6) / 24) * Math.PI * 2;
    this.sun.position.set(Math.cos(a) * this.bound * 1.6, (Math.abs(Math.sin(a)) * this.bound + 20) * 1.6, this.bound * 0.5);
    if (this.sky) this.sky.u.sunDir.value.copy(this.sun.position).normalize();
    // 影は重いので、ときどきだけ描き直す (太陽はゆっくりしか動かない)
    if (this.sun.castShadow && (this.shadowT -= dt) <= 0) { this.shadowT = 1.5; this.app.renderer.shadowMap.needsUpdate = true; }
    this.bursts.update(dt);

    // 動く小物
    const t = this.elapsed;
    for (const o of this.animated) {
      const u = o.userData;
      if (u.spin) u.spin.rotation[u.spinAxis || 'y'] += dt * (u.spinAxis ? -0.5 : 0.8);
      if (u.float) o.children[0].position.y = (o.children[0].userData.baseY ??= o.children[0].position.y) + Math.sin(t * 1.2 + (u.phase || 0)) * u.float;
      if (u.sway) o.rotation.z = Math.sin(t * 1.5 + (u.phase || 0)) * 0.08;
      if (u.flicker) o.scale.y = (u.baseS ??= o.scale.y) * (1 + Math.sin(t * 13 + (u.phase || 0)) * 0.08);
      if (u.pulse) o.scale.x = o.scale.z = (u.baseS ??= o.scale.x) * (1 + Math.max(0, Math.sin(t * 6 + (u.phase || 0))) * 0.04);
      if (u.portalDisc) u.portalDisc.material.uniforms.time.value = t;
    }
    if (this.particles) this.updateParticles(dt, t);

    // キャラクター
    const here = new Set();
    for (const c of this.app.model.chars) {
      // この世界線を出発した・この世界線に向かっているキャラは空を飛んでいる姿を見せる
      const fly = c.transit ? this.flightPos(c.transit) : null;
      if (c.world !== this.worldId && !fly) continue;
      here.add(c.id);
      let o = this.charObjs.get(c.id);
      if (!o) { o = this.makeCharObj(c); this.charObjs.set(c.id, o); }
      const u = o.userData;
      u.sh.visible = !fly;
      u.fidMoving = false;
      if (fly) o.position.copy(fly);
      else {
        o.position.y = 0;
        // 何かをしている最中も、その場で少しうろうろする (見た目だけ。同期はしない)
        const still = !c.walking && c.state === 'ok' && !c.partyLeader && !c.transit && !STAY_KINDS.has(c.act.kind);
        if (!still) u.fid = null;
        else if ((u.fidT = (u.fidT ?? Math.random() * 4) - dt) < 0) {
          u.fidT = 3 + Math.random() * 8;
          const a = Math.random() * Math.PI * 2, r = Math.random() < 0.3 ? 0 : 0.6 + Math.random() * 1.8;
          u.fid = { x: Math.cos(a) * r, z: Math.sin(a) * r };
        }
        const tx = c.x + (u.fid?.x || 0), tz = c.z + (u.fid?.z || 0);
        const dx = tx - o.position.x, dz = tz - o.position.z, d2 = dx * dx + dz * dz;
        if (d2 > 400) o.position.set(tx, 0, tz);
        else if (still) {
          const d = Math.sqrt(d2), s = Math.min(d, dt * 1.4);
          if (d > 0.02) { o.position.x += (dx / d) * s; o.position.z += (dz / d) * s; u.fidMoving = d > 0.08; }
        } else { o.position.x += dx * Math.min(1, dt * 8); o.position.z += dz * Math.min(1, dt * 8); }
        // ときどき、していることに合わせた絵文字を浮かべる
        if (still && (u.ambT = (u.ambT ?? 5 + Math.random() * 25) - dt) < 0) {
          u.ambT = 15 + Math.random() * 30;
          const em = AMBIENT[c.act.cat];
          if (em && this.camera.position.distanceTo(o.position) < 70) this.floatText(o, em[Math.floor(Math.random() * em.length)], 3.2 + (c.rank - 1) * 0.12 + 1.4, 'emote', true);
        }
      }
      const H = 3.2 + (c.rank - 1) * 0.12;
      const W = H * (u.tex.ready ? u.tex.aspect : 1) * (c.img ? 1 : 0.92);
      const down = c.state === 'down', lying = down || c.state === 'camp' || c.state === 'sleep';
      u.sp.material.rotation = lying ? Math.PI / 2 : c.walking || u.fidMoving ? Math.sin(t * 9 + u.phase) * 0.05 : 0;
      u.sp.scale.set(c.img ? W : H * 0.92, c.img ? H : H * 0.92, 1);
      const bob = c.walking || u.fidMoving ? Math.abs(Math.sin(t * 9 + u.phase)) * 0.35 : Math.sin(t * 2 + u.phase) * 0.04 + 0.04;
      u.sp.position.y = (lying ? Math.min(W, H) * 0.5 * 0.9 : (c.img ? H : H * 0.92) / 2) + bob;
      u.sp.material.color.set(sleepTint(c));
      u.sp.material.opacity = down ? 0.75 : 1;
      if (c.act.kind === 'fight') u.sp.position.x = Math.sin(t * 30) * 0.12;
      else u.sp.position.x = 0;
      u.nl.position.y = (lying ? H * 0.55 : H) + 0.7;
      const camD = this.camera.position.distanceTo(o.position);
      u.nl.visible = (settings.names && camD < 110) || c.id === this.app.selected || o === this.hovered;
      const d = sim.displayAct(c);
      const visitor = c.home !== this.worldId;
      const html = `<i style="background:${CATS[d.cat]?.color || '#999'}">${d.icon}</i>${visitor ? '🧳' : ''}${sim.isBirthday(c) ? '🎂' : ''}${escapeHtml(c.name)}`;
      if (html !== u.last) { o.userData.nl.element.innerHTML = html; u.last = html; }
      if (c.bubble && camD < 160) {
        u.bl.visible = true;
        u.bl.position.y = H + 2.2;
        if (u.bubLast !== c.bubble.text) {
          u.bl.element.textContent = c.bubble.text;
          u.bubLast = c.bubble.text;
          if (camD < 70) this.app.sound.play('talk');
        }
      } else u.bl.visible = false;
      // リアクションの絵文字・戦闘のダメージ表示
      if (c.emote && c.emote.n !== u.emoteN) {
        u.emoteN = c.emote.n;
        if (camD < 140) this.floatText(o, c.emote.e, H + 1.4, 'emote');
      }
      const raidFight = c.act.kind === 'raid' && !c.walking && sim.raids.some((r) => r.id === c.act.data && r.phase === 'fight');
      const fighting = c.act.kind === 'fight' || raidFight || (c.act.kind === 'defend' && c.act.fightUntil);
      if (fighting && camD < 140 && (u.hitT -= dt) < 0) {
        u.hitT = 0.45 + Math.random() * 0.5;
        this.floatText(o, `💥${Math.round(30 + Math.random() * (raidFight ? 900 : 300))}`, H * 0.8, 'hit');
        this.bursts.burst(o.position.x, H * 0.6, o.position.z, { n: 9, speed: 8, colors: ['#ffd27a', '#ff7a3a'], size: 0.32, life: 0.4, g: 5, hdr: 2.2 });
      }
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

    this.floats = this.floats.filter((f) => {
      f.life -= dt;
      if (f.life > 0) return true;
      if (f.lb.element.parentNode) f.lb.element.parentNode.removeChild(f.lb.element);
      f.parent.remove(f.lb);
      return false;
    });

    // 選択リング
    const so = sel && this.charObjs.get(sel.id);
    this.selRing.visible = !!so && !sim.transitOf(sel);
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
        o = buildMonster(m.boss, TYPE_COLOR[m.type?.[0]]);
        o.position.set(m.x, 0, m.z);
        const lb = label(`${m.type?.[0] ? m.type[0] + 'の' : ''}${m.horde ? '大群' : m.boss ? '大魔物' : '魔物'} ${m.power}`, 'mon-label');
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
    for (const id of [...this.monObjs.keys()]) {
      if (alive.has(id)) continue;
      const p = this.monObjs.get(id).position;
      this.bursts.burst(p.x, 1.2, p.z, { n: 26, speed: 10, colors: ['#b070ff', '#ff5a8a', '#ffffff'], size: 0.5, life: 0.7, g: 2, hdr: 2 });
      this.removeObj(this.monObjs, id);
    }

    // レイドボス
    const raids = new Set();
    for (const r of sim.raids) {
      if (r.world !== this.worldId) continue;
      raids.add(r.id);
      let o = this.raidObjs.get(r.id);
      if (!o) {
        o = buildRaidBoss();
        o.position.set(r.x, 0, r.z);
        const lb = label('', 'raid-label');
        lb.position.y = 4.8;
        o.add(lb);
        o.userData.lb = lb;
        o.userData.last = '';
        this.scene.add(o);
        this.raidObjs.set(r.id, o);
      }
      const u = o.userData;
      const fight = r.phase === 'fight';
      u.body.position.y = 2 + Math.sin(t * 2) * 0.25;
      u.body.rotation.y += dt * (fight ? 3 : 0.4);
      u.body.position.x = fight ? Math.sin(t * 25) * 0.15 : 0;
      u.aura.scale.setScalar(1 + Math.sin(t * (fight ? 10 : 3)) * 0.12);
      u.aura.material.opacity = fight ? 0.5 + Math.sin(t * 12) * 0.3 : 0.55;
      if (fight && (u.hitT = (u.hitT ?? 0) - dt) < 0) {
        u.hitT = 0.18 + Math.random() * 0.2;
        this.floatText(o, `-${Math.round(200 + Math.random() * 1800)}`, 2.6 + Math.random() * 1.5, 'boss');
      }
      const n = sim.raidFighters(r).length;
      const left = Math.max(0, Math.ceil(r.until - sim.t));
      const html = `<b>🐉 レイドボス「${escapeHtml(r.name)}」</b><span>${r.type ? `${escapeHtml(r.type[0])}タイプ ・ ` : ''}戦闘力 ${r.power} ・ 集まった戦力 ${Math.round(sim.raidPower(r))}（${n}組）</span>`
        + `<i>${fight ? '⚔️ 激闘中！' : `集合中… あと${left}分で開戦`}</i>`;
      if (html !== u.last) { u.lb.inner.innerHTML = html; u.last = html; }
    }
    for (const id of [...this.raidObjs.keys()]) if (!raids.has(id)) this.removeObj(this.raidObjs, id);

    // 防衛戦の状況表示と、宝の眠る場所の目印
    const evs = new Set();
    const hd = sim.hordeAt(this.worldId);
    if (hd) {
      const key = 'h' + hd.id;
      evs.add(key);
      let o = this.eventObjs.get(key);
      if (!o) {
        o = new THREE.Group();
        const lb = label('', 'raid-label horde-label');
        lb.position.y = 16;
        o.add(lb);
        o.userData = { lb, last: '' };
        this.scene.add(o);
        this.eventObjs.set(key, o);
      }
      const hearts = '❤️'.repeat(Math.max(0, hd.hp)) + '🖤'.repeat(Math.max(0, hd.maxHp - hd.hp));
      const html = `<b>🛡️ 防衛戦！ ${hd.type ? escapeHtml(hd.type[0]) + 'タイプの' : ''}魔物の大群が迫っている</b><span>撃破 ${hd.killed} / ${hd.size}体 ・ 守っている ${sim.charsIn(this.worldId).filter((c) => c.act.kind === 'defend').length}人</span><i>町の耐久 ${hearts}</i>`;
      if (html !== o.userData.last) { o.userData.lb.inner.innerHTML = html; o.userData.last = html; }
    }
    for (const r of sim.races) {
      if (r.world !== this.worldId) continue;
      const key = 'r' + r.id;
      evs.add(key);
      let o = this.eventObjs.get(key);
      if (!o) {
        o = buildTreasureMark();
        o.position.set(r.x, 0, r.z);
        const lb = label('', 'raid-label race-label');
        lb.position.y = 6;
        o.add(lb);
        o.userData = { lb, last: '' };
        this.scene.add(o);
        this.eventObjs.set(key, o);
      }
      const here = r.racers.filter((id) => this.app.model.charById.get(id).world === r.world).length;
      const html = `<b>🗺️ 「${escapeHtml(r.item)}」が眠る場所</b><span>挑戦者 ${r.racers.length}人（到着 ${here}人）</span>`;
      if (html !== o.userData.last) { o.userData.lb.inner.innerHTML = html; o.userData.last = html; }
    }
    // 誕生日パーティーのケーキ、勢力の旗
    const fest = (key, x, z, build, ly, cls) => {
      evs.add(key);
      let o = this.eventObjs.get(key);
      if (!o) {
        o = build();
        o.position.set(x, 0, z);
        const lb = label('', `raid-label fest-label ${cls}`);
        lb.position.y = ly;
        o.add(lb);
        o.userData.lb = lb;
        o.userData.last = '';
        this.scene.add(o);
        this.eventObjs.set(key, o);
      }
      return o;
    };
    const setHtml = (o, html) => { if (html !== o.userData.last) { o.userData.lb.inner.innerHTML = html; o.userData.last = html; } };
    const fcolor = (name) => `hsl(${hashStr(name) % 360}, 70%, 55%)`;
    const names = (ids) => ids.map((id) => escapeHtml(this.app.model.charById.get(id).name)).join('・');
    for (const p of sim.parties) {
      if (p.world !== this.worldId) continue;
      const o = fest('p' + p.id, p.x, p.z, buildCake, 8, '');
      o.userData.balloons.position.y = Math.sin(t * 1.5 + p.id) * 0.3;
      o.userData.balloons.rotation.y += dt * 0.2;
      setHtml(o, `<b>🎂 ${names(p.hosts)}の誕生日パーティー</b><span>お祝いに来た人 ${p.guests.length}人</span>`);
    }
    for (const m of sim.meets) {
      if (!m.started || m.world !== this.worldId) continue;
      const o = fest('m' + m.id, m.x, m.z - 4, () => buildFlag(fcolor(m.faction)), 8, '');
      o.userData.cloth.rotation.y = Math.sin(t * 2 + m.id) * 0.25;
      setHtml(o, `<b>${m.kind === 'drill' ? '🎖️' : '📯'} 「${escapeHtml(m.faction)}」の${m.kind === 'drill' ? '合同訓練' : m.kind === 'market' ? '商談会' : '集会'}</b><span>${m.members.length}人参加</span>`);
    }
    for (const c of sim.contests) {
      if (!c.started || c.world !== this.worldId) continue;
      const o = fest('c' + c.id, c.x, c.z, () => {
        const g = new THREE.Group();
        const a = buildFlag('#e8483a'), b = buildFlag('#3a78e8');
        a.position.set(-7, 0, 0); b.position.set(7, 0, 0); b.rotation.y = Math.PI;
        g.add(a, b);
        g.userData.flags = [a, b];
        return g;
      }, 8, '');
      o.userData.flags.forEach((f, i) => { f.userData.cloth.rotation.y = Math.sin(t * 3 + i) * 0.3; });
      const left = Math.max(0, Math.ceil(c.until - sim.t));
      setHtml(o, `<b>🚩 勢力対抗「${escapeHtml(c.game)}」</b><span><em class="tm-a">「${escapeHtml(c.a)}」</em>vs<em class="tm-b">「${escapeHtml(c.b)}」</em></span><i>決着まであと${left}分</i>`);
    }
    for (const key of [...this.eventObjs.keys()]) if (!evs.has(key)) this.removeObj(this.eventObjs, key);

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
      // 足もとに広がる光の輪と、舞い上がる光の粒
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(big ? '#e8d0ff' : '#fff6a0').multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.x, 0.3, e.z);
      this.scene.add(ring);
      this.fx.push({ m: ring, life: 1.1, max: 1.1, grow: big ? 26 : 13 });
      this.bursts.burst(e.x, 2, e.z, { n: big ? 90 : 40, speed: big ? 16 : 9, up: 7, colors: big ? ['#e8d0ff', '#9ac8ff'] : ['#fff6a0', '#ffffff'], size: 0.42, life: 1.1, g: -1, hdr: 2.2 });
    }
    this.fx = this.fx.filter((f) => {
      f.life -= dt;
      f.m.material.opacity = Math.max(0, f.life / f.max) * 0.7;
      if (f.grow) f.m.scale.setScalar(1 + (1 - f.life / f.max) * f.grow);
      if (f.life <= 0) { this.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; }
      return true;
    });
  }

  // 出発: ポータルから外へ向かって空に上がっていく / 到着: 空から降りてきてポータルに着く
  // ゲートから飛び立つ (最初の15秒) / 空から降りてくる (最後の15秒) 姿。それ以外の間はこの世界線にはいない
  flightPos(tr) {
    const { sim } = this.app;
    const { stage, f } = sim.transitStage(tr);
    const leaving = stage === 'up' && tr.from === this.worldId;
    if (!leaving && !(stage === 'down' && tr.to === this.worldId)) return null;
    const d = leaving ? f : 1 - f;
    let base;
    if (tr.kind === 'line') {
      const p = this.world.geo.portals[leaving ? tr.to : tr.from] || { x: 0, z: 0 };
      base = leaving ? p : { x: p.x * 0.92, z: p.z * 0.92 };
    } else base = leaving ? { x: tr.sx ?? 0, z: tr.sz ?? 0 } : { x: tr.tx ?? 0, z: tr.tz ?? 0 };
    const len = Math.hypot(base.x, base.z) || 1;
    const out = tr.kind === 'line' ? this.bound * 0.3 * d : 0;
    const up = tr.kind === 'line' ? 30 * d + 170 * d * d : 60 * d + 300 * d * d;
    return new THREE.Vector3(base.x + (base.x / len) * out, up, base.z + (base.z / len) * out);
  }

  // シミュレーションの大きな出来事に合わせた演出
  onSimEvent(e) {
    if (e.world !== this.worldId) return;
    const c = this.app.model.charById.get(e.ids?.[0]);
    const here = c && c.world === this.worldId;
    const x = here ? c.x : 0, z = here ? c.z : 0;
    const t = e.text, B = this.bursts, S = this.app.sound;
    const camD = this.camera.position.distanceTo(new THREE.Vector3(x, 0, z));
    const vol = clamp(1.3 - camD / (this.bound * 1.6), 0.25, 1);
    const fireworks = (n) => {
      const cols = ['#ff5a7a', '#ffd84a', '#5ad0ff', '#7ae08a', '#c88aff', '#ff9a4a'];
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (this.app.view !== this) return;
          B.firework(x + (Math.random() - 0.5) * 34, z + (Math.random() - 0.5) * 34, 34 + Math.random() * 26, cols[Math.floor(Math.random() * cols.length)]);
          S.play('firework', { vol });
        }, i * 650 + Math.random() * 300);
      }
    };
    if (t.startsWith('🎂') && t.includes('パーティー')) { B.confetti(x, 14, z, 12, 120); S.play('party', { vol }); }
    else if (t.startsWith('🎉')) { B.confetti(x, 14, z, 14, 160); fireworks(3); }
    else if (t.startsWith('🏅')) { B.confetti(x, 14, z, 16, 200); fireworks(3); }
    else if (t.startsWith('🏆')) { fireworks(7); this.app.shake = 1; }
    else if (t.startsWith('🎊')) { B.confetti(0, 18, 0, this.bound * 0.4, 260); fireworks(5); }
    else if (t.startsWith('🐉') || t.startsWith('💥') || t.startsWith('🏚️')) this.app.shake = 1.4;
    else if (t.startsWith('🔥')) this.app.shake = 0.7;
    else if (t.startsWith('💰') || t.startsWith('💎')) B.burst(x, 3, z, { n: 90, speed: 14, up: 6, colors: ['#ffe27a', '#ffffff'], size: 0.5, life: 1.3, g: 7, hdr: 2.6 });
    else if (t.startsWith('💕')) B.burst(x, 3, z, { n: 40, speed: 6, up: 5, colors: ['#ff7ab0', '#ffb0d0'], size: 0.55, life: 1.3, g: 1, hdr: 1.8 });
  }

  floatText(parent, text, y, cls, silent = false) {
    if (this.floats.length > 120) return;
    if (!silent) {
      // 遠いほど小さく、画面の左右に合わせて聞こえる
      const p = parent.getWorldPosition(new THREE.Vector3());
      const d = this.camera.position.distanceTo(p);
      const v = p.clone().project(this.camera);
      this.app.sound.play(cls === 'emote' ? 'pop' : cls, { vol: clamp(1.15 - d / 150, 0, 1), pan: clamp(v.x, -1, 1) * 0.6 });
    }
    const lb = label(escapeHtml(text), `float-${cls}`);
    lb.position.set((Math.random() - 0.5) * 1.6, y, (Math.random() - 0.5) * 0.6);
    parent.add(lb);
    this.floats.push({ lb, parent, life: cls === 'hit' ? 1.1 : 1.8 });
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
