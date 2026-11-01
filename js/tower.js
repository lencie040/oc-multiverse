// レモンタワー: 現代にある塔を1階ずつ登る。前の塔をクリアすると次の塔に入れる
export const TOP_FLOOR = 100; // 1〜99階と最上階
export const TOWERS = [
  { id: 'lemon', name: 'レモンタワー', lo: 20, hi: 120, color: '#ffe14a', coin: 1 },
  { id: 'super', name: 'スーパーレモンタワー', lo: 100, hi: 200, color: '#ffb43a', coin: 3, need: 'lemon' },
  { id: 'hyper', name: 'ハイパーレモンタワー', lo: 180, hi: 280, color: '#ff6a5a', coin: 8, need: 'super' },
  { id: 'elite', name: 'エリートレモンタワー', lo: 260, hi: 320, color: '#c88aff', coin: 20, need: 'hyper' },
];
export const towerById = (id) => TOWERS.find((t) => t.id === id);
export const floorName = (f) => (f >= TOP_FLOOR ? '最上階' : `${f}階`);
// 階が上がるほど魔物のレベルが上がる。10階ごとにボス、最上階は特に強い
export function floorStats(t, f) {
  const lv = Math.round(t.lo + ((t.hi - t.lo) * (f - 1)) / (TOP_FLOOR - 1));
  const top = f >= TOP_FLOOR, boss = top || f % 10 === 0;
  return { lv, boss, top, base: top ? 125 : boss ? 112 : 95, count: top || f % 5 === 0 ? 2 : 1 };
}
export function floorCoins(t, f) {
  const { boss, top } = floorStats(t, f);
  return Math.round((40 + f * 6) * t.coin * (top ? 10 : boss ? 3 : 1));
}
