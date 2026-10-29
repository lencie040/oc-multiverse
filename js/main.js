import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildModel } from './model.js';
import { Sim } from './sim.js';
import { UniverseView, ClusterView, WorldView } from './views.js';
import { UI } from './ui.js';
import { REAL_SEC_PER_GAME_MIN } from './util.js';

const SAVE_KEY = 'oc-multiverse-save-v1';

class App {
  async init() {
    await Promise.race([document.fonts.load('800 40px "M PLUS Rounded 1c"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    const raw = await fetch('data/data.json').then((r) => r.json());
    this.model = buildModel(raw);
    this.sim = new Sim(this.model);
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && !this.sim.restore(s)) console.info('保存データが古いため新しく始めます');
    } catch (e) { /* 保存データなし */ }

    this.settings = { names: true, worldNames: true, minor: false };
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
  goUniverse() {
    this.stopFollow();
    this.setView(new UniverseView(this), '#/');
  }
  openDan(id) {
    this.stopFollow();
    this.setView(new ClusterView(this, id), `#/dan/${encodeURIComponent(id)}`);
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
    if (opts.focus) {
      this.openWorld(c.world, { keepFollow: this.following });
      this.view.focusOn(c.x, c.z);
    }
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
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) this.view.click(ndc(e));
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
      if (e.code === 'Escape') { if (this.selected) this.selectChar(null); else this.goUp(); }
      else if (e.code === 'Slash') { e.preventDefault(); document.getElementById('search').focus(); }
      else if (e.code === 'KeyP') this.setSpeed(this.speed === 0 ? 1 : 0);
      else if (e.code === 'KeyT') this.toggleFollow();
      else if (e.code === 'KeyH') document.body.classList.toggle('nopanels');
      else if (e.code === 'KeyN') { const cb = document.getElementById('tg-names'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.speed) this.sim.update((dt / REAL_SEC_PER_GAME_MIN) * this.speed);
    this.view.update(dt);
    this.ui.tick(dt);
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
