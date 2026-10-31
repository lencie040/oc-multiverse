import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildModel } from './model.js?v=34';
import { Sim } from './sim.js?v=34';
import { UniverseView, ClusterView, WorldView } from './views.js?v=34';
import { UI } from './ui.js?v=34';
import { Director } from './director.js?v=34';
import { Sound, moodOf } from './audio.js?v=34';
import { MIN_PER_DAY, nowGameT } from './util.js?v=34';
import { Sync } from './sync.js?v=34';
import { PostFX } from './fx.js?v=34';

const SAVE_KEY = 'oc-multiverse-save-v1';
const SETTINGS_KEY = 'oc-multiverse-settings';
// グラフィック設定ごとの描画解像度
const PIXEL_RATIO = { low: 0.75, mid: 1, high: 1.5, ultra: 2 };
// 重さのほとんどは描くピクセルの数で決まるので、大きな画面でも 2560×1440 ぶんまでに抑える
const MAX_PIXELS = 3.7e6;
const pixelRatio = (q) => Math.min(devicePixelRatio, PIXEL_RATIO[q] ?? 2, Math.sqrt(MAX_PIXELS / (innerWidth * innerHeight)));

class App {
  async init() {
    await Promise.race([document.fonts.load('800 40px "M PLUS Rounded 1c"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    const raw = await fetch('data/data.json?v=34').then((r) => r.json());
    this.model = buildModel(raw);
    this.sim = new Sim(this.model);
    // みんなの世界 (Supabase) があればそれを、なければこのブラウザの保存を読む
    this.sync = new Sync(this);
    const shared = await this.sync.load();
    let local = null;
    try { local = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* 保存データなし */ }
    if (shared && this.sim.restore(shared)) { /* みんなの世界の続き */ }
    else if (local && !this.sim.restore(local)) console.info('保存データが古いため新しく始めます');
    // 閉じていた間の出来事を進めて、現実の時刻に追いつく (同期中はホストが進める)
    if (this.sync.role === 'solo') this.sim.catchUp();

    this.settings = { names: true, worldNames: true, minor: false, toasts: true, news: true, gfx: 'high', ui: 1 };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* 保存できない環境 */ }
    this.sound = new Sound();
    this.sim.listen((e) => { this.eventSound(e); this.view?.onSimEvent?.(e); });
    this.keys = {};
    this.selected = null;
    this.following = false;

    const stage = document.getElementById('stage');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.shake = 0;
    this.renderer.setPixelRatio(pixelRatio(this.settings.gfx));
    document.documentElement.style.setProperty('--ui', this.settings.ui);
    this.renderer.setSize(innerWidth, innerHeight);
    stage.appendChild(this.renderer.domElement);
    this.applyPost();
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

    this.sync.join();
    setInterval(() => this.save(), 15000);
    addEventListener('beforeunload', () => this.save());
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  save() {
    if (!this.sync.running) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.sim.serialize())); } catch (e) { /* 保存できない環境 */ }
  }

  // ---------- 画面遷移 ----------
  // 設定を変えて保存する。グラフィックが変わったら今の画面を作り直す
  setSetting(k, v) {
    this.settings[k] = v;
    this.saveSettings();
    if (k === 'ui') document.documentElement.style.setProperty('--ui', v);
    if (k === 'gfx') {
      this.renderer.setPixelRatio(pixelRatio(v));
      this.applyPost();
      const keep = { keepFollow: true };
      const cur = this.view;
      if (cur.kind === 'world') { this.view = null; cur.dispose(); this.openWorld(cur.worldId, keep); }
      else if (cur.kind === 'dan') { this.view = null; cur.dispose(); this.openDan(cur.danId, keep); }
      else this.goUniverse(keep);
      this.ui.syncSpaceBtn();
      if (this.director.on) this.director.pickIdle();
    }
  }
  // 高・最高はブルームと色調整を掛ける
  applyPost() {
    const q = this.settings.gfx, want = q === 'high' || q === 'ultra';
    if (this.post && !want) { this.post.dispose(); this.post = null; }
    if (want && !this.post) this.post = new PostFX(this.renderer);
    this.post?.resize();
  }
  saveSettings() {
    const { gfx, ui, spaceWatch } = this.settings;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ gfx, ui, spaceWatch })); } catch (e) { /* 保存できない環境 */ }
  }
  // 最高設定の「宇宙から観戦」: おまかせ観戦で世界線の中に入らず、世界団マップから透けた世界線を映す
  get spaceWatch() { return !!(this.director?.on && this.settings.gfx === 'ultra' && this.settings.spaceWatch); }
  toggleSpaceWatch() {
    this.settings.spaceWatch = !this.settings.spaceWatch;
    this.saveSettings();
    this.ui.syncSpaceBtn();
    if (this.settings.spaceWatch && !this.director.on) this.director.toggle(true);
    else if (this.director.on) this.director.pickIdle();
  }
  // 世界線のある場所 (x, z) を映す。宇宙から観戦中なら世界団マップから
  watchWorld(wid, x = 0, z = 0, dist = 70) {
    if (this.spaceWatch) {
      this.openDan(this.model.worlds.get(wid).dan, { keepFollow: true });
      this.view.watch = { world: wid, x, z };
    } else {
      this.openWorld(wid);
      this.view.focusOn(x, z, dist);
    }
  }

  setView(v, hash) {
    this.view?.dispose();
    if (this.view) {
      this.sound.play('warp');
      this.ui.warp(v.kind === 'world' || (v.kind === 'dan' && this.view.kind === 'universe'));
    }
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
    if (this.view?.kind !== 'dan' || this.view.danId !== id) this.setView(new ClusterView(this, id), `#/dan/${encodeURIComponent(id)}`);
    this.view.watch = null;
  }
  // キャラのいる場所を映す: 世界線にいれば世界線、移動中なら世界団マップか宇宙マップ
  // 追跡中の移動は「出発の世界線で飛び立つ → マップ上を飛ぶ → 到着の世界線に降りる」の3場面で映す
  viewFor(c) {
    const v = this.placeOf(c);
    // 宇宙から観戦中は、世界線の中も世界団マップから映す
    return v.kind === 'world' && this.spaceWatch ? { kind: 'dan', id: this.model.worlds.get(v.id).dan } : v;
  }
  placeOf(c) {
    const tr = this.sim.transitOf(c);
    if (!tr) return { kind: 'world', id: c.world };
    const { stage } = this.sim.transitStage(tr);
    const danOf = (wid) => this.model.worlds.get(wid).dan;
    if (stage === 'up') return { kind: 'world', id: tr.from };
    if (stage === 'down') return { kind: 'world', id: tr.to };
    if (stage === 'line' || stage === 'exit') return { kind: 'dan', id: danOf(tr.from) };
    if (stage === 'enter') return { kind: 'dan', id: danOf(tr.to) };
    return { kind: 'universe' };
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
      this.renderer.setPixelRatio(pixelRatio(this.settings.gfx));
      this.renderer.setSize(innerWidth, innerHeight);
      this.labels.setSize(innerWidth, innerHeight);
      this.post?.resize();
      this.view.resize();
    });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (this.director.on && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Escape'].includes(e.code)) this.director.toggle(false);
      if (e.code === 'Escape') { if (this.selected) this.selectChar(null); else this.goUp(); }
      else if (e.code === 'Slash') { e.preventDefault(); document.getElementById('search').focus(); }
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
    const r = this.sim.raidAt(v.worldId) || this.sim.hordeAt(v.worldId);
    const h = this.sim.hour;
    this.sound.setMood(r ? 'battle' : moodOf(v.world), h >= 21 || h < 5, r ? 'raid:' + r.id : v.worldId);
  }
  eventSound(e) {
    const here = this.view?.kind === 'world' && e.world === this.view.worldId;
    const t = e.text;
    const big = [['🐉', 'horn'], ['🏆', 'fanfare'], ['💥', 'lose'], ['🏃', 'whoosh'], ['🛡️', 'horn'], ['💰', 'fanfare'], ['🎊', 'fanfare'], ['🏚️', 'lose'], ['🗺️', 'treasure'], ['🌌', 'dan'], ['💎', 'treasure'], ['💕', 'heart'], ['📣', 'chime'], ['🥊', 'boss'], ['🎂', 'fanfare'], ['🏅', 'fanfare'], ['🚩', 'horn'], ['🎉', 'chime']];
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
    // 現実の時計に合わせて進める。タブを隠していた間の遅れは、通知 (音・カメラ・テロップ) なしで少しずつ追いつく
    const gap = nowGameT() - this.sim.t;
    if (!this.sync.running) this.sim.coast(Math.max(0, gap));
    else if (gap > MIN_PER_DAY / 2) this.sim.catchUp();
    else if (gap > 1) { this.sim.quiet = true; this.sim.update(Math.min(gap, 30)); this.sim.quiet = false; }
    else if (gap > 0) this.sim.update(gap);
    this.view.update(dt);
    this.ui.tick(dt);
    this.director.tick();
    this.sync.tick();
    this.updateMusic();
    this.view.postUpdate(dt);
    // 大きな出来事のカメラの揺れ
    const cam = this.view.camera, saved = cam.position.clone();
    if (this.shake > 0.01) {
      const k = this.shake * cam.position.distanceTo(this.view.controls.target) * 0.012;
      cam.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(k));
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    if (this.post) this.post.render(this.view.scene, cam, dt, this.view.kind === 'world' ? 0.26 : 0.5);
    else this.renderer.render(this.view.scene, cam);
    this.labels.render(this.view.scene, cam);
    cam.position.copy(saved);
  }
}

const app = new App();
window.app = app;
app.init().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = '読み込みに失敗しました: ' + e.message;
});
