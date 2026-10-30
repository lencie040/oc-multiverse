import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildModel } from './model.js?v=21';
import { Sim } from './sim.js?v=21';
import { UniverseView, ClusterView, WorldView } from './views.js?v=21';
import { UI } from './ui.js?v=21';
import { Director } from './director.js?v=21';
import { Sound, moodOf } from './audio.js?v=21';
import { REAL_SEC_PER_GAME_MIN } from './util.js?v=21';

const SAVE_KEY = 'oc-multiverse-save-v1';

class App {
  async init() {
    await Promise.race([document.fonts.load('800 40px "M PLUS Rounded 1c"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    const raw = await fetch('data/data.json?v=21').then((r) => r.json());
    this.model = buildModel(raw);
    this.sim = new Sim(this.model);
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && !this.sim.restore(s)) console.info('保存データが古いため新しく始めます');
    } catch (e) { /* 保存データなし */ }

    this.settings = { names: true, worldNames: true, minor: false, toasts: true, news: true };
    this.sound = new Sound();
    this.sim.listen((e) => this.eventSound(e));
    this.speed = 1;
    this.keys = {};
    this.selected = null;
    this.following = false;

    const stage = document.getElementById('stage');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    stage.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.setSize(innerWidth, innerHeight);
    this.labels.domElement.id = 'labels';
    document.body.appendChild(this.labels.domElement);

    this.ui = new UI(this);
    this.director = new Director(this);
    this.bindInput();
    this.route();
    addEventListener('hashchange', () => this.route(true));
    document.getElementById('loading').remove();

    setInterval(() => this.save(), 15000);
    addEventListener('beforeunload', () => this.save());
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.sim.serialize())); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- 画面遷移 ----------
  setView(v, hash) {
    this.view?.dispose();
    if (this.view) this.sound.play('whoosh');
    this.view = v;
    this.view.resize();
    if (location.hash !== hash) { this.ignoreHash = true; location.hash = hash; }
    this.ui.onViewChange();
  }
  route(fromHash = false) {
    if (fromHash && this.ignoreHash) { this.ignoreHash = false; return; }
    const m = decodeURIComponent(location.hash).match(/^#\/(dan|world)\/(.+)$/);
    if (m && m[1] === 'world' && this.model.worlds.has(m[2])) return this.openWorld(m[2]);
    if (m && m[1] === 'dan' && this.model.danById.has(m[2])) return this.openDan(m[2]);
    this.goUniverse();
  }
  goUniverse(opts = {}) {
    if (!opts.keepFollow) this.stopFollow();
    this.setView(new UniverseView(this), '#/');
  }
  openDan(id, opts = {}) {
    if (!opts.keepFollow) this.stopFollow();
    this.setView(new ClusterView(this, id), `#/dan/${encodeURIComponent(id)}`);
  }
  // キャラのいる場所を映す: 世界線にいれば世界線、移動中なら世界団マップか宇宙マップ
  // 追跡中の移動は「出発の世界線で飛び立つ → マップ上を飛ぶ → 到着の世界線に降りる」の3場面で映す
  viewFor(c, follow = this.following) {
    const tr = this.sim.transitOf(c);
    if (!tr) return { kind: 'world', id: c.world };
    if (follow) {
      const f = this.sim.transitProgress(tr);
      if (f < 0.2) return { kind: 'world', id: tr.from };
      if (f >= 0.8) return { kind: 'world', id: tr.to };
    }
    return tr.kind === 'line' ? { kind: 'dan', id: this.model.worlds.get(tr.from).dan } : { kind: 'universe' };
  }
  isShowing(v) {
    const cur = this.view;
    if (!cur || cur.kind !== v.kind) return false;
    return v.kind === 'universe' || (v.kind === 'world' ? cur.worldId === v.id : cur.danId === v.id);
  }
  goToChar(c, keepFollow = false) {
    const want = this.viewFor(c, keepFollow);
    const changed = !this.isShowing(want);
    if (changed && keepFollow) this.ui.flash();
    if (want.kind === 'world') {
      if (changed) this.openWorld(want.id, { keepFollow });
      if (changed || !keepFollow) this.view.frameChar(c);
    } else if (want.kind === 'dan') {
      if (changed) this.openDan(want.id, { keepFollow });
    } else if (changed) this.goUniverse({ keepFollow });
  }
  openWorld(id, opts = {}) {
    if (!opts.keepFollow) this.stopFollow();
    if (this.view?.kind !== 'world' || this.view.worldId !== id) this.setView(new WorldView(this, id), `#/world/${encodeURIComponent(id)}`);
    if (opts.focus) this.view.focusOn(opts.focus.x, opts.focus.z);
  }
  goUp() {
    if (this.view.kind === 'world') this.openDan(this.view.world.dan);
    else if (this.view.kind === 'dan') this.goUniverse();
  }

  selectChar(id, opts = {}) {
    this.selected = id;
    if (!id) { this.stopFollow(); this.ui.renderInfo(); return; }
    const c = this.model.charById.get(id);
    if (opts.focus) this.goToChar(c, this.following);
    this.ui.lastInfo = '';
    this.ui.renderInfo();
  }
  toggleFollow() {
    if (!this.selected) return;
    this.following = !this.following;
    if (this.following) this.selectChar(this.selected, { focus: true });
    this.ui.lastInfo = '';
    this.ui.renderInfo();
  }
  stopFollow() {
    if (!this.following) return;
    this.following = false;
    if (this.ui) this.ui.lastInfo = '';
  }
  setSpeed(s) {
    this.speed = s;
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', Number(b.dataset.s) === s);
  }

  // ---------- 入力 ----------
  bindInput() {
    const el = this.renderer.domElement;
    const ndc = (e) => new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && this.view.click(ndc(e))) this.sound.play('click');
      down = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (down) return;
      el.style.cursor = this.view.hover(ndc(e)) ? 'pointer' : '';
    });
    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.labels.setSize(innerWidth, innerHeight);
      this.view.resize();
    });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (this.director.on && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Escape'].includes(e.code)) this.director.toggle(false);
      if (e.code === 'Escape') { if (this.selected) this.selectChar(null); else this.goUp(); }
      else if (e.code === 'Slash') { e.preventDefault(); document.getElementById('search').focus(); }
      else if (e.code === 'KeyP') this.setSpeed(this.speed === 0 ? 1 : 0);
      else if (e.code === 'KeyT') this.toggleFollow();
      else if (e.code === 'KeyO') this.director.toggle();
      else if (e.code === 'KeyM') this.ui.toggleMute();
      else if (e.code === 'KeyH') document.body.classList.toggle('nopanels');
      else if (e.code === 'KeyN') { const cb = document.getElementById('tg-names'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
  }

  // 今見ている場所に合わせて曲を変える (世界線ごとに別のメロディ、レイド中はバトル曲)
  updateMusic() {
    const v = this.view;
    if (v.kind !== 'world') return this.sound.setMood('space', false, v.kind === 'dan' ? 'dan:' + v.danId : 'space');
    const r = this.sim.raidAt(v.worldId);
    const h = this.sim.hour;
    this.sound.setMood(r ? 'battle' : moodOf(v.world), h >= 21 || h < 5, r ? 'raid:' + r.id : v.worldId);
  }
  eventSound(e) {
    const here = this.view?.kind === 'world' && e.world === this.view.worldId;
    const t = e.text;
    const big = [['🐉', 'horn'], ['🏆', 'fanfare'], ['💥', 'lose'], ['🏃', 'whoosh'], ['🌌', 'dan'], ['💎', 'treasure'], ['💕', 'heart'], ['📣', 'chime'], ['🥊', 'boss']];
    for (const [k, name] of big) if (t.startsWith(k)) return this.sound.play(name);
    if (!here) return;
    if (t.startsWith('🌀') || t.includes('に到着した')) this.sound.play('portal');
    else if (t.startsWith('🧭')) this.sound.play('treasure');
    else if (t.startsWith('💫')) this.sound.play('lose');
    else if (t.startsWith('🔥')) this.sound.play('boss');
    else if (/^(⛺|🏠|🤝|🙅|🎒)/.test(t)) this.sound.play('chime');
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // 追跡中のキャラが移動している間は、見逃さないよう最大×2に抑える
    const sel = this.following && this.selected && this.model.charById.get(this.selected);
    const speed = sel && this.sim.transitOf(sel) ? Math.min(this.speed, 2) : this.speed;
    if (speed) this.sim.update((dt / REAL_SEC_PER_GAME_MIN) * speed);
    this.view.update(dt);
    this.ui.tick(dt);
    this.director.tick();
    this.updateMusic();
    this.renderer.render(this.view.scene, this.view.camera);
    this.labels.render(this.view.scene, this.view.camera);
  }
}

const app = new App();
window.app = app;
app.init().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = '読み込みに失敗しました: ' + e.message;
});
