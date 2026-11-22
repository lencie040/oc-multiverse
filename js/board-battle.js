import { edge, monsterType, splitTypes } from './types.js?v=57';
import { clamp } from './util.js?v=57';

export const FORMATIONS = {
  push: ['前進', '攻撃距離まで詰める'],
  guard: ['防御', '被ダメージを抑える'],
  split: ['散開', '予告された列から離れる'],
};

export const TECHS = {
  blast: { name: '星の衝撃', lv: 3, cost: 1, desc: '敵全体にダメージ' },
  mend: { name: '再生の陣', lv: 5, cost: 2, desc: '味方全体のHPを回復' },
  break: { name: '時の結界', lv: 8, cost: 3, desc: '敵の大技を止め、動きを遅くする' },
  nova: { name: '星団衝', lv: 12, cost: 4, desc: '敵全体に大ダメージ' },
};

export function startSkirmish(character, level, world, played) {
  const threat = Math.min(21, Math.round(world.danger / 4 + played / 6));
  const types = monsterType(world);
  const advantage = edge(splitTypes(character.type), types);
  const allies = ['前衛', '術士', '援護'].map((name, lane) => {
    const max = 39 + level * 2 + clamp((character.stats[lane ? 4 : 0] ?? 35) / 7, 0, 18);
    return { name, lane, homeLane: lane, x: 20 + 5 * lane, hp: max, max, hit: 0, attack: 0.6 + lane * 0.12,
      power: (5 + level * 0.58 + (character.stats[lane === 1 ? 3 : 1] ?? 35) * 0.025) * advantage, range: [13, 31, 25][lane] };
  });
  const enemies = Array.from({ length: threat >= 9 ? 3 : 2 }, (_, i) => {
    const max = 37 + threat * 4 + 7 * i, lane = i * 2 % 3;
    return { name: (types[i % types.length] ?? '無') + 'の魔物', lane, x: 79 + i * 4, hp: max, max, hit: 0,
      attack: 1.2 + 0.2 * i, power: 5.5 + threat * 0.68, range: i ? 25 : 16 };
  });
  return { allies, enemies, sec: 0, stance: 'push', burst: 5.4, lane: 1, slow: 0, tech: 0, threat };
}

function strike(unit, damage) {
  unit.hp = Math.max(0, unit.hp - damage);
  unit.hit = 0.24;
}

export function castTech(battle, id) {
  if (battle.tech > 0) return false;
  battle.tech = 6;
  if (id === 'mend') {
    for (const u of battle.allies) if (u.hp > 0) u.hp = Math.min(u.max, u.hp + u.max * 0.38);
  } else if (id === 'break') {
    battle.burst = 5;
    battle.slow = 3;
    for (const u of battle.enemies) u.attack += 1.2;
  } else {
    for (const u of battle.enemies) strike(u, (id === 'nova' ? 28 : 14) + battle.sec * 0.16);
  }
  return true;
}

export function updateSkirmish(battle, dt) {
  const { allies, enemies, stance } = battle;
  battle.sec += dt;
  battle.tech = Math.max(0, battle.tech - dt);
  battle.slow = Math.max(0, battle.slow - dt);
  battle.burst -= dt * (battle.slow > 0 ? 0.4 : 1);
  for (const unit of [...allies, ...enemies]) unit.hit = Math.max(0, unit.hit - dt);

  for (const u of allies) {
    if (u.hp <= 0) continue;
    if (stance === 'split') u.lane = u.homeLane === battle.lane ? (u.homeLane + 1) % 3 : u.homeLane;
    else u.lane = u.homeLane;
  }
  for (const [side, other, allied] of [[allies, enemies, true], [enemies, allies, false]]) {
    for (const u of side) {
      if (u.hp <= 0) continue;
      const target = other.filter((x) => x.hp > 0).sort((a, b) =>
        (Math.abs(a.x - u.x) + 11 * Math.abs(a.lane - u.lane)) -
        (Math.abs(b.x - u.x) + 11 * Math.abs(b.lane - u.lane)))[0];
      if (!target) break;
      const speed = allied ? stance === 'push' ? 16 : 10 : battle.slow > 0 ? 4 : 10;
      const goal = allied && stance === 'guard' ? 29 + 4 * u.lane : target.x + (allied ? -1 : 1) * (u.range - 2);
      u.x = clamp(u.x + clamp(goal - u.x, -speed * dt, speed * dt), allied ? 10 : 34, allied ? 68 : 96);
      u.attack -= dt;
      if (u.attack <= 0 && Math.abs(u.x - target.x) <= u.range + 2) {
        strike(target, u.power * (allied ? stance === 'guard' ? 0.66 : stance === 'split' ? 0.86 : 1 : stance === 'guard' ? 0.45 : 1));
        u.attack = allied ? 0.78 : 1.06;
      }
    }
  }

  if (battle.burst <= 0) {
    for (const u of allies) if (u.lane === battle.lane && u.hp > 0) strike(u, (22 + battle.threat) * (stance === 'guard' ? 0.38 : 1));
    battle.burst = 4.9;
    const counts = [0, 0, 0];
    for (const u of allies) if (u.hp > 0) counts[u.homeLane] += u.hp;
    battle.lane = counts.indexOf(Math.max(...counts));
  }
  if (enemies.every((u) => u.hp <= 0)) return 'win';
  if (allies.every((u) => u.hp <= 0) || battle.sec > 28) return 'lose';
  return null;
}
