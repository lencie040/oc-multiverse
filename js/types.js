// タイプ相性 (攻める側 → 守る側)。表はスプレッドシートのタイプ相性シートから読み込む (data.json の types)
// CHART[攻撃側][防御側] = 倍率 (2 / 0.5 / 0)。書かれていない組み合わせは等倍
let CHART = {};
let ALL = [];
export function loadTypeChart(t) {
  CHART = t?.chart || {};
  ALL = t?.types || Object.keys(CHART);
}

export const TYPE_COLOR = {
  水: '#3a8fe0', 炎: '#e8542a', 草: '#4cae4c', 花: '#f07ab8', 電: '#f2c81e', 氷: '#7ad8e8', 飛: '#8fa8f0',
  地: '#b8894a', 岩: '#9a8a5a', 鋼: '#8a9aaa', 闘: '#c0403a', 超: '#e85a8a', 悪: '#5a4a5a', 霊: '#6a5aa8',
  竜: '#5a3ae0', 虫: '#9ab82a', 毒: '#9a4ab0', 光: '#e8c840', 闇: '#3a2a5a', 無: '#a8a890',
  妖: '#d86ad8', 食: '#e89a4a', 古: '#8a7a5a', 虚: '#6a6a8a', 埃: '#a89a8a', 賢: '#4a8ac8', 虹: '#e86a9a', 反: '#5ac8a8', 月: '#c8b8f0',
};

export function splitTypes(s) { return s ? s.split(/[／/・]/).map((x) => x.trim()).filter(Boolean) : []; }

// 攻撃の通りやすさ: 攻撃側は一番効くタイプで攻め、防御側の複合タイプは掛け合わせる
// 無効(0)は戦闘力の計算では 1/4 として扱う
function hit(atk, def) {
  let best = 0;
  for (const a of atk) {
    let m = 1;
    for (const d of def) { const v = CHART[a]?.[d] ?? 1; m *= v === 0 ? 0.25 : v; }
    best = Math.max(best, m);
  }
  return best || 1;
}

// 戦闘力にかける倍率: 自分の攻撃の通りやすさ ÷ 相手の攻撃の通りやすさ を穏やかにしたもの
// (片方だけ効果抜群で約1.23倍、お互いに有利不利が逆なら約1.5倍、最大1.6倍・最小0.6倍)
export function edge(me, foe) {
  if (!me?.length || !foe?.length) return 1;
  return Math.max(0.6, Math.min(1.6, (hit(me, foe) / hit(foe, me)) ** 0.3));
}
export function edgeNote(k) { return k >= 1.15 ? '（タイプ相性◎）' : k <= 0.87 ? '（タイプ相性×）' : ''; }

// キャラ詳細用: 有利な相手・苦手な相手
export function typeSummary(types) {
  if (!types.length) return null;
  const good = ALL.filter((t) => edge(types, [t]) >= 1.15);
  const bad = ALL.filter((t) => edge(types, [t]) <= 0.87);
  return { good, bad };
}

// 世界線の雰囲気から、出てくる魔物のタイプを決める
const POOL = {
  leaf: ['草', '虫', '飛'], dust: ['地', '岩', '古', '埃'], snow: ['氷'], spark: ['電', '鋼', '超'], ember: ['炎', '悪'],
  wisp: ['霊', '闇'], petal: ['花', '飛', '妖'], paper: ['超', '賢'], star: ['超', '光', '月'], bubble: ['水'], ash: ['闇', '岩'],
  rain: ['水', '電'], heart: ['花', '妖'], note: ['無', '飛'],
};
const GENERIC = ['無', '水', '炎', '草', '電', '飛', '地', '岩', '虫', '毒', '闇', '霊', '闘'];
export function monsterType(world, rnd = Math.random) {
  const pool = POOL[world.theme?.particle];
  const list = pool && rnd() < 0.65 ? pool : GENERIC;
  return [list[Math.floor(rnd() * list.length)]];
}
