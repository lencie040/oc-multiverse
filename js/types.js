// タイプ相性 (攻める側 → 守る側)。表にないタイプ同士は等倍
// 妖・古・食・賢・虚・虹 などの独自タイプは、いまは相性なし (表に足せばすぐ反映される)
const STRONG = {
  水: ['炎', '地', '岩'],
  炎: ['草', '花', '氷', '虫', '鋼'],
  草: ['水', '地', '岩'],
  花: ['水', '地'],
  電: ['水', '飛'],
  氷: ['草', '花', '飛', '地', '竜'],
  飛: ['草', '花', '虫', '闘'],
  地: ['炎', '電', '岩', '鋼', '毒'],
  岩: ['炎', '氷', '飛', '虫'],
  鋼: ['氷', '岩'],
  闘: ['無', '氷', '岩', '鋼', '悪'],
  超: ['闘', '毒'],
  悪: ['超', '霊'],
  霊: ['霊', '超'],
  竜: ['竜'],
  虫: ['草', '花', '超', '悪'],
  毒: ['草', '花'],
  光: ['闇', '霊'],
  闇: ['光', '超'],
};
const WEAK = {
  水: ['水', '草', '花', '竜'],
  炎: ['炎', '水', '岩', '竜'],
  草: ['草', '炎', '飛', '虫', '鋼', '毒'],
  花: ['花', '炎', '飛', '毒'],
  電: ['電', '草', '竜', '地'],
  氷: ['氷', '炎', '水', '鋼'],
  飛: ['電', '岩', '鋼'],
  地: ['草', '虫', '飛'],
  岩: ['闘', '地', '鋼'],
  鋼: ['炎', '水', '電', '鋼'],
  闘: ['飛', '超', '毒', '虫', '霊'],
  超: ['超', '鋼', '悪'],
  悪: ['闘', '悪'],
  霊: ['悪', '無'],
  竜: ['鋼'],
  虫: ['炎', '飛', '闘', '鋼', '霊', '毒'],
  毒: ['毒', '地', '岩', '霊', '鋼'],
  無: ['岩', '鋼', '霊'],
  光: ['光'],
  闇: ['闇'],
};
const SUPER = 1.25, RESIST = 0.8;

export const TYPE_COLOR = {
  水: '#3a8fe0', 炎: '#e8542a', 草: '#4cae4c', 花: '#f07ab8', 電: '#f2c81e', 氷: '#7ad8e8', 飛: '#8fa8f0',
  地: '#b8894a', 岩: '#9a8a5a', 鋼: '#8a9aaa', 闘: '#c0403a', 超: '#e85a8a', 悪: '#5a4a5a', 霊: '#6a5aa8',
  竜: '#5a3ae0', 虫: '#9ab82a', 毒: '#9a4ab0', 光: '#ffe680', 闇: '#3a2a5a', 無: '#a8a890',
};

export function splitTypes(s) { return s ? s.split(/[／/・]/).map((x) => x.trim()).filter(Boolean) : []; }

// 攻撃の通りやすさ (複合タイプは掛け合わせ)
function hit(atk, def) {
  let m = 1;
  for (const a of atk) for (const d of def) {
    if (STRONG[a]?.includes(d)) m *= SUPER;
    else if (WEAK[a]?.includes(d)) m *= RESIST;
  }
  return Math.max(0.6, Math.min(1.6, m));
}

// 戦闘力にかける倍率: 自分の攻撃の通りやすさ ÷ 相手の攻撃の通りやすさ (の平方根)
export function edge(me, foe) {
  if (!me?.length || !foe?.length) return 1;
  return Math.max(0.65, Math.min(1.5, Math.sqrt(hit(me, foe) / hit(foe, me))));
}
export function edgeNote(k) { return k >= 1.12 ? '（タイプ相性◎）' : k <= 0.89 ? '（タイプ相性×）' : ''; }

// キャラ詳細用: 有利な相手・苦手な相手
const ALL = [...new Set([...Object.keys(STRONG), ...Object.keys(WEAK)])];
export function typeSummary(types) {
  if (!types.length) return null;
  const good = ALL.filter((t) => edge(types, [t]) >= 1.1);
  const bad = ALL.filter((t) => edge(types, [t]) <= 0.9);
  return { good, bad };
}

// 世界線の雰囲気から、出てくる魔物のタイプを決める
const POOL = {
  leaf: ['草', '虫', '飛'], dust: ['地', '岩'], snow: ['氷'], spark: ['電', '鋼', '超'], ember: ['炎', '悪'],
  wisp: ['霊', '闇'], petal: ['花', '飛'], paper: ['超'], star: ['超', '光'], bubble: ['水'], ash: ['闇', '岩'],
  rain: ['水', '電'], heart: ['花', '無'], note: ['無', '飛'],
};
const GENERIC = ['無', '水', '炎', '草', '電', '飛', '地', '岩', '虫', '毒', '闇', '霊', '闘'];
export function monsterType(world, rnd = Math.random) {
  const pool = POOL[world.theme?.particle];
  const list = pool && rnd() < 0.65 ? pool : GENERIC;
  return [list[Math.floor(rnd() * list.length)]];
}
