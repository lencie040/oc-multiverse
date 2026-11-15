import { seeded, hashStr } from './util.js?v=53';

export const MAP_W = 1000;
export const MAP_H = 680;
export const TILES = {
  blue: { name: '青マス', label: '+3', color: '#469aff' },
  red: { name: '赤マス', label: '−3', color: '#f26877' },
  lucky: { name: 'ラッキーマス', label: '✦', color: '#62d8aa' },
  unlucky: { name: 'アンラッキーマス', label: '!', color: '#62d8aa' },
  item: { name: 'アイテムマス', label: '✚', color: '#62d8aa' },
  event: { name: 'ハプニングマス', label: '♪', color: '#62d8aa' },
  enemy: { name: '敵マス', label: '⚔', color: '#62d8aa' },
  black: { name: '黒マス', label: '×', color: '#292537' },
  shop: { name: 'ショップ', pass: true },
  gate: { name: '移動ゲート', pass: true },
  crystal: { name: 'クリスタル', pass: true },
};
const LAND = [
  ['blue', 46], ['red', 17], ['lucky', 9], ['unlucky', 5], ['item', 8], ['event', 8], ['enemy', 7],
];

export function makeBoard(world) {
  const rng = seeded(hashStr('sugoroku:' + world.id));
  const tiles = [], rings = [];
  const phase = rng.range(-0.3, 0.3);
  const counts = [38, 30 + rng.int(0, 2), 20 + rng.int(0, 3)];
  for (let ring = 0; ring < counts.length; ring++) {
    const ids = [], size = counts[ring];
    const rx = [443, 328, 209][ring], ry = [278, 191, 103][ring];
    for (let i = 0; i < size; i++) {
      const a = Math.PI * 2 * i / size + phase + ring * 0.093;
      const ripple = 1 + 0.055 * Math.sin(a * 3 + phase * 11) + rng.range(-0.025, 0.025);
      let roll = rng() * 100;
      const type = LAND.find(([, weight]) => (roll -= weight) < 0)[0];
      const id = tiles.length;
      ids.push(id);
      tiles.push({ id, type, ring, x: MAP_W / 2 + Math.sin(a) * rx * ripple,
        y: MAP_H / 2 + Math.cos(a) * ry * ripple, links: [] });
    }
    ids.forEach((id, i) => { tiles[id].next = ids[(i + 1) % size]; tiles[id].back = ids[(i + size - 1) % size]; });
    rings.push(ids);
  }

  for (const [ring, n] of [[0, 8], [1, 6]]) {
    const a = rings[ring], b = rings[ring + 1];
    const offset = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const from = a[(offset + Math.floor(i * a.length / n)) % a.length];
      const u = tiles[from];
      const to = b.reduce((best, id) => {
        const dist = (index) => Math.hypot(tiles[index].x - u.x, tiles[index].y - u.y);
        return dist(id) < dist(best) ? id : best;
      });
      u.links.push(to);
      tiles[to].links.push(from);
    }
  }

  tiles[0].type = 'blue';
  for (const id of [rings[0][6], rings[0][25], rings[1][12], rings[2][9]]) tiles[id].type = 'shop';
  for (const id of [rings[0][12], rings[1][22], rings[2][0]]) tiles[id].type = 'gate';
  if (rng() < 0.78) {
    const id = rings[2][rng.int(11, rings[2].length - 1)];
    tiles[id].type = 'black';
  }
  return { tiles, rings };
}
