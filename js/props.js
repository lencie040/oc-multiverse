// ローポリの構造物・自然物
import * as THREE from 'three';
import { FONT } from './util.js?v=25';

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  ball: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  torus: new THREE.TorusGeometry(0.5, 0.14, 8, 20),
  hook: new THREE.TorusGeometry(0.5, 0.17, 8, 12, Math.PI),
  thinTorus: new THREE.TorusGeometry(0.5, 0.06, 6, 28),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  knot: new THREE.TorusKnotGeometry(0.4, 0.12, 64, 8),
  plane: new THREE.PlaneGeometry(1, 1),
  heart: (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.1, -0.35, -0.55, -0.1, -0.5, 0.18);
    s.bezierCurveTo(-0.45, 0.48, -0.08, 0.5, 0, 0.25);
    s.bezierCurveTo(0.08, 0.5, 0.45, 0.48, 0.5, 0.18);
    s.bezierCurveTo(0.55, -0.1, 0.1, -0.35, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
    g.center();
    return g;
  })(),
  star: (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.22 : 0.5, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false });
    g.center();
    return g;
  })(),
  drop: (() => {
    const pts = [];
    // しずく型: 上がとがり下が丸い
    for (let i = 0; i <= 16; i++) {
      const t = (i / 16) * Math.PI;
      pts.push(new THREE.Vector2(0.5 * Math.sin(t) * Math.sin(t / 2), 0.5 * Math.cos(t)));
    }
    return new THREE.LatheGeometry(pts.reverse(), 12);
  })(),
  spiral: (() => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      pts.push(new THREE.Vector3(Math.cos(t * 18) * (0.5 - t * 0.3), t * 3, Math.sin(t * 18) * (0.5 - t * 0.3)));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.08, 6);
  })(),
};

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: true, ...opts });
    matCache.set(key, m);
  }
  return matCache.get(key);
}
const glow = (color, k = 0.9) => mat(color, { emissive: color, emissiveIntensity: k });

function mesh(geo, material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

const textCache = new Map();
function textTexture(ch, fg = '#222', bg = '#fff') {
  const key = ch + fg + bg;
  if (textCache.has(key)) return textCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 122, 122);
  ctx.fillStyle = fg; ctx.font = `800 84px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  textCache.set(key, t);
  return t;
}

const PALETTE = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45', '#ff8fab', '#5ee7df'];
const KANA = '数式字文言書音心夢星月火水木金土天地光闇風雪花鳥';

// 種類ごとの組み立て。r: 0-1 の乱数 (props ごとに固定)
const BUILD = {
  tree(c = '#4f9d4a', r) {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#7a5232'), 0, 0.9, 0, 0.35, 1.8, 0.35));
    g.add(mesh(G.sphere, mat(c), 0, 2.6, 0, 2.4));
    if (r > 0.5) g.add(mesh(G.sphere, mat(c), 0.6, 2.1, 0.3, 1.5));
    return g;
  },
  fruittree(c = '#ff9a2e', r) {
    const g = BUILD.tree('#4d8f3a', r);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + r * 6;
      g.add(mesh(G.ball, mat(c), Math.cos(a) * 1.1, 2.3 + (i % 3) * 0.4, Math.sin(a) * 1.1, 0.35));
    }
    return g;
  },
  bigtree(c = '#3e8e3a', r) {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#6a4528'), 0, 2, 0, 1, 4, 1));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      g.add(mesh(G.sphere, mat(c), Math.cos(a) * 1.4, 4.6 + (i % 2), Math.sin(a) * 1.4, 3.2));
    }
    return g;
  },
  pine(c = '#2f7a46') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#6a4a2a'), 0, 0.5, 0, 0.3, 1, 0.3));
    g.add(mesh(G.cone, mat(c), 0, 1.8, 0, 2, 2));
    g.add(mesh(G.cone, mat(c), 0, 2.8, 0, 1.5, 1.6));
    return g;
  },
  palm(c = '#3faa4a', r) {
    const g = new THREE.Group();
    const trunk = mesh(G.cyl6, mat('#9c7a4a'), 0, 1.6, 0, 0.28, 3.2, 0.28);
    trunk.rotation.z = 0.15;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(G.cone4, mat(c), 0, 3.2, 0, 0.5, 2.2, 0.15);
      leaf.rotation.set(Math.PI / 2.4, (i / 6) * Math.PI * 2 + r, 0, 'YXZ');
      leaf.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.6 + 0.25, 3.1, Math.sin((i / 6) * Math.PI * 2) * 0.6);
      g.add(leaf);
    }
    return g;
  },
  bamboo(c = '#6fbf4a', r) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(mesh(G.cyl6, mat(c), Math.cos(i * 2 + r) * 0.6, 2.5, Math.sin(i * 2 + r) * 0.6, 0.18, 5 + i * 0.4, 0.18));
    return g;
  },
  bush(c = '#5aa94a') {
    const g = new THREE.Group();
    g.add(mesh(G.sphere, mat(c), 0, 0.4, 0, 1.2, 0.9, 1.2));
    g.add(mesh(G.sphere, mat(c), 0.5, 0.3, 0.2, 0.8));
    return g;
  },
  flower(c, r) {
    const col = c || PALETTE[Math.floor(r * PALETTE.length)];
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#4a9a3a'), 0, 0.5, 0, 0.08, 1, 0.08));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(G.ball, mat(col), Math.cos(a) * 0.25, 1.05, Math.sin(a) * 0.25, 0.28));
    }
    g.add(mesh(G.ball, mat('#ffe066'), 0, 1.1, 0, 0.22));
    g.scale.setScalar(1.3);
    return g;
  },
  rock(c = '#8a8a8a') { return mesh(G.dodeca, mat(c), 0, 0.5, 0, 1.6, 1.1, 1.3); },
  crystal(c = '#9fe3ff', r) {
    const g = new THREE.Group();
    const m = mat(c, { emissive: c, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.1 });
    for (let i = 0; i < 3; i++) {
      const cr = mesh(G.octa, m, (i - 1) * 0.5, 1 + i * 0.2, (r - 0.5) * i, 0.7, 2 + i * 0.6, 0.7);
      cr.rotation.z = (i - 1) * 0.3;
      g.add(cr);
    }
    return g;
  },
  icespike(c = '#cdeeff') {
    const g = new THREE.Group();
    const m = mat(c, { roughness: 0.15, emissive: '#88ccff', emissiveIntensity: 0.15 });
    g.add(mesh(G.cone, m, 0, 1.6, 0, 1.2, 3.2));
    g.add(mesh(G.cone, m, 0.8, 1, 0.3, 0.7, 2));
    return g;
  },
  pillar(c = '#e8e0cc', r) {
    const g = new THREE.Group();
    const h = r > 0.4 ? 4 : 2.2;
    g.add(mesh(G.cyl, mat(c), 0, h / 2, 0, 0.7, h, 0.7));
    g.add(mesh(G.box, mat(c), 0, h + 0.15, 0, 1.1, 0.3, 1.1));
    return g;
  },
  ruin(c = '#b8a888', r) {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 0.8, 0, 3, 1.6, 0.6));
    g.add(mesh(G.box, mat(c), -1, 2, 0, 1, 1, 0.6));
    const b = mesh(G.box, mat(c), 1.6, 0.25, 1, 0.8, 0.5, 0.8);
    b.rotation.y = r * 3;
    g.add(b);
    return g;
  },
  pyramid(c = '#d8b878') { return mesh(G.cone4, mat(c), 0, 2.5, 0, 6, 5, 6); },
  obelisk(c = '#6a6a7a') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 3, 0, 1.2, 6, 1.2));
    g.add(mesh(G.cone4, mat(c), 0, 6.5, 0, 1.7, 1, 1.7));
    return g;
  },
  torii(c = '#d8442a') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl, mat(c), -1.6, 2, 0, 0.35, 4, 0.35));
    g.add(mesh(G.cyl, mat(c), 1.6, 2, 0, 0.35, 4, 0.35));
    g.add(mesh(G.box, mat(c), 0, 4.1, 0, 4.6, 0.35, 0.45));
    g.add(mesh(G.box, mat(c), 0, 3.3, 0, 3.6, 0.25, 0.3));
    return g;
  },
  temple(c = '#f4efe2') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 0.25, 0, 6, 0.5, 4));
    for (let i = 0; i < 4; i++) for (const z of [-1.5, 1.5]) g.add(mesh(G.cyl, mat(c), -2.2 + i * 1.47, 2, z, 0.45, 3, 0.45));
    const roof = mesh(G.cone4, mat(c), 0, 4.2, 0, 4.8, 1.3, 3.4);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(4.6, 1.3, 3.2);
    g.add(roof);
    return g;
  },
  castle(c = '#ffd6ec') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 2, 0, 5, 4, 5));
    for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
      g.add(mesh(G.cyl, mat(c), x, 3, z, 1.4, 6, 1.4));
      g.add(mesh(G.cone, mat('#ff7ab8'), x, 6.8, z, 1.8, 1.8));
    }
    g.add(mesh(G.cyl, mat(c), 0, 5.5, 0, 2, 3, 2));
    g.add(mesh(G.cone, mat('#ff7ab8'), 0, 8, 0, 2.6, 2.2));
    return g;
  },
  tomb(c = '#8a8f99') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 0.7, 0, 0.9, 1.4, 0.3));
    g.add(mesh(G.cyl, mat(c), 0, 1.4, 0, 0.9, 0.3, 0.9));
    g.children[1].rotation.x = Math.PI / 2;
    return g;
  },
  lantern(c = '#ffb84a') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#3a3a3a'), 0, 0.9, 0, 0.12, 1.8, 0.12));
    g.add(mesh(G.ball, glow(c, 1.2), 0, 2, 0, 0.6, 0.8, 0.6));
    return g;
  },
  lamp(c = '#fff1a8') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#444a55'), 0, 1.5, 0, 0.12, 3, 0.12));
    g.add(mesh(G.ball, glow(c, 1.4), 0, 3.1, 0, 0.45));
    return g;
  },
  cloud(c = '#ffffff', r) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(mesh(G.sphere, mat(c), (i - 1.5) * 0.9, 0, Math.sin(i * 2) * 0.4, 1.2 + (i % 2) * 0.5));
    g.position.y = 4 + r * 4;
    const wrap = new THREE.Group();
    wrap.add(g);
    wrap.userData.float = 0.6;
    return wrap;
  },
  lollipop(c, r) {
    const col = c || PALETTE[Math.floor(r * PALETTE.length)];
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#fafafa'), 0, 1.5, 0, 0.15, 3, 0.15));
    const disc = mesh(G.cyl, mat(col), 0, 3.4, 0, 2, 0.35, 2);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    const sw = mesh(G.thinTorus, mat('#ffffff'), 0, 3.4, 0.2, 1.2);
    g.add(sw);
    return g;
  },
  candycane() {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) g.add(mesh(G.cyl6, mat(i % 2 ? '#ffffff' : '#ff4a5a'), 0, 0.3 + i * 0.6, 0, 0.35, 0.6, 0.35));
    g.add(mesh(G.hook, mat('#ff4a5a'), 0.5, 3.6, 0, 1.0));
    return g;
  },
  cake(c = '#ffd0e0') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl, mat('#f6e3c8'), 0, 0.6, 0, 3, 1.2, 3));
    g.add(mesh(G.cyl, mat(c), 0, 1.3, 0, 3.1, 0.25, 3.1));
    g.add(mesh(G.cyl, mat('#f6e3c8'), 0, 1.9, 0, 2, 1, 2));
    g.add(mesh(G.cyl, mat(c), 0, 2.45, 0, 2.1, 0.2, 2.1));
    g.add(mesh(G.ball, mat('#ff3a4a'), 0, 2.8, 0, 0.5));
    return g;
  },
  donut(c, r) {
    const col = c || PALETTE[Math.floor(r * PALETTE.length)];
    const g = new THREE.Group();
    const d = mesh(G.torus, mat('#d8a060'), 0, 0.7, 0, 2.4, 2.4, 3.2);
    d.rotation.x = Math.PI / 2;
    g.add(d);
    const ic = mesh(G.torus, mat(col), 0, 0.85, 0, 2.3, 2.3, 1.8);
    ic.rotation.x = Math.PI / 2;
    g.add(ic);
    return g;
  },
  mushroom(c = '#e04a4a') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl, mat('#f4ecd8'), 0, 0.7, 0, 0.6, 1.4, 0.6));
    g.add(mesh(G.ball, mat(c), 0, 1.5, 0, 2.2, 1.2, 2.2));
    g.add(mesh(G.ball, mat('#ffffff'), 0.5, 1.9, 0.3, 0.35));
    return g;
  },
  volcano(c = '#5a2a1a') {
    const g = new THREE.Group();
    g.add(mesh(G.cone, mat(c), 0, 3, 0, 8, 6));
    g.add(mesh(G.cyl, glow('#ff6a1a', 1.5), 0, 5.6, 0, 1.6, 0.6, 1.6));
    return g;
  },
  lava(c = '#ff5a1a') { return mesh(G.cyl, glow(c, 1.2), 0, 0.06, 0, 4, 0.12, 3); },
  toxic(c = '#9be03a') { return mesh(G.cyl, glow(c, 0.7), 0, 0.06, 0, 3.5, 0.12, 2.6); },
  flame(c = '#ff8a2a') {
    const g = new THREE.Group();
    g.add(mesh(G.cone, glow(c, 1.4), 0, 0.9, 0, 1, 1.8));
    g.add(mesh(G.cone, glow('#ffe04a', 1.6), 0, 0.7, 0, 0.55, 1.1));
    g.userData.flicker = true;
    return g;
  },
  pond(c = '#3a9ad9') { return mesh(G.cyl, mat(c, { roughness: 0.1, metalness: 0.2 }), 0, 0.05, 0, 6, 0.1, 4.5); },
  coral(c = '#ff7a8a', r) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const b = mesh(G.cyl6, mat(c), Math.cos(i * 1.3) * 0.4, 0.9, Math.sin(i * 1.3) * 0.4, 0.25, 1.8 + r, 0.25);
      b.rotation.set(Math.cos(i) * 0.5, 0, Math.sin(i) * 0.5);
      g.add(b);
      g.add(mesh(G.ball, mat(c), b.position.x * 2.2, 1.9 + r * 0.5, b.position.z * 2.2, 0.4));
    }
    return g;
  },
  seaweed(c = '#2f9a6a') {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) g.add(mesh(G.cone4, mat(c), (i - 1) * 0.4, 1.2, 0, 0.3, 2.4 + i * 0.4, 0.1));
    g.userData.sway = true;
    return g;
  },
  gear(c = '#8a929c') {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const disc = mesh(G.cyl, mat(c, { metalness: 0.6, roughness: 0.4 }), 0, 0, 0, 3, 0.5, 3);
    disc.rotation.x = Math.PI / 2;
    inner.add(disc);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = mesh(G.box, mat(c, { metalness: 0.6, roughness: 0.4 }), Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0, 0.5, 0.5, 0.5);
      t.rotation.z = a;
      inner.add(t);
    }
    inner.position.y = 2.2;
    g.add(inner);
    g.userData.spin = inner;
    return g;
  },
  pipe(c = '#7a8088') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl, mat(c, { metalness: 0.5 }), 0, 1.5, 0, 0.6, 3, 0.6));
    const h = mesh(G.cyl, mat(c, { metalness: 0.5 }), 1, 2.8, 0, 0.6, 2, 0.6);
    h.rotation.z = Math.PI / 2;
    g.add(h);
    return g;
  },
  pole(c = '#222222') { return mesh(G.cyl6, mat(c), 0, 2.5, 0, 0.12, 5, 0.12); },
  books(c, r) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = mesh(G.box, mat(PALETTE[(i + Math.floor(r * 8)) % PALETTE.length]), 0, 0.2 + i * 0.4, 0, 1.6, 0.38, 1.1);
      b.rotation.y = (i * 0.37 + r) % 0.6;
      g.add(b);
    }
    return g;
  },
  paper(c = '#fffdf5', r) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = mesh(G.box, mat(c), 0, 1.5 + i * 0.9, 0, 1.4, 0.03, 1.9);
      p.rotation.set(0.3 * (i - 1), r * 6 + i, 0.2);
      g.add(p);
    }
    g.userData.float = 0.4;
    return g;
  },
  note(c = '#ffe04a') {
    const g = new THREE.Group();
    const m = glow(c, 0.4);
    const head = mesh(G.ball, m, 0, 1.5, 0, 0.9, 0.7, 0.7);
    head.rotation.z = 0.4;
    g.add(head);
    g.add(mesh(G.box, m, 0.38, 2.6, 0, 0.15, 2.2, 0.15));
    g.add(mesh(G.box, m, 0.7, 3.5, 0, 0.7, 0.2, 0.15));
    g.userData.float = 0.8;
    return g;
  },
  speaker(c = '#2a2a33') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 1.6, 0, 2, 3.2, 1.6));
    for (const y of [1, 2.3]) {
      const s = mesh(G.cyl, mat('#555566'), 0, y, 0.82, y === 1 ? 1.4 : 0.8, 0.1, y === 1 ? 1.4 : 0.8);
      s.rotation.x = Math.PI / 2;
      g.add(s);
    }
    g.userData.pulse = true;
    return g;
  },
  numblock(c, r) {
    const ch = String(Math.floor(r * 10));
    const m = new THREE.MeshStandardMaterial({ map: textTexture(ch, '#2a2a6a', '#ffffff'), roughness: 0.7 });
    const b = mesh(G.box, m, 0, 0.9, 0, 1.8);
    b.rotation.y = r * 3;
    return b;
  },
  letterblock(c, r) {
    const ch = KANA[Math.floor(r * KANA.length)];
    const m = new THREE.MeshStandardMaterial({ map: textTexture(ch, '#222222', '#fff7e0'), roughness: 0.7 });
    const b = mesh(G.box, m, 0, 0.9, 0, 1.8);
    b.rotation.y = r * 3;
    return b;
  },
  crate(c = '#b8864a') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 0.7, 0, 1.4));
    g.add(mesh(G.box, mat(c), 0.3, 1.9, 0.1, 1, 1, 1));
    return g;
  },
  windmill(c = '#f4f0e8') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat(c), 0, 2.5, 0, 1.4, 5, 1.4));
    g.add(mesh(G.cone, mat('#c0503a'), 0, 5.5, 0, 2, 1.4));
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = mesh(G.box, mat('#fffaf0'), 0, 1.4, 0, 0.5, 2.8, 0.05);
      const arm = new THREE.Group();
      arm.add(b);
      arm.rotation.z = (i * Math.PI) / 2;
      blades.add(arm);
    }
    blades.position.set(0, 4.6, 0.85);
    g.add(blades);
    g.userData.spin = blades;
    return g;
  },
  heart(c = '#ff5a8a') {
    const h = mesh(G.heart, mat(c, { emissive: c, emissiveIntensity: 0.25 }), 0, 1.6, 0, 2.2);
    const g = new THREE.Group();
    g.add(h);
    g.add(mesh(G.cyl6, mat('#ffffff'), 0, 0.3, 0, 0.12, 0.6, 0.12));
    g.userData.float = 0.3;
    return g;
  },
  mirror(c = '#d8ecf6') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat('#c0a060', { metalness: 0.6 }), 0, 1.8, 0, 2.2, 3.4, 0.2));
    g.add(mesh(G.box, mat(c, { metalness: 1, roughness: 0.05 }), 0, 1.8, 0.11, 1.9, 3.1, 0.02));
    return g;
  },
  cotton(c = '#ffffff') {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) g.add(mesh(G.sphere, mat(c), Math.cos(i * 1.3) * 0.6, 0.8 + (i % 2) * 0.5, Math.sin(i * 1.3) * 0.6, 1.3));
    return g;
  },
  honeycomb(c = '#f2b632') {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : 1;
      g.add(mesh(G.cyl6, mat(c, { emissive: '#a06000', emissiveIntensity: 0.2 }), Math.cos(a) * r, 0.6 + (i % 3) * 0.4, Math.sin(a) * r, 1, 1.2 + (i % 3) * 0.8, 1));
    }
    return g;
  },
  easel(c, r) {
    const g = new THREE.Group();
    for (const x of [-0.6, 0.6]) {
      const l = mesh(G.box, mat('#8a5a33'), x, 1.4, 0, 0.12, 2.8, 0.12);
      l.rotation.z = -x * 0.2;
      g.add(l);
    }
    g.add(mesh(G.box, mat('#fffdf5'), 0, 1.9, 0.12, 1.8, 1.4, 0.05));
    g.add(mesh(G.box, mat(PALETTE[Math.floor(r * 8)]), -0.3, 2, 0.16, 0.7, 0.5, 0.02));
    g.add(mesh(G.box, mat(PALETTE[(Math.floor(r * 8) + 3) % 8]), 0.35, 1.7, 0.16, 0.5, 0.6, 0.02));
    return g;
  },
  key(c = '#d4b060') {
    const g = new THREE.Group();
    const m = mat(c, { metalness: 0.7, roughness: 0.35 });
    g.add(mesh(G.torus, m, 0, 3.4, 0, 1.6));
    g.add(mesh(G.box, m, 0, 1.6, 0, 0.35, 2.8, 0.25));
    g.add(mesh(G.box, m, 0.35, 0.6, 0, 0.5, 0.25, 0.25));
    g.add(mesh(G.box, m, 0.3, 1, 0, 0.4, 0.25, 0.25));
    return g;
  },
  nest(c = '#9a7040') {
    const g = new THREE.Group();
    const n = mesh(G.torus, mat(c), 0, 0.3, 0, 1.6, 1.6, 1.4);
    n.rotation.x = Math.PI / 2;
    g.add(n);
    for (let i = 0; i < 3; i++) g.add(mesh(G.ball, mat('#f8f0e0'), (i - 1) * 0.35, 0.35, 0, 0.35, 0.45, 0.35));
    return g;
  },
  star(c = '#ffe86a', r) {
    const g = new THREE.Group();
    const s = mesh(G.star, glow(c, 0.9), 0, 3 + r * 3, 0, 2);
    g.add(s);
    g.userData.spin = s;
    g.userData.float = 0.5;
    return g;
  },
  moonrock(c = '#b0b0b8') {
    const g = new THREE.Group();
    const ring = mesh(G.torus, mat(c), 0, 0.1, 0, 3, 3, 1.2);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.add(mesh(G.dodeca, mat('#9a9aa2'), 2, 0.4, 1, 0.9));
    return g;
  },
  building(c, r) {
    const cols = ['#d8d4cc', '#c4ccd8', '#e8dcc8', '#b8c4b8', '#d8c0b8'];
    const col = c || cols[Math.floor(r * cols.length)];
    const h = 3 + r * 6;
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(col), 0, h / 2, 0, 3, h, 3));
    for (let y = 1.2; y < h - 0.5; y += 1.4) g.add(mesh(G.box, glow('#ffe9a8', 0.25), 0, y, 1.52, 2.2, 0.5, 0.04));
    return g;
  },
  skyscraper(c = '#4a5a7a', r) {
    const h = 8 + r * 10;
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c, { metalness: 0.5, roughness: 0.3 }), 0, h / 2, 0, 2.6, h, 2.6));
    for (const [x, z] of [[-1.31, -1.31], [1.31, -1.31], [-1.31, 1.31], [1.31, 1.31]]) g.add(mesh(G.box, glow('#5affff', 1.2), x, h / 2, z, 0.08, h, 0.08));
    g.add(mesh(G.cyl6, glow('#ff4ad8', 1), 0, h + 0.8, 0, 0.1, 1.6, 0.1));
    return g;
  },
  neon(c, r) {
    const col = c || ['#ff4ad8', '#5affff', '#a0ff5a', '#ffd84a'][Math.floor(r * 4)];
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#333344'), 0, 1.5, 0, 0.12, 3, 0.12));
    const ring = mesh(G.thinTorus, glow(col, 1.6), 0, 3.4, 0, 1.4);
    g.add(ring);
    g.userData.spin = ring;
    return g;
  },
  tower(c = '#b8b0a0') {
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat(c), 0, 4, 0, 2.4, 8, 2.4));
    g.add(mesh(G.cyl6, mat(c), 0, 8.4, 0, 3, 0.8, 3));
    g.add(mesh(G.cone, mat('#7a5a9a'), 0, 10, 0, 3, 2.6));
    return g;
  },
  spike(c = '#2a1a3a') {
    const g = new THREE.Group();
    g.add(mesh(G.cone4, mat(c), 0, 2, 0, 1.2, 4));
    g.add(mesh(G.cone4, mat(c), 0.9, 1.2, 0.4, 0.8, 2.4));
    g.add(mesh(G.cone4, mat(c), -0.6, 0.9, -0.5, 0.6, 1.8));
    return g;
  },
  eye(c = '#ffffff') {
    const g = new THREE.Group();
    const e = mesh(G.ball, mat(c, { emissive: '#552255', emissiveIntensity: 0.3 }), 0, 2.4, 0, 1.6);
    g.add(e);
    g.add(mesh(G.ball, glow('#ff2a5a', 1.2), 0, 2.4, 0.7, 0.6));
    g.add(mesh(G.cyl6, mat('#3a2a4a'), 0, 0.8, 0, 0.2, 1.6, 0.2));
    g.userData.float = 0.4;
    return g;
  },
  knot(c = '#c080ff') {
    const g = new THREE.Group();
    const k = mesh(G.knot, mat(c, { emissive: c, emissiveIntensity: 0.25 }), 0, 2.6, 0, 2.6);
    g.add(k);
    g.userData.spin = k;
    return g;
  },
  blob(c = '#f4b6c4') {
    const g = new THREE.Group();
    g.add(mesh(G.sphere, mat(c), 0, 1, 0, 2.2, 1.8, 2));
    g.add(mesh(G.sphere, mat(c), 0.8, 1.4, 0.4, 1.3));
    g.add(mesh(G.sphere, mat(c), -0.7, 1.5, -0.3, 1.2));
    return g;
  },
  drop(c = '#7ad0ff') {
    const g = new THREE.Group();
    g.add(mesh(G.drop, mat(c, { roughness: 0.1, emissive: c, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 }), 0, 1.6, 0, 2.2, 3, 2.2));
    g.userData.float = 0.3;
    return g;
  },
  stage(c = '#8a1f2f') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat('#6a4a2a'), 0, 0.4, 0, 7, 0.8, 4));
    for (const x of [-3.2, 3.2]) g.add(mesh(G.box, mat(c), x, 2.8, -1.6, 1, 4.8, 0.3));
    g.add(mesh(G.box, mat(c), 0, 5.2, -1.6, 7.4, 0.8, 0.3));
    g.add(mesh(G.ball, glow('#ffe9a8', 1.2), -2, 4.4, 0, 0.35));
    g.add(mesh(G.ball, glow('#ffe9a8', 1.2), 2, 4.4, 0, 0.35));
    return g;
  },
  parasol(c, r) {
    const col = c || PALETTE[Math.floor(r * 8)];
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#f4f4f4'), 0, 1.4, 0, 0.1, 2.8, 0.1));
    g.add(mesh(G.cone, mat(col), 0, 3, 0, 3.2, 0.9));
    return g;
  },
  clock(c = '#e8dcc0') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat('#7a5a3a'), 0, 2, 0, 1.6, 4, 1.2));
    const face = mesh(G.cyl, mat(c), 0, 4.4, 0, 2.4, 0.3, 2.4);
    face.rotation.x = Math.PI / 2;
    g.add(face);
    const hand = new THREE.Group();
    hand.add(mesh(G.box, mat('#222222'), 0, 0.5, 0, 0.12, 1, 0.05));
    hand.position.set(0, 4.4, 0.2);
    g.add(hand);
    g.userData.spin = hand;
    g.userData.spinAxis = 'z';
    return g;
  },
  spiral(c = '#ff9ad8') {
    const g = new THREE.Group();
    const s = mesh(G.spiral, mat(c, { emissive: c, emissiveIntensity: 0.3 }), 0, 0, 0, 1.6);
    g.add(s);
    g.userData.spin = s;
    return g;
  },
  frame(c = '#c8a060', r) {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c, { metalness: 0.3 }), 0, 1.8, 0, 2.6, 2, 0.15));
    g.add(mesh(G.box, mat(PALETTE[Math.floor(r * 8)]), 0, 1.8, 0.08, 2.2, 1.6, 0.02));
    g.add(mesh(G.cyl6, mat('#555555'), 0, 0.4, 0, 0.1, 0.8, 0.1));
    return g;
  },
  tv(c = '#333344') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat(c), 0, 1.6, 0, 2.6, 1.8, 1));
    g.add(mesh(G.box, glow('#6ad8ff', 0.8), 0, 1.6, 0.51, 2.2, 1.4, 0.02));
    g.add(mesh(G.box, mat(c), 0, 0.35, 0, 0.6, 0.7, 0.6));
    return g;
  },
  dustpile(c = '#a89a88') {
    const g = new THREE.Group();
    g.add(mesh(G.sphere, mat(c), 0, 0.3, 0, 2.4, 0.9, 2));
    g.add(mesh(G.sphere, mat(c), 0.8, 0.4, 0.3, 1.2, 0.9, 1.2));
    return g;
  },
  ingot(c = '#ffd700') {
    const g = new THREE.Group();
    const m = mat(c, { metalness: 0.8, roughness: 0.3 });
    g.add(mesh(G.box, m, 0, 0.3, 0, 1.6, 0.6, 0.8));
    g.add(mesh(G.box, m, 0.2, 0.9, 0, 1.6, 0.6, 0.8));
    g.add(mesh(G.cyl6, m, -1.2, 1.5, 0.5, 0.5, 3, 0.5));
    return g;
  },
  bone(c = '#efe8d8') {
    const g = new THREE.Group();
    const b = new THREE.Group();
    b.add(mesh(G.cyl6, mat(c), 0, 0, 0, 0.4, 3, 0.4));
    for (const y of [-1.5, 1.5]) for (const x of [-0.3, 0.3]) b.add(mesh(G.ball, mat(c), x, y, 0, 0.6));
    b.rotation.z = Math.PI / 2.4;
    b.position.y = 0.9;
    g.add(b);
    return g;
  },
  ball(c, r) {
    const col = c || PALETTE[Math.floor(r * PALETTE.length)];
    return mesh(G.ball, mat(col, { roughness: 0.4, flatShading: false }), 0, 0.9, 0, 1.8);
  },
  puppet(c = '#c8a080') {
    const g = new THREE.Group();
    g.add(mesh(G.box, mat('#6a4a2a'), 0, 4.2, 0, 2.4, 0.15, 0.15));
    for (const x of [-1, 1]) g.add(mesh(G.cyl6, mat('#dddddd'), x, 3.3, 0, 0.02, 1.8, 0.02));
    g.add(mesh(G.ball, mat(c), 0, 2.3, 0, 0.8));
    g.add(mesh(G.box, mat('#a04040'), 0, 1.4, 0, 0.9, 1.2, 0.5));
    for (const x of [-0.25, 0.25]) g.add(mesh(G.box, mat(c), x, 0.5, 0, 0.2, 0.8, 0.2));
    g.userData.sway = true;
    return g;
  },
  pumpkin(c = '#ff8a1a', r) {
    // ジャック・オー・ランタン
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(G.ball, mat(c), Math.cos(a) * 0.32, 0.75, Math.sin(a) * 0.32, 1.1, 1.3, 1.1));
    }
    g.add(mesh(G.cyl6, mat('#4a6a2a'), 0, 1.5, 0, 0.14, 0.45, 0.14));
    const face = glow('#ffd23a', 1.6);
    for (const x of [-0.32, 0.32]) {
      const eye = mesh(G.cone4, face, x, 0.95, 0.86, 0.26, 0.24, 0.06);
      eye.rotation.x = Math.PI / 2;
      g.add(eye);
    }
    g.add(mesh(G.box, face, 0, 0.55, 0.86, 0.7, 0.14, 0.06));
    g.scale.setScalar(1.4 + r * 0.6);
    return g;
  },
  bat(c = '#2a1a33', r) {
    const g = new THREE.Group();
    const b = new THREE.Group();
    b.add(mesh(G.ball, mat(c), 0, 0, 0, 0.5));
    for (const x of [-1, 1]) {
      const wing = mesh(G.cone4, mat(c), x * 0.55, 0.05, 0, 0.5, 0.9, 0.08);
      wing.rotation.z = x * Math.PI / 2;
      b.add(wing);
    }
    for (const x of [-0.12, 0.12]) b.add(mesh(G.ball, glow('#ff3a3a', 1.5), x, 0.08, 0.22, 0.09));
    b.position.y = 4 + r * 4;
    g.add(b);
    g.userData.float = 1.2;
    g.userData.spin = b;
    return g;
  },
  banner(c, r) {
    const col = c || PALETTE[Math.floor(r * PALETTE.length)];
    const g = new THREE.Group();
    g.add(mesh(G.cyl6, mat('#7a6a5a'), 0, 2.5, 0, 0.12, 5, 0.12));
    const cloth = mesh(G.box, mat(col), 0.8, 3.8, 0, 1.6, 2, 0.04);
    g.add(cloth);
    g.userData.sway = true;
    return g;
  },
};

export const PROP_KINDS = Object.keys(BUILD);

export function buildProp(kind, color, r = 0.5) {
  const fn = BUILD[kind] || BUILD.rock;
  return fn(color || undefined, r);
}

export function buildHouse(color, roof) {
  const g = new THREE.Group();
  g.add(mesh(G.box, mat('#f6efe2'), 0, 1, 0, 2.6, 2, 2.4));
  const rf = mesh(G.cone4, mat(roof), 0, 2.6, 0, 2.6, 1.3, 2.4);
  rf.rotation.y = Math.PI / 4;
  rf.scale.set(2.7, 1.3, 2.6);
  g.add(rf);
  g.add(mesh(G.box, mat(color === 'rainbow' ? '#c080ff' : color), 0, 0.6, 1.21, 0.7, 1.2, 0.04));
  g.add(mesh(G.box, glow('#ffe9a8', 0.5), 0.8, 1.2, 1.21, 0.5, 0.5, 0.04));
  return g;
}

export function buildWorkplace(color) {
  const g = new THREE.Group();
  g.add(mesh(G.box, mat('#e8e0d0'), 0, 1.8, 0, 6, 3.6, 4));
  g.add(mesh(G.box, mat(color), 0, 3.8, 0, 6.4, 0.4, 4.4));
  g.add(mesh(G.box, mat('#6a4a2a'), 0, 0.9, 2.01, 1.4, 1.8, 0.04));
  g.add(mesh(G.cyl6, mat('#8a8a8a'), 2, 4.6, -1, 0.5, 1.6, 0.5));
  return g;
}

export function buildTent(color) {
  const g = new THREE.Group();
  const t = mesh(G.cone4, mat(color), 0, 0.9, 0, 2.6, 1.8, 2.6);
  t.rotation.y = Math.PI / 4;
  g.add(t);
  g.add(mesh(G.cyl, glow('#ff9a3a', 1.4), 1.8, 0.15, 0.8, 0.5, 0.3, 0.5));
  return g;
}

export function buildPortal(color) {
  const g = new THREE.Group();
  const ring = mesh(G.torus, glow(color, 1.1), 0, 3.4, 0, 5.4);
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  disc.position.y = 3.4;
  g.add(disc);
  g.add(mesh(G.cyl, mat('#555566'), 0, 0.15, 0, 5, 0.3, 2));
  g.userData.portalDisc = disc;
  return g;
}

// tint: タイプの色 (体の色にうっすら混ぜる)
export function buildMonster(boss, tint = null) {
  const g = new THREE.Group();
  let col = boss ? '#4a0a2a' : '#2a1a3a';
  if (tint) col = '#' + new THREE.Color(col).lerp(new THREE.Color(tint), 0.45).getHexString();
  const body = mesh(G.ico, mat(col, { emissive: tint || (boss ? '#5a0a20' : '#1a0a2a'), emissiveIntensity: tint ? 0.25 : 0.5 }), 0, 1, 0, 1.8);
  g.add(body);
  for (const x of [-0.35, 0.35]) g.add(mesh(G.ball, glow('#ff3030', 2), x, 1.25, 0.75, 0.28));
  for (let i = 0; i < 4; i++) {
    const s = mesh(G.cone4, mat('#1a0a1a'), Math.cos(i * 1.6) * 0.7, 1.8, Math.sin(i * 1.6) * 0.5, 0.35, 0.8);
    s.rotation.z = -Math.cos(i * 1.6) * 0.6;
    g.add(s);
  }
  g.userData.body = body;
  if (boss) g.scale.setScalar(2);
  return g;
}

// レイドボス: 大きな魔物 + 金の角と王冠 + 足元の赤いオーラ
export function buildRaidBoss() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh(G.ico, mat('#22040e', { emissive: '#4a0016', emissiveIntensity: 0.5, roughness: 0.5 }), 0, 0, 0, 2.6));
  for (const x of [-0.5, 0, 0.5]) body.add(mesh(G.ball, glow('#ffdd33', 2), x, 0.35 - Math.abs(x) * 0.3, 1.15, 0.32));
  for (const x of [-0.8, 0.8]) {
    const h = mesh(G.cone, mat('#d8b040', { metalness: 0.6, roughness: 0.3 }), x, 1.3, 0, 0.45, 1.4);
    h.rotation.z = -x * 0.5;
    body.add(h);
  }
  const crown = mesh(G.torus, mat('#ffd040', { metalness: 0.8, roughness: 0.25, emissive: '#a07000', emissiveIntensity: 0.4 }), 0, 1.45, 0, 1.2);
  crown.rotation.x = Math.PI / 2;
  body.add(crown);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    body.add(mesh(G.cone4, mat('#1a0510'), Math.cos(a) * 1.25, -0.2, Math.sin(a) * 1.25, 0.5, 1.2));
  }
  body.position.y = 2;
  g.add(body);
  const aura = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 40), new THREE.MeshBasicMaterial({ color: '#ff2a5a', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.05;
  g.add(aura);
  g.scale.setScalar(3.2);
  g.userData = { body, aura };
  return g;
}

// 宝の眠る場所の目印 (地面の赤いバツ印 + スコップ)
export function buildTreasureMark() {
  const g = new THREE.Group();
  for (const r of [Math.PI / 4, -Math.PI / 4]) {
    const b = mesh(G.box, glow('#ff3a3a', 0.6), 0, 0.12, 0, 5, 0.2, 0.9);
    b.rotation.y = r;
    g.add(b);
  }
  const sh = new THREE.Group();
  sh.add(mesh(G.cyl6, mat('#8a5a33'), 0, 1.4, 0, 0.12, 2.4, 0.12));
  sh.add(mesh(G.box, mat('#b8c0c8', { metalness: 0.6 }), 0, 0.2, 0, 0.7, 0.8, 0.1));
  sh.position.set(2.4, 0, 1.2);
  sh.rotation.z = 0.35;
  g.add(sh);
  return g;
}

// 誕生日パーティー: 大きなケーキと風船
export function buildCake() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, mat('#d8a070'), 0, 0.2, 0, 4.6, 0.4, 4.6));
  g.add(mesh(G.cyl, mat('#fff4ec'), 0, 0.9, 0, 3.4, 1.1, 3.4));
  g.add(mesh(G.cyl, mat('#f6b8cc'), 0, 1.9, 0, 2.4, 0.9, 2.4));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(G.ball, mat('#e83a4a'), Math.cos(a) * 1.4, 1.55, Math.sin(a) * 1.4, 0.4));
  }
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.5;
    g.add(mesh(G.cyl6, mat('#fff0a0'), x, 2.75, 0, 0.12, 0.8, 0.12));
    g.add(mesh(G.ball, glow('#ffb030', 2), x, 3.25, 0, 0.18));
  }
  const balloons = new THREE.Group();
  ['#ff6a8a', '#6ac8ff', '#ffd84a', '#9a7aff', '#7ae08a'].forEach((c, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 3.6, z = Math.sin(a) * 3.6, y = 5 + (i % 2) * 0.8;
    balloons.add(mesh(G.ball, mat(c, { roughness: 0.35 }), x, y, z, 1, 1.2, 1));
    balloons.add(mesh(G.cyl6, mat('#dddddd'), x, y / 2 - 0.3, z, 0.03, y - 0.6, 0.03));
  });
  g.add(balloons);
  g.userData.balloons = balloons;
  return g;
}

// 勢力の旗 (対抗戦は2本、集会は1本)
export function buildFlag(color) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl6, mat('#5a4a3a'), 0, 3, 0, 0.18, 6, 0.18));
  const cloth = mesh(G.box, mat(color, { side: THREE.DoubleSide }), 1.1, 5.1, 0, 2.2, 1.4, 0.06);
  g.add(cloth);
  g.add(mesh(G.ball, mat('#ffd040', { metalness: 0.6 }), 0, 6.1, 0, 0.35));
  g.userData.cloth = cloth;
  return g;
}

export { G as GEOMETRIES };
