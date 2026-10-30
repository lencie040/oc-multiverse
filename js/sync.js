// 見ている人全員で同じ世界を見るための同期 (Supabase)
// - 一番早くから見ている人が「ホスト」になって世界を動かし、2秒ごとに変わった所だけを全員へ送る
// - ホストが閉じたら、次に古い人が自動で引き継ぐ
// - 世界の状態は2分ごとにテーブル (world_state) に保存し、誰もいない間の分は次に開いた人が進める
const SUPABASE_URL = 'https://palkvodygcxebubkxehh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dUhf4QpsBTOnyt4IzaVL4w_K4Oflmmk'; // 公開用キー (サイトに載せてよいもの)
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
const DELTA_EVERY = 2000;
const SAVE_EVERY = 120000;
const MAX_MSG = 90000; // 1回の送信の大きさの目安 (文字数)
// このファイルの版 (?v=N)。新しい版の人がいればその人がホストになり、古い版の画面は自動で読み込み直す
const APP_V = Number(new URL(import.meta.url).searchParams.get('v')) || 0;

// 小数は2桁に丸めて小さくする
const round = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
const pack = (o) => JSON.parse(JSON.stringify(o, round));
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// 魔物は位置以外 (目的地・戦闘中か等) が変わった時だけ送る。位置は届くまでの間に各自で進める
const monKey = (list) => JSON.stringify(list.map((m) => [m.id, m.tx, m.tz, m.power, m.engagedBy, m.dead, m.horde]));

export class Sync {
  constructor(app) {
    this.app = app;
    this.id = Math.random().toString(36).slice(2, 10);
    this.since = Date.now();
    this.role = 'solo'; // solo: 同期なし / wait: 誰がホストか確認中 / host / viewer
    this.viewers = 1;
    this.sent = { chars: new Map(), world: '', mons: new Map() };
    this.events = [];
    this.lastDelta = 0;
    this.lastSave = Date.now();
  }

  // 起動時: 保存された世界を読む。undefined = 同期を使えない、null = まだ保存がない
  async load() {
    try {
      const { createClient } = await timeout(import(LIB), 8000);
      this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
      const { data, error } = await timeout(this.sb.from('world_state').select('state').eq('id', 'main').maybeSingle(), 8000);
      if (error) throw error;
      this.role = 'wait';
      return data?.state ?? null;
    } catch (e) {
      console.info('同期なしで動きます:', e.message || e);
      return undefined;
    }
  }

  join() {
    if (this.role === 'solo') return;
    this.app.sim.listen((e) => { if (this.role === 'host') this.events.push(e); });
    this.ch = this.sb.channel('oc-world', { config: { presence: { key: this.id }, broadcast: { self: false } } });
    this.ch.on('presence', { event: 'sync' }, () => this.elect());
    this.ch.on('broadcast', { event: 'delta' }, ({ payload }) => this.receive(payload));
    this.ch.on('broadcast', { event: 'hello' }, () => { if (this.role === 'host') this.resetSent(); });
    this.ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await this.ch.track({ since: this.since, v: APP_V });
      // 少し待ってもほかに誰もいなければ自分がホスト
      setTimeout(() => this.elect(), 1500);
    });
    // 万一つながらない時は、ひとりで動かす
    setTimeout(() => { if (this.role === 'wait') this.setRole('host'); }, 8000);
  }

  elect() {
    if (!this.ch) return;
    const st = this.ch.presenceState();
    const members = Object.entries(st).map(([id, metas]) => ({ id, since: metas[0]?.since ?? Infinity, v: metas[0]?.v ?? 0 }));
    if (!members.some((m) => m.id === this.id)) return;
    if (members.some((m) => m.v > APP_V) && !this.reloading) { this.reloading = true; location.reload(); return; }
    this.viewers = members.length;
    members.sort((a, b) => b.v - a.v || a.since - b.since || (a.id < b.id ? -1 : 1));
    this.setRole(members[0].id === this.id ? 'host' : 'viewer');
  }

  setRole(r) {
    if (r === this.role) return;
    const prev = this.role;
    this.role = r;
    if (r === 'host') {
      // 引き継いだ時点の状態を「送った」ことにして、そこからの変化だけを送る
      this.markSent();
      this.lastSave = prev === 'wait' ? 0 : Date.now();
    } else if (r === 'viewer') {
      // 最新の全体をホストに送ってもらう
      this.ch.send({ type: 'broadcast', event: 'hello', payload: { id: this.id } });
    }
  }

  get running() { return this.role === 'solo' || this.role === 'host'; }

  tick() {
    if (this.role !== 'host') return;
    const now = Date.now();
    if (now - this.lastDelta >= DELTA_EVERY) { this.lastDelta = now; this.sendDelta(); }
    if (now - this.lastSave >= SAVE_EVERY) { this.lastSave = now; this.save(); }
  }

  resetSent() { this.sent = { chars: new Map(), world: '', mons: new Map(), full: true }; }
  markSent() {
    const { sim, model } = this.app;
    this.sent = {
      chars: new Map(model.chars.map((c) => [c.id, JSON.stringify(sim.charState(c))])),
      world: JSON.stringify(sim.worldState()),
      mons: new Map([...sim.monsters].map(([w, l]) => [w, monKey(l)])),
    };
    this.events = [];
  }

  sendDelta() {
    const { sim, model } = this.app;
    const parts = [];
    const full = !!this.sent.full;
    const ws = JSON.stringify(sim.worldState());
    if (ws !== this.sent.world) { this.sent.world = ws; parts.push(['world', JSON.parse(ws)]); }
    for (const [w, list] of sim.monsters) {
      const k = monKey(list);
      if (k !== this.sent.mons.get(w)) { this.sent.mons.set(w, k); parts.push(['mons', w, list]); }
    }
    for (const c of model.chars) {
      const st = sim.charState(c);
      const js = JSON.stringify(st);
      if (js !== this.sent.chars.get(c.id)) { this.sent.chars.set(c.id, js); parts.push(['char', c.id, st]); }
    }
    if (full) parts.push(['events', sim.events.slice(-60)]);
    else if (this.events.length) parts.push(['ev', this.events]);
    this.events = [];
    delete this.sent.full;
    if (!parts.length) return;
    // 大きすぎる時は何回かに分けて送る
    let batch = [], size = 0;
    const flush = () => {
      if (!batch.length) return;
      this.ch.send({ type: 'broadcast', event: 'delta', payload: { t: sim.t, v: APP_V, parts: pack(batch) } });
      batch = []; size = 0;
    };
    for (const p of parts) {
      const n = JSON.stringify(p).length;
      if (size + n > MAX_MSG) flush();
      batch.push(p); size += n;
    }
    flush();
  }

  receive({ parts, v = 0 }) {
    if (this.role !== 'viewer' && this.role !== 'wait') return;
    if (v < APP_V) return; // 古い版のホストからの状態は使わない
    const { sim, model } = this.app;
    for (const p of parts) {
      if (p[0] === 'world') sim.applyWorld(p[1]);
      else if (p[0] === 'mons') sim.monsters.set(p[1], p[2]);
      else if (p[0] === 'char') { const c = model.charById.get(p[1]); if (c) sim.applyChar(c, p[2]); }
      else if (p[0] === 'ev') for (const e of p[1]) sim.ingest(e);
      else if (p[0] === 'events') {
        sim.events = p[1];
        for (const c of model.chars) c.log = sim.events.filter((e) => e.ids.includes(c.id)).slice(-30);
      }
    }
  }

  // 最後の人が閉じても、保存から先の時間は次に開いた人が進めるので、閉じる瞬間の保存はしない
  async save() {
    const { sim } = this.app;
    const row = { id: 'main', t: sim.t, state: pack(sim.serialize()), updated_at: new Date().toISOString() };
    const { error } = await this.sb.from('world_state').upsert(row);
    if (error) console.warn('保存できませんでした:', error.message);
  }

  statusText() {
    return { solo: '', wait: '🌐 接続中…', host: `🌐 ${this.viewers}人で観覧中`, viewer: `🌐 ${this.viewers}人で観覧中` }[this.role];
  }
}
