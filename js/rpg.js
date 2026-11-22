// レベル・戦闘・宇宙の魔物・救難信号・お金と持ち物 (Sim に足すメソッド)
import { rand, randInt, pick, chance, hashStr } from './util.js?v=55';
import { powerAt, MAX_LEVEL, worldsWithin, OBSERVER_LEVEL, WORLD_RANK } from './model.js?v=55';
import { splitTypes, monsterType } from './types.js?v=55';
import { learnset, makeUnit, bestMoves, startBattle, battleTurn, autoBattle, boost } from './battle.js?v=55';
import { ITEMS, SELLERS } from './items.js?v=55';
import { TOP_FLOOR, towerById, floorName, floorStats, floorCoins } from './tower.js?v=55';

const TURN_SEC = 0.9; // 自動の戦闘の1ターンの長さ (秒)
const FIGHT_MIN = 2 / 60, FIGHT_MAX = 8 / 60; // 自動の戦闘の長さ (分)
const SOS_RANGE = 3; // 救難信号が届く世界線の距離
const SOS_EVERY = 180; // 操作していないキャラが救難信号を出し直す間隔 (分)
const TRANSIT_MIN_LV = 20;
export const TRANSIT_BASE = 200; // 宇宙の魔物の種族値 (1能力あたり)
const SAFE_ODDS = 0.5; // 操作していないキャラが世界線移動に出る勝率の目安

const monsterMoves = (type) => [
  { key: `m:${type}`, nm: `${type}のかみつき`, types: [type], cat: 'p', contact: true, pw: 80, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
  { key: `m2:${type}`, nm: `${type}の波動`, types: [type], cat: 's', contact: false, pw: 80, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
  { key: 'm:無', nm: '体当たり', types: ['無'], cat: 'p', contact: true, pw: 60, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
];

export const RPG = {
  runPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => this.t >= p.at);
    this.pending = this.pending.filter((p) => this.t < p.at);
    for (const p of due) p.fn();
  },
  recover(c) {
    c.downUntil = null;
    c.state = 'ok';
    c.act = { cat: 'daily', label: '目を覚ました', until: this.t, kind: 'idle' };
  },

  // ---------- 特性 ----------
  // 通常特性1・2のうち、キャラごとに決まった方を使う
  abilityOptions(c) { return c.abilities.map((a, i) => ({ a, i })).filter((x) => x.a && (x.i < 2 || c.lv >= 100)); },
  abilityOf(c) {
    const list = this.abilityOptions(c);
    if (!list.length) return '';
    const hit = list.find((x) => x.i === c.ability);
    return (hit ?? list[hashStr('ab:' + c.id) % list.length]).a;
  },

  // ---------- 戦う人を作る ----------
  charUnit(c, foes) {
    if (!this.learned.has(c.id)) this.learned.set(c.id, learnset(c));
    const k = (c.halvedDay === this.day ? 0.5 : 1) * (c.trainDay === this.day ? 1.1 : 1);
    const u = makeUnit({ id: c.id, name: c.name, types: splitTypes(c.type), stats: c.stats, lv: c.lv, ability: this.abilityOf(c), moves: this.learned.get(c.id), cost: c.cost, sym: c.hani, canGk: true, item: this.heldItem(c), zoku: c.zoku, char: c });
    if (k !== 1) { for (const s of ['A', 'B', 'C', 'D', 'S', 'H']) u.st[s] = Math.max(1, Math.floor(u.st[s] * k)); u.max = u.hp = u.st.H; }
    u.moves = bestMoves(u, foes);
    return u;
  },
  heldItem(c) {
    const it = c.held && ITEMS[c.held];
    return it ? { nm: it.name, ...it.held } : null;
  },
  monsterUnit(mo, i = 0) {
    const b = mo.base, name = `${mo.boss ? '大魔物' : '魔物'}`;
    const u = makeUnit({ id: 'm' + (mo.id ?? i), name, types: mo.type, stats: [b * (mo.boss ? 1.4 : 1), b, b, b, b, b * 0.9], lv: mo.lv, moves: monsterMoves(mo.type[0]) });
    return u;
  },
  summon(m, spec) {
    const pool = this.m.chars.filter((o) => o.id !== m.id && (spec.kin ? o.zoku === spec.kin : this.wname(o.home) === spec.world));
    if (!pool.length) return null;
    const o = pick(pool), lv = spec.lv ?? Math.max(1, Math.ceil(m.lv * spec.lvR));
    const u = makeUnit({ id: 's:' + o.id, name: o.name, types: splitTypes(o.type), stats: o.stats, lv, moves: learnset(o), cost: o.cost, sym: o.hani });
    u.moves = bestMoves(u, [m]);
    return u;
  },
  // 戦闘中にアイテムを使う (id が空なら特性「店の店主」の品物)
  battleItem(B, m, id, say, heal) {
    const c = m.src.char;
    const it = ITEMS[id ?? pick(['kizu', 'power', 'guard', 'speed', 'nandemo'])];
    if (id) { if (!c?.items[id]) return; this.takeItem(c, id); if (m.ab.unburden) { m.st.S *= 2; say(`${m.nm}は 身軽になった！`); } }
    say(`${m.nm}は ${it.name}を 使った！`);
    if (it.kind === 'heal' && heal(m, m.max * it.hp)) say(`${m.nm}の HPが 回復した！`);
    if (it.kind === 'cure') { m.ss = {}; say(`${m.nm}の 状態異常が 治った！`); }
    if (it.kind === 'buff') boost(B, m, it.st, it.n);
    if (it.kind === 'shield') { m.vol.sh = { hp: Math.floor(m.max * 0.4), B: null, D: null, col: null }; m.vol.shEnd = 999; say(`${m.nm}は シールドを張った！`); }
  },
  // 操作していないキャラの戦闘中の判断
  npcChoice(u, space) {
    const c = u.src.char;
    if (!c) return null;
    const r = u.hp / u.max;
    if (r < 0.4) {
      const id = ['manten', 'kizu2', 'kizu'].find((x) => c.items[x]);
      if (id) return { t: 'item', id };
    }
    if (r < 0.2 && !space && c.items.bread) { this.takeItem(c, 'bread'); return { t: 'run' }; }
    return null;
  },

  // ---------- 戦闘 ----------
  newBattle(left, right, opts = {}) {
    return startBattle(left, right, {
      slots: [Math.min(3, left.length), 1], quiet: this.quiet, summon: (m, f) => this.summon(m, f),
      useItem: (m, id, say, heal) => this.battleItem(this.curB, m, id, say, heal), ...opts,
    });
  },
  // 経過を「何秒に、誰のHPが何%」の列にまとめる (見ている人の画面ではこれを再生する)
  timeline(B, sec) {
    const ids = [], tl = [], last = {};
    const steps = B.q.filter((x) => x.hp);
    steps.forEach((st, i) => {
      for (const [id, hp, max] of st.hp) {
        if (!ids.includes(id)) ids.push(id);
        const p = Math.round((Math.max(0, hp) / max) * 100);
        if (last[id] !== p) { last[id] = p; tl.push([Math.round((i / Math.max(1, steps.length)) * sec * 10) / 10, ids.indexOf(id), p]); }
      }
    });
    return { ids, tl };
  },
  addFight(place, left, right, B, extra = {}) {
    if (this.quiet) return null;
    const sec = extra.sec ?? this.fightSec(B) * 60;
    const f = { id: this.nextFightId++, ...place, left: left.map((u) => [u.id, u.nm, u.lv]), right: right.map((u) => [u.id, u.nm, u.lv]), start: this.t, sec, ...this.timeline(B, sec), ...extra };
    this.fights.push(f);
    return f;
  },
  updateFights() {
    this.fights = this.fights.filter((f) => this.t <= f.start + (f.sec + 1) / 60);
  },
  // 今の時点の全員のHP (見ている人の画面で、記録された経過を再生する)
  fightBars(f) {
    const names = new Map([...f.left, ...f.right].map(([id, nm, lv], i) => [id, { id, nm, lv, side: i < f.left.length ? 0 : 1 }]));
    if (f.bars) return f.bars.map(([id, nm, lv, hp, max, sh, ss]) => ({ id, nm, lv, pct: (hp / max) * 100, hp, max, sh, ss, side: names.get(id)?.side ?? 0 }));
    const sec = (this.t - f.start) * 60, pct = {};
    for (const [t, i, p] of f.tl || []) { if (t > sec) break; pct[f.ids[i]] = p; }
    return (f.ids || []).map((id) => ({ ...(names.get(id) || { id, nm: '仲間', lv: 0, side: 0 }), pct: pct[id] ?? 100 }));
  },
  fightOf(id) { return this.fights.find((f) => f.left?.some((x) => x[0] === id) || f.right?.some((x) => x[0] === id)); },
  fightSec(B) { return Math.min(FIGHT_MAX, Math.max(FIGHT_MIN, (B.turn * TURN_SEC) / 60)); },
  // 戦う仲間 (同じ場所にいて動ける人。3人まで同時に、残りは控え)
  fighters(c) { return this.partyOf(c).filter((p) => p.state !== 'down').slice(0, 6); },
  // 観戦用に戦闘の経過を記録し、結果を返す
  fight(c, foes, place, { space = false } = {}) {
    const left = this.fighters(c).map((p) => this.charUnit(p, foes));
    const B = this.curB = this.newBattle(left, foes);
    while (!B.done && B.turn < 30) battleTurn(B, (u) => (u.s === 0 ? this.npcChoice(u, space) : null));
    if (!B.done) autoBattle(B, 30);
    this.addFight(place, left, foes, B);
    return { win: B.win === 0, fled: B.fled === 0, kills: foes.filter((m) => m.hp <= 0).length, sec: this.fightSec(B) };
  },
  // ---------- レイド ----------
  raidStats(w) {
    const lv = this.worldLevel(w) + 3, base = 120 + w.danger;
    return { lv, base, power: Math.round(powerAt(Array(6).fill(base), lv) * 5 * rand(0.9, 1.2)) };
  },
  // 集まった全員でボスと戦う。1〜2分かけて決着する
  raidBattle(r, fighters) {
    const type = r.type[0], moves = [
      { key: 'r1', nm: '大地を砕く一撃', types: [type], cat: 'p', contact: true, pw: 110, acc: 95, pp: 99, pri: 0, cond: '', eff: '', rng: 'eA', fx: { ss: [], st: [], ok: [] } },
      { key: 'r2', nm: '破滅の波動', types: [type], cat: 's', contact: false, pw: 100, acc: 100, pp: 99, pri: 0, cond: '', eff: '', rng: 'eA', fx: { ss: [], st: [], ok: [] } },
    ];
    const boss = makeUnit({ id: 'raid' + r.id, name: r.name, types: r.type, stats: Array(6).fill(r.base), lv: r.lv, moves });
    const left = fighters.flatMap((c) => this.partyOf(c).filter((p) => p.world === r.world && p.state !== 'down')).slice(0, 12).map((c) => this.charUnit(c, [boss]));
    boss.max = boss.hp = boss.max * (3 + left.length);
    const B = this.curB = this.newBattle(left, [boss], { slots: [Math.min(8, left.length), 1] });
    autoBattle(B, 60);
    const min = rand(1, 2);
    r.won = B.win === 0;
    r.until = this.t + (this.quiet ? 0 : min);
    this.addFight({ world: r.world, x: r.x, z: r.z, raid: r.id }, left, [boss], B, { sec: min * 60 });
  },

  // ---------- 世界線の魔物 ----------
  worldLevel(w) { return w.residents.length ? OBSERVER_LEVEL : Math.round(OBSERVER_LEVEL * 0.8); },
  rollMonster(w, opts = {}) {
    const boss = opts.boss ?? chance(0.06);
    const lv = Math.max(1, Math.min(MAX_LEVEL, Math.round(this.worldLevel(w) * rand(0.75, 1.15)) + Math.floor(w.danger / 12) + (boss ? 2 : 0)));
    const base = Math.round(50 + w.danger * 1.3 + rand(-6, 6));
    return { lv, base, boss, power: powerAt(Array(6).fill(base), lv) };
  },
  killCoin(mo) { return Math.round((8 + mo.lv * 3) * (mo.boss ? 3 : 1)); },
  winSpoils(c, foes) {
    c.coins += foes.reduce((coin, monster) => coin + this.killCoin(monster), 0);
    if (this.abilityOf(c).startsWith('「ものひろい') && chance(0.1)) this.addItem(c, pick(['kizu', 'onigiri', 'nandemo']));
  },

  // ---------- 世界線移動の魔物 ----------
  routeLevel(from, to) {
    const W = this.m.worlds, d = Math.max(W.get(from).danger, W.get(to).danger);
    return Math.max(TRANSIT_MIN_LV + Math.floor(d / 4), Math.round(OBSERVER_LEVEL * 0.8));
  },
  spaceFoes(from, to) {
    const W = this.m.worlds, lv = this.routeLevel(from, to), type = W.get(pick([from, to]));
    const n = randInt(2, 3);
    return Array.from({ length: n }, (_, i) => {
      const t = monsterType(type);
      return { id: `sp${this.nextMonsterId++}`, lv, base: TRANSIT_BASE, type: t, boss: false, i };
    });
  },
  // 模擬戦の勝率。結果はレベルと行き先の強さごとに覚えておく
  travelOdds(c, to) {
    const from = c.world, lv = this.routeLevel(from, to);
    const key = `${c.id}:${c.lv}:${lv}:${c.abilities.indexOf(this.abilityOf(c))}`;
    if (this.oddsCache.has(key)) return this.oddsCache.get(key);
    let win = 0;
    const was = this.quiet;
    this.quiet = true;
    for (let i = 0; i < 6; i++) {
      const foes = this.spaceFoes(from, to).map((m) => this.monsterUnit(m));
      const B = this.curB = this.newBattle([this.charUnit(c, foes)], foes);
      autoBattle(B, 30);
      if (B.win === 0) win++;
    }
    this.quiet = was;
    this.oddsCache.set(key, win / 6);
    if (this.oddsCache.size > 4000) this.oddsCache.clear();
    return win / 6;
  },
  safeHop(c, to) { return this.travelOdds(c, to) >= SAFE_ODDS; },
  // 世界団の移動では魔物に2回遭う
  danOdds(c, toDan) { return this.travelOdds(c, this.edgeOf(toDan)) ** 2; },
  safeDan(c, toDan) { return this.danOdds(c, toDan) >= SAFE_ODDS; },
  // 飛んでいる途中で魔物に遭う時刻
  planEncounters(kind, start, end, t1, t2) {
    if (kind === 'dan') return [t1 ?? start + (end - start) * 0.25, t2 ?? end - (end - start) * 0.25];
    return [start + (end - start) * rand(0.35, 0.65)];
  },
  stepTransit(c) {
    const tr = c.transit;
    if (tr.downed) {
      if (c.state !== 'down') c.state = 'down';
      if (tr.downed.respawn != null) { if (this.t >= tr.downed.respawn) this.respawnHome(c); return; }
      if (this.t >= tr.downed.next) this.sendSOS(c);
      return;
    }
    if (tr.pausedAt != null) return;
    if (tr.encs?.length && this.t >= tr.encs[0]) {
      tr.encs.shift();
      if (c.flags?.cloak) { delete c.flags.cloak; this.say(c, 'マントのおかげで見つからなかった'); return; }
      return this.spaceBattle(c);
    }
    if (this.t >= tr.end) this.arrive(c);
  },
  pauseTransit(tr) { tr.pausedAt = this.t; },
  resumeTransit(tr) {
    const d = this.t - tr.pausedAt;
    for (const k of ['start', 'end', 't1', 't2']) if (tr[k] != null) tr[k] += d;
    if (tr.encs) tr.encs = tr.encs.map((t) => t + d);
    tr.pausedAt = null;
  },
  spaceBattle(c) {
    const tr = c.transit;
    this.pauseTransit(tr);
    const defs = this.spaceFoes(tr.from, tr.to), foes = defs.map((m) => this.monsterUnit(m));
    const end = (r) => {
      if (!c.transit) return;
      if (r.win) { this.winSpoils(c, defs); c.kills += defs.length; this.resumeTransit(tr); this.say(c, pick(['なんとか切り抜けた！', 'ふぅ、危なかった', '宇宙は物騒だ…'])); }
      else this.fallInSpace(c);
    };
    const r = this.fight(c, foes, { transit: c.id }, { space: true });
    if (!r) return;
    if (this.quiet) return end(r);
    tr.fightEnd = { at: this.t + r.sec, r };
    this.pending.push({ at: this.t + r.sec, fn: () => end(r) });
  },
  fallInSpace(c) {
    const tr = c.transit;
    tr.downed = { t: this.t, next: this.t + 20, sos: 0 };
    for (const p of this.partyOf(c)) { p.state = 'down'; p.downs++; p.bubble = null; this.emote(p, '💫'); }
    if (this.daily) this.daily.downs += this.partyOf(c).length;
    const a = this.wname(tr.from), b = this.wname(tr.to);
    this.log(`💫 ${this.partyNames(c)}が「${a}」と「${b}」の間の宇宙で魔物に敗れ、倒れている`, tr.from, this.partyOf(c).map((p) => p.id), true, { kind: 'space-down' });
  },
  respawnHome(c) {
    c.transit = null;
    this.sendHome(c, `${c.name}は宇宙で倒れ、家で目を覚ました`);
  },
  // 救難信号: 倒れた場所の両端から3マス以内の世界線に届く
  sosWorlds(tr) {
    const W = this.m.worlds, out = new Set();
    for (const id of [tr.from, tr.to]) for (const w of worldsWithin(W, id, SOS_RANGE).keys()) out.add(w);
    return out;
  },
  sendSOS(c) {
    const tr = c.transit;
    if (!tr?.downed) return false;
    tr.downed.next = this.t + SOS_EVERY;
    tr.downed.sos++;
    const reach = this.sosWorlds(tr);
    this.log(`🆘 ${c.name}が宇宙から救難信号を出した！（「${this.wname(tr.from)}」の周辺に届いている）`, tr.from, [c.id], true, { kind: 'sos' });
    if (tr.downed.helper) return true;
    const cands = this.m.chars.filter((o) => reach.has(o.world) && o !== c && o.rank >= WORLD_RANK && this.m.worlds.get(o.world).dan === this.m.worlds.get(tr.to).dan && this.free(o) && !o.trip && !o.party.length && o.pts >= 1 && this.travelOdds(o, tr.to) >= 0.4);
    cands.sort((a, b) => (c.friends[b.id] || 0) - (c.friends[a.id] || 0) || b.lv - a.lv);
    if (cands[0]) this.goRescue(cands[0], c);
    return true;
  },
  goRescue(o, c) {
    const tr = c.transit;
    if (!tr?.downed || o.transit || o.rank < WORLD_RANK || this.m.worlds.get(o.world)?.dan !== this.m.worlds.get(tr.to)?.dan) return false;
    tr.downed.helper = o.id;
    o.pts = Math.max(0, o.pts - 1);
    this.say(o, `${c.name}を助けに行く！`);
    this.log(`🚑 ${o.name}が${c.name}の救難信号を受けて宇宙へ向かった`, o.world, [o.id, c.id], true);
    this.startTransit(o, 'line', o.world, tr.to, rand(3, 5), { rescue: c.id });
    return true;
  },
  rescue(c, by) {
    const tr = c.transit;
    if (!tr?.downed) return;
    for (const p of this.partyOf(c)) p.state = 'ok';
    tr.downed = null;
    this.resumeTransit(tr);
    tr.encs = [];
    this.addFriend(c, by, 6);
    this.emote(c, '😭');
    this.say(c, 'ありがとう…！');
    this.log(`🚑 ${by.name}が宇宙で倒れていた${c.name}を助け出した！`, tr.to, [by.id, c.id], true, { kind: 'rescued' });
  },
  // 同じ道を通りかかった人が見つけて助ける
  passBy(traveler, from, to) {
    for (const o of this.m.chars) {
      const tr = o.transit;
      if (!tr?.downed || o === traveler) continue;
      if ((tr.from === from && tr.to === to) || (tr.from === to && tr.to === from)) { this.rescue(o, traveler); return; }
    }
  },
  spaceDowned() { return this.m.chars.filter((c) => c.transit?.downed); },

  // ---------- 持ち物 ----------
  addItem(c, id, n = 1) {
    const it = ITEMS[id];
    if (it.kind === 'food') return;
    c.items[id] = Math.min(it.max ?? 99, (c.items[id] || 0) + n);
  },
  takeItem(c, id, n = 1) {
    c.items[id] -= n;
    if (c.items[id] <= 0) delete c.items[id];
    if (c.held === id && !c.items[id]) c.held = null;
  },
  // 店を開いている人 (同じ世界線にいて起きている人)
  seller(kind, world) {
    return this.m.chars.find((o) => SELLERS[kind].includes(o.name) && o.world === world && o.state === 'ok' && !o.transit);
  },
  buy(c, id, n = 1) {
    const it = ITEMS[id];
    const s = it && this.seller(it.shop, c.world);
    if (!s) return '店の人がいない';
    if (s === c) return '自分の店';
    if (it.max && (c.items[id] || 0) + n > it.max) return `${it.max}個までしか持てない`;
    const cost = it.price * n;
    if (c.coins < cost) return 'コインが足りない';
    c.coins -= cost;
    s.coins += cost;
    this.addItem(c, id, n);
    this.addFriend(c, s, 1);
    this.log(`🛍️ ${c.name}が${s.name}から${it.name}を買った`, c.world, [c.id, s.id], false);
    return null;
  },
  sendHome(c, text = null) {
    const h = this.m.worlds.get(c.home).geo.homes[c.id];
    if (c.trip) this.endTrip(c);
    c.world = c.home; c.x = h.x; c.z = h.z; c.state = 'ok'; c.walking = false; c.dest = null;
    c.act = { cat: 'daily', label: '家で休んでいる', until: this.t + 5, kind: 'idle' };
    if (text) this.log(`🏠 ${text}`, c.home, [c.id], false);
  },

  // ---------- レモンタワー ----------
  towerOpen(c, t) { return !t.need || (c.tower[t.need] || 0) >= TOP_FLOOR; },
  // 塔の入り口まで歩いて、次の階に挑む
  goTower(c, id) {
    const t = towerById(id), w = this.m.worlds.get(c.world);
    if (!t) return '知らない塔';
    if (!w.geo.tower) return 'レモンタワーは現代にある';
    if (!this.towerOpen(c, t)) return `${towerById(t.need).name}をクリアすると入れる`;
    if ((c.tower[id] || 0) >= TOP_FLOOR) return 'もうクリアしている';
    const p = w.geo.tower; // 塔の正面まで歩く
    this.setAct(c, 'battle', `${t.name}に挑む`, 0, { x: p.x - Math.cos(p.a) * 8, z: p.z - Math.sin(p.a) * 8 }, 'towerGate', id, `${t.name}へ向かっている`);
    return null;
  },
  enterTower(c, id) {
    const t = towerById(id), f = (c.tower[id] || 0) + 1, st = floorStats(t, f);
    const defs = Array.from({ length: st.count }, (_, i) => ({ id: `t${this.nextMonsterId++}`, lv: st.lv, base: st.base, boss: st.boss && i === 0, type: monsterType(this.m.worlds.get(c.world)) }));
    const foes = defs.map((m) => this.monsterUnit(m));
    const act = c.act = { cat: 'battle', label: `${t.name} ${floorName(f)}`, until: Infinity, kind: 'tower' };
    const end = (r) => {
      if (c.act === act) c.act = { cat: 'daily', label: '待機中', until: this.t, kind: 'idle' };
      if (r.fled) return;
      if (!r.win) {
        this.log(`💫 ${c.name}が${t.name}の${floorName(f)}で敗れた`, c.world, [c.id], false);
        for (const p of this.partyOf(c)) if (p.world === c.world) { this.knockDown(p); this.emote(p, '💫'); }
        return;
      }
      c.tower[id] = f;
      const coin = floorCoins(t, f);
      c.coins += coin;
      this.winSpoils(c, defs);
      c.kills += defs.length;
      if (st.boss) this.log(`🍋 ${c.name}が${t.name}の${floorName(f)}をクリアした！`, c.world, [c.id], st.top || f % 50 === 0);
      if (st.top) { this.emote(c, '🎉'); this.say(c, `${t.name}、制覇！`, 40); }
    };
    const r = this.fight(c, foes, { world: c.world, x: c.x, z: c.z, tower: id });
    if (!r) return;
    if (this.quiet) return end(r);
    this.pending.push({ at: this.t + r.sec, fn: () => end(r) });
  },
  // ゆとりがあるキャラは、近くの店で買い物をする。
  npcShopping(c) {
    if (c.coins <= 900 || !chance(0.2)) return false;
    const s = this.seller('general', c.world);
    if (!s || s === c) return false;
    this.buy(c, pick(['kizu', 'kizu2']));
    return this.setAct(c, 'shopping', `${s.name}の店で買い物`, 20, { x: s.x + 1.5, z: s.z }, 'idle', null, '店へ向かっている');
  },
};
