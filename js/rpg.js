// レベル・戦闘・宇宙の魔物・救難信号・お金と持ち物 (Sim に足すメソッド)
import { rand, randInt, pick, chance, MIN_PER_DAY, hashStr } from './util.js?v=49';
import { powerAt, MAX_LEVEL, worldsWithin } from './model.js?v=49';
import { splitTypes } from './types.js?v=49';
import { learnset, makeUnit, bestMoves, startBattle, battleTurn, autoBattle, boost, canUseMove } from './battle.js?v=49';
import { ITEMS, SELLERS, sellPrice, onlinePrice } from './items.js?v=49';
import { TOP_FLOOR, towerById, floorName, floorStats, floorCoins } from './tower.js?v=49';

const TURN_SEC = 0.9; // 自動の戦闘の1ターンの長さ (秒)
const FIGHT_MIN = 2 / 60, FIGHT_MAX = 8 / 60; // 自動の戦闘の長さ (分)
const CHOOSE_SEC = 15; // 手動の戦闘で、技を選ばずに待つ長さ
export const CTRL_EXPIRE = 14 * MIN_PER_DAY; // この間アクセスがなければ操作権を手放す
export const CTRL_ONLINE = 0.6; // 操作している人が見ていると判断する間隔 (分)
const SOS_RANGE = 3; // 救難信号が届く世界線の距離
const SOS_EVERY = 180; // 操作していないキャラが救難信号を出し直す間隔 (分)
const TRANSIT_MIN_LV = 20;
export const TRANSIT_BASE = 200; // 宇宙の魔物の種族値 (1能力あたり)
export const DOWN_MIN = 3; // 操作中のキャラがやられた時に動けない長さ (分)
const SAFE_ODDS = 0.5; // 操作していないキャラが世界線移動に出る勝率の目安

const monsterMoves = (type) => [
  { key: `m:${type}`, nm: `${type}のかみつき`, types: [type], cat: 'p', contact: true, pw: 80, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
  { key: `m2:${type}`, nm: `${type}の波動`, types: [type], cat: 's', contact: false, pw: 80, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
  { key: 'm:無', nm: '体当たり', types: ['無'], cat: 'p', contact: true, pw: 60, acc: 100, pp: 40, pri: 0, cond: '', eff: '', fx: { ss: [], st: [], ok: [] } },
];

export const RPG = {
  // ---------- レベル ----------
  expNeed(lv) { return Math.round(6 + 0.6 * lv ** 1.75); },
  gainExp(c, n) {
    if (c.lv >= MAX_LEVEL) return;
    c.exp += Math.round(n * (this.abilityOf(c).startsWith('「おためし') ? 1.2 : 1));
    let up = 0;
    while (c.lv < MAX_LEVEL && c.exp >= this.expNeed(c.lv)) { c.exp -= this.expNeed(c.lv); c.lv++; up++; }
    if (!up) return;
    this.emote(c, '🆙');
    if (c.lv % 10 === 0 || c.ctrl) this.log(`🆙 ${c.name}がLv${c.lv}になった！`, c.transit ? c.home : c.world, [c.id], c.lv % 10 === 0);
  },
  // 全員の真ん中のレベル (1時間ごとに計算する)
  updateLevels() {
    const L = this.m.chars.map((c) => c.lv).sort((a, b) => a - b);
    this.lvMedian = L[L.length >> 1];
    // 周りより遅れすぎたキャラには、時間で少しずつ経験値が入る
    for (const c of this.m.chars) if (c.lv < this.lvMedian * 0.6 && this.lvMedian - c.lv >= 3) this.gainExp(c, Math.ceil(this.expNeed(c.lv) * 0.1));
  },

  // ---------- 特性 ----------
  // 通常特性1・2はどちらか、夢特性は Lv100 から。操作していないキャラはキャラごとに決まった方を使う
  abilityOptions(c) { return c.abilities.map((a, i) => ({ a, i })).filter((x) => x.a && (x.i < 2 || c.lv >= 100)); },
  abilityOf(c) {
    const list = this.abilityOptions(c);
    if (!list.length) return '';
    const hit = list.find((x) => x.i === c.ability);
    return (hit ?? list[hashStr('ab:' + c.id) % list.length]).a;
  },

  // ---------- 戦う人を作る ----------
  charUnit(c, foes, manual = false) {
    if (!this.learned.has(c.id)) this.learned.set(c.id, learnset(c));
    const k = (c.halvedDay === this.day ? 0.5 : 1) * (c.trainDay === this.day ? 1.1 : 1);
    const u = makeUnit({ id: c.id, name: c.name, types: splitTypes(c.type), stats: c.stats, lv: c.lv, ability: this.abilityOf(c), moves: this.learned.get(c.id), cost: c.cost, sym: c.hani, canGk: true, item: this.heldItem(c), zoku: c.zoku, char: c });
    if (k !== 1) { for (const s of ['A', 'B', 'C', 'D', 'S', 'H']) u.st[s] = Math.max(1, Math.floor(u.st[s] * k)); u.max = u.hp = u.st.H; }
    if (!manual) u.moves = bestMoves(u, foes);
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
    if (!this.fights.length) return;
    // 手動の戦闘はホストが持っているので、ホストが替わると続きがなくなる
    this.fights = this.fights.filter((f) => (f.manual ? [...this.live.values()].some((L) => L.f === f) : this.t <= f.start + (f.sec + 1) / 60));
    for (const [id, L] of this.live) {
      if (L.done) { this.live.delete(id); continue; }
      if (this.t >= L.deadline || !this.ownerOnline(L.c)) this.manualTurn(L, null);
    }
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
  // まとめて戦って結果を返す。操作中で本人が見ていれば手動の戦闘を始めて null を返す
  fight(c, foes, place, onEnd, opts = {}) {
    const space = !!opts.space;
    const manual = this.isManual(c);
    const left = this.fighters(c).map((p) => this.charUnit(p, foes, manual && p === c));
    if (manual) return this.startManual(c, left, foes, place, onEnd, space);
    const B = this.curB = this.newBattle(left, foes);
    while (!B.done && B.turn < 30) battleTurn(B, (u) => (u.s === 0 ? this.npcChoice(u, space) : null));
    if (!B.done) autoBattle(B, 30);
    this.addFight(place, left, foes, B);
    return { win: B.win === 0, fled: B.fled === 0, kills: foes.filter((m) => m.hp <= 0).length, sec: this.fightSec(B) };
  },
  isManual(c) { return !!c.ctrl && !c.ctrl.auto && !c.ctrl.home && this.ownerOnline(c) && !this.quiet; },
  ownerOnline(c) { return !!c.ctrl && this.t - c.ctrl.seen < CTRL_ONLINE; },

  // ---------- 手動の戦闘 ----------
  startManual(c, left, foes, place, onEnd, space) {
    const B = this.curB = this.newBattle(left, foes);
    const f = { id: this.nextFightId++, ...place, left: left.map((u) => [u.id, u.nm, u.lv]), right: foes.map((u) => [u.id, u.nm, u.lv]), start: this.t, manual: c.id, turn: 0, text: [], bars: this.bars(B) };
    this.fights.push(f);
    const L = { c, B, f, me: left.find((u) => u.src.char === c), onEnd, space, deadline: this.t + CHOOSE_SEC / 60, seen: 0 };
    this.live.set(f.id, L);
    this.pushManual(L);
    if (B.done) this.endManual(L);
    return null;
  },
  bars(B) { return B.sd.flatMap((x) => x.tm.map((u) => [u.id, u.nm, u.lv, Math.max(0, u.hp), u.max, u.vol.sh?.hp || 0, Object.keys(u.ss)])); },
  pushManual(L) {
    const { B, f, me } = L;
    f.turn = B.turn;
    f.bars = this.bars(B);
    f.text = B.q.filter((x) => x.t).slice(-14).map((x) => x.t);
    f.moves = me.moves.map((m, i) => [i, m.nm, m.types.join('／'), m.cat, m.pw, m.left, m.pp, canUseMove(B, me, m), m.eff || m.desc || '']);
    f.deadline = L.deadline;
  },
  manualTurn(L, x) {
    const { B, me } = L;
    if (L.done || B.done) return;
    this.curB = B;
    B.q = B.q.slice(-14);
    battleTurn(B, (u) => (u === me && x ? x : u.s === 0 ? this.npcChoice(u, L.space) : null));
    L.deadline = this.t + CHOOSE_SEC / 60;
    this.pushManual(L);
    if (B.done || B.turn >= 60) this.endManual(L);
  },
  endManual(L) {
    const { B, f, c } = L;
    if (!B.done) autoBattle(B, B.turn);
    L.done = true;
    f.result = B.fled === 0 ? 'fled' : B.win === 0 ? 'win' : 'lose';
    f.manual = null;
    f.start = this.t; f.sec = 3; f.ids = []; f.tl = [];
    L.onEnd({ win: B.win === 0, fled: B.fled === 0, kills: B.sd[1].tm.filter((m) => m.hp <= 0).length, sec: 0 });
    this.log(`⚔️ ${c.name}の戦闘が終わった（${f.result === 'win' ? '勝利' : f.result === 'fled' ? '逃走' : '敗北'}）`, c.transit ? c.home : c.world, [c.id], false);
  },

  // ---------- 世界線の魔物 ----------
  worldLevel(w) {
    const list = this.local(w.id);
    if (!list.length) return Math.max(1, Math.round((this.lvMedian || 1) * 0.8));
    return Math.max(1, Math.round(list.reduce((s, c) => s + c.lv, 0) / list.length));
  },
  rollMonster(w, opts = {}) {
    const boss = opts.boss ?? chance(0.06);
    const lv = Math.max(1, Math.min(MAX_LEVEL, Math.round(this.worldLevel(w) * rand(0.75, 1.15)) + Math.floor(w.danger / 12) + (boss ? 2 : 0)));
    const base = Math.round(50 + w.danger * 1.3 + rand(-6, 6));
    return { lv, base, boss, power: powerAt(Array(6).fill(base), lv) };
  },
  killExp(mo) { return Math.round((5 + mo.lv * 1.3) * (mo.boss ? 2.5 : 1) * (1 + (mo.base - 50) / 80)); },
  killCoin(mo) { return Math.round((8 + mo.lv * 3) * (mo.boss ? 3 : 1)); },
  winSpoils(c, foes) {
    const ps = this.partyOf(c).filter((p) => p.state !== 'down');
    let exp = 0, coin = 0;
    for (const m of foes) { exp += this.killExp(m); coin += this.killCoin(m); }
    for (const p of ps) this.gainExp(p, exp / Math.sqrt(ps.length));
    c.coins += coin;
    if (this.abilityOf(c).startsWith('「ものひろい') && chance(0.1)) this.addItem(c, pick(['kizu', 'onigiri', 'nandemo']));
  },

  // ---------- 世界線移動の魔物 ----------
  routeLevel(from, to) {
    const W = this.m.worlds, d = Math.max(W.get(from).danger, W.get(to).danger);
    return Math.max(TRANSIT_MIN_LV + Math.floor(d / 4), Math.round((this.lvMedian || 1) * 0.8));
  },
  spaceFoes(from, to) {
    const W = this.m.worlds, lv = this.routeLevel(from, to), type = W.get(pick([from, to]));
    const n = randInt(2, 3);
    return Array.from({ length: n }, (_, i) => {
      const t = this.pickMonsterType(type);
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
  safeHop(c, to) { return !!c.ctrl || this.travelOdds(c, to) >= SAFE_ODDS; },
  // 世界団の移動では魔物に2回遭う
  danOdds(c, toDan) { return this.travelOdds(c, this.edgeOf(toDan)) ** 2; },
  safeDan(c, toDan) { return !!c.ctrl || this.danOdds(c, toDan) >= SAFE_ODDS; },
  // 飛んでいる途中で魔物に遭う時刻
  planEncounters(kind, start, end, t1, t2) {
    if (kind === 'dan') return [t1 ?? start + (end - start) * 0.25, t2 ?? end - (end - start) * 0.25];
    return [start + (end - start) * rand(0.35, 0.65)];
  },
  stepTransit(c) {
    const tr = c.transit;
    if (tr.downed) {
      if (c.state !== 'down') c.state = 'down';
      // 操作中のキャラは、少し待つと家で起き上がる (倒れている途中で操作を始めた時も同じ)
      if (c.ctrl) tr.downed.respawn ??= this.t + DOWN_MIN;
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
    const r = this.fight(c, foes, { transit: c.id }, end, { space: true });
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
    this.notify(c, '家で目を覚ました');
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
    const cands = this.m.chars.filter((o) => reach.has(o.world) && o !== c && !this.playerHolds(o) && this.free(o) && !o.trip && !o.party.length && o.pts >= 1 && this.travelOdds(o, tr.to) >= 0.4);
    cands.sort((a, b) => (c.friends[b.id] || 0) - (c.friends[a.id] || 0) || b.lv - a.lv);
    if (cands[0]) this.goRescue(cands[0], c);
    return true;
  },
  goRescue(o, c) {
    const tr = c.transit;
    if (!tr?.downed || o.transit) return false;
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
    if (it.kind === 'food') { c.food += it.food * n; return; }
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
  sell(c, id, n = 1) {
    const it = ITEMS[id];
    const s = this.seller('buyer', c.world);
    if (!it || !s) return '買取屋がいない';
    if ((c.items[id] || 0) < n) return '持っていない';
    this.takeItem(c, id, n);
    c.coins += sellPrice(id) * n;
    return null;
  },
  distFromGenzai(world) {
    const W = this.m.worlds, A = [...W.values()].find((w) => w.name === '現代');
    const here = W.get(world);
    if (!here || !A) return 8;
    if (here.dan === A.dan) return worldsWithin(W, A.id, 30).get(world) ?? 8;
    return 8 + Math.abs(this.m.dans.indexOf(this.m.danById.get(here.dan)) - this.m.dans.indexOf(this.m.danById.get(A.dan)));
  },
  order(c, id, n = 1) {
    const it = ITEMS[id];
    if (!it || it.kind === 'bread') return 'GUDAZON では売っていない';
    const cost = onlinePrice(id, this.distFromGenzai(c.transit ? c.transit.from : c.world)) * n;
    if (c.coins < cost) return 'コインが足りない';
    c.coins -= cost;
    this.addItem(c, id, n);
    this.log(`📦 ${c.name}にGUDAZONから${it.name}が届いた`, c.transit ? c.home : c.world, [c.id], false);
    return null;
  },
  useField(c, id) {
    const it = ITEMS[id];
    if (!c.items[id]) return '持っていない';
    if (it.kind === 'food') { this.addItem(c, id); this.takeItem(c, id); return null; }
    if (it.kind === 'exp') {
      let need = 0, lv = c.lv;
      for (let n = it.exp; n > 0; n -= 1) { need += this.expNeed(lv) * Math.min(1, n); lv++; }
      this.takeItem(c, id);
      this.gainExp(c, need);
      return null;
    }
    if (id === 'ptTicket') { c.pts += it.pts; this.takeItem(c, id); return null; }
    if (id === 'cloak') { (c.flags ||= {}).cloak = 1; this.takeItem(c, id); return null; }
    if (id === 'homeWing') {
      if (c.transit) return '宇宙では使えない';
      this.takeItem(c, id);
      this.sendHome(c, `${c.name}はふるさとの翼で家に帰った`);
      return null;
    }
    if (id === 'beacon') {
      if (!c.transit?.downed) return '宇宙で倒れている時に使う';
      this.takeItem(c, id);
      this.rescue(c, c);
      return null;
    }
    if (it.kind === 'hold') { c.held = c.held === id ? null : id; return null; }
    return '戦闘中に使うアイテム';
  },
  sendHome(c, text = null) {
    const h = this.m.worlds.get(c.home).geo.homes[c.id];
    if (c.trip) this.endTrip(c);
    c.world = c.home; c.x = h.x; c.z = h.z; c.state = 'ok'; c.walking = false; c.dest = null;
    c.act = { cat: 'daily', label: '家で休んでいる', until: this.t + 5, kind: 'idle' };
    if (text) this.log(`🏠 ${text}`, c.home, [c.id], false);
  },

  // ---------- 食料 ----------
  morningFood(c) {
    if (c.transit?.downed || c.state === 'down') return;
    if (c.food > 0) { c.food--; c.hungry = 0; return; }
    c.hungry++;
    if (c.hungry < 3 || c.transit) return;
    // 魔物にやられた時と同じように3分倒れる。起きる時には食べ物を見つけている
    c.food = 5;
    c.hungry = 0;
    if (c.ctrl) { this.playerDown(c, `${c.name}は空腹で倒れ、家に運ばれた（${DOWN_MIN}分間動けない）`); c.act.label = '空腹で倒れている'; return; }
    c.walking = false;
    c.state = 'down';
    c.downUntil = this.t + DOWN_MIN;
    c.act = { cat: 'daily', label: '空腹で倒れている', until: Infinity, kind: 'idle' };
    this.log(`🍽️ ${c.name}が空腹で倒れた…`, c.world, [c.id], true);
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
    const defs = Array.from({ length: st.count }, (_, i) => ({ id: `t${this.nextMonsterId++}`, lv: st.lv, base: st.base, boss: st.boss && i === 0, type: this.pickMonsterType(this.m.worlds.get(c.world)) }));
    const foes = defs.map((m) => this.monsterUnit(m));
    const act = c.act = { cat: 'battle', label: `${t.name} ${floorName(f)}`, until: Infinity, kind: 'tower' };
    const end = (r) => {
      if (c.act === act) c.act = { cat: 'daily', label: '待機中', until: this.playerHolds(c) ? Infinity : this.t, kind: 'idle' };
      if (r.fled) return this.notify(c, 'タワーから逃げ出した');
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
      this.notify(c, `${floorName(f)}をクリア！ ${coin}コイン獲得`);
      if (st.boss) this.log(`🍋 ${c.name}が${t.name}の${floorName(f)}をクリアした！`, c.world, [c.id], st.top || f % 50 === 0);
      if (st.top) { this.emote(c, '🎉'); this.say(c, `${t.name}、制覇！`, 40); }
    };
    const r = this.fight(c, foes, { world: c.world, x: c.x, z: c.z, tower: id }, end);
    if (!r) return;
    if (this.quiet) return end(r);
    this.pending.push({ at: this.t + r.sec, fn: () => end(r) });
  },
  // 操作していないキャラの買い物。足りなくなったら店かGUDAZONで買う
  npcShopping(c, geo) {
    if (c.food <= 2) {
      const s = this.seller('food', c.world);
      if (s && s !== c && c.coins >= ITEMS.yasai.price) {
        this.buy(c, 'yasai');
        return this.setAct(c, 'shopping', `${s.name}の八百屋で買い物`, 20, { x: s.x + 1.5, z: s.z }, 'idle', null, '八百屋へ向かっている');
      }
      if (!this.order(c, 'yasai') || !this.order(c, 'onigiri')) { this.emote(c, '📦'); return false; }
    }
    if (c.coins > 900 && chance(0.2)) {
      const s = this.seller('general', c.world);
      if (s && s !== c) {
        const id = c.coins > 6000 ? 'candyL' : c.coins > 2000 ? 'candyM' : pick(['kizu', 'kizu2', 'candyS']);
        this.buy(c, id);
        if (ITEMS[id].kind === 'exp') this.useField(c, id);
        return this.setAct(c, 'shopping', `${s.name}の店で買い物`, 20, { x: s.x + 1.5, z: s.z }, 'idle', null, '店へ向かっている');
      }
      if (c.coins > 3000 && !this.order(c, 'candyS')) this.useField(c, 'candyS');
    }
    return false;
  },
};
