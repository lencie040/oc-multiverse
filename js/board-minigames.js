import { MOODS } from './audio.js?v=52';
import { seeded, hashStr, clamp } from './util.js?v=52';

const THEMES = {
  calm: ['街角の信号', '買い物メモ', '落とし物さがし', ['🍎', '🔑', '📘', '🏠', '☕', '🪙']],
  cute: ['お菓子の窯', 'ケーキの飾り順', 'お目当てのマカロン', ['🍰', '🍪', '🍬', '🍭', '🍩', '🍓']],
  nature: ['森の足音', '渡り鳥の隊列', '木の実ひろい', ['🍁', '🍄', '🌿', '🐦', '🌰', '🌼']],
  ocean: ['波のひと休み', '灯台の合図', '浜辺の貝さがし', ['🐚', '🦀', '🐠', '⚓', '🌊', '🪸']],
  dark: ['闇の瞬き', '亡霊の通った順', '影にある灯', ['👻', '🕯️', '🌙', '🗝️', '🦇', '🪦']],
  spooky: ['かぼちゃのチャイム', 'お化けの行列', 'トリック・オア・サーチ', ['🎃', '🕷️', '🦉', '🍬', '🦇', '🧙']],
  fire: ['噴火の隙間', '溶岩の足場', '火の粉より早く', ['🔥', '🪨', '🌋', '☀️', '💥', '⚒️']],
  ice: ['氷の共鳴', '結晶の並び', '凍った宝石', ['❄️', '🧊', '💎', '☃️', '🩵', '🌨️']],
  future: ['回路の同期', '再起動コード', 'バグの波形', ['📡', '💾', '🔋', '⚙️', '🤖', '💡']],
  holy: ['聖堂の鐘', '祈りの順路', '灯火をさがせ', ['🕊️', '🔔', '🪽', '🕯️', '🌟', '🌙']],
  ancient: ['砂時計の合図', '石板の紋章', '遺跡の発掘', ['🔆', '🏺', '🪶', '🐍', '🗿', '🪲']],
  music: ['拍の向こう', '音符の連なり', '音色の聞き分け', ['🎵', '🎺', '🥁', '🎻', '🎹', '🎸']],
  space: ['流星の時刻', '星座の軌跡', '惑星観測', ['🪐', '🌙', '⭐', '☄️', '🛸', '🌎']],
};
const DUELS = [
  ['一閃', '合図が光った瞬間を狙う反応勝負'],
  ['逆順紋章', '見えた紋章を最後から逆順に押す'],
  ['紋章リレー', '指定された紋章を制限時間内に集める'],
];
const MARKS = ['◆', '●', '▲', '■', '✦', '⬟'];

export function makeChallenge(world, mood, seed, time, duel = false, mode = seed % 3) {
  const rng = seeded(hashStr(String(seed)));
  const [pulse, memory, find, icons] = THEMES[mood] ?? THEMES.space;
  const beat = 60 / (MOODS[mood]?.bpm ?? 90);
  const steps = duel ? [5, 5, 8][mode] : [5, 4 + (seed % 2), 7][mode];
  const gap = duel ? 1.28 : clamp(beat * 2, 1, 1.65);
  const reverse = mode === 1 && (duel || ['ice', 'dark', 'spooky', 'ancient'].includes(mood));
  const sequence = Array.from({ length: steps }, () => rng.int(0, mode === 1 ? 3 : 5));
  const cues = Array.from({ length: steps }, (_, i) => 1.8 + i * gap + (duel ? rng.range(-0.13, 0.13) : 0));
  return {
    mode, seed, reverse, steps, cues, sequence, icons: duel ? MARKS : icons,
    name: duel ? DUELS[mode][0] : [pulse, memory, find][mode],
    help: duel ? DUELS[mode][1] : [
      '白い合図が光ったら押す',
      reverse ? '見えた順番を逆から入力' : '見えた順番で入力',
      '見本と同じ印を探して押す',
    ][mode],
    world: world.id, start: time, preview: 3,
    limit: mode === 0 ? cues.at(-1) + 0.8 : mode === 1 ? 11 : duel ? 10 : 12,
    window: duel ? 0.48 : clamp(beat * 0.58, 0.33, 0.48),
  };
}

export const newScore = () => ({ points: 0, step: 0, misses: 0, used: [], done: false, elapsed: 0 });

export function targets(game, step) {
  const rng = seeded(hashStr(`${game.seed}:${step}`));
  const order = game.icons.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function pressChallenge(game, score, input, time) {
  const elapsed = time - game.start;
  if (score.done || elapsed < 0 || elapsed >= game.limit || !Number.isInteger(input)) return false;
  if (game.mode === 0) {
    if (input !== 0) return false;
    const index = game.cues.findIndex((cue, i) => !score.used.includes(i) && Math.abs(elapsed - cue) <= game.window);
    if (index < 0) {
      // 連打で有利にならないよう、早押しすると直近の合図を使ってしまう。
      const next = game.cues.findIndex((cue, i) => cue > elapsed && !score.used.includes(i));
      if (next >= 0) score.used.push(next);
      score.misses++;
    } else {
      score.used.push(index);
      score.points += 50 + Math.round(50 * (1 - Math.abs(elapsed - game.cues[index]) / game.window));
    }
    return true;
  }
  if (game.mode === 1 && elapsed < game.preview) return false;
  const index = game.reverse ? game.steps - 1 - score.step : score.step;
  if (input === game.sequence[index]) {
    score.step++;
    score.points += 100;
    if (score.step >= game.steps) score.done = true;
  } else {
    score.misses++;
    if (game.mode === 1 && score.step) {
      score.step = 0;
      score.points = 0;
    }
  }
  score.elapsed = elapsed;
  return true;
}

export function performance(game, score) {
  return Math.max(0, score.points - score.misses * (game.mode === 0 ? 25 : 18))
    + (score.done ? Math.round((game.limit - score.elapsed) * 4) : 0);
}
