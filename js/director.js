// おまかせ観戦: 面白い出来事にカメラが自動で向かう
import { weighted } from './util.js?v=11';

// 出来事の先頭の絵文字 → 見どころ度
const PRIO = [
  ['🐉', 100], ['🔥', 95], ['🏆', 92], ['💥', 88], ['🌌', 80], ['💎', 75], ['💕', 70], ['🥊', 62], ['📣', 60],
  ['🙅', 45], ['🌀', 40], ['🎒', 35], ['⛺', 30], ['💫', 28], ['⚔️', 20], ['🏠', 15],
];
export function prioOf(e) {
  for (const [k, p] of PRIO) if (e.text.startsWith(k)) return e.major ? p : p * 0.5;
  return 0;
}

const now = () => performance.now() / 1000;

export class Director {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.until = 0;
    this.prio = 0;
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

  show(e, p) {
    const { app } = this;
    const raid = app.sim.raidAt(e.world);
    if (e.ids.length) {
      app.following = true;
      app.selectChar(e.ids[0], { focus: true });
    } else {
      app.stopFollow();
      app.selectChar(null);
      app.openWorld(e.world);
      if (raid) app.view.focusOn(raid.x, raid.z, 70);
    }
    this.prio = p;
    this.until = now() + (p >= 80 ? 18 : 12);
    app.ui.caption(`🎬 ${e.text}`);
  }

  pickIdle() {
    const { app } = this;
    const { sim, model } = app;
    // レイドが起きていれば、まずはそこを映す
    const raid = sim.raids.find((r) => r.phase === 'fight') || sim.raids[0];
    if (raid && Math.random() < 0.8) {
      const ids = raid.participants.filter((id) => model.charById.get(id).world === raid.world);
      app.stopFollow();
      app.selectChar(null);
      app.openWorld(raid.world);
      app.view.focusOn(raid.x, raid.z, ids.length ? 55 : 70);
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
      else if (c.act.kind === 'fight') w = 5;
      else if (c.act.kind === 'chat') w = 3;
      else if (c.trip) w = 3;
      else if (c.state === 'ok') w = 0.15;
      if (!w) continue;
      cands.push([c, w * (c.img ? 2 : 1)]);
    }
    const c = weighted(cands);
    if (!c) return;
    app.following = true;
    app.selectChar(c.id, { focus: true });
    this.prio = 0;
    this.until = now() + 15;
    app.ui.caption(`🎬 ${c.name}の様子：${sim.displayAct(c).text}`);
  }

  tick() {
    if (this.on && now() > this.until) this.pickIdle();
  }
}
