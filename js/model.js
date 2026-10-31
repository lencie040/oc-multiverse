// データ整形・世界団内の世界線配置・隣接関係・世界線内の地理
import { seeded, hashStr } from './util.js?v=35';
import { themeOf } from './themes.js?v=35';

export const LEVEL = 50;
export const MAX_DANGER = 40; // 魔物の強さ・多さに使う汎異記号の数字の上限

// Lv50 時の実数値合計 × ランク補正 = 戦闘力
export function basePower(c) {
  const [H, ...rest] = c.stats;
  const hp = Math.floor(((2 * H + 31) * LEVEL) / 100) + LEVEL + 10;
  const others = rest.reduce((s, b) => s + Math.floor(((2 * b + 31) * LEVEL) / 100) + 5, 0);
  return Math.round((hp + others) * (1 + (c.rank - 1) * 0.12));
}

export const DAN_COLORS = ['#7ab8ff', '#ff7a8a', '#ffd27a', '#c8a0ff', '#7affc8'];

export function buildModel(raw) {
  const worlds = new Map();
  for (const w of raw.worlds) {
    worlds.set(w.id, { ...w, letter: [...w.id][0].toUpperCase(), residents: [], neighbors: [], pos: { x: 0, y: 0, z: 0 } });
  }
  const chars = raw.chars.map((c) => ({ ...c, power: 0 }));
  for (const c of chars) {
    c.power = basePower(c);
    c.home = c.hani;
    worlds.get(c.hani).residents.push(c.id);
  }
  const dans = raw.dans.map((d, i) => ({ ...d, color: DAN_COLORS[i % DAN_COLORS.length], worlds: [] }));
  const danById = new Map(dans.map((d) => [d.id, d]));
  for (const w of worlds.values()) danById.get(w.dan)?.worlds.push(w.id);
  for (const c of chars) c.dan = worlds.get(c.home).dan;

  for (const d of dans) layoutDan(d, worlds);
  layoutDans(dans);
  for (const w of worlds.values()) {
    w.theme = themeOf(w);
    w.danger = Math.min(w.num, MAX_DANGER);
    w.geo = buildGeo(w, worlds);
  }
  return { worlds, chars, charById: new Map(chars.map((c) => [c.id, c])), dans, danById, types: raw.types };
}

// 世界団の配置: しょ (シーズン1) は遠く離れた所に、シーズン2の世界団は一列に並ぶ。隣どうしだけ行き来できる
const SEASON1 = new Set(['䥚']);
export const DAN_GAP = 340, SEASON_GAP = 1300;
function layoutDans(dans) {
  const s1 = dans.filter((d) => SEASON1.has(d.id)), s2 = dans.filter((d) => !SEASON1.has(d.id));
  const left = -((s2.length - 1) / 2) * DAN_GAP;
  s2.forEach((d, i) => { d.season = 2; d.pos = { x: left + i * DAN_GAP, y: Math.sin(i * 1.7) * 40, z: (i % 2 ? -1 : 1) * 70 }; });
  s1.forEach((d, i) => { d.season = 1; d.pos = { x: left - SEASON_GAP, y: 80, z: 260 + i * DAN_GAP }; });
  for (const d of dans) d.neighbors = [];
  const link = (a, b) => { a.neighbors.push(b.id); b.neighbors.push(a.id); };
  for (let i = 1; i < s2.length; i++) link(s2[i - 1], s2[i]);
  for (let i = 1; i < s1.length; i++) link(s1[i - 1], s1[i]);
  if (s1.length && s2.length) link(s1[s1.length - 1], s2[0]);
}
// 世界団の移動に必要なpt (1人あたり): シーズンをまたぐと120pt、同じシーズンなら40pt
export const danCost = (a, b) => (a.season !== b.season ? 120 : 40);

// 汎異記号の1文字目が同じ世界線を近くに配置し、近いもの同士を「隣」にする
const SPREAD = 3.5;
function layoutDan(dan, worlds) {
  const rng = seeded(hashStr('dan:' + dan.id));
  const groups = new Map();
  for (const id of dan.worlds) {
    const w = worlds.get(id);
    if (!groups.has(w.letter)) groups.set(w.letter, []);
    groups.get(w.letter).push(w);
  }
  const letters = [...groups.keys()].sort();
  const L = letters.length;
  const big = Math.max(...[...groups.values()].map((g) => g.length));
  const ringR = L === 1 ? 0 : 40 + L * 13 + Math.sqrt(big) * 10;
  letters.forEach((letter, i) => {
    // フィボナッチ球を平たくつぶして並べる
    const t = L === 1 ? 0.5 : i / (L - 1);
    const phi = i * 2.39996;
    const y = (1 - 2 * t) * ringR * 0.35;
    const cx = Math.cos(phi) * ringR, cz = Math.sin(phi) * ringR;
    const ws = groups.get(letter).sort((a, b) => a.num - b.num || a.id.localeCompare(b.id));
    ws.forEach((w, j) => {
      const a = j * 2.39996 + rng() * 0.3;
      const r = j === 0 ? 0 : 9 + 8.5 * Math.sqrt(j);
      // 広い宇宙に見えるよう、世界線どうしの間隔を大きく開ける
      w.pos = { x: (cx + Math.cos(a) * r) * SPREAD, y: (y + rng.range(-6, 6)) * SPREAD, z: (cz + Math.sin(a) * r) * SPREAD };
    });
  });

  // 隣接: 各世界線の最寄り2つ + 最小全域木で連結を保証
  const ws = dan.worlds.map((id) => worlds.get(id));
  const d = (a, b) => (a.pos.x - b.pos.x) ** 2 + (a.pos.y - b.pos.y) ** 2 + (a.pos.z - b.pos.z) ** 2;
  const link = (a, b) => {
    if (a === b || a.neighbors.includes(b.id)) return;
    a.neighbors.push(b.id);
    b.neighbors.push(a.id);
  };
  for (const a of ws) {
    ws.filter((b) => b !== a).sort((p, q) => d(a, p) - d(a, q)).slice(0, 2).forEach((b) => link(a, b));
  }
  if (ws.length > 1) {
    const inTree = new Set([ws[0]]);
    while (inTree.size < ws.length) {
      let best = null;
      for (const a of inTree) for (const b of ws) {
        if (inTree.has(b)) continue;
        const dd = d(a, b);
        if (!best || dd < best[2]) best = [a, b, dd];
      }
      link(best[0], best[1]);
      inTree.add(best[1]);
    }
  }
}

// 世界線内の地理: 家・職場・広場・ポータル・構造物の配置 (シード固定)
function buildGeo(w, worlds) {
  const rng = seeded(hashStr('geo:' + w.id));
  const n = w.residents.length;
  const R = Math.round(32 + Math.sqrt(n) * 11);
  const plazaR = Math.max(7, R * 0.12);
  const townR = R * 0.6;
  const taken = [];
  const free = (x, z, r) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + r) ** 2);
  const place = (rMin, rMax, rad, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng.range((rMin / R) ** 2, (rMax / R) ** 2)) * R;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (free(x, z, rad)) {
        taken.push({ x, z, r: rad });
        return { x, z };
      }
    }
    const a = rng() * Math.PI * 2, rr = rng.range(rMin, rMax);
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr };
  };
  taken.push({ x: 0, z: 0, r: plazaR });

  // ポータル: 配置図での隣の世界線の方向に置く
  const portals = {};
  const angs = w.neighbors.map((id) => {
    const o = worlds.get(id);
    return { id, a: Math.atan2(o.pos.z - w.pos.z, o.pos.x - w.pos.x) };
  }).sort((p, q) => p.a - q.a);
  const minGap = Math.min(0.5, (Math.PI * 2) / Math.max(1, angs.length) * 0.8);
  for (let i = 1; i < angs.length; i++) if (angs[i].a - angs[i - 1].a < minGap) angs[i].a = angs[i - 1].a + minGap;
  for (const { id, a } of angs) {
    const x = Math.cos(a) * R * 0.9, z = Math.sin(a) * R * 0.9;
    portals[id] = { x, z, a };
    taken.push({ x, z, r: 6 });
  }

  const works = [];
  const nWorks = Math.min(6, Math.max(1, Math.ceil(n / 12)));
  for (let i = 0; i < nWorks; i++) works.push(place(townR * 0.75, townR * 1.05, 5));
  const homes = {};
  for (const id of w.residents) homes[id] = place(plazaR + 3, townR, 3.2, 120);
  const pond = w.theme.water ? place(townR * 0.6, townR * 1.1, 6) : null;
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push(place(plazaR * 0.5, townR, 1.5));

  // 構造物・自然物
  const props = [];
  const totalW = w.theme.props.reduce((s, p) => s + p.weight, 0);
  const pickProp = () => {
    let r = rng() * totalW;
    for (const p of w.theme.props) if ((r -= p.weight) <= 0) return p;
    return w.theme.props[0];
  };
  const count = Math.min(260, Math.round(R * R * 0.012) + 10);
  for (let i = 0; i < count; i++) {
    const wild = rng() < 0.75;
    const p = pickProp();
    const pos = wild ? place(townR + 2, R * 0.97, 2.2, 20) : place(plazaR + 2, townR, 2.2, 20);
    props.push({ ...p, x: pos.x, z: pos.z, s: rng.range(0.8, 1.5) * (wild ? 1.2 : 1), rot: rng() * Math.PI * 2, seed: rng() });
  }
  return { R, plazaR, townR, homes, works, spots, pond, portals, props };
}

export function randomWild(geo) {
  const a = Math.random() * Math.PI * 2;
  const r = geo.R * (0.68 + Math.random() * 0.26);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export function randomTown(geo) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * geo.townR;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// 世界線の移動pt: 汎異記号の1文字目が同じなら1pt、違えば5pt
export function hopCost(worlds, a, b) {
  return worlds.get(a).letter === worlds.get(b).letter ? 1 : 5;
}

// いちばん安く行ける経路 (ダイクストラ法)。行けなければ null
export function cheapestPath(worlds, from, to) {
  if (from === to) return { path: [from], cost: 0 };
  const best = new Map([[from, 0]]);
  const prev = new Map();
  const open = [[0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, cur] = open.shift();
    if (d > best.get(cur)) continue;
    if (cur === to) break;
    for (const nb of worlds.get(cur).neighbors) {
      const nd = d + hopCost(worlds, cur, nb);
      if (nd < (best.get(nb) ?? Infinity)) { best.set(nb, nd); prev.set(nb, cur); open.push([nd, nb]); }
    }
  }
  if (!best.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return { path, cost: best.get(to) };
}

// 世界団内の最短経路 (BFS)
export function pathBetween(worlds, from, to) {
  if (from === to) return [from];
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const nb of worlds.get(cur).neighbors) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === to) {
        const path = [to];
        let p = cur;
        while (p !== null) { path.unshift(p); p = prev.get(p); }
        return path;
      }
      q.push(nb);
    }
  }
  return null;
}
