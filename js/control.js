// キャラ操作: 見ている人からの命令を受けて、そのキャラを動かす (Sim に足すメソッド)
// 命令はホストだけが実行する。結果は普段の同期で全員に届く
import { rand, randInt, pick, dist2, hashStr } from './util.js?v=46';
import { randomTown, powerAt } from './model.js?v=46';
import { monsterType } from './types.js?v=46';
import { makeUnit, autoBattle } from './battle.js?v=46';
import { ITEMS } from './items.js?v=46';
import { CTRL_EXPIRE, DOWN_MIN } from './rpg.js?v=46';

// 操作して何かをやり遂げた時のコイン (難しいことほど多い)
const ACT_COINS = { work: 30, training: 20, explore: 25, help: 20, social: 8, hobby: 6, sabori: 2, daily: 3 };
const OWN = ['ゴロゴロする', 'スマホをいじる', 'ぼーっとする', 'お菓子をつまむ', 'テレビを眺める'];

export const ownerHash = (token) => 'p' + hashStr('player:' + token).toString(36);

export const Control = {
  playerHolds(c) { return !!c.ctrl && !c.ctrl.auto && !c.ctrl.home; },
  ownerChar(who) { return this.m.chars.find((c) => c.ctrl?.owner === who) || null; },
  pickMonsterType(w) { return monsterType(w); },
  runPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => this.t >= p.at);
    this.pending = this.pending.filter((p) => this.t < p.at);
    for (const p of due) p.fn();
  },
  playerDown(c) {
    c.downs++;
    this.sendHome(c, `${c.name}はやられて家に戻された（${DOWN_MIN}分間動けない）`);
    c.state = 'down';
    c.downUntil = this.t + DOWN_MIN;
    c.bubble = null;
    c.act = { cat: 'battle', label: '倒れている', until: Infinity, kind: 'idle' };
  },
  recover(c) {
    c.downUntil = null;
    if (c.starveDay != null) return; // 空腹で倒れている時は、そちらの朝まで
    c.state = 'ok';
    c.act = { cat: 'daily', label: '待機中', until: this.playerHolds(c) ? Infinity : this.t, kind: 'idle' };
    this.notify(c, '動けるようになった');
  },
  // 操作した人に結果の一言を返す
  notify(c, text) { if (c.ctrl) c.ctrl.msg = { n: (c.ctrl.msg?.n || 0) + 1, text }; },
  expireControl() {
    for (const c of this.m.chars) if (c.ctrl && this.t - c.ctrl.seen > CTRL_EXPIRE) { c.ctrl = null; c.act.until = this.t; }
  },
  // 寝ないまま朝を迎えると、その日は力が半減する
  morningSleep(c) {
    if (!this.playerHolds(c) || c.transit?.downed || c.state === 'sleep') return;
    if (c.sleptKey === this.day - 1) return;
    c.halvedDay = this.day;
    this.log(`🥱 ${c.name}は寝ずに朝を迎えた（今日は戦闘力が半減）`, c.transit ? c.home : c.world, [c.id], false);
  },
  actReward(c, a) {
    if (!c.ctrl || a.kind === 'fight') return;
    const n = ACT_COINS[a.cat];
    if (n) c.coins += randInt(n, n * 2);
  },

  // ---------- 自動帰宅 ----------
  // いちばん安い道で家へ向かう。ptが足りなければ、足りる所まで進んで待つ
  stepHome(c) {
    if (c.world === c.home) {
      c.ctrl.home = false;
      this.notify(c, '家に着いた');
      c.act = { cat: 'daily', label: '待機中', until: Infinity, kind: 'idle' };
      return;
    }
    const w = this.m.worlds.get(c.world);
    if (w.dan !== c.dan) {
      const nd = this.nextDan(w.dan, c.dan);
      if (this.atEdge(c)) {
        if (nd && c.pts >= this.danPrice(c, nd)) return this.setAct(c, 'move', '世界線の果てへ', 0, w.geo.edge, 'danGate', { homeward: true, to: nd }, '世界線の果てへ向かっている');
        return this.waitPts(c);
      }
      return this.hopHome(c, this.danOf(c).edge);
    }
    return this.hopHome(c, c.home);
  },
  hopHome(c, target) {
    const nx = this.nextHop(c, target);
    if (nx && c.pts >= this.hopPrice(c, c.world, nx)) return this.goPortal(c, nx);
    return this.waitPts(c);
  },
  waitPts(c) { c.act = { cat: 'move', label: '移動ptがたまるのを待っている', until: this.t + 60, kind: 'idle' }; },

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

  // ---------- 命令 ----------
  command(token, cid, op, a = {}) {
    const who = ownerHash(token), c = this.m.charById.get(cid);
    if (!c) return;
    if (op === 'claim') {
      if (c.ctrl) return;
      const had = this.ownerChar(who);
      if (had) return this.notify(had, '操作できるのは1人1キャラまで');
      return this.takeControl(c, who);
    }
    if (c.ctrl?.owner !== who) return;
    c.ctrl.seen = this.t;
    if (op === 'ping') return;
    if (op === 'release') { c.ctrl = null; c.act.until = this.t; return; }
    const err = this.runCommand(c, op, a);
    if (typeof err === 'string') this.notify(c, err);
  },
  takeControl(c, who) {
    if (c.partyLeader) {
      const L = this.m.charById.get(c.partyLeader);
      if (L) L.party = L.party.filter((id) => id !== c.id);
      c.partyLeader = null;
    }
    for (const id of c.party) { const o = this.m.charById.get(id); if (o) o.partyLeader = null; }
    c.party = [];
    c.trip = null;
    c.ctrl = { owner: who, seen: this.t, auto: false, home: false };
    if (!c.transit && c.state !== 'down') c.act = { cat: 'daily', label: '待機中', until: Infinity, kind: 'idle' };
  },
  canAct(c) {
    if (c.transit) return '移動中はできない';
    if (c.state === 'down') return '倒れていて動けない';
    if (['fight', 'raid', 'defend', 'portal', 'danGate'].includes(c.act.kind)) return '今は手が離せない';
    return null;
  },
  runCommand(c, op, a) {
    const geo = c.transit ? null : this.m.worlds.get(c.world).geo;
    switch (op) {
      case 'auto': c.ctrl.auto = !!a.on; if (a.on) c.ctrl.home = false; c.act.until = Math.min(c.act.until, this.t); return null;
      case 'home': c.ctrl.home = !!a.on; if (a.on) c.ctrl.auto = false; if (!c.transit) c.act.until = Math.min(c.act.until, this.t); return null;
      case 'ability': return this.setAbility(c, a.i);
      case 'buy': return c.transit ? '移動中は買えない' : c.state === 'down' ? '倒れていて動けない' : this.buy(c, a.id, a.n || 1);
      case 'sell': return c.transit ? '移動中は売れない' : c.state === 'down' ? '倒れていて動けない' : this.sell(c, a.id, a.n || 1);
      case 'order': return this.order(c, a.id, a.n || 1);
      case 'use': return this.useField(c, a.id);
      case 'give': return c.state === 'down' ? '倒れていて動けない' : this.give(c, a);
      case 'sos': return c.transit?.downed ? 'もうすぐ家で目を覚ます' : '倒れていない';
      case 'move': case 'bitem': case 'run': return this.battleCommand(c, op, a);
      case 'wake':
        if (c.state !== 'sleep' && c.state !== 'camp') return '寝ていない';
        c.state = 'ok';
        c.act = { cat: 'daily', label: '待機中', until: Infinity, kind: 'idle' };
        return null;
    }
    if (c.ctrl.auto || c.ctrl.home) return '自動の間は命令できない';
    const no = this.canAct(c);
    if (no) return no;
    if (c.state === 'sleep' || c.state === 'camp') { if (op === 'sleep') return null; c.state = 'ok'; }
    return this.doOrder(c, op, a, geo);
  },
  doOrder(c, op, a, geo) {
    const w = this.m.worlds.get(c.world), home = geo.homes[c.id] ?? randomTown(geo);
    switch (op) {
      case 'walk': {
        const d = Math.hypot(a.x, a.z), k = d > geo.R * 0.97 ? (geo.R * 0.97) / d : 1;
        return this.setAct(c, 'move', '待機中', Infinity, { x: a.x * k, z: a.z * k }, 'idle', null, '歩いている');
      }
      case 'sleep':
        if (this.isNight) c.sleptKey = this.nightKey();
        return this.setAct(c, 'daily', '寝る', this.nextMorning() - this.t + rand(0, 60), c.world === c.home ? home : null, 'sleep', null, '家に帰っている');
      case 'hobby': return this.doHobby(c, geo, home);
      case 'work': { const wp = pick(geo.works); return this.setAct(c, 'work', c.job, rand(90, 220), { x: wp.x + rand(-3, 3), z: wp.z + rand(-3, 3) }); }
      case 'train': return this.doTraining(c, geo);
      case 'explore': return this.doExplore(c, geo);
      case 'shop': return this.doShopping(c, geo);
      case 'sabori': return this.setAct(c, 'sabori', pick(OWN), rand(30, 120), null);
      case 'water': return this.setAct(c, 'daily', '水を飲む', rand(3, 8), null);
      case 'eat': return this.setAct(c, 'daily', 'ごはんを食べる', rand(15, 30), null);
      case 'walkabout': return this.doWalk(c, geo);
      case 'help': return this.doHelp(c, geo);
      case 'visit': return this.doVisit(c, geo);
      case 'chat': { const o = this.findChatPartner(c); if (!o) return '近くに話し相手がいない'; return this.startChat(c, o); }
      case 'repair': return this.repair[c.world] > this.t ? this.setAct(c, 'help', '荒らされた町の片付け', rand(40, 90), randomTown(geo)) : '片付ける所がない';
      case 'battle': return this.tryBattleAny(c, a.mon) ? null : '近くに魔物がいない';
      case 'raid': { const r = this.raidAt(c.world); if (!r || r.phase !== 'gather') return 'レイドの集合中ではない'; return this.joinRaid(c, r) ? null : '参加できない'; }
      case 'defend': { const h = this.hordeAt(c.world); if (!h) return '防衛戦は起きていない'; return this.joinDefense(c, h) ? null : '参加できない'; }
      case 'dig': { const r = this.races.find((x) => x.world === c.world); if (!r) return '宝の地図のうわさはない'; if (!r.racers.includes(c.id)) r.racers.push(c.id); return this.goDig(c, r); }
      case 'party': { const p = this.partyAt(c.world); if (!p) return 'パーティーはない'; return this.joinParty(c, p); }
      case 'contest': {
        const ct = this.contests.find((x) => x.world === c.world && x.started);
        if (!ct) return '対抗戦はない';
        ct.watchers.push(c.id);
        return this.setAct(c, 'event', `勢力対抗「${ct.game}」を観戦`, ct.until - this.t, { x: ct.x + 9, z: ct.z }, 'watch', ct.id, '対抗戦を見に行っている');
      }
      case 'camp': return this.setAct(c, 'daily', '野宿する', this.nextMorning() - this.t, { x: c.x + 1, z: c.z }, 'camp', null, '野宿の場所へ向かっている');
      case 'hop': {
        const to = a.to;
        if (!w.neighbors.includes(to)) return '隣の世界線ではない';
        if (c.pts < this.hopPrice(c, c.world, to)) return '移動ptが足りない';
        return this.goPortal(c, to);
      }
      case 'dan': {
        if (!this.atEdge(c)) return `世界線の果て（${this.wname(this.danOf(c).edge)}）へ行く必要がある`;
        if (!this.danOf(c).neighbors.includes(a.to)) return '隣の世界団ではない';
        if (c.pts < this.danPrice(c, a.to)) return '移動ptが足りない';
        return this.setAct(c, 'move', '世界線の果てへ', 0, w.geo.edge, 'danGate', { homeward: false, to: a.to }, '世界線の果てへ向かっている');
      }
      case 'rescue': {
        const o = this.m.charById.get(a.id);
        if (!o?.transit?.downed || !this.sosWorlds(o.transit).has(c.world)) return '救難信号が届いていない';
        if (o.transit.downed.helper) return 'もう誰かが向かっている';
        if (c.pts < 1) return '移動ptが足りない';
        return this.goRescue(c, o) ? null : '向かえない';
      }
      default: return '知らない命令';
    }
  },
  tryBattleAny(c, id) {
    const list = this.monsters.get(c.world).filter((m) => !m.engagedBy);
    const mo = list.find((m) => m.id === id) || list.sort((a, b) => dist2(c.x, c.z, a.x, a.z) - dist2(c.x, c.z, b.x, b.z))[0];
    if (!mo) return false;
    mo.engagedBy = c.id;
    this.setAct(c, 'battle', '魔物退治', 0, { x: mo.x + 1.2, z: mo.z }, 'battle', mo.id, '魔物に向かっている');
    return true;
  },
  setAbility(c, i) {
    if (!this.abilityOptions(c).some((x) => x.i === i)) return i === 2 ? '夢特性はLv100から' : 'その特性はない';
    c.ability = i;
    return null;
  },
  give(c, { to, id, n = 1 }) {
    const o = this.m.charById.get(to);
    if (!o || o === c || o.world !== c.world || c.transit) return '同じ世界線にいる相手にしか渡せない';
    if (id === 'food') {
      if (c.food < n) return '食料が足りない';
      c.food -= n; o.food += n;
    } else {
      if ((c.items[id] || 0) < n) return '持っていない';
      if (ITEMS[id].max && (o.items[id] || 0) + n > ITEMS[id].max) return '相手が持ちきれない';
      this.takeItem(c, id, n); this.addItem(o, id, n);
    }
    this.addFriend(c, o, 2);
    this.emote(o, '🎁');
    this.log(`🎁 ${c.name}が${o.name}に${id === 'food' ? '食料' : ITEMS[id].name}を渡した`, c.world, [c.id, o.id], false);
    return null;
  },
  battleCommand(c, op, a) {
    const L = [...this.live.values()].find((x) => x.c === c && !x.done);
    if (!L) return '戦闘中ではない';
    if (op === 'move') {
      const mv = L.me.moves[a.i];
      if (!mv) return 'その技は使えない';
      return this.manualTurn(L, { t: 'mv', i: a.i, gk: !!a.gk && !L.B.sd[0].gkUsed }), null;
    }
    if (op === 'bitem') {
      if (!c.items[a.id] || !['heal', 'cure', 'buff', 'shield'].includes(ITEMS[a.id]?.kind)) return '使えない';
      return this.manualTurn(L, { t: 'item', id: a.id }), null;
    }
    if (L.space) return '宇宙では逃げられない';
    const free = this.abilityOf(c).startsWith('「にげあし');
    if (!free && !c.items.bread) return 'みるくパンがない';
    if (!free) this.takeItem(c, 'bread');
    return this.manualTurn(L, { t: 'run' }), null;
  },
};
