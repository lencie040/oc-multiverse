// キャラクターの自律行動シミュレーション (描画とは独立に全世界線ぶん動く)
import { rand, randInt, pick, chance, weighted, dist2, hashStr, seeded, MIN_PER_DAY } from './util.js';
import { randomWild, randomTown, pathBetween } from './model.js';

export const CATS = {
  daily: { label: 'デイリー', icon: '🍙', color: '#7ccf8a' },
  hobby: { label: '趣味', icon: '🎨', color: '#f2a5d0' },
  work: { label: '仕事', icon: '🔨', color: '#f2c46a' },
  battle: { label: '戦闘', icon: '⚔️', color: '#ff6a6a' },
  move: { label: '移動', icon: '👣', color: '#7ab8ff' },
  sabori: { label: 'サボり', icon: '🛋️', color: '#b9a6e0' },
};

const HOBBIES = ['読書', 'ゲーム', '釣り', 'お絵かき', '散歩', '歌う', '楽器演奏', '料理', 'ガーデニング', '写真撮影',
  '筋トレ', '編み物', 'パズル', '日向ぼっこ', 'ダンス', '虫取り', 'ボードゲーム', 'お菓子作り', '映画鑑賞', '詩を書く', '昼寝', 'スケッチ'];
const OUTDOOR = /釣り|散歩|散策|虫取り|日向|写真|スケッチ|森林|バード|凧|狩り|探し|採集|観測|月見|水泳|スケート|雪|日光|夕涼み|水浴び|素振り|球技|肝試し|紙飛行機|ドローン|焚き火|温泉|化石|宇宙遊泳/;
const JOBS = ['畑仕事', 'お店番', '見回り', '研究', '掃除', '配達', '料理の仕込み', '工房で製作', '書類整理', '子守り', '修理屋', '図書館の整理', 'パン屋', '郵便配達'];
const SABORI = ['ゴロゴロする', 'スマホをいじる', '二度寝', 'ぼーっとする', 'お菓子をつまむ', '布団にくるまる', 'テレビを眺める'];
const WALK = ['散策', '見回り', 'ぶらぶら', '近所を一周', '寄り道'];
const GREET = ['やあ！', 'こんにちは〜', '元気？', 'いい天気だね', '最近どう？', '聞いてよ〜', 'おっ、久しぶり！', 'ねえねえ'];
const REPLY = ['元気だよ！', 'ふふっ', 'それな！', 'へぇ〜！', 'まあまあかな', 'いいね！', 'ほんとに？', 'あはは'];

const WALK_SPEED = 2.4; // 1ゲーム分あたりの移動距離
const MAX_EVENTS = 500;

export class Sim {
  constructor(model) {
    this.m = model;
    this.t = 6 * 60;
    this.lastMorning = -1;
    this.events = [];
    this.listeners = [];
    this.effects = [];
    this.monsters = new Map(); // worldId -> [monster]
    this.spawnAcc = new Map();
    this.nextMonsterId = 1;
    for (const w of model.worlds.values()) {
      this.monsters.set(w.id, []);
      this.spawnAcc.set(w.id, 0);
      const cap = this.monsterCap(w);
      for (let i = 0; i < Math.round(cap * 0.6); i++) this.spawnMonster(w);
    }
    for (const c of model.chars) this.initChar(c);
  }

  initChar(c) {
    const geo = this.m.worlds.get(c.home).geo;
    const h = geo.homes[c.id];
    const r = seeded(hashStr('char:' + c.id));
    Object.assign(c, {
      world: c.home, x: h.x, z: h.z, dest: null, walking: false,
      state: 'ok', movesLeft: 3, lastDan: -99, halvedDay: -1,
      partyLeader: null, party: [], trip: null,
      meals: { day: -1, f: '' }, work: { day: -1, n: 0 },
      act: { cat: 'daily', label: '起きた', until: this.t + r.range(0, 60), kind: 'idle' },
      bubble: null, kills: 0, downs: 0, travels: 0, log: [],
    });
    const th = this.m.worlds.get(c.home).theme;
    const hb = new Set();
    if (th.hobbies.length && r() < 0.7) hb.add(r.pick(th.hobbies));
    while (hb.size < 3) hb.add(r.pick(HOBBIES));
    c.hobbies = [...hb];
    c.job = /海軍|軍/.test(c.seiryoku) ? '海軍の訓練' : /SHOP|製/.test(c.seiryoku) ? 'お店の仕事' : r.pick(JOBS);
  }

  // ---------- 時刻 ----------
  get day() { return Math.floor(this.t / MIN_PER_DAY); }
  get hour() { return (this.t % MIN_PER_DAY) / 60; }
  get isNight() { const h = this.hour; return h >= 22 || h < 6; }
  nextMorning() {
    return (this.hour < 6 ? this.day : this.day + 1) * MIN_PER_DAY + 360;
  }
  nightKey() { return this.hour < 12 ? this.day - 1 : this.day; }

  wname(id) { return this.m.worlds.get(id)?.name ?? id; }
  power(c) { return c.power * (c.halvedDay === this.day ? 0.5 : 1); }
  partyOf(c) {
    const leader = c.partyLeader ? this.m.charById.get(c.partyLeader) : c;
    return [leader, ...leader.party.map((id) => this.m.charById.get(id))];
  }
  partyPower(c) {
    return this.partyOf(c).filter((p) => p.state !== 'down' && p.world === c.world).reduce((s, p) => s + this.power(p), 0);
  }
  partyNames(c) {
    const p = this.partyOf(c);
    return p.length > 1 ? `${p[0].name}たち(${p.length}人)` : p[0].name;
  }

  // ---------- イベント ----------
  listen(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }
  log(text, world, ids = [], major = true, extra = null) {
    const e = { t: this.t, text, world, ids, major, extra };
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    for (const id of ids) {
      const c = this.m.charById.get(id);
      if (c) { c.log.push(e); if (c.log.length > 30) c.log.shift(); }
    }
    for (const f of this.listeners) f(e);
  }
  say(c, text, dur = 25) { c.bubble = { text, until: this.t + dur }; }

  // ---------- 魔物 ----------
  monsterCap(w) { return w.num === 0 ? 0 : Math.min(40, 2 + Math.round(w.num * 0.8)); }
  spawnMonster(w) {
    const p = randomWild(w.geo);
    const boss = chance(0.06);
    const power = Math.round((240 + w.num * 30) * rand(0.6, 1.4) * (boss ? 2.2 : 1));
    this.monsters.get(w.id).push({ id: this.nextMonsterId++, x: p.x, z: p.z, tx: p.x, tz: p.z, power, boss, engagedBy: null });
  }
  updateMonsters(dt) {
    for (const w of this.m.worlds.values()) {
      const list = this.monsters.get(w.id);
      const cap = this.monsterCap(w);
      if (list.length < cap) {
        const acc = this.spawnAcc.get(w.id) + dt;
        const every = 240 / (1 + w.num * 0.12);
        if (acc >= every) { this.spawnMonster(w); this.spawnAcc.set(w.id, 0); } else this.spawnAcc.set(w.id, acc);
      }
      for (const mo of list) {
        if (mo.engagedBy) {
          const c = this.m.charById.get(mo.engagedBy);
          if (c && c.world === w.id && c.state !== 'down' && c.act.data === mo.id) continue;
          mo.engagedBy = null;
        }
        const d = Math.sqrt(dist2(mo.x, mo.z, mo.tx, mo.tz));
        if (d < 0.5) {
          if (chance(0.02 * dt)) { const p = randomWild(w.geo); mo.tx = p.x; mo.tz = p.z; }
        } else {
          const s = Math.min(d, 0.7 * dt);
          mo.x += ((mo.tx - mo.x) / d) * s; mo.z += ((mo.tz - mo.z) / d) * s;
        }
      }
    }
  }

  // ---------- メインループ ----------
  update(dt) {
    // dt: ゲーム内の分
    while (dt > 0) {
      const step = Math.min(dt, 2);
      dt -= step;
      this.t += step;
      if (this.hour >= 6 && this.lastMorning < this.day) this.morning();
      this.updateMonsters(step);
      for (const c of this.m.chars) this.updateChar(c, step);
    }
    this.effects = this.effects.filter((e) => this.t - e.t < 40);
  }

  morning() {
    this.lastMorning = this.day;
    for (const c of this.m.chars) {
      c.movesLeft = 3;
      if (c.state === 'down') {
        c.state = 'ok';
        c.act = { cat: 'daily', label: '目を覚ました', until: this.t + rand(5, 30), kind: 'idle' };
      }
      if (c.trip) c.trip.campOk = false;
    }
  }

  updateChar(c, dt) {
    if (c.bubble && this.t > c.bubble.until) c.bubble = null;
    if (c.state === 'down') return;
    if (c.partyLeader) return this.followLeader(c, dt);
    if (c.walking) {
      const d = Math.sqrt(dist2(c.x, c.z, c.dest.x, c.dest.z));
      const s = WALK_SPEED * (c.trip ? 1.4 : 1) * dt;
      if (d <= s) {
        c.x = c.dest.x; c.z = c.dest.z; c.walking = false;
        c.act.until = this.t + c.act.dur;
        this.onArrive(c);
      } else {
        c.x += ((c.dest.x - c.x) / d) * s; c.z += ((c.dest.z - c.z) / d) * s;
      }
      return;
    }
    if (this.t >= c.act.until) {
      this.onDone(c);
      if (c.state !== 'down' && !c.walking && this.t >= c.act.until) this.decide(c);
    }
  }

  followLeader(c, dt) {
    const L = this.m.charById.get(c.partyLeader);
    if (!L || !L.party.includes(c.id)) { c.partyLeader = null; return; }
    if (c.world !== L.world) { c.world = L.world; c.x = L.x; c.z = L.z; }
    const idx = L.party.indexOf(c.id);
    const a = (idx / L.party.length) * Math.PI * 2 + 0.6;
    const tx = L.x + Math.cos(a) * 2.4, tz = L.z + Math.sin(a) * 2.4;
    const d = Math.sqrt(dist2(c.x, c.z, tx, tz));
    const s = WALK_SPEED * 1.6 * dt;
    if (d > s) { c.x += ((tx - c.x) / d) * s; c.z += ((tz - c.z) / d) * s; } else { c.x = tx; c.z = tz; }
    c.walking = d > 0.4 && L.walking;
    c.state = L.state === 'camp' || L.state === 'sleep' ? L.state : 'ok';
    c.act = { ...L.act, kind: 'follow' };
  }

  // 行動を設定 (dest があれば歩いてから dur 分)
  setAct(c, cat, label, dur, dest, kind = 'idle', data = null, walkLabel = null) {
    c.act = { cat, label, dur, until: this.t + dur, kind, data, walkLabel };
    if (dest && dist2(c.x, c.z, dest.x, dest.z) > 0.25) {
      c.dest = { x: dest.x, z: dest.z };
      c.walking = true;
    } else {
      c.walking = false;
      this.onArrive(c);
    }
  }

  displayAct(c) {
    if (c.state === 'down') return { cat: 'battle', icon: '💫', text: '倒れている（朝まで動けない）' };
    if (c.state === 'camp') return { cat: 'daily', icon: '⛺', text: '野宿中（すやすや）' };
    if (c.state === 'sleep') return { cat: 'daily', icon: '💤', text: '寝ている' };
    if (c.walking) return { cat: 'move', icon: CATS.move.icon, text: c.act.walkLabel || `${c.act.label}に向かっている` };
    return { cat: c.act.cat, icon: CATS[c.act.cat]?.icon ?? '', text: c.act.label };
  }

  // ---------- 到着時・完了時 ----------
  onArrive(c) {
    const a = c.act;
    if (a.kind === 'portal') return this.crossPortal(c, a.data);
    if (a.kind === 'battle') {
      const mo = this.monsters.get(c.world).find((m) => m.id === a.data);
      if (!mo) { a.until = this.t; a.kind = 'idle'; return; }
      a.label = mo.boss ? '大魔物と戦っている！' : '魔物と戦っている';
      a.until = this.t + rand(15, 40);
      a.kind = 'fight';
    }
    if (a.kind === 'ask') return this.resolveAsk(c, a.data);
    if (a.kind === 'chat' && a.data) {
      this.say(c, pick(GREET));
      const o = this.m.charById.get(a.data);
      if (o && o.world === c.world) this.say(o, pick(REPLY), 30);
    }
    if (a.kind === 'sleep') c.state = 'sleep';
    if (a.kind === 'camp') c.state = 'camp';
  }

  onDone(c) {
    const a = c.act;
    if (c.state === 'sleep' || c.state === 'camp') c.state = 'ok';
    if (a.kind === 'fight') this.resolveBattle(c, a.data);
    a.kind = 'idle';
  }

  // ---------- 意思決定 ----------
  decide(c) {
    if (c.trip) return this.decideTrip(c);
    if (c.world !== c.home && c.rank < 9) {
      // 安全策: 単独で世界線を移動できないキャラが取り残されたら家へ送り届ける
      const h = this.m.worlds.get(c.home).geo.homes[c.id];
      this.log(`🧭 迷子の${c.name}が${this.wname(c.home)}に送り届けられた`, c.home, [c.id], false);
      c.world = c.home; c.x = h.x; c.z = h.z;
    }
    if (c.world !== c.home) {
      // 旅の途中で状態が外れた → 帰る旅を開始
      c.trip = { mode: 'far', goingHome: true, acts: 0, hops: 0, campOk: false };
      return this.decideTrip(c);
    }
    const h = this.hour;
    const w = this.m.worlds.get(c.world);
    const geo = w.geo;
    const home = geo.homes[c.id];
    if (this.isNight) return this.setAct(c, 'daily', '寝る', this.nextMorning() + rand(0, 75) - this.t, home, 'sleep', null, '家に帰っている');
    const meal = this.dueMeal(c);
    if (meal) return this.doMeal(c, meal, home);

    if (c.rank >= 9 && h >= 8 && h < 15 && c.movesLeft > 0 && chance(0.12)) {
      if (this.startTrip(c)) return;
    }

    const atHome = dist2(c.x, c.z, home.x, home.z) < 6;
    const monsters = this.monsters.get(c.world).length;
    const workOk = h >= 8 && h < 17 && (c.work.day !== this.day || c.work.n < 2);
    const near = this.findChatPartner(c);
    const choice = weighted([
      ['hobby', 26],
      ['work', workOk ? 32 : 0],
      ['battle', monsters ? 6 + Math.min(30, monsters * 2) : 0],
      ['move', 10],
      ['sabori', atHome ? 16 : 0],
      ['water', 5],
      ['chat', near ? 9 : 0],
    ]);
    switch (choice) {
      case 'hobby': return this.doHobby(c, geo, home);
      case 'work': {
        if (c.work.day !== this.day) c.work = { day: this.day, n: 0 };
        c.work.n++;
        const wp = geo.works[hashStr(c.id) % geo.works.length];
        return this.setAct(c, 'work', c.job, rand(90, 220), { x: wp.x + rand(-3, 3), z: wp.z + rand(-3, 3) });
      }
      case 'battle': if (this.tryBattle(c)) return; return this.doWalk(c, geo);
      case 'move': return this.doWalk(c, geo);
      case 'sabori': return this.setAct(c, 'sabori', pick(SABORI), rand(30, 120), home);
      case 'water': return this.setAct(c, 'daily', '水を飲む', rand(3, 8), null);
      case 'chat': return this.startChat(c, near);
    }
  }

  dueMeal(c) {
    const h = this.hour;
    if (c.meals.day !== this.day) c.meals = { day: this.day, f: '' };
    const f = c.meals.f;
    if (h >= 7 && h < 10 && !f.includes('b')) return ['b', '朝ごはんを食べる'];
    if (h >= 12 && h < 14 && !f.includes('l')) return ['l', '昼ごはんを食べる'];
    if (h >= 18.5 && h < 21 && !f.includes('d')) return ['d', '晩ごはんを食べる'];
    if (h >= 20.5 && h < 22 && !f.includes('o')) return ['o', 'お風呂と歯みがき'];
    return null;
  }
  doMeal(c, [flag, label], home) {
    c.meals.f += flag;
    if (c.trip) {
      const lbl = flag === 'o' ? '水浴びをする' : label.replace('を食べる', '（携帯食）を食べる');
      return this.setAct(c, 'daily', lbl, rand(15, 30), null);
    }
    const dest = flag === 'l' && chance(0.4) ? randomTown(this.m.worlds.get(c.world).geo) : home;
    return this.setAct(c, 'daily', label, rand(20, 45), dest);
  }

  doHobby(c, geo, home) {
    const hb = pick(c.hobbies);
    let dest = home;
    if (/釣り|水/.test(hb)) dest = geo.pond ? { x: geo.pond.x + rand(-5, 5), z: geo.pond.z + rand(-5, 5) } : randomWild(geo);
    else if (OUTDOOR.test(hb)) dest = chance(0.5) ? randomTown(geo) : pick(geo.spots);
    else if (chance(0.4)) dest = { x: rand(-geo.plazaR, geo.plazaR) * 0.7, z: rand(-geo.plazaR, geo.plazaR) * 0.7 };
    return this.setAct(c, 'hobby', hb, rand(30, 120), dest);
  }
  doWalk(c, geo) {
    const p = chance(0.5) ? randomTown(geo) : pick(geo.spots);
    return this.setAct(c, 'move', pick(WALK), rand(5, 20), p, 'idle', null, pick(WALK) + 'している');
  }

  findChatPartner(c) {
    let best = null, bd = 900;
    for (const o of this.m.chars) {
      if (o === c || o.world !== c.world || o.state !== 'ok' || o.partyLeader || o.trip || o.walking) continue;
      if (!['hobby', 'sabori', 'move'].includes(o.act.cat) || o.act.kind !== 'idle') continue;
      const d = dist2(c.x, c.z, o.x, o.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  startChat(c, o) {
    const mid = { x: (c.x + o.x) / 2, z: (c.z + o.z) / 2 };
    const dur = rand(15, 35);
    this.setAct(o, 'hobby', `${c.name}とおしゃべり`, dur + 10, { x: mid.x + 1, z: mid.z }, 'idle');
    this.setAct(c, 'hobby', `${o.name}とおしゃべり`, dur, { x: mid.x - 1, z: mid.z }, 'chat', o.id);
    if (c.world !== c.home) this.log(`${c.name}が${this.wname(c.world)}の${o.name}とおしゃべりした`, c.world, [c.id, o.id], false);
  }

  // ---------- 戦闘 ----------
  tryBattle(c) {
    const list = this.monsters.get(c.world).filter((m) => !m.engagedBy);
    if (!list.length) return false;
    const pw = this.partyPower(c);
    list.sort((a, b) => dist2(c.x, c.z, a.x, a.z) - dist2(c.x, c.z, b.x, b.z));
    const mo = list.find((m) => m.power < pw * 1.6 || chance(0.15));
    if (!mo) return false;
    mo.engagedBy = c.id;
    this.setAct(c, 'battle', '魔物退治', 0, { x: mo.x + 1.2, z: mo.z }, 'battle', mo.id, mo.boss ? '大魔物に向かっている' : '魔物退治に向かっている');
    return true;
  }
  resolveBattle(c, monsterId) {
    const list = this.monsters.get(c.world);
    const i = list.findIndex((m) => m.id === monsterId);
    if (i < 0) return;
    const mo = list[i];
    const pw = this.partyPower(c);
    const me = pw * rand(0.75, 1.25), them = mo.power * rand(0.75, 1.25);
    const who = this.partyNames(c);
    const ids = this.partyOf(c).map((p) => p.id);
    const wn = this.wname(c.world);
    if (me >= them) {
      list.splice(i, 1);
      c.kills++;
      this.say(c, mo.boss ? 'やったー！大物だ！' : 'よし！');
      const notable = mo.boss || mo.power > pw * 0.95;
      this.log(`⚔️ ${who}が${wn}で${mo.boss ? '大魔物' : '魔物'}(戦闘力${mo.power})を退治した`, c.world, ids, notable);
    } else {
      mo.engagedBy = null;
      for (const p of this.partyOf(c)) if (p.world === c.world) this.knockDown(p);
      this.log(`💫 ${who}が${wn}の${mo.boss ? '大魔物' : '魔物'}(戦闘力${mo.power})に敗れ、朝まで倒れている`, c.world, ids, true);
    }
  }
  knockDown(p) {
    p.state = 'down';
    p.walking = false;
    p.downs++;
    p.act = { cat: 'battle', label: '倒れている', until: Infinity, kind: 'idle' };
    p.bubble = null;
  }

  // ---------- 冒険 (世界線・世界団の移動) ----------
  canDan(c) { return c.rank >= 11 && this.day - c.lastDan >= 3; }

  startTrip(c) {
    const w = this.m.worlds.get(c.world);
    const dan = c.rank >= 11 && this.canDan(c) && chance(0.45);
    if (!dan && !w.neighbors.length) return false;
    c.trip = { mode: dan ? 'dan' : chance(0.6) ? 'trip' : 'far', hops: dan ? 0 : randInt(1, 3), hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [c.world] };
    c.party = [];
    if (!dan) {
      // 余裕があるランク分だけ同じ汎異記号の仲間を連れていく
      const slots = Math.max(0, c.rank - 9);
      const mates = this.m.chars.filter((o) => o !== c && o.hani === c.hani && o.world === c.world && o.state === 'ok'
        && !o.partyLeader && !o.trip && !o.party.length && o.act.kind === 'idle');
      for (const o of mates.sort(() => Math.random() - 0.5).slice(0, slots)) {
        o.partyLeader = c.id;
        o.walking = false;
        c.party.push(o.id);
        this.say(o, pick(['ついていく！', 'いっしょに行く！', '冒険だ〜！']));
      }
    }
    this.say(c, dan ? '世界団を越えるぞ…！' : pick(['ちょっと冒険してくる！', '隣の世界線に行ってみよう', '旅に出るか']));
    const names = c.party.length ? `（仲間: ${c.party.map((id) => this.m.charById.get(id).name).join('、')}）` : '';
    if (!dan) this.log(`🎒 ${c.name}が冒険に出発した${names}`, c.world, [c.id, ...c.party], true);
    this.decideTrip(c);
    return true;
  }

  endTrip(c) {
    if (c.party.length) this.log(`🏠 ${this.partyNames(c)}が${this.wname(c.home)}に帰ってきた`, c.home, [c.id, ...c.party], true);
    else if (c.trip?.hopsDone || c.trip?.danJumped) this.log(`🏠 ${c.name}が${this.wname(c.home)}に帰ってきた`, c.home, [c.id], true);
    for (const id of c.party) {
      const o = this.m.charById.get(id);
      o.partyLeader = null;
      o.act = { cat: 'daily', label: 'ひと休み', until: this.t + rand(5, 20), kind: 'idle' };
    }
    c.party = [];
    c.trip = null;
  }

  decideTrip(c) {
    const tr = c.trip;
    const w = this.m.worlds.get(c.world);
    const h = this.hour;
    const inHomeDan = w.dan === c.dan;
    if (c.world === c.home && (tr.hopsDone > 0 || tr.goingHome || tr.danJumped) && !(tr.mode === 'dan' && !tr.danJumped)) {
      this.endTrip(c);
      return this.decide(c);
    }
    if (h >= 21.5 || h < 6) return this.campNight(c);
    const meal = this.dueMeal(c);
    if (meal && c.world !== c.home) return this.doMeal(c, meal, null);

    // 世界団の移動
    if (tr.mode === 'dan' && !tr.danJumped) return this.danJump(c, false);
    if (!inHomeDan) {
      if (this.canDan(c) && h < 18) return this.danJump(c, true);
      return this.exploreOrHop(c, w, false);
    }

    if (tr.goingHome) {
      const path = pathBetween(this.m.worlds, c.world, c.home);
      if (path && path.length > 1 && c.movesLeft > 0) return this.goPortal(c, path[1]);
      return this.foreignActivity(c, w); // 移動回数切れ → 夜は野宿
    }
    if (c.world === c.home) {
      if (c.movesLeft <= 0 || !w.neighbors.length) { this.endTrip(c); return this.decide(c); }
      return this.goPortal(c, pick(w.neighbors));
    }
    return this.exploreOrHop(c, w, true);
  }

  exploreOrHop(c, w, canReturn) {
    const tr = c.trip;
    const h = this.hour;
    if (tr.acts < randInt(2, 4)) return this.foreignActivity(c, w);
    tr.acts = 0;
    const path = canReturn ? pathBetween(this.m.worlds, c.world, c.home) : null;
    const reachable = path && path.length - 1 <= c.movesLeft;
    if (canReturn && (tr.mode === 'trip' || h >= 16 || tr.hopsDone >= tr.hops) && reachable && (tr.mode === 'trip' || chance(0.6))) {
      tr.goingHome = true;
      this.say(c, 'そろそろ帰ろうか');
      return this.decideTrip(c);
    }
    if (c.movesLeft > (canReturn && tr.mode === 'trip' ? 1 : 0) && h < 18 && w.neighbors.length) {
      const fresh = w.neighbors.filter((id) => !tr.visited.includes(id));
      return this.goPortal(c, pick(fresh.length ? fresh : w.neighbors));
    }
    return this.foreignActivity(c, w);
  }

  foreignActivity(c, w) {
    c.trip.acts++;
    const near = this.findChatPartner(c);
    const choice = weighted([
      ['sight', 30], ['battle', this.monsters.get(w.id).length ? 25 : 0], ['chat', near ? 20 : 0], ['hobby', 15],
    ]);
    if (choice === 'battle' && this.tryBattle(c)) return;
    if (choice === 'chat') return this.startChat(c, near);
    if (choice === 'hobby') {
      const hb = pick(c.hobbies);
      return this.setAct(c, 'hobby', `${w.name}で${hb}`, rand(30, 90), OUTDOOR.test(hb) ? randomWild(w.geo) : randomTown(w.geo));
    }
    return this.setAct(c, 'move', `${w.name}を観光`, rand(20, 60), chance(0.5) ? randomTown(w.geo) : randomWild(w.geo), 'idle', null, `${w.name}を探索している`);
  }

  goPortal(c, to) {
    const p = this.m.worlds.get(c.world).geo.portals[to];
    if (!p) return this.foreignActivity(c, this.m.worlds.get(c.world));
    this.setAct(c, 'move', `${this.wname(to)}へ移動`, 0, p, 'portal', to, `隣の世界線「${this.wname(to)}」へ向かっている`);
  }

  crossPortal(c, to) {
    const from = c.world;
    const tw = this.m.worlds.get(to);
    const back = tw.geo.portals[from] || { x: 0, z: 0 };
    c.movesLeft--;
    c.travels++;
    c.trip.hopsDone++;
    c.trip.visited.push(to);
    const k = 0.92;
    c.world = to; c.x = back.x * k; c.z = back.z * k;
    for (const id of c.party) {
      const o = this.m.charById.get(id);
      o.world = to; o.x = c.x; o.z = c.z;
    }
    this.effects.push({ t: this.t, world: from, x: this.m.worlds.get(from).geo.portals[to]?.x ?? 0, z: this.m.worlds.get(from).geo.portals[to]?.z ?? 0, kind: 'portal' });
    this.effects.push({ t: this.t, world: to, x: c.x, z: c.z, kind: 'portal' });
    const ids = [c.id, ...c.party];
    this.log(`🌀 ${this.partyNames(c)}が「${this.wname(from)}」→「${this.wname(to)}」へ移動した（今日の残り${c.movesLeft}回）`, to, ids, true, { kind: 'travel', from, to });
    c.act = { cat: 'move', label: `${tw.name}に到着`, until: this.t + rand(3, 10), kind: 'idle' };
  }

  danJump(c, homeward) {
    const tr = c.trip;
    const from = c.world;
    let to;
    if (homeward) to = c.home;
    else {
      const others = this.m.dans.filter((d) => d.id !== this.m.worlds.get(c.world).dan && d.worlds.length);
      const dan = pick(others);
      const populated = dan.worlds.filter((id) => this.m.worlds.get(id).residents.length);
      to = pick(populated.length && chance(0.7) ? populated : dan.worlds);
    }
    for (const id of c.party) { const o = this.m.charById.get(id); o.partyLeader = null; }
    c.party = [];
    c.lastDan = this.day;
    c.halvedDay = this.day;
    tr.danJumped = true;
    if (!homeward) tr.mode = 'far';
    tr.goingHome = homeward;
    tr.acts = 0;
    const tw = this.m.worlds.get(to);
    const p = randomTown(tw.geo);
    this.effects.push({ t: this.t, world: from, x: c.x, z: c.z, kind: 'dan' });
    c.world = to; c.x = p.x; c.z = p.z;
    this.effects.push({ t: this.t, world: to, x: c.x, z: c.z, kind: 'dan' });
    this.say(c, homeward ? 'ただいま…ちょっと疲れた' : 'ふぅ…力を使いすぎた');
    this.log(`🌌 ${c.name}が世界団を越え「${this.wname(from)}」(${this.m.worlds.get(from).dan})→「${tw.name}」(${tw.dan})へ！今日は力が半減`, to, [c.id], true);
    c.act = { cat: 'move', label: '世界団移動の反動で休憩', until: this.t + rand(20, 40), kind: 'idle' };
  }

  // ---------- 野宿 ----------
  campNight(c) {
    const tr = c.trip;
    const w = this.m.worlds.get(c.world);
    if (c.world === c.home) { this.endTrip(c); return this.decide(c); }
    if (tr.campOk && tr.campKey === this.nightKey()) {
      return this.setAct(c, 'daily', '野宿する', this.nextMorning() + rand(0, 60) - this.t, tr.campSpot, 'camp', null, '野宿の場所へ向かっている');
    }
    // 承諾をくれる住人を探す
    const hosts = this.m.chars.filter((o) => o.home === w.id && o.world === w.id && o.state !== 'down' && !o.partyLeader && !(tr.refused || []).includes(o.id));
    if (!hosts.length) {
      this.grantCamp(c, randomTown(w.geo));
      if (!w.residents.length) this.log(`⛺ ${this.partyNames(c)}は誰もいない「${w.name}」で野宿することにした`, w.id, [c.id, ...c.party], true);
      else this.log(`⛺ ${this.partyNames(c)}は「${w.name}」の外れでこっそり野宿することにした`, w.id, [c.id, ...c.party], false);
      return this.campNight(c);
    }
    hosts.sort((a, b) => dist2(c.x, c.z, a.x, a.z) - dist2(c.x, c.z, b.x, b.z));
    const host = hosts[0];
    this.setAct(c, 'daily', `${host.name}に野宿の許可をもらう`, 8, { x: host.x + 1.5, z: host.z }, 'ask', host.id, `${host.name}に野宿の許可をもらいに行っている`);
  }

  grantCamp(c, spot) {
    c.trip.campOk = true;
    c.trip.campKey = this.nightKey();
    c.trip.campSpot = spot;
  }

  resolveAsk(c, hostId) {
    const host = this.m.charById.get(hostId);
    const w = this.m.worlds.get(c.world);
    const ids = [c.id, ...c.party];
    if (!host || host.world !== c.world || host.state === 'down') { c.act.until = this.t; return; }
    this.say(c, '今夜ここで野宿してもいいですか？', 20);
    let p = 0.62;
    if (host.zoku && host.zoku === c.zoku) p += 0.2;
    if (host.seiryoku && host.seiryoku === c.seiryoku) p += 0.2;
    if (c.party.length) p -= 0.06 * c.party.length;
    if (chance(p)) {
      this.say(host, pick(['いいよ！ゆっくりしていって', 'どうぞどうぞ', '気をつけてね〜']), 25);
      const hp = w.geo.homes[host.id] || randomTown(w.geo);
      this.grantCamp(c, { x: hp.x + rand(-6, 6), z: hp.z + rand(4, 7) });
      this.log(`⛺ ${host.name}が承諾し、${this.partyNames(c)}は「${w.name}」で野宿する`, w.id, [...ids, host.id], true);
      return;
    }
    this.say(host, pick(['ダメ！', 'うちは困るよ…', '他を当たって！']), 25);
    (c.trip.refused ||= []).push(host.id);
    if (c.movesLeft > 0 && w.neighbors.length) {
      this.log(`🙅 ${host.name}が${this.partyNames(c)}の野宿を断った → 残りの移動回数で別の世界線へ`, w.id, [...ids, host.id], true);
      c.trip.refused = [];
      const path = w.dan === c.dan ? pathBetween(this.m.worlds, c.world, c.home) : null;
      const to = path && path.length > 1 ? path[1] : pick(w.neighbors);
      c.act = { cat: 'move', label: '別の世界線を目指す', until: this.t + 2, kind: 'idle' };
      return this.goPortal(c, to);
    }
    // どうしようもない → 撃退して野宿する
    const me = this.partyPower(c) * rand(0.75, 1.25), them = this.power(host) * rand(0.75, 1.25);
    if (me >= them) {
      this.knockDown(host);
      this.say(c, 'ごめんね…！', 20);
      this.grantCamp(c, { x: c.x + rand(-4, 4), z: c.z + rand(3, 6) });
      this.log(`🥊 移動回数が残っていない${this.partyNames(c)}は、断った${host.name}を撃退して「${w.name}」で野宿する`, w.id, [...ids, host.id], true);
    } else {
      for (const m of this.partyOf(c)) this.knockDown(m);
      this.say(host, '出直してきな！', 25);
      this.log(`💫 ${this.partyNames(c)}は野宿を断った${host.name}に撃退され、朝まで「${w.name}」で倒れている`, w.id, [...ids, host.id], true);
    }
  }

  // ---------- 参照 ----------
  charsIn(worldId) { return this.m.chars.filter((c) => c.world === worldId); }
  visitorsIn(worldId) { return this.m.chars.filter((c) => c.world === worldId && c.home !== worldId); }

  // ---------- 保存 ----------
  serialize() {
    const keys = ['world', 'x', 'z', 'dest', 'walking', 'state', 'movesLeft', 'lastDan', 'halvedDay', 'partyLeader', 'party', 'trip', 'meals', 'work', 'act', 'kills', 'downs', 'travels'];
    return {
      v: 1, t: this.t, lastMorning: this.lastMorning, nextMonsterId: this.nextMonsterId,
      monsters: Object.fromEntries(this.monsters),
      events: this.events.slice(-200),
      chars: this.m.chars.map((c) => [c.id, Object.fromEntries(keys.map((k) => [k, c[k] === Infinity ? 'INF' : c[k]]))]),
    };
  }
  restore(s) {
    if (!s || s.v !== 1) return false;
    const map = new Map(s.chars);
    if (map.size !== this.m.chars.length || this.m.chars.some((c) => !map.has(c.id) || !this.m.worlds.has(map.get(c.id).world))) return false;
    this.t = s.t; this.lastMorning = s.lastMorning; this.nextMonsterId = s.nextMonsterId;
    for (const [wid, list] of Object.entries(s.monsters)) if (this.monsters.has(wid)) this.monsters.set(wid, list);
    this.events = s.events || [];
    for (const c of this.m.chars) {
      const d = map.get(c.id);
      Object.assign(c, d);
      if (c.act && c.act.until === 'INF') c.act.until = Infinity;
      if (c.act && c.act.until === null) c.act.until = Infinity;
      c.log = this.events.filter((e) => e.ids.includes(c.id)).slice(-30);
    }
    return true;
  }
}
