// おまかせ観戦: 面白い出来事にカメラが自動で向かう
import { weighted } from './util.js?v=25';

// 出来事の先頭の絵文字 → 見どころ度
const PRIO = [
  ['🐉', 100], ['🔥', 95], ['🛡️', 93], ['🏆', 92], ['💰', 90], ['🎊', 86], ['🏚️', 86], ['🗺️', 72], ['💥', 88], ['🌌', 80], ['💎', 75], ['💕', 70], ['🥊', 62], ['📣', 60],
  ['🎂', 84], ['🚩', 82], ['🏅', 78], ['🎉', 66], ['🎖️', 52], ['📯', 50], ['🏃', 55], ['🙅', 45], ['🌀', 40], ['🎒', 35], ['⛺', 30], ['💫', 28], ['⚔️', 20], ['🏠', 15],
];
export function prioOf(e) {
  for (const [k, p] of PRIO) if (e.text.startsWith(k)) return e.major ? p : p * 0.5;
  return 0;
}

const now = () => performance.now() / 1000;

// 場面ごとのカメラ: dist=距離, elev=見下ろす角度(ラジアン), orbit=回り込む速さ
const SHOTS = {
  universe: { dist: 75, elev: 0.35, orbit: 0.06 },
  transit: { dist: 38, elev: 0.4, orbit: 0.02 },
  flying: { dist: 26, elev: 0.22, orbit: 0.02 },
  closeup: { dist: 16, elev: 0.38, orbit: 0.07 },
  chat: { dist: 12, elev: 0.25, orbit: 0.05 },
  sleep: { dist: 13, elev: 0.75, orbit: 0.04 },
  walk: { dist: 22, elev: 0.55, orbit: 0.06 },
  fight: { dist: 19, elev: 0.42, orbit: 0.16 },
  raidMember: { dist: 30, elev: 0.5, orbit: 0.1 },
  raidGather: { dist: 62, elev: 0.82, orbit: 0.07 },
  raidFight: { dist: 44, elev: 0.5, orbit: 0.2 },
  fest: { dist: 28, elev: 0.55, orbit: 0.09 },
  establish: { dist: 0, elev: 0.95, orbit: 0.05 },
};

export class Director {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.until = 0;
    this.prio = 0;
    this.shot = null;
    this.raidId = null;
    this.vary = { k: 1, dir: 1 };
    app.sim.listen((e) => this.onEvent(e));
  }

  toggle(force) {
    this.on = force ?? !this.on;
    document.getElementById('tg-director').classList.toggle('on', this.on);
    this.app.ui.caption(this.on ? '🎬 おまかせ観戦スタート！ 面白いところにカメラが向かいます' : null);
    if (this.on) this.pickIdle();
    else { this.app.stopFollow(); this.app.ui.lastInfo = ''; }
  }

  onEvent(e) {
    if (!this.on) return;
    const p = prioOf(e);
    if (p < 30) return;
    // 撮影中のシーンより十分に見どころがあれば切り替える
    if (now() < this.until && p < this.prio + 20) return;
    this.show(e, p);
  }

  // 場面が変わるたびに、距離と回る向きに少し変化をつける
  newTake(raidId = null) {
    this.raidId = raidId;
    this.vary = { k: 0.85 + Math.random() * 0.35, dir: Math.random() < 0.5 ? -1 : 1 };
  }

  show(e, p) {
    const { app } = this;
    const raid = app.sim.raidAt(e.world);
    this.newTake(e.ids.length ? null : raid?.id);
    if (e.ids.length) {
      app.following = true;
      app.selectChar(e.ids[0], { focus: true });
    } else {
      app.stopFollow();
      app.selectChar(null);
      app.openWorld(e.world);
      if (raid) app.view.focusOn(raid.x, raid.z, 70);
      else if (app.sim.hordeAt(e.world)) app.view.focusOn(0, 0, 80);
    }
    this.prio = p;
    this.until = now() + (p >= 80 ? 18 : 12);
    app.ui.caption(`🎬 ${e.text}`);
  }

  pickIdle() {
    const { app } = this;
    const { sim, model } = app;
    // 防衛戦中なら、戦っている人を映す
    const hd = sim.hordes[0];
    if (hd && Math.random() < 0.6) {
      const ds = model.chars.filter((c) => c.world === hd.world && c.act.kind === 'defend' && !c.partyLeader);
      const c = ds.find((x) => x.act.fightUntil) || ds[0];
      if (c) {
        this.newTake();
        app.following = true;
        app.selectChar(c.id, { focus: true });
        this.prio = 85;
        this.until = now() + 12;
        app.ui.caption(`🎬 防衛戦！ ${c.name}が「${sim.wname(hd.world)}」の町を守っている`);
        return;
      }
    }
    // レイドが起きていれば、まずはそこを映す
    const raid = sim.raids.find((r) => r.phase === 'fight') || sim.raids[0];
    if (raid && Math.random() < 0.8) {
      const ids = raid.participants.filter((id) => model.charById.get(id).world === raid.world);
      app.stopFollow();
      app.selectChar(null);
      app.openWorld(raid.world);
      app.view.focusOn(raid.x, raid.z, ids.length ? 55 : 70);
      this.newTake(raid.id);
      this.prio = 90;
      this.until = now() + 15;
      app.ui.caption(`🎬 レイド${raid.phase === 'fight' ? '激闘中' : '集合中'}！「${raid.name}」＠${sim.wname(raid.world)}`);
      return;
    }
    const cands = [];
    for (const c of model.chars) {
      if (c.partyLeader || c.state === 'down') continue;
      let w = 0;
      if (c.transit) w = 6;
      else if (c.act.kind === 'raid') w = 7;
      else if (c.act.kind === 'defend') w = 6;
      else if (c.act.kind === 'dig') w = 5;
      else if (c.act.kind === 'contest') w = 6;
      else if (c.act.kind === 'party') w = app.sim.parties.some((p) => p.hosts.includes(c.id)) ? 8 : 3;
      else if (c.act.kind === 'meet') w = 1.5;
      else if (c.act.kind === 'fight') w = 5;
      else if (c.act.kind === 'chat') w = 3;
      else if (c.trip) w = 3;
      else if (c.state === 'ok') w = 0.15;
      if (!w) continue;
      cands.push([c, w * (c.img ? 2 : 1)]);
    }
    const c = weighted(cands);
    if (!c) return;
    this.newTake();
    app.following = true;
    app.selectChar(c.id, { focus: true });
    this.prio = 0;
    this.until = now() + 15;
    app.ui.caption(`🎬 ${c.name}の様子：${sim.displayAct(c).text}`);
  }

  tick() {
    if (!this.on) return;
    // 移動中のキャラを映している間は、到着するまで他の小さな出来事に切り替えない
    const { app } = this;
    const sel = app.following && app.selected && app.model.charById.get(app.selected);
    const flying = !!(sel && app.sim.transitOf(sel));
    if (flying) { this.until = Math.max(this.until, now() + 4); this.prio = Math.max(this.prio, 60); }
    // 到着したらしばらくそのキャラを映し続ける
    if (this.wasFlying && !flying && sel) { this.until = Math.max(this.until, now() + 8); this.newTake(); }
    this.wasFlying = flying;
    if (now() > this.until) this.pickIdle();
    this.shot = this.chooseShot();
  }

  // 今映しているものに合わせてカメラの構図を決める
  chooseShot() {
    const { app } = this;
    const v = app.view;
    let base;
    if (v.kind === 'universe') base = SHOTS.universe;
    else if (v.kind === 'dan') base = SHOTS.transit;
    else if (this.raidId != null && !app.selected) {
      const r = app.sim.raids.find((x) => x.id === this.raidId);
      base = !r ? { ...SHOTS.establish, dist: v.bound * 1.2 } : r.phase === 'fight' ? SHOTS.raidFight : SHOTS.raidGather;
    } else {
      const c = app.selected && app.model.charById.get(app.selected);
      if (!c) base = { ...SHOTS.establish, dist: v.bound * 1.2 };
      else if (app.sim.transitOf(c)) base = SHOTS.flying;
      else if (c.state === 'sleep' || c.state === 'camp' || c.state === 'down') base = SHOTS.sleep;
      else if (c.act.kind === 'fight' || (c.act.kind === 'defend' && c.act.fightUntil)) base = SHOTS.fight;
      else if (c.act.kind === 'defend') base = SHOTS.walk;
      else if (c.act.kind === 'raid') base = SHOTS.raidMember;
      else if (['party', 'meet', 'contest', 'watch'].includes(c.act.kind) && !c.walking) base = SHOTS.fest;
      else if (c.act.kind === 'chat' || c.act.cat === 'social') base = SHOTS.chat;
      else if (c.walking) base = SHOTS.walk;
      else base = SHOTS.closeup;
    }
    return { dist: base.dist * this.vary.k, elev: base.elev, orbit: base.orbit * this.vary.dir };
  }
}
