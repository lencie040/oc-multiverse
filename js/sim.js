// キャラクターの自律行動シミュレーション (描画とは独立に全世界線ぶん動く)
import { rand, randInt, pick, chance, weighted, dist2, hashStr, seeded, MIN_PER_DAY, nowGameT, dateOfDay } from './util.js?v=25';
import { randomWild, randomTown, hopCost, cheapestPath } from './model.js?v=25';
import { splitTypes, edge, edgeNote, monsterType, loadTypeChart } from './types.js?v=25';

export const CATS = {
  daily: { label: 'デイリー', icon: '🍙', color: '#7ccf8a' },
  hobby: { label: '趣味', icon: '🎨', color: '#f2a5d0' },
  work: { label: '仕事', icon: '🔨', color: '#f2c46a' },
  battle: { label: '戦闘', icon: '⚔️', color: '#ff6a6a' },
  move: { label: '移動', icon: '👣', color: '#7ab8ff' },
  sabori: { label: 'サボり', icon: '🛋️', color: '#b9a6e0' },
  social: { label: '交流', icon: '💬', color: '#6fd6e8' },
  training: { label: '修行', icon: '🥋', color: '#ff9a4a' },
  shopping: { label: '買い物', icon: '🛍️', color: '#c6e36a' },
  explore: { label: '探検', icon: '🧭', color: '#3fbf9f' },
  help: { label: '手伝い', icon: '🤝', color: '#ffcf9a' },
  raid: { label: 'レイド', icon: '🐉', color: '#ff3a6a' },
  event: { label: '催し', icon: '🎪', color: '#ffd84a' },
};

const HOBBIES = ['読書', 'ゲーム', '釣り', 'お絵かき', '散歩', '歌う', '楽器演奏', '料理', 'ガーデニング', '写真撮影',
  '筋トレ', '編み物', 'パズル', '日向ぼっこ', 'ダンス', '虫取り', 'ボードゲーム', 'お菓子作り', '映画鑑賞', '詩を書く', '昼寝', 'スケッチ'];
const OUTDOOR = /釣り|散歩|散策|虫取り|日向|写真|スケッチ|森林|バード|凧|狩り|探し|採集|観測|月見|水泳|スケート|雪|日光|夕涼み|水浴び|素振り|球技|肝試し|紙飛行機|ドローン|焚き火|温泉|化石|宇宙遊泳/;
const JOBS = ['畑仕事', 'お店番', '見回り', '研究', '掃除', '配達', '料理の仕込み', '工房で製作', '書類整理', '子守り', '修理屋', '図書館の整理', 'パン屋', '郵便配達'];
const SABORI = ['ゴロゴロする', 'スマホをいじる', '二度寝', 'ぼーっとする', 'お菓子をつまむ', '布団にくるまる', 'テレビを眺める'];
const WALK = ['散策', '見回り', 'ぶらぶら', '近所を一周', '寄り道'];
const GREET = ['やあ！', 'こんにちは〜', '元気？', 'いい天気だね', '最近どう？', '聞いてよ〜', 'おっ、久しぶり！', 'ねえねえ'];
const REPLY = ['元気だよ！', 'ふふっ', 'それな！', 'へぇ〜！', 'まあまあかな', 'いいね！', 'ほんとに？', 'あはは'];
const TRAIN = ['素振り', '走り込み', '瞑想', '組手の練習', '技の特訓', '滝に打たれる', '体幹トレーニング'];
const SHOPS = ['食材の買い出し', '雑貨を買う', 'おやつを買う', '服を見る', '本屋をのぞく', '日用品を買う'];
const HELP = ['荷物運びを手伝う', '近所の掃除を手伝う', '畑を手伝う', '屋根の修理を手伝う', '迷子の道案内'];
const TREASURES = ['古いコイン', 'きれいな石', '謎の地図', '化石', '光る羽根', '古びた鍵', '小さな宝石', '壊れた時計', '不思議な種'];
const RARE = ['伝説の剣のかけら', '星の涙', '虹色の宝玉', '古代の王冠'];
const RAID_TITLE = [['巨竜', '竜'], ['魔王', '悪'], ['大蛇', '毒'], ['鉄巨人', '鋼'], ['黒獅子', '闇'], ['亡霊王', '霊'], ['大怪鳥', '飛'], ['深淵の主', '水']];
const GIFTS = ['手作りケーキ', '花束', 'マフラー', 'ぬいぐるみ', '手紙', 'お菓子の詰め合わせ', '似顔絵', 'キラキラの石', '新しい本', 'おそろいのキーホルダー'];
// 勢力の催し。名前から種類を決める
const MEET_KINDS = {
  drill: { cat: 'training', label: '合同訓練', icon: '🎖️', lines: ['気合い入れていくぞ！', 'せーの！', '隊列、そろえて！', 'もう一本！'] },
  market: { cat: 'work', label: '商談会', icon: '📯', lines: ['いらっしゃいませ〜', '新作できました！', 'これ、売れると思う？', 'お安くしときますよ'] },
  meet: { cat: 'event', label: '集会', icon: '📯', lines: ['今日の議題は…', '最近どう？', '次の計画だけど', 'みんな集まった？'] },
};
const CONTESTS = [
  { name: '綱引き', stat: [0, 1] }, { name: 'リレー', stat: [5] }, { name: '腕相撲', stat: [1] }, { name: '雪合戦', stat: [3, 5] },
  { name: '料理対決', stat: null }, { name: 'クイズ大会', stat: null }, { name: 'ダンスバトル', stat: [5, 4] }, { name: '我慢くらべ', stat: [2, 4] },
];
const BUSY = ['raid', 'defend', 'dig', 'party', 'meet', 'contest', 'watch', 'fight', 'battle', 'portal', 'ask', 'sleep', 'camp'];
const RAID_RATE = 0.00015;
// 移動pt: 1日にたまる量 (ランク7は2日で1pt)。3日分までためられる
export const PT_RATE = { 7: 0.5, 8: 3, 9: 7, 10: 15, 11: 40 };
export const DAN_COST = 40;
const HORDE_RATE = 0.00004; // 魔物の大群の出現率 (昼のみ)
const LEGEND = ['海賊王の黄金', '始まりの羅針盤', '時を刻む砂時計', '虹色の王冠', '星降る宝玉', '千年樹の種', '幻の金貨', '世界線の鍵'];
export const TRANSIT = '@transit'; // 移動中のキャラの world
// 行動を始めたときに頭上に出る絵文字
const EMOTES = {
  daily: ['😋', '🥤', '😌'], hobby: ['🎵', '✨', '😊'], work: ['💦', '💪', '📦'], sabori: ['😪', '🎮', '💤'],
  social: ['💬', '😆', '🎶'], training: ['🔥', '💪', '🥋'], shopping: ['🛍️', '💰', '😍'], explore: ['👀', '🧭', '❓'],
  help: ['👍', '🤝', '😊'], move: ['🎵', '👟'], event: ['🎉', '🎈', '🥳'],
};
const FRIEND = 10, BEST = 25; // 友達・親友になる友好度 // 1ゲーム分あたりの出現率 (昼のみ)

const WALK_SPEED = 60; // 1分あたりの移動距離 (現実と同じ時間の流れで、歩く様子が見える速さ)
const MAX_EVENTS = 500;

export class Sim {
  constructor(model) {
    this.m = model;
    loadTypeChart(model.types);
    this.t = nowGameT();
    this.lastMorning = -1;
    this.events = [];
    this.listeners = [];
    this.effects = [];
    this.monsters = new Map(); // worldId -> [monster]
    this.spawnAcc = new Map();
    this.nextMonsterId = 1;
    this.raids = [];
    this.hordes = [];
    this.races = [];
    this.repair = {};
    this.parties = []; // 誕生日パーティー
    this.meets = []; // 勢力の集会・合同訓練
    this.contests = []; // 勢力対抗戦
    this.nextEventId = 1;
    this.nextRaidId = 1;
    for (const w of model.worlds.values()) {
      this.monsters.set(w.id, []);
      this.spawnAcc.set(w.id, 0);
      const cap = this.monsterCap(w);
      for (let i = 0; i < Math.round(cap * 0.6); i++) this.spawnMonster(w);
    }
    for (const c of model.chars) this.initChar(c);
    // 誕生日の早見表と、勢力 (本拠地 = いちばん多く住んでいる世界線)
    this.bdays = new Map();
    for (const c of model.chars) {
      if (!c.bdKey) continue;
      if (!this.bdays.has(c.bdKey)) this.bdays.set(c.bdKey, []);
      this.bdays.get(c.bdKey).push(c);
    }
    const fs = new Map();
    for (const c of model.chars) if (c.seiryoku) { if (!fs.has(c.seiryoku)) fs.set(c.seiryoku, []); fs.get(c.seiryoku).push(c); }
    this.factions = [...fs].filter(([, ms]) => ms.length >= 3).map(([name, ms]) => {
      const cnt = {};
      for (const c of ms) cnt[c.home] = (cnt[c.home] || 0) + 1;
      const hq = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
      const kind = /海軍|軍|隊/.test(name) ? 'drill' : /SHOP|製|ショップ/i.test(name) ? 'market' : 'meet';
      return { name, members: ms.map((c) => c.id), hq, kind };
    });
  }

  initChar(c) {
    const geo = this.m.worlds.get(c.home).geo;
    const h = geo.homes[c.id];
    const r = seeded(hashStr('char:' + c.id));
    Object.assign(c, {
      world: c.home, x: h.x, z: h.z, dest: null, walking: false,
      state: 'ok', pts: 0, halvedDay: -1,
      partyLeader: null, party: [], trip: null,
      meals: { day: -1, f: '' }, work: { day: -1, n: 0 },
      act: { cat: 'daily', label: '起きた', until: this.t + r.range(0, 60), kind: 'idle' },
      bubble: null, kills: 0, downs: 0, travels: 0, log: [],
      trainDay: -1, treasures: 0, raidWins: 0, transit: null, friends: {}, emote: null,
      bdayParty: -1, contestWins: 0,
    });
    c.types = splitTypes(c.type);
    const bd = /(\d+)月(\d+)日/.exec(c.birthday || '');
    c.bdKey = bd ? `${+bd[1]}-${+bd[2]}` : null;
    c.pts = this.ptRate(c);
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
  dateLabel(day = this.day) { const { m, d } = dateOfDay(day); return `${m}月${d}日`; }
  // うるう年でない年の2月29日生まれは、2月28日にお祝いする
  bdKeysOn(day) {
    const { y, m, d } = dateOfDay(day);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return m === 2 && d === 28 && !leap ? ['2-28', '2-29'] : [`${m}-${d}`];
  }
  isBirthday(c) { return !!c.bdKey && this.bdKeysOn(this.day).includes(c.bdKey); }
  birthdaysOn(day = this.day) { return this.bdKeysOn(day).flatMap((k) => this.bdays.get(k) || []); }

  wname(id) { return this.m.worlds.get(id)?.name ?? id; }
  // 世界団移動の日は半減、修行した日は1割増し
  power(c) { return c.power * (c.halvedDay === this.day ? 0.5 : 1) * (c.trainDay === this.day ? 1.1 : 1); }
  partyOf(c) {
    const leader = c.partyLeader ? this.m.charById.get(c.partyLeader) : c;
    return [leader, ...leader.party.map((id) => this.m.charById.get(id))];
  }
  // foe を渡すと、メンバーそれぞれのタイプ相性をかけた戦闘力になる
  partyPower(c, foe = null) {
    return this.partyOf(c).filter((p) => p.state !== 'down' && p.world === c.world).reduce((s, p) => s + this.power(p) * (foe ? edge(p.types, foe) : 1), 0);
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
    if (!this.quiet) for (const f of this.listeners) f(e);
  }
  // 吹き出しは dur×1.2秒ほど表示する
  say(c, text, dur = 25) { c.bubble = { text, until: this.t + dur * 0.02 }; }
  emote(c, e) { c.emote = { e, n: (c.emote?.n || 0) + 1 }; }

  // ---------- 友好度 ----------
  addFriend(a, b, n) {
    if (!a || !b || a === b) return;
    const before = a.friends[b.id] || 0;
    const after = Math.max(-30, Math.min(100, before + n));
    a.friends[b.id] = after;
    b.friends[a.id] = after;
    if (before < BEST && after >= BEST) {
      this.emote(a, '💕'); this.emote(b, '💕');
      this.daily?.bestFriends.push([a.name, b.name]);
      this.log(`💕 ${a.name}と${b.name}が親友になった！`, a.world, [a.id, b.id], true);
    } else if (before < FRIEND && after >= FRIEND) {
      this.log(`🤝 ${a.name}と${b.name}が友達になった`, a.world, [a.id, b.id], false);
    }
  }
  friendCount(c, min = FRIEND) { return Object.values(c.friends).filter((v) => v >= min).length; }
  relationLabel(v) { return v >= BEST ? '親友' : v >= FRIEND ? '友達' : v <= -10 ? 'ライバル' : '知り合い'; }

  // ---------- 日報 ----------
  newDaily() {
    return { day: this.day, kills: {}, battles: 0, downs: 0, travels: 0, danJumps: [], raidsWon: [], raidsLost: [], raidsFled: [], hordesWon: [], hordesLost: [], racesWon: [], treasures: [], bestFriends: [], camps: 0, duels: 0, birthdays: [], contests: [], meets: 0 };
  }
  makeReport(d) {
    const top = Object.entries(d.kills).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, n]) => ({ id, name: this.m.charById.get(id)?.name ?? id, n }));
    return { ...d, mvp: top, id: (this.report?.id || 0) + 1 };
  }

  // ---------- 魔物 ----------
  monsterCap(w) { return w.danger === 0 ? 0 : 2 + Math.round(w.danger * 0.8); }
  spawnMonster(w) {
    const p = randomWild(w.geo);
    const boss = chance(0.06);
    const power = Math.round((240 + w.danger * 30) * rand(0.6, 1.4) * (boss ? 2.2 : 1));
    this.monsters.get(w.id).push({ id: this.nextMonsterId++, x: p.x, z: p.z, tx: p.x, tz: p.z, power, boss, type: monsterType(w), engagedBy: null });
  }
  updateMonsters(dt) {
    for (const w of this.m.worlds.values()) {
      const list = this.monsters.get(w.id);
      const cap = this.monsterCap(w);
      if (list.filter((mo) => !mo.horde).length < cap) {
        const acc = this.spawnAcc.get(w.id) + dt;
        const every = 240 / (1 + w.danger * 0.12);
        if (acc >= every) { this.spawnMonster(w); this.spawnAcc.set(w.id, 0); } else this.spawnAcc.set(w.id, acc);
      }
      for (const mo of list) {
        if (mo.engagedBy) {
          const c = this.m.charById.get(mo.engagedBy);
          if (c && c.world === w.id && c.state !== 'down' && (c.act.data === mo.id || c.act.target === mo.id)) continue;
          mo.engagedBy = null;
        }
        if (mo.horde) { this.marchHorde(w, mo, dt); continue; }
        const d = Math.sqrt(dist2(mo.x, mo.z, mo.tx, mo.tz));
        if (d < 0.5) {
          if (chance(0.1 * dt)) { const p = randomWild(w.geo); mo.tx = p.x; mo.tz = p.z; }
        } else {
          const s = Math.min(d, 15 * dt);
          mo.x += ((mo.tx - mo.x) / d) * s; mo.z += ((mo.tz - mo.z) / d) * s;
        }
      }
      if (list.some((mo) => mo.dead)) this.monsters.set(w.id, list.filter((mo) => !mo.dead));
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
      this.updateRaids(step);
      this.updateEvents(step);
      for (const c of this.m.chars) this.updateChar(c, step);
    }
    this.effects = this.effects.filter((e) => this.t - e.t < 3);
  }

  // 閉じていた間の時間を進める。長すぎる分 (max より前) は飛ばす
  catchUp(target = nowGameT(), max = 2 * MIN_PER_DAY) {
    if (target - this.t > max) {
      this.t = target - max;
      this.meets = this.meets.filter((m) => m.started);
      this.contests = this.contests.filter((c) => c.started);
    }
    this.quiet = true;
    if (target > this.t) this.update(target - this.t);
    this.quiet = false;
  }

  morning() {
    this.lastMorning = this.day;
    if (this.daily && this.daily.day < this.day) this.report = this.makeReport(this.daily);
    this.daily = this.newDaily();
    for (const c of this.m.chars) {
      c.pts = Math.min(this.ptCap(c), c.pts + this.ptRate(c));
      if (c.state === 'down') {
        c.state = 'ok';
        c.act = { cat: 'daily', label: '目を覚ました', until: this.t + rand(5, 30), kind: 'idle' };
      }
      if (c.trip) c.trip.campOk = false;
    }
    for (const c of this.birthdaysOn()) {
      this.daily.birthdays.push({ id: c.id, name: c.name, n: 0 });
      this.log(`🎂 今日（${this.dateLabel()}）は${c.name}の誕生日！`, c.transit ? c.home : c.world, [c.id], true);
    }
    this.scheduleFactionEvents();
  }

  updateChar(c, dt) {
    if (c.transit) { if (this.t >= c.transit.end) this.arrive(c); return; }
    if (c.bubble && this.t > c.bubble.until) c.bubble = null;
    if (c.state === 'down') return;
    if (c.partyLeader) return this.followLeader(c, dt);
    if (c.act.kind === 'defend') return this.defendStep(c, dt);
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
    if (L.transit) { c.act = { ...L.act, kind: 'follow' }; c.walking = false; return; }
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
    const tr = this.transitOf(c);
    if (tr) return { cat: 'move', icon: tr.kind === 'dan' ? '🌌' : '🌀', text: `「${this.wname(tr.from)}」→「${this.wname(tr.to)}」へ移動中（あと${Math.max(1, Math.ceil(tr.end - this.t))}分）` };
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
    if (a.kind === 'party') {
      const p = this.parties.find((x) => x.id === a.data);
      if (p?.hosts.includes(c.id)) { this.say(c, pick(['みんな来てくれてありがとう！', 'えへへ、今日は主役！', 'ケーキ、楽しみ！'])); this.emote(c, '🎂'); }
      else if (p) { this.say(c, pick(['お誕生日おめでとう！', 'ハッピーバースデー！', 'おめでと〜！', 'プレゼント持ってきたよ！'])); this.emote(c, '🎉'); }
      return;
    }
    if (a.kind === 'meet') {
      const mt = this.meets.find((x) => x.id === a.data);
      if (mt && chance(0.5)) this.say(c, pick(MEET_KINDS[mt.kind].lines));
      if (mt) this.emote(c, MEET_KINDS[mt.kind].icon);
      return;
    }
    if (a.kind === 'contest') { this.say(c, pick(['負けないぞ！', '勝つのはうちだ！', 'いざ勝負！', '本気でいくよ！'])); this.emote(c, '🔥'); return; }
    if (a.kind === 'watch') { if (chance(0.4)) this.say(c, pick(['がんばれ〜！', 'どっちが勝つかな', 'いけいけ〜！'])); this.emote(c, '👀'); return; }
    if (a.kind === 'sleep') c.state = 'sleep';
    if (a.kind === 'camp') c.state = 'camp';
    if (a.kind === 'fight') this.emote(c, '⚔️');
    else if (a.kind === 'chat' && a.data) this.emote(c, (c.friends[a.data] || 0) >= FRIEND ? '💕' : '💬');
    else if (EMOTES[a.cat] && chance(0.55)) this.emote(c, pick(EMOTES[a.cat]));
  }

  onDone(c) {
    const a = c.act;
    if (c.state === 'sleep' || c.state === 'camp') c.state = 'ok';
    if (a.kind === 'fight') this.resolveBattle(c, a.data);
    if (a.kind === 'train') { c.trainDay = this.day; this.emote(c, '🔥'); }
    if (a.kind === 'explore') this.rollTreasure(c);
    if (a.kind === 'dig') this.resolveDig(c, a.data);
    if (a.kind === 'chat') this.addFriend(c, this.m.charById.get(a.data), c.zoku && c.zoku === this.m.charById.get(a.data)?.zoku ? 3 : 2);
    if (a.kind === 'visit' || a.kind === 'help') {
      const o = this.m.charById.get(a.data);
      this.addFriend(c, o, a.kind === 'help' ? 3 : 2);
      if (a.kind === 'help' && o) this.emote(o, '😊');
    }
    a.kind = 'idle';
  }

  // ---------- 意思決定 ----------
  decide(c) {
    if (this.joinGatheringRaid(c)) return;
    if (this.joinHordeDefense(c)) return;
    if (this.joinBirthday(c)) return;
    const race = this.raceOf(c);
    if (race && this.hour >= 6 && this.hour < 21) {
      if (c.world === race.world) return this.goDig(c, race);
      const nx = this.nextHop(c, race.world);
      if (!c.trip && nx && this.canHop(c, nx)) {
        c.trip = { mode: 'far', hops: 3, hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [c.world], raceTarget: race.id };
        return this.decideTrip(c);
      }
    }
    if (c.trip) return this.decideTrip(c);
    if (c.world !== c.home && !this.ptRate(c)) {
      // 安全策: 自分では移動ptがたまらないキャラが取り残されたら家へ送り届ける
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

    if (c.pts >= 1 && h >= 8 && h < 15 && !this.isBirthday(c) && chance(c.rank >= 9 ? 0.12 : 0.06)) {
      if (this.startTrip(c)) return;
    }

    const atHome = dist2(c.x, c.z, home.x, home.z) < 6;
    const monsters = this.monsters.get(c.world).length;
    const workOk = h >= 8 && h < 17 && (c.work.day !== this.day || c.work.n < 2);
    const near = this.findChatPartner(c);
    const choice = weighted([
      ['hobby', 22],
      ['work', workOk ? 30 : 0],
      ['battle', monsters ? 6 + Math.min(14, monsters) : 0],
      ['move', 8],
      ['sabori', atHome ? 14 : 0],
      ['water', 5],
      ['social', 10],
      ['training', c.trainDay === this.day ? 2 : 8],
      ['shopping', h >= 9 && h < 19 ? 8 : 0],
      ['explore', 6],
      ['help', 6],
      ['repair', this.repair[c.world] > this.t ? 45 : 0],
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
      case 'social': return near && chance(0.6) ? this.startChat(c, near) : this.doVisit(c, geo);
      case 'training': return this.doTraining(c, geo);
      case 'shopping': return this.doShopping(c, geo);
      case 'explore': return this.doExplore(c, geo);
      case 'help': return this.doHelp(c, geo);
      case 'repair': return this.setAct(c, 'help', pick(['荒らされた町の片付け', '壊れた柵の修理', 'がれき拾い']), rand(40, 90), randomTown(geo));
    }
  }

  // ---------- 臨時イベント: 魔物の大群 (防衛戦) ----------
  hordeAt(worldId) { return this.hordes.find((h) => h.world === worldId); }
  updateEvents(dt) {
    const h = this.hour;
    if (h >= 8 && h < 18 && this.hordes.length < 2) {
      for (const w of this.m.worlds.values()) {
        if (!w.danger || w.residents.length < 2 || this.raidAt(w.id) || this.hordeAt(w.id)) continue;
        if (chance(dt * HORDE_RATE * (1 + w.danger / 20))) this.spawnHorde(w);
      }
    }
    for (const hd of [...this.hordes]) this.updateHorde(hd);
    for (const r of [...this.races]) if (this.t > r.until) this.endRace(r, null);
    if (h >= 15 && h < 18.5) for (const c of this.birthdaysOn()) if (c.bdayParty !== this.day && this.free(c)) this.startParty(c);
    for (const p of [...this.parties]) if (this.t >= p.until) this.endParty(p);
    for (const mt of [...this.meets]) {
      if (!mt.started && this.t >= mt.start) this.startMeet(mt);
      else if (mt.started && this.t >= mt.until) this.endMeet(mt);
    }
    for (const ct of [...this.contests]) {
      if (!ct.started && this.t >= ct.start) this.startContest(ct);
      else if (ct.started && this.t >= ct.until) this.endContest(ct);
    }
  }
  spawnHorde(w) {
    const size = Math.min(30, Math.round(8 + w.danger * 0.4 + w.residents.length * 0.5));
    const hp = Math.max(3, Math.round(size * 0.22));
    const hd = { id: this.nextEventId++, world: w.id, angle: Math.random() * Math.PI * 2, size, spawned: 0, killed: 0, broke: 0, hp, maxHp: hp, start: this.t, until: this.t + 150, defenders: [], type: monsterType(w) };
    this.hordes.push(hd);
    this.log(`🛡️ ${hd.type[0]}タイプの魔物の大群(${size}体)が「${w.name}」の町に押し寄せてきた！ みんなで町を守れ！`, w.id, [], true, { kind: 'horde', horde: hd.id });
    for (const c of this.m.chars) if (c.world === w.id) this.joinDefense(c, hd);
  }
  joinHordeDefense(c) {
    const hd = this.hordeAt(c.world);
    return !!hd && this.joinDefense(c, hd);
  }
  joinDefense(c, hd) {
    if (c.state !== 'ok' || c.partyLeader || c.transit || c.act.kind === 'raid' || c.act.kind === 'defend') return false;
    if (!hd.defenders.includes(c.id)) hd.defenders.push(c.id);
    c.walking = false;
    c.act = { cat: 'battle', label: '町を守っている', until: Infinity, kind: 'defend', data: hd.id, target: null, fightUntil: 0, walkLabel: '大群を迎え撃ちに向かっている' };
    this.say(c, pick(['町を守るぞ！', 'みんな、配置について！', 'ここは通さない！', 'かかってこい！']));
    return true;
  }
  updateHorde(hd) {
    const w = this.m.worlds.get(hd.world);
    // 3つの波に分けて島の外側から押し寄せる
    const per = Math.ceil(hd.size / 3);
    while (hd.spawned < hd.size && this.t >= hd.start + Math.floor(hd.spawned / per) * 25) {
      const a = hd.angle + rand(-0.5, 0.5), r = w.geo.R * rand(0.88, 0.97);
      this.monsters.get(w.id).push({
        id: this.nextMonsterId++, x: Math.cos(a) * r, z: Math.sin(a) * r, tx: 0, tz: 0,
        power: Math.round((240 + w.danger * 30) * 0.6 * rand(0.7, 1.2)), boss: false, horde: hd.id, type: hd.type, engagedBy: null,
      });
      hd.spawned++;
    }
    const alive = this.monsters.get(w.id).some((m) => m.horde === hd.id);
    if (hd.hp <= 0) this.endHorde(hd, false);
    else if (hd.spawned >= hd.size && !alive) this.endHorde(hd, true);
    else if (this.t > hd.until) this.endHorde(hd, true);
  }
  marchHorde(w, mo, dt) {
    const d = Math.hypot(mo.x, mo.z);
    const hd = this.hordes.find((h) => h.id === mo.horde);
    if (!hd) { mo.dead = true; return; }
    if (d < w.geo.plazaR) {
      hd.hp--;
      hd.broke++;
      mo.dead = true;
      this.effects.push({ t: this.t, world: w.id, x: mo.x, z: mo.z, kind: 'portal' });
      return;
    }
    const s = Math.min(d, 20 * dt);
    mo.x -= (mo.x / d) * s; mo.z -= (mo.z / d) * s;
  }
  defendStep(c, dt) {
    const hd = this.hordes.find((h) => h.id === c.act.data);
    if (!hd || c.world !== hd.world) { c.act.kind = 'idle'; c.act.until = this.t; c.walking = false; return; }
    const list = this.monsters.get(c.world);
    let mo = c.act.target != null ? list.find((m) => m.id === c.act.target && !m.dead) : null;
    if (c.act.fightUntil) {
      if (!mo) { c.act.fightUntil = 0; c.act.target = null; return; }
      if (this.t < c.act.fightUntil) return;
      c.act.fightUntil = 0;
      c.act.target = null;
      c.act.label = '町を守っている';
      if (this.partyPower(c, mo.type) * rand(0.8, 1.2) >= mo.power * rand(0.8, 1.2)) {
        mo.dead = true;
        c.kills++;
        hd.killed++;
        if (this.daily) this.daily.kills[c.id] = (this.daily.kills[c.id] || 0) + 1;
        if (chance(0.4)) this.emote(c, pick(['💪', '✨', '😤']));
      } else {
        mo.engagedBy = null;
        for (const p of this.partyOf(c)) if (p.world === c.world) { this.knockDown(p); this.emote(p, '💫'); }
        this.log(`💫 ${this.partyNames(c)}が「${this.wname(c.world)}」の防衛戦で倒れた`, c.world, [c.id], false);
      }
      return;
    }
    if (!mo) {
      const cand = list.filter((m) => m.horde === hd.id && !m.dead);
      if (!cand.length) {
        // 次の波を待つ: 町の手前で構える
        const a = hd.angle, r = this.m.worlds.get(c.world).geo.plazaR + 4;
        this.stepToward(c, Math.cos(a) * r, Math.sin(a) * r, dt);
        return;
      }
      cand.sort((a, b) => (a.engagedBy ? 1 : 0) - (b.engagedBy ? 1 : 0) || dist2(c.x, c.z, a.x, a.z) - dist2(c.x, c.z, b.x, b.z));
      mo = cand[0];
      c.act.target = mo.id;
    }
    if (this.stepToward(c, mo.x, mo.z, dt * 1.5) < 1.8 && !mo.engagedBy) {
      mo.engagedBy = c.id;
      c.walking = false;
      c.act.fightUntil = this.t + rand(3, 8);
      c.act.label = '大群と交戦中！';
    } else if (mo.engagedBy && mo.engagedBy !== c.id && Math.sqrt(dist2(c.x, c.z, mo.x, mo.z)) < 2) c.act.target = null;
  }
  stepToward(c, x, z, dt) {
    const d = Math.sqrt(dist2(c.x, c.z, x, z));
    const s = WALK_SPEED * dt;
    if (d <= s) { c.x = x; c.z = z; c.walking = false; return 0; }
    c.x += ((x - c.x) / d) * s; c.z += ((z - c.z) / d) * s;
    c.walking = true;
    return d;
  }
  endHorde(hd, success) {
    this.hordes = this.hordes.filter((h) => h !== hd);
    const w = this.m.worlds.get(hd.world);
    this.monsters.set(hd.world, this.monsters.get(hd.world).filter((m) => m.horde !== hd.id && !m.dead));
    const ds = hd.defenders.map((id) => this.m.charById.get(id)).filter((c) => c.world === hd.world);
    const ids = ds.flatMap((c) => this.partyOf(c).filter((p) => p.world === hd.world).map((p) => p.id));
    for (const c of ds) {
      if (c.act.kind === 'defend' && c.act.data === hd.id) { c.act.kind = 'idle'; c.act.until = this.t; c.walking = false; }
    }
    if (success) {
      const ok = ds.filter((c) => c.state !== 'down');
      for (const c of ok) { this.emote(c, '🎉'); this.say(c, pick(['守りきった！', 'やったね！', '町は無事だ！'])); }
      for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < Math.min(ok.length, i + 8); j++) this.addFriend(ok[i], ok[j], 2);
      this.daily?.hordesWon.push({ world: hd.world, n: ids.length, killed: hd.killed });
      this.log(`🎊 防衛成功！ ${ids.length}人で魔物の大群を撃退し「${w.name}」の町を守った（撃破${hd.killed}体・町の耐久 残り${hd.hp}/${hd.maxHp}）`, hd.world, ids, true, { kind: 'horde-end' });
    } else {
      for (const c of ds) if (c.state !== 'down') { this.emote(c, '😢'); this.say(c, '町が…'); }
      this.repair[hd.world] = this.t + 240;
      this.daily?.hordesLost.push({ world: hd.world, n: ids.length, killed: hd.killed });
      this.log(`🏚️ 防衛失敗…「${w.name}」の町が魔物の大群に荒らされた（撃破${hd.killed}体）。しばらく片付けが続く`, hd.world, ids, true, { kind: 'horde-end' });
    }
  }

  // ---------- 臨時イベント: 宝の地図争奪戦 ----------
  raceOf(c) { return this.races.find((r) => r.racers.includes(c.id)); }
  startRace(finder) {
    const w0 = this.m.worlds.get(finder.world);
    let target = finder.world;
    if (this.ptRate(finder) && finder.pts >= 1) {
      // 同じ世界団の1〜3つ先の世界線のどこかに宝が眠っている
      const dist = new Map([[finder.world, 0]]);
      const q = [finder.world];
      while (q.length) {
        const cur = q.shift();
        if (dist.get(cur) >= 3) continue;
        for (const nb of this.m.worlds.get(cur).neighbors) if (!dist.has(nb)) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
      }
      const far = [...dist].filter(([, d]) => d >= 1).map(([id]) => id);
      if (far.length) target = pick(far);
    }
    const tw = this.m.worlds.get(target);
    const spot = randomWild(tw.geo);
    const r = { id: this.nextEventId++, world: target, x: spot.x, z: spot.z, item: pick(LEGEND), finder: finder.id, racers: [], start: this.t, until: this.t + 1440 };
    this.races.push(r);
    this.emote(finder, '🗺️');
    this.say(finder, 'これは…宝の地図！？');
    this.log(`🗺️ ${finder.name}が宝の地図を見つけた！「${tw.name}」に伝説の宝が眠っているらしい…争奪戦の始まりだ`, w0.id, [finder.id], true, { kind: 'race', race: r.id });
    this.joinRace(r, finder);
    // うわさを聞きつけたライバルたち
    const rivals = this.m.chars.filter((c) => c !== finder && c.state === 'ok' && !c.partyLeader && !c.transit
      && !['raid', 'defend', 'dig'].includes(c.act.kind) && !this.raceOf(c)
      && ((c.world === target && chance(0.25)) || (c.world !== target && this.ptRate(c) && this.m.worlds.get(c.world).dan === tw.dan && this.routeCost(c, c.world, target) <= Math.min(c.pts, 15) && chance(0.5))));
    for (const c of rivals.sort(() => Math.random() - 0.5).slice(0, 4)) this.joinRace(r, c);
    return true;
  }
  joinRace(r, c) {
    if (c.world !== r.world && !this.ptRate(c)) return;
    r.racers.push(c.id);
    if (c !== this.m.charById.get(r.finder)) this.say(c, pick(['その宝、いただき！', '負けないよ！', '宝はわたしのもの！', 'うわさの宝だ…！']));
    if (c.world === r.world) { c.walking = false; return this.goDig(c, r); }
    if (!c.trip) {
      c.trip = { mode: 'far', hops: 3, hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [c.world] };
      if (!c.party.length) this.recruit(c, 2);
    }
    c.trip.raceTarget = r.id;
    c.walking = false;
    c.act = { cat: 'explore', label: '宝の地図を広げる', until: this.t + 3, kind: 'idle' };
  }
  goDig(c, r) {
    this.setAct(c, 'explore', `「${r.item}」を探して掘っている`, rand(8, 18), { x: r.x + rand(-4, 4), z: r.z + rand(-4, 4) }, 'dig', r.id, '宝の地図の場所へ急いでいる');
  }
  resolveDig(c, id) {
    const r = this.races.find((x) => x.id === id);
    if (!r || c.world !== r.world) return;
    // 地図を持っている本人は場所の見当がつくので掘り当てやすい
    if (chance(c.id === r.finder ? 0.35 : 0.12)) return this.endRace(r, c);
    this.say(c, pick(['ここじゃない…', 'うーん、もう少し先かな', 'ただの石ころだ…']));
    this.emote(c, '💦');
    this.goDig(c, r);
  }
  endRace(r, winner) {
    this.races = this.races.filter((x) => x !== r);
    const w = this.m.worlds.get(r.world);
    for (const id of r.racers) {
      const c = this.m.charById.get(id);
      if (c.trip?.raceTarget === r.id) delete c.trip.raceTarget;
      if (c.act.kind === 'dig' && c.act.data === r.id) { c.act.kind = 'idle'; c.act.until = this.t; c.walking = false; }
      if (winner && c !== winner && c.world === r.world) { this.emote(c, '😭'); this.say(c, pick(['くやしい〜！', '先を越された…', 'おめでとう…！'])); }
    }
    if (!winner) {
      this.log(`🍂 宝は見つからないまま、「${w.name}」の宝の地図のうわさは消えていった`, r.world, r.racers, false);
      return;
    }
    winner.treasures++;
    this.emote(winner, '🎉');
    this.say(winner, `やった！「${r.item}」だ！`, 40);
    this.daily?.racesWon.push({ name: winner.name, item: r.item, world: r.world, n: r.racers.length });
    this.log(`💰 ${winner.name}が「${w.name}」で伝説の宝「${r.item}」を掘り当てた！（${r.racers.length}人の争奪戦）`, r.world, [winner.id, ...r.racers.filter((id) => id !== winner.id)], true, { kind: 'race-end' });
  }

  // ---------- 誕生日パーティー ----------
  free(c) { return c.state === 'ok' && !c.transit && !c.partyLeader && !BUSY.includes(c.act.kind); }
  partyAt(worldId) { return this.parties.find((p) => p.world === worldId); }
  inviteChance(host, o) {
    const rel = host.friends[o.id] || 0;
    if (rel >= BEST) return 0.95;
    if (rel >= FRIEND) return 0.8;
    if (o.seiryoku && o.seiryoku === host.seiryoku) return 0.6;
    if (o.zoku && o.zoku === host.zoku) return 0.5;
    return o.home === host.home ? 0.3 : 0.15;
  }
  startParty(host) {
    const w = this.m.worlds.get(host.world);
    if (this.hordeAt(w.id) || this.raidAt(w.id)) return;
    host.bdayParty = this.day;
    // 同じ日に同じ世界線で誕生日の人がいたら合同パーティーにする
    const cur = this.partyAt(w.id);
    if (cur) {
      if (this.t > cur.until - 30) return;
      cur.hosts.push(host.id);
      cur.guests = cur.guests.filter((id) => id !== host.id);
      this.setAct(host, 'event', '誕生日パーティーの主役', cur.until - this.t, { x: cur.x + 1.2, z: cur.z }, 'party', cur.id, 'パーティー会場へ向かっている');
      this.log(`🎂 ${host.name}も今日が誕生日！ 合同パーティーになった`, w.id, cur.hosts, true);
      return;
    }
    const atHome = host.world === host.home;
    const h = atHome ? w.geo.homes[host.id] : randomTown(w.geo);
    const p = { id: this.nextEventId++, world: w.id, hosts: [host.id], x: h.x, z: h.z + (atHome ? 3 : 0), start: this.t, until: this.t + 110, asked: [host.id], guests: [] };
    this.parties.push(p);
    this.setAct(host, 'event', '誕生日パーティーの主役', p.until - this.t, { x: p.x, z: p.z }, 'party', p.id, 'パーティー会場へ向かっている');
    // 仲のいい順に声をかける
    const cands = this.m.chars.filter((o) => o.world === w.id && o !== host && this.free(o));
    cands.sort((a, b) => (host.friends[b.id] || 0) - (host.friends[a.id] || 0));
    for (const o of cands) {
      p.asked.push(o.id);
      if (p.guests.length < 14 && chance(this.inviteChance(host, o))) this.joinParty(o, p);
    }
    // 隣の世界線にいる友達も、移動ptがあれば駆けつける
    const far = [];
    for (const o of this.m.chars) {
      if (far.length >= 3 || o.world === w.id || !w.neighbors.includes(o.world) || (host.friends[o.id] || 0) < FRIEND) continue;
      if (!this.free(o) || o.trip || o.party.length || !this.canHop(o, w.id) || !chance(0.6)) continue;
      o.trip = { mode: 'trip', hops: 1, hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [o.world], bdayTarget: p.id };
      p.asked.push(o.id);
      far.push(o);
      this.say(o, `${host.name}の誕生日だ！`);
      this.goPortal(o, w.id);
    }
    const extra = far.length ? `（${far.map((o) => o.name).join('、')}も隣の世界線から向かっている）` : '';
    this.log(`🎂 ${host.name}の誕生日パーティーが始まった！ ${p.guests.length}人がお祝いに駆けつけた${extra}`, w.id, [host.id, ...p.guests], true, { kind: 'party', party: p.id });
  }
  joinParty(o, p) {
    if (p.guests.includes(o.id) || p.hosts.includes(o.id)) return;
    p.guests.push(o.id);
    const i = p.guests.length, a = i * 0.9, d = 3 + (i % 3) * 1.4;
    const host = this.m.charById.get(p.hosts[0]);
    this.setAct(o, 'event', `${host.name}の誕生日パーティー`, Math.max(10, p.until - this.t - 5), { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }, 'party', p.id, `${host.name}の誕生日パーティーに向かっている`);
  }
  joinBirthday(c) {
    const p = this.partyAt(c.world);
    if (!p || p.asked.includes(c.id) || this.t > p.until - 20) return false;
    p.asked.push(c.id);
    if (!chance(this.inviteChance(this.m.charById.get(p.hosts[0]), c) * 0.7)) return false;
    this.joinParty(c, p);
    return true;
  }
  endParty(p) {
    this.parties = this.parties.filter((x) => x !== p);
    const at = (id) => { const o = this.m.charById.get(id); return o.world === p.world && o.act.kind === 'party' && o.act.data === p.id ? o : null; };
    const hosts = p.hosts.map((id) => this.m.charById.get(id));
    const guests = p.guests.map(at).filter(Boolean);
    for (const o of [...p.hosts.map(at).filter(Boolean), ...guests]) { o.act.kind = 'idle'; o.act.until = this.t; o.walking = false; }
    for (const h of hosts) for (const g of guests) this.addFriend(h, g, 4);
    for (let i = 0; i < guests.length; i++) for (let j = i + 1; j < guests.length; j++) this.addFriend(guests[i], guests[j], 1);
    const names = hosts.map((h) => h.name).join('と');
    for (const h of hosts) {
      const d = this.daily?.birthdays.find((x) => x.id === h.id);
      if (d) d.n = guests.length;
      if (h.world === p.world) { this.say(h, guests.length ? '最高の誕生日だった！' : 'ひとりでも、ケーキはおいしい…', 40); this.emote(h, guests.length ? '🥰' : '🍰'); }
    }
    if (!guests.length) return this.log(`🍰 ${names}はひとりでケーキを食べて誕生日を祝った`, p.world, p.hosts, false);
    const gifts = [...new Set(guests.map(() => pick(GIFTS)))].slice(0, 3);
    for (const g of guests) if (chance(0.3)) this.say(g, pick(['楽しかった〜！', 'またね！', 'ケーキおいしかった！']));
    this.log(`🎉 ${names}の誕生日パーティーはおひらき。${guests.length}人にお祝いしてもらい、${gifts.join('・')}などのプレゼントをもらった`, p.world, [...p.hosts, ...guests.map((g) => g.id)], true);
  }

  // ---------- 勢力の催し (集会・合同訓練・商談会 / 対抗戦) ----------
  scheduleFactionEvents() {
    const day0 = this.day * MIN_PER_DAY;
    for (const f of this.factions) {
      if (!chance(0.2) || this.meets.some((m) => m.faction === f.name)) continue;
      this.meets.push({ id: this.nextEventId++, faction: f.name, kind: f.kind, world: f.hq, start: Math.max(day0 + rand(9.5, 15) * 60, this.t + rand(10, 120)), dur: rand(60, 100), started: false });
    }
    if (this.contests.length || !chance(0.5)) return;
    const byWorld = {};
    for (const f of this.factions) (byWorld[f.hq] ||= []).push(f);
    const ws = Object.entries(byWorld).filter(([, fs]) => fs.length >= 2);
    const pickW = weighted(ws.map(([w, fs]) => [w, fs.length]));
    if (!pickW) return;
    const fs = [...byWorld[pickW]].sort(() => Math.random() - 0.5);
    this.contests.push({ id: this.nextEventId++, world: pickW, a: fs[0].name, b: fs[1].name, game: pick(CONTESTS).name, start: Math.max(day0 + rand(13, 16) * 60, this.t + rand(20, 90)), started: false });
  }
  factionMembers(name, world, max = Infinity) {
    const f = this.factions.find((x) => x.name === name);
    return f.members.map((id) => this.m.charById.get(id)).filter((c) => c.world === world && this.free(c))
      .sort((a, b) => b.rank - a.rank).slice(0, max);
  }
  eventSpot(w) { return w.geo.spots.length && chance(0.6) ? pick(w.geo.spots) : randomTown(w.geo); }
  startMeet(mt) {
    const w = this.m.worlds.get(mt.world);
    const ms = this.hordeAt(w.id) || this.raidAt(w.id) ? [] : this.factionMembers(mt.faction, w.id);
    if (ms.length < 2) { this.meets = this.meets.filter((x) => x !== mt); return; }
    const K = MEET_KINDS[mt.kind];
    const sp = this.eventSpot(w);
    Object.assign(mt, { started: true, until: this.t + mt.dur, x: sp.x, z: sp.z, members: ms.map((c) => c.id) });
    ms.forEach((c, i) => {
      const a = (i / ms.length) * Math.PI * 2, d = 2.5 + (i % 2) * 1.6;
      const dest = mt.kind === 'drill' ? { x: sp.x + ((i % 5) - 2) * 1.8, z: sp.z + Math.floor(i / 5) * 1.8 } : { x: sp.x + Math.cos(a) * d, z: sp.z + Math.sin(a) * d };
      this.setAct(c, K.cat, `「${mt.faction}」の${K.label}`, mt.dur, dest, 'meet', mt.id, `「${mt.faction}」の${K.label}に向かっている`);
    });
    this.say(ms[0], pick(K.lines));
    this.log(`${K.icon} 「${mt.faction}」の${K.label}が「${w.name}」で開かれた（${ms.length}人参加）`, w.id, mt.members, true, { kind: 'meet', meet: mt.id });
  }
  endMeet(mt) {
    this.meets = this.meets.filter((x) => x !== mt);
    const ms = mt.members.map((id) => this.m.charById.get(id)).filter((c) => c.world === mt.world && c.act.kind === 'meet' && c.act.data === mt.id);
    for (const c of ms) {
      c.act.kind = 'idle'; c.act.until = this.t; c.walking = false;
      if (mt.kind === 'drill') { c.trainDay = this.day; this.emote(c, '🔥'); }
    }
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) this.addFriend(ms[i], ms[j], 2);
    if (this.daily) this.daily.meets++;
    const K = MEET_KINDS[mt.kind];
    this.log(`「${mt.faction}」の${K.label}が終わった${mt.kind === 'drill' ? '（参加者は今日1日、戦闘力1割増し）' : ''}`, mt.world, ms.map((c) => c.id), false);
  }
  startContest(ct) {
    const w = this.m.worlds.get(ct.world);
    const busy = this.hordeAt(w.id) || this.raidAt(w.id);
    const A = busy ? [] : this.factionMembers(ct.a, w.id, 5), B = busy ? [] : this.factionMembers(ct.b, w.id, 5);
    if (A.length < 2 || B.length < 2) { this.contests = this.contests.filter((x) => x !== ct); return; }
    const sp = this.eventSpot(w);
    Object.assign(ct, { started: true, until: this.t + 60, x: sp.x, z: sp.z, teamA: A.map((c) => c.id), teamB: B.map((c) => c.id), watchers: [] });
    const lbl = `勢力対抗「${ct.game}」に出場`;
    A.forEach((c, i) => this.setAct(c, 'event', lbl, 60, { x: sp.x - 4.5, z: sp.z + (i - 2) * 1.8 }, 'contest', ct.id, '対抗戦の会場へ向かっている'));
    B.forEach((c, i) => this.setAct(c, 'event', lbl, 60, { x: sp.x + 4.5, z: sp.z + (i - 2) * 1.8 }, 'contest', ct.id, '対抗戦の会場へ向かっている'));
    // 見物人も集まってくる
    for (const o of this.m.chars) {
      if (ct.watchers.length >= 10 || o.world !== w.id || !this.free(o) || !chance(0.25)) continue;
      const a = Math.random() * Math.PI * 2;
      ct.watchers.push(o.id);
      this.setAct(o, 'event', `勢力対抗「${ct.game}」を観戦`, 60, { x: sp.x + Math.cos(a) * 9, z: sp.z + Math.sin(a) * 9 }, 'watch', ct.id, '対抗戦を見に行っている');
    }
    this.log(`🚩 勢力対抗「${ct.game}」！「${ct.a}」vs「${ct.b}」が「${w.name}」で始まる`, w.id, [...ct.teamA, ...ct.teamB], true, { kind: 'contest', contest: ct.id });
  }
  endContest(ct) {
    this.contests = this.contests.filter((x) => x !== ct);
    const at = (id) => { const c = this.m.charById.get(id); return c.world === ct.world && ['contest', 'watch'].includes(c.act.kind) && c.act.data === ct.id ? c : null; };
    const A = ct.teamA.map(at).filter(Boolean), B = ct.teamB.map(at).filter(Boolean), W = ct.watchers.map(at).filter(Boolean);
    for (const c of [...A, ...B, ...W]) { c.act.kind = 'idle'; c.act.until = this.t; c.walking = false; }
    if (!A.length && !B.length) return;
    const g = CONTESTS.find((x) => x.name === ct.game);
    const score = (team) => {
      if (!team.length) return -1;
      const each = team.map((c) => (g.stat ? g.stat.reduce((s, i) => s + c.stats[i], 0) / g.stat.length : 100) * (1 + 0.05 * c.rank) * rand(0.6, 1.4));
      return (each.reduce((s, v) => s + v, 0) / team.length) * (1 + 0.06 * team.length);
    };
    const aWin = score(A) >= score(B);
    const [win, lose, wn, ln] = aWin ? [A, B, ct.a, ct.b] : [B, A, ct.b, ct.a];
    for (const c of win) { c.contestWins++; this.emote(c, '🎉'); this.say(c, pick(['やったー！', '勝った〜！', 'これが実力だ！'])); }
    for (const c of lose) { this.emote(c, '😭'); this.say(c, pick(['くやしい！', '次は負けない！', 'いい勝負だった…'])); }
    for (const c of W) this.emote(c, '👏');
    for (const team of [win, lose]) for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) this.addFriend(team[i], team[j], 2);
    for (const a of win) for (const b of lose) this.addFriend(a, b, 1);
    this.daily?.contests.push({ game: ct.game, win: wn, lose: ln, world: ct.world });
    this.log(`🏅 勢力対抗「${ct.game}」は「${wn}」の勝利！「${ln}」を下した`, ct.world, [...win, ...lose].map((c) => c.id), true);
  }

  // ---------- 追加の行動 ----------
  doVisit(c, geo) {
    const others = this.m.worlds.get(c.world).residents.filter((id) => id !== c.id);
    if (!others.length) return this.doWalk(c, geo);
    // 仲のいい相手ほど遊びに行きやすい
    const o = this.m.charById.get(weighted(others.map((id) => [id, 1 + Math.max(0, c.friends[id] || 0) / 5])));
    const h = geo.homes[o.id];
    return this.setAct(c, 'social', `${o.name}の家に遊びに行く`, rand(30, 90), { x: h.x + rand(-2, 2), z: h.z + rand(1, 3) }, 'visit', o.id, `${o.name}の家に向かっている`);
  }
  doTraining(c, geo) {
    const dest = chance(0.5) ? pick(geo.spots) : randomWild(geo);
    return this.setAct(c, 'training', pick(TRAIN), rand(40, 120), dest, 'train', null, '修行の場所へ向かっている');
  }
  doShopping(c, geo) {
    const wp = pick(geo.works);
    return this.setAct(c, 'shopping', pick(SHOPS), rand(15, 45), { x: wp.x + rand(-4, 4), z: wp.z + rand(-4, 4) }, 'idle', null, 'お店に向かっている');
  }
  doExplore(c, geo) {
    return this.setAct(c, 'explore', `${this.wname(c.world)}の奥地を探検`, rand(30, 90), randomWild(geo), 'explore', null, '探検に出かけている');
  }
  doHelp(c, geo) {
    const busy = this.m.chars.filter((o) => o !== c && o.world === c.world && o.state === 'ok' && o.act.cat === 'work' && !o.walking);
    if (busy.length) {
      const o = pick(busy);
      return this.setAct(c, 'help', `${o.name}の${o.act.label}を手伝う`, rand(40, 90), { x: o.x + 1.5, z: o.z + 0.5 }, 'help', o.id, `${o.name}を手伝いに行っている`);
    }
    return this.setAct(c, 'help', pick(HELP), rand(30, 70), randomTown(geo));
  }
  rollTreasure(c) {
    if (!this.races.length && this.hour >= 7 && this.hour < 18 && chance(0.006)) return this.startRace(c);
    if (chance(0.015)) {
      c.treasures++;
      const item = pick(RARE);
      this.say(c, 'こ、これは…！');
      this.emote(c, '💎');
      this.daily?.treasures.push({ name: c.name, item, rare: true });
      this.log(`💎 ${c.name}が「${this.wname(c.world)}」の探検で「${item}」を発見した！`, c.world, [c.id], true);
    } else if (chance(0.12)) {
      c.treasures++;
      const item = pick(TREASURES);
      this.say(c, 'なにか見つけた！');
      this.emote(c, '✨');
      this.daily?.treasures.push({ name: c.name, item, rare: false });
      this.log(`🧭 ${c.name}が「${this.wname(c.world)}」で「${item}」を見つけた`, c.world, [c.id], false);
    }
  }

  // ---------- レイド ----------
  updateRaids(dt) {
    const h = this.hour;
    if (h >= 8 && h < 17 && this.raids.length < 3) {
      for (const w of this.m.worlds.values()) {
        if (w.num < 20 || this.raids.some((r) => r.world === w.id) || this.hordeAt(w.id)) continue;
        if (chance(dt * RAID_RATE * (1 + w.danger / 60))) this.spawnRaid(w);
      }
    }
    for (const r of [...this.raids]) {
      if (this.t < r.until) continue;
      if (r.phase === 'gather') {
        const fighters = this.raidFighters(r);
        if (!fighters.length) {
          this.log(`🌫️ 誰も集まらず、レイドボス「${r.name}」は「${this.wname(r.world)}」から去っていった`, r.world, [], true, { kind: 'raid-end' });
          this.endRaid(r);
          continue;
        }
        // 戦力が足りなければ無理をせず撤退する (倒れる人は出ない)
        const ratio = this.raidPower(r) / r.power;
        if (ratio < 0.5 || (ratio < 0.75 && chance(0.7))) {
          const ids = fighters.flatMap((c) => this.partyOf(c).filter((p) => p.world === r.world).map((p) => p.id));
          for (const id of ids) {
            const c = this.m.charById.get(id);
            this.say(c, pick(['今日は分が悪い…', '撤退だ！', '無理はしないでおこう', '覚えてろ〜！']));
            this.emote(c, '💦');
          }
          this.daily?.raidsFled.push({ name: r.name, world: r.world, n: ids.length });
          this.log(`🏃 戦力が足りず、${ids.length}人はレイドボス「${r.name}」から撤退した（集まった戦力${Math.round(this.raidPower(r))}／ボス${r.power}）。ボスは去っていった`, r.world, ids, true, { kind: 'raid-end' });
          this.endRaid(r);
          continue;
        }
        r.phase = 'fight';
        r.until = this.t + 30;
        for (const c of fighters) { c.act.label = 'レイドボスと激闘中！'; this.say(c, pick(['いくぞ！', 'みんな、力を合わせて！', 'うおおお！'])); }
        this.log(`🔥 ${fighters.length}組がレイドボス「${r.name}」との戦いを始めた！`, r.world, fighters.map((c) => c.id), true);
      } else this.resolveRaid(r);
    }
  }
  spawnRaid(w) {
    const a = Math.random() * Math.PI * 2, rr = w.geo.R * rand(0.45, 0.6);
    const [title, type] = pick(RAID_TITLE);
    const r = {
      id: this.nextRaidId++, world: w.id, x: Math.cos(a) * rr, z: Math.sin(a) * rr,
      name: `${[...w.name][0]}獄の${title}`, type: [type],
      // 一人では勝てないが、5人前後集まれば勝ち目がある強さ
      power: Math.round((240 + w.danger * 30) * 4.5 * rand(0.9, 1.2)),
      phase: 'gather', until: this.t + 90, participants: [], helpers: [],
    };
    this.raids.push(r);
    this.effects.push({ t: this.t, world: w.id, x: r.x, z: r.z, kind: 'dan' });
    this.log(`🐉 レイドボス「${r.name}」(${type}タイプ・戦闘力${r.power})が「${w.name}」に出現！ 一人では勝てない…みんなを呼べ！`, w.id, [], true, { kind: 'raid', raid: r.id });
    for (const c of this.m.chars) if (c.world === w.id) this.joinRaid(c, r);
    // 隣の世界線にいるランク9以上へ救援要請
    let called = 0;
    for (const nb of w.neighbors) {
      for (const c of this.m.chars) {
        if (called >= 6) break;
        if (c.world !== nb || c.state !== 'ok' || c.partyLeader || !this.canHop(c, w.id)) continue;
        if (c.trip?.raidTarget || c.act.kind === 'raid' || !chance(0.7)) continue;
        this.callHelper(c, r);
        called++;
      }
    }
  }
  raidAt(worldId) { return this.raids.find((r) => r.world === worldId); }
  joinGatheringRaid(c) {
    const r = this.raidAt(c.world);
    if (!r || r.phase !== 'gather' || r.participants.includes(c.id)) return false;
    return this.joinRaid(c, r);
  }
  joinRaid(c, r) {
    if (c.state !== 'ok' || c.partyLeader || r.participants.includes(c.id)) return false;
    r.participants.push(c.id);
    const i = r.participants.length;
    const a = i * 0.75, d = 10 + (i % 4) * 2.6;
    this.setAct(c, 'raid', 'レイドボスに挑む', Infinity, { x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d }, 'raid', r.id, 'レイドボスのもとへ集合中');
    this.say(c, pick(['加勢するよ！', 'みんなで倒そう！', '任せて！', '集合〜！']));
    return true;
  }
  callHelper(c, r) {
    if (!c.trip) {
      c.trip = { mode: 'trip', hops: 1, hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [c.world] };
      if (!c.party.length) this.recruit(c, hopCost(this.m.worlds, c.world, r.world));
    }
    c.trip.raidTarget = r.id;
    r.helpers.push(c.id);
    this.say(c, '救援に行くぞ！');
    this.log(`📣 ${this.partyNames(c)}が「${this.wname(r.world)}」のレイドに救援に向かった`, c.world, [c.id, ...c.party], true);
    this.goPortal(c, r.world);
  }
  raidFighters(r) {
    return r.participants.map((id) => this.m.charById.get(id))
      .filter((c) => c.world === r.world && c.state === 'ok' && c.act.kind === 'raid' && c.act.data === r.id && !c.walking);
  }
  raidPower(r) { return this.raidFighters(r).reduce((s, c) => s + this.partyPower(c, r.type), 0); }
  resolveRaid(r) {
    const fighters = this.raidFighters(r);
    const ids = fighters.flatMap((c) => this.partyOf(c).filter((p) => p.world === r.world).map((p) => p.id));
    const me = this.raidPower(r) * rand(0.8, 1.2), them = r.power * rand(0.85, 1.15);
    if (fighters.length && me >= them) {
      for (const id of ids) {
        const c = this.m.charById.get(id);
        c.kills++; c.raidWins++;
        this.say(c, pick(['やったー！！', '勝った！', 'みんなのおかげ！']));
        this.emote(c, '🎉');
      }
      // 一緒に戦った仲間とは仲良くなる
      const cs = ids.map((id) => this.m.charById.get(id));
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) this.addFriend(cs[i], cs[j], 3);
      this.daily?.raidsWon.push({ name: r.name, world: r.world, n: ids.length });
      this.log(`🏆 ${ids.length}人でレイドボス「${r.name}」(戦闘力${r.power})を撃破した！`, r.world, ids, true, { kind: 'raid-end' });
    } else {
      for (const id of ids) this.knockDown(this.m.charById.get(id));
      this.daily?.raidsLost.push({ name: r.name, world: r.world, n: ids.length });
      this.log(`💥 レイドボス「${r.name}」に敗北…${ids.length}人が朝まで倒れている（ボスは力尽きて消滅した）`, r.world, ids, true, { kind: 'raid-end' });
    }
    this.endRaid(r);
  }
  endRaid(r) {
    this.raids = this.raids.filter((x) => x !== r);
    this.effects.push({ t: this.t, world: r.world, x: r.x, z: r.z, kind: 'dan' });
    for (const id of [...r.participants, ...r.helpers]) {
      const c = this.m.charById.get(id);
      if (c.trip?.raidTarget === r.id) delete c.trip.raidTarget;
      if (c.act.kind === 'raid' && c.act.data === r.id) { c.act.kind = 'idle'; c.act.until = this.t; c.walking = false; }
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
      if (!['hobby', 'sabori', 'move', 'shopping', 'social'].includes(o.act.cat) || o.act.kind !== 'idle') continue;
      const d = dist2(c.x, c.z, o.x, o.z) / (1 + Math.max(0, c.friends[o.id] || 0) * 0.15);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  startChat(c, o) {
    const mid = { x: (c.x + o.x) / 2, z: (c.z + o.z) / 2 };
    const dur = rand(15, 35);
    this.setAct(o, 'social', `${c.name}とおしゃべり`, dur + 10, { x: mid.x + 1, z: mid.z }, 'idle');
    this.setAct(c, 'social', `${o.name}とおしゃべり`, dur, { x: mid.x - 1, z: mid.z }, 'chat', o.id);
    if (c.world !== c.home) this.log(`${c.name}が${this.wname(c.world)}の${o.name}とおしゃべりした`, c.world, [c.id, o.id], false);
  }

  // ---------- 戦闘 ----------
  tryBattle(c) {
    const list = this.monsters.get(c.world).filter((m) => !m.engagedBy);
    if (!list.length) return false;
    list.sort((a, b) => dist2(c.x, c.z, a.x, a.z) - dist2(c.x, c.z, b.x, b.z));
    // タイプ相性も考えて勝てそうな相手を選ぶ。どうしてもいなければ、たまに格上へ挑む
    const mo = list.find((m) => m.power < this.partyPower(c, m.type)) || (chance(0.1) ? list[0] : null);
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
    const pw = this.partyPower(c, mo.type);
    const me = pw * rand(0.75, 1.25), them = mo.power * rand(0.75, 1.25);
    const note = edgeNote(edge(c.types, mo.type));
    const mname = `${mo.type?.[0] ? mo.type[0] + 'タイプの' : ''}${mo.boss ? '大魔物' : '魔物'}`;
    const who = this.partyNames(c);
    const ids = this.partyOf(c).map((p) => p.id);
    const wn = this.wname(c.world);
    if (me >= them) {
      list.splice(i, 1);
      c.kills++;
      if (this.daily) { this.daily.battles++; this.daily.kills[c.id] = (this.daily.kills[c.id] || 0) + 1; }
      this.say(c, mo.boss ? 'やったー！大物だ！' : 'よし！');
      this.emote(c, mo.boss ? '🎉' : '💪');
      const notable = mo.boss || mo.power > pw * 0.95;
      this.log(`⚔️ ${who}が${wn}で${mname}(戦闘力${mo.power})を退治した${note}`, c.world, ids, notable);
    } else {
      mo.engagedBy = null;
      for (const p of this.partyOf(c)) if (p.world === c.world) { this.knockDown(p); this.emote(p, '💫'); }
      if (this.daily) this.daily.downs += ids.length;
      this.log(`💫 ${who}が${wn}の${mname}(戦闘力${mo.power})に敗れ、朝まで倒れている${note}`, c.world, ids, true);
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
  // ---------- 移動pt ----------
  ptRate(c) { return PT_RATE[Math.min(c.rank, 11)] || 0; }
  ptCap(c) { return this.ptRate(c) * 3; }
  partySize(c) { return 1 + c.party.length; }
  // 仲間を連れていくと人数分のptがかかる
  hopPrice(c, a, b) { return hopCost(this.m.worlds, a, b) * this.partySize(c); }
  canHop(c, to) { return c.world !== to && this.m.worlds.get(c.world).neighbors.includes(to) && c.pts >= this.hopPrice(c, c.world, to); }
  routeCost(c, from, to) {
    if (this.m.worlds.get(from).dan !== this.m.worlds.get(to).dan) return Infinity;
    const r = cheapestPath(this.m.worlds, from, to);
    return r ? r.cost * this.partySize(c) : Infinity;
  }
  nextHop(c, to) {
    if (this.m.worlds.get(c.world).dan !== this.m.worlds.get(to).dan) return null;
    return cheapestPath(this.m.worlds, c.world, to)?.path[1] ?? null;
  }
  canDan(c) { return c.rank >= 11 && c.pts >= DAN_COST * this.partySize(c); }
  fmtPt(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

  startTrip(c) {
    const w = this.m.worlds.get(c.world);
    const dan = c.rank >= 11 && c.pts >= DAN_COST && chance(0.45);
    if (!dan && !w.neighbors.some((nb) => c.pts >= hopCost(this.m.worlds, c.world, nb))) return false;
    c.trip = { mode: dan ? 'dan' : chance(0.6) ? 'trip' : 'far', hops: dan ? 0 : randInt(1, 3), hopsDone: 0, acts: 0, goingHome: false, campOk: false, visited: [c.world] };
    c.party = [];
    this.recruit(c, dan ? DAN_COST : 2);
    if (!dan) {
      // 仲間を含めて払えるかを確認し、往復できなければ片道の遠出にする
      const minHop = Math.min(...w.neighbors.map((nb) => this.hopPrice(c, c.world, nb)));
      if (c.pts < minHop) { this.endTrip(c); return false; }
      if (c.trip.mode === 'trip' && c.pts < minHop * 2) c.trip.mode = 'far';
    }
    this.say(c, dan ? '世界団を越えるぞ…！' : pick(['ちょっと冒険してくる！', '隣の世界線に行ってみよう', '旅に出るか']));
    const names = c.party.length ? `（仲間: ${c.party.map((id) => this.m.charById.get(id).name).join('、')}）` : '';
    if (!dan) this.log(`🎒 ${c.name}が冒険に出発した${names}`, c.world, [c.id, ...c.party], true);
    this.decideTrip(c);
    return true;
  }

  // 同じ汎異記号の仲間を、ptに余裕がある分だけ (1人あたり unit pt) 連れていく
  recruit(c, unit) {
    const slots = Math.min(3, Math.max(0, Math.floor(c.pts / unit) - 1));
    if (!slots || chance(0.3)) return;
    const mates = this.m.chars.filter((o) => o !== c && o.hani === c.hani && o.world === c.world && o.state === 'ok'
      && !o.partyLeader && !o.trip && !o.party.length && o.act.kind === 'idle');
    for (const o of mates.sort(() => Math.random() - 0.5).slice(0, randInt(1, slots))) {
      o.partyLeader = c.id;
      o.walking = false;
      c.party.push(o.id);
      this.say(o, pick(['ついていく！', 'いっしょに行く！', '冒険だ〜！']));
    }
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
    if (tr.raidTarget) {
      const r = this.raids.find((x) => x.id === tr.raidTarget);
      if (r && r.world !== c.world && this.canHop(c, r.world)) return this.goPortal(c, r.world);
      delete tr.raidTarget;
    }
    if (tr.bdayTarget) {
      const p = this.parties.find((x) => x.id === tr.bdayTarget);
      if (p && p.world === c.world) { delete tr.bdayTarget; if (this.t < p.until - 10) return this.joinParty(c, p); }
      else if (p && this.canHop(c, p.world)) return this.goPortal(c, p.world);
      else delete tr.bdayTarget;
    }
    if (tr.raceTarget) {
      const r = this.races.find((x) => x.id === tr.raceTarget);
      if (!r) delete tr.raceTarget;
      else if (r.world === c.world) return this.goDig(c, r);
      else {
        const nx = this.nextHop(c, r.world);
        if (nx && this.canHop(c, nx)) return this.goPortal(c, nx);
      }
    }
    if (!inHomeDan) {
      if (this.canDan(c) && h < 18) return this.danJump(c, true);
      return this.exploreOrHop(c, w, false);
    }

    if (tr.goingHome) {
      const nx = this.nextHop(c, c.home);
      if (nx && this.canHop(c, nx)) return this.goPortal(c, nx);
      return this.foreignActivity(c, w); // ptが足りない → 夜は野宿して、朝たまるのを待つ
    }
    if (c.world === c.home) {
      // 日帰りなら往復できる行き先だけ
      const ok = w.neighbors.filter((nb) => c.pts >= this.hopPrice(c, c.world, nb) * (tr.mode === 'trip' ? 2 : 1));
      if (!ok.length) { this.endTrip(c); return this.decide(c); }
      const cheap = ok.filter((nb) => hopCost(this.m.worlds, c.world, nb) === 1);
      return this.goPortal(c, pick(cheap.length && chance(0.7) ? cheap : ok));
    }
    return this.exploreOrHop(c, w, true);
  }

  exploreOrHop(c, w, canReturn) {
    const tr = c.trip;
    const h = this.hour;
    if (tr.acts < randInt(2, 4)) return this.foreignActivity(c, w);
    tr.acts = 0;
    const back = canReturn ? this.routeCost(c, c.world, c.home) : Infinity;
    const reachable = back <= c.pts;
    if (canReturn && (tr.mode === 'trip' || h >= 16 || tr.hopsDone >= tr.hops) && reachable && (tr.mode === 'trip' || chance(0.6))) {
      tr.goingHome = true;
      this.say(c, 'そろそろ帰ろうか');
      return this.decideTrip(c);
    }
    if (h < 18 && w.neighbors.length) {
      // 日帰りなら、行った先から帰れるだけのptを残す
      const ok = w.neighbors.filter((nb) => {
        const cost = this.hopPrice(c, c.world, nb);
        return c.pts >= cost + (canReturn && tr.mode === 'trip' ? this.routeCost(c, nb, c.home) : 0);
      });
      const fresh = ok.filter((id) => !tr.visited.includes(id));
      if (ok.length) return this.goPortal(c, pick(fresh.length ? fresh : ok));
    }
    return this.foreignActivity(c, w);
  }

  foreignActivity(c, w) {
    c.trip.acts++;
    const near = this.findChatPartner(c);
    const choice = weighted([
      ['sight', 26], ['battle', this.monsters.get(w.id).length ? 25 : 0], ['chat', near ? 18 : 0], ['hobby', 12],
      ['explore', 10], ['shopping', w.geo.works.length && w.residents.length ? 6 : 0], ['training', 5],
    ]);
    if (choice === 'battle' && this.tryBattle(c)) return;
    if (choice === 'chat') return this.startChat(c, near);
    if (choice === 'explore') return this.doExplore(c, w.geo);
    if (choice === 'training') return this.doTraining(c, w.geo);
    if (choice === 'shopping') {
      const wp = pick(w.geo.works);
      return this.setAct(c, 'shopping', `${w.name}のお土産を買う`, rand(15, 40), { x: wp.x + rand(-4, 4), z: wp.z + rand(-4, 4) }, 'idle', null, 'お土産屋に向かっている');
    }
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

  // ポータルに入ると世界団マップ上を実際に飛んで隣の世界線へ向かう
  crossPortal(c, to) {
    const from = c.world;
    const a = this.m.worlds.get(from).pos, b = this.m.worlds.get(to).pos;
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const cost = this.hopPrice(c, from, to);
    c.pts = Math.max(0, c.pts - cost);
    c.travels++;
    c.trip.hopsDone++;
    c.trip.visited.push(to);
    if (this.daily) this.daily.travels++;
    for (const id of c.party) this.addFriend(c, this.m.charById.get(id), 1);
    const p = this.m.worlds.get(from).geo.portals[to];
    this.effects.push({ t: this.t, world: from, x: p?.x ?? c.x, z: p?.z ?? c.z, kind: 'portal' });
    this.log(`🌀 ${this.partyNames(c)}が「${this.wname(from)}」を出発し「${this.wname(to)}」へ向かっている（${cost}pt消費・残り${this.fmtPt(c.pts)}pt）`, from, [c.id, ...c.party], true, { kind: 'travel', from, to });
    this.startTransit(c, 'line', from, to, 12 + d * 0.35);
  }

  startTransit(c, kind, from, to, dur, extra = {}) {
    c.transit = { kind, from, to, start: this.t, end: this.t + dur, sx: c.x, sz: c.z, ...extra };
    c.world = TRANSIT;
    c.walking = false;
    c.bubble = null;
    const label = kind === 'dan' ? `世界団を越えて「${this.wname(to)}」へ移動中` : `「${this.wname(to)}」へ移動中`;
    c.act = { cat: 'move', label, until: Infinity, kind: 'transit' };
    for (const id of c.party) { const o = this.m.charById.get(id); o.world = TRANSIT; o.walking = false; o.bubble = null; }
  }
  transitOf(c) {
    if (c.transit) return c.transit;
    const L = c.partyLeader && this.m.charById.get(c.partyLeader);
    return L?.transit || null;
  }
  transitProgress(tr) { return Math.min(1, Math.max(0, (this.t - tr.start) / (tr.end - tr.start))); }

  arrive(c) {
    const { kind, from, to, tx, tz } = c.transit;
    c.transit = null;
    const tw = this.m.worlds.get(to);
    let p;
    if (kind === 'line') {
      const back = tw.geo.portals[from] || { x: 0, z: 0 };
      p = { x: back.x * 0.92, z: back.z * 0.92 };
    } else p = tx !== undefined ? { x: tx, z: tz } : randomTown(tw.geo);
    c.world = to; c.x = p.x; c.z = p.z;
    for (const id of c.party) { const o = this.m.charById.get(id); o.world = to; o.x = p.x; o.z = p.z; }
    this.emote(c, '👋');
    this.effects.push({ t: this.t, world: to, x: p.x, z: p.z, kind: kind === 'dan' ? 'dan' : 'portal' });
    if (kind === 'dan') {
      this.say(c, c.trip?.goingHome ? 'ただいま…ちょっと疲れた' : 'ふぅ…力を使いすぎた');
      this.log(`🌌 ${c.name}が世界団 ${tw.dan} の「${tw.name}」に到着した（今日は力が半減）`, to, [c.id], true);
      c.act = { cat: 'move', label: '世界団移動の反動で休憩', until: this.t + rand(20, 40), kind: 'idle' };
      return;
    }
    this.log(`${this.partyNames(c)}が「${tw.name}」に到着した`, to, [c.id, ...c.party], false);
    c.act = { cat: 'move', label: `${tw.name}に到着`, until: this.t + rand(3, 10), kind: 'idle' };
    const r = this.raidAt(to);
    if (r && r.phase === 'gather') this.joinRaid(c, r);
    else if (this.hordeAt(to)) this.joinDefense(c, this.hordeAt(to));
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
    const cost = DAN_COST * this.partySize(c);
    c.pts = Math.max(0, c.pts - cost);
    c.halvedDay = this.day;
    tr.danJumped = true;
    if (!homeward) tr.mode = 'far';
    tr.goingHome = homeward;
    tr.acts = 0;
    const tw = this.m.worlds.get(to);
    this.effects.push({ t: this.t, world: from, x: c.x, z: c.z, kind: 'dan' });
    this.log(`🌌 ${this.partyNames(c)}が世界団を越える旅に出た 「${this.wname(from)}」(${this.m.worlds.get(from).dan})→「${tw.name}」(${tw.dan})　${cost}pt消費・今日は力が半減`, from, [c.id, ...c.party], true, { kind: 'dan-travel', from, to });
    this.daily?.danJumps.push({ name: c.name, from, to });
    const land = randomTown(tw.geo);
    this.startTransit(c, 'dan', from, to, rand(90, 120), { tx: land.x, tz: land.z });
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
      this.emote(c, '🙏');
      this.addFriend(c, host, 2);
      if (this.daily) this.daily.camps++;
      const hp = w.geo.homes[host.id] || randomTown(w.geo);
      this.grantCamp(c, { x: hp.x + rand(-6, 6), z: hp.z + rand(4, 7) });
      this.log(`⛺ ${host.name}が承諾し、${this.partyNames(c)}は「${w.name}」で野宿する`, w.id, [...ids, host.id], true);
      return;
    }
    this.say(host, pick(['ダメ！', 'うちは困るよ…', '他を当たって！']), 25);
    this.emote(c, '💢');
    this.addFriend(c, host, -3);
    (c.trip.refused ||= []).push(host.id);
    const homeHop = w.dan === c.dan ? this.nextHop(c, c.home) : null;
    const ok = w.neighbors.filter((nb) => this.canHop(c, nb));
    if (ok.length) {
      this.log(`🙅 ${host.name}が${this.partyNames(c)}の野宿を断った → 残りの移動ptで別の世界線へ`, w.id, [...ids, host.id], true);
      c.trip.refused = [];
      const to = homeHop && ok.includes(homeHop) ? homeHop : ok.sort((a, b) => hopCost(this.m.worlds, c.world, a) - hopCost(this.m.worlds, c.world, b))[0];
      c.act = { cat: 'move', label: '別の世界線を目指す', until: this.t + 2, kind: 'idle' };
      return this.goPortal(c, to);
    }
    // どうしようもない → 撃退して野宿する
    const me = this.partyPower(c) * rand(0.75, 1.25), them = this.power(host) * rand(0.75, 1.25);
    if (me >= them) {
      this.knockDown(host);
      this.emote(host, '💫');
      this.addFriend(c, host, -8);
      if (this.daily) this.daily.duels++;
      this.say(c, 'ごめんね…！', 20);
      this.grantCamp(c, { x: c.x + rand(-4, 4), z: c.z + rand(3, 6) });
      this.log(`🥊 移動ptが足りない${this.partyNames(c)}は、断った${host.name}を撃退して「${w.name}」で野宿する`, w.id, [...ids, host.id], true);
    } else {
      for (const m of this.partyOf(c)) { this.knockDown(m); this.emote(m, '💫'); }
      this.addFriend(c, host, -8);
      if (this.daily) this.daily.duels++;
      this.say(host, '出直してきな！', 25);
      this.log(`💫 ${this.partyNames(c)}は野宿を断った${host.name}に撃退され、朝まで「${w.name}」で倒れている`, w.id, [...ids, host.id], true);
    }
  }

  // ---------- 参照 ----------
  charsIn(worldId) { return this.m.chars.filter((c) => c.world === worldId); }
  visitorsIn(worldId) { return this.m.chars.filter((c) => c.world === worldId && c.home !== worldId); }

  // ---------- 保存 ----------
  serialize() {
    const keys = ['world', 'x', 'z', 'dest', 'walking', 'state', 'pts', 'halvedDay', 'partyLeader', 'party', 'trip', 'meals', 'work', 'act', 'kills', 'downs', 'travels', 'trainDay', 'treasures', 'raidWins', 'transit', 'friends', 'bdayParty', 'contestWins'];
    return {
      v: 1, t: this.t, lastMorning: this.lastMorning, nextMonsterId: this.nextMonsterId,
      raids: this.raids, nextRaidId: this.nextRaidId, hordes: this.hordes, races: this.races, repair: this.repair, nextEventId: this.nextEventId,
      parties: this.parties, meets: this.meets, contests: this.contests, clock: 'real', daily: this.daily, report: this.report,
      monsters: Object.fromEntries(this.monsters),
      events: this.events.slice(-200),
      chars: this.m.chars.map((c) => [c.id, Object.fromEntries(keys.map((k) => [k, c[k] === Infinity ? 'INF' : c[k]]))]),
    };
  }
  restore(s) {
    if (!s || s.v !== 1) return false;
    const map = new Map(s.chars);
    if (map.size !== this.m.chars.length || this.m.chars.some((c) => !map.has(c.id) || !(this.m.worlds.has(map.get(c.id).world) || map.get(c.id).world === TRANSIT))) return false;
    if (s.clock !== 'real') {
      // 1日20分だったころの保存データ: 時刻が合わないので、記録と友好度だけ引き継いで今の時刻から始める
      for (const c of this.m.chars) {
        const d = map.get(c.id);
        for (const k of ['kills', 'downs', 'travels', 'treasures', 'raidWins', 'contestWins', 'friends']) if (d[k] != null) c[k] = d[k];
      }
      return true;
    }
    this.t = s.t; this.lastMorning = s.lastMorning; this.nextMonsterId = s.nextMonsterId;
    for (const [wid, list] of Object.entries(s.monsters)) {
      const w = this.m.worlds.get(wid);
      if (!w) continue;
      // 上限を変える前に生まれた強すぎる魔物は取り除く
      const maxPower = (240 + w.danger * 30) * 1.4 * 2.2;
      this.monsters.set(wid, list.filter((mo) => mo.power <= maxPower).slice(0, this.monsterCap(w)));
    }
    this.events = s.events || [];
    this.raids = (s.raids || []).filter((r) => this.m.worlds.has(r.world));
    this.nextRaidId = s.nextRaidId || 1;
    this.daily = s.daily || this.newDaily();
    this.daily.raidsFled ??= [];
    for (const k of ['hordesWon', 'hordesLost', 'racesWon', 'birthdays', 'contests']) this.daily[k] ??= [];
    this.daily.meets ??= 0;
    this.parties = (s.parties || []).filter((p) => this.m.worlds.has(p.world));
    this.meets = (s.meets || []).filter((p) => this.m.worlds.has(p.world));
    this.contests = (s.contests || []).filter((p) => this.m.worlds.has(p.world));
    for (const [wid, list] of this.monsters) for (const mo of list) mo.type ??= monsterType(this.m.worlds.get(wid));
    this.hordes = (s.hordes || []).filter((h) => this.m.worlds.has(h.world));
    this.races = (s.races || []).filter((r) => this.m.worlds.has(r.world));
    this.repair = s.repair || {};
    this.nextEventId = s.nextEventId || 1;
    this.report = s.report || null;
    for (const c of this.m.chars) {
      const d = map.get(c.id);
      Object.assign(c, d);
      if (c.act && c.act.until === 'INF') c.act.until = Infinity;
      if (c.act && c.act.until === null) c.act.until = Infinity;
      if (typeof c.pts !== 'number') c.pts = this.ptRate(c);
      delete c.movesLeft; delete c.lastDan;
      c.bdayParty ??= -1; c.contestWins ??= 0;
      c.trainDay ??= -1; c.treasures ??= 0; c.raidWins ??= 0; c.transit ??= null; c.friends ??= {};
      c.log = this.events.filter((e) => e.ids.includes(c.id)).slice(-30);
    }
    return true;
  }
}
