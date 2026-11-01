// キャラ操作の画面: 操作パネルと手動の戦闘
import { escapeHtml } from './util.js?v=44';
import { ITEMS, SHOP_NAMES, sellPrice, onlineItems, onlinePrice } from './items.js?v=44';
import { ownerHash } from './control.js?v=44';

const $ = (s) => document.querySelector(s);
const TOKEN_KEY = 'oc-multiverse-player';
const PING_SEC = 10;
const TABS = [['act', '行動'], ['move', '移動'], ['bag', '持ち物'], ['shop', '店'], ['net', 'GUDAZON'], ['ab', '特性'], ['etc', 'その他']];
const ACTS = [['work', '🔨 仕事'], ['hobby', '🎨 趣味'], ['train', '🥋 修行'], ['explore', '🧭 探検'], ['battle', '⚔️ 魔物退治'], ['chat', '💬 おしゃべり'], ['visit', '🏠 遊びに行く'], ['help', '🤝 手伝い'], ['shop', '🛍️ 買い物に行く'], ['eat', '🍙 ごはん'], ['water', '🥤 水を飲む'], ['sabori', '🛋️ サボる'], ['walkabout', '👣 散歩'], ['camp', '⛺ 野宿']];
const CAT = { p: '物理', s: '特殊', x: '変化', v: '虚空', a: '反質', f: '封印' };

function newToken() {
  const t = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* 保存できない環境 */ }
  return t;
}

export class Play {
  constructor(app) {
    this.app = app;
    let t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) { /* 保存できない環境 */ }
    this.token = t || newToken();
    this.who = ownerHash(this.token);
    this.tab = 'act';
    this.open = true;
    this.pingT = 0;
    this.drawT = 0;
    this.msgN = 0;
    this.lastHtml = '';
    this.lastBt = '';
    $('#tg-play').addEventListener('click', () => { this.open = !this.open; this.lastHtml = ''; });
    $('#play').addEventListener('click', (e) => this.onClick(e));
    $('#play').addEventListener('change', (e) => { if (e.target.dataset.cmd) this.send(e.target.dataset.cmd, { on: e.target.checked }); });
    $('#bt').addEventListener('click', (e) => this.onClick(e));
  }
  get me() { return this.app.model.chars.find((c) => c.ctrl?.owner === this.who) || null; }
  send(op, a = {}, cid = this.me?.id) {
    if (cid) this.app.sync.command(this.token, cid, op, a);
  }
  claim(id) {
    const { app } = this;
    if (this.me && this.me.id !== id) return app.ui.toast({ text: `操作できるのは1人1キャラまでです（${this.me.name}を操作中）`, ids: [], world: this.me.home });
    this.send('claim', {}, id);
    this.open = true;
    app.following = true;
    app.selectChar(id, { focus: true });
    app.ui.setSheet('play', true);
  }
  // 地面をタップしたらそこへ歩く
  tapGround(ndc) {
    const c = this.me, v = this.app.view;
    if (!c || v.kind !== 'world' || c.world !== v.worldId || this.app.director.on) return false;
    if (c.ctrl.auto || c.ctrl.home) return false;
    const p = v.groundPoint(ndc);
    if (!p) return false;
    this.send('walk', p);
    return true;
  }
  onClick(e) {
    const b = e.target.closest('[data-tab],[data-op],[data-ask]');
    if (!b) return;
    if (b.dataset.ask) { this.asking = b.dataset.ask === 'yes'; this.lastHtml = ''; return this.draw(); }
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.asking = false; this.lastHtml = ''; return this.draw(); }
    this.send(b.dataset.op, b.dataset.a ? JSON.parse(b.dataset.a) : {});
    if (b.dataset.op === 'release') { this.app.stopFollow(); this.asking = false; this.lastHtml = ''; }
  }
  tick(dt) {
    const c = this.me;
    $('#tg-play').hidden = !c;
    if (!c) { if (!$('#play').hidden) $('#play').hidden = true; $('#bt').hidden = true; return; }
    if ((this.pingT -= dt) <= 0) { this.pingT = PING_SEC; this.send('ping'); }
    if (c.ctrl.msg && c.ctrl.msg.n !== this.msgN) {
      this.msgN = c.ctrl.msg.n;
      this.app.ui.caption(`🎮 ${c.ctrl.msg.text}`);
      setTimeout(() => { if (!this.app.director.on) this.app.ui.caption(null); }, 2500);
    }
    if ((this.drawT -= dt) > 0) return;
    this.drawT = 0.25;
    this.draw();
    this.drawBattle(c);
  }
  draw() {
    const c = this.me, box = $('#play');
    if (!c) return;
    box.hidden = !this.open && !this.app.ui.phone;
    if (box.hidden) return;
    const html = this.head(c) + `<div class="pl-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="pl-body">${this[`tab_${this.tab}`](c)}</div>`;
    if (html === this.lastHtml) return;
    const body = box.querySelector('.pl-body'), st = body?.scrollTop ?? 0;
    box.innerHTML = html;
    box.querySelector('.pl-body').scrollTop = st;
    this.lastHtml = html;
  }
  head(c) {
    const { sim } = this.app, need = sim.expNeed(c.lv);
    return `<div class="pl-head"><h3>🎮 ${escapeHtml(c.name)} <small>Lv${c.lv}</small></h3>`
      + `<div class="pl-exp"><i style="width:${Math.min(100, (c.exp / need) * 100)}%"></i></div>`
      + `<div class="pl-st"><span>🪙 <b>${c.coins}</b></span><span>🍙 <b>${c.food}</b>${c.hungry ? `（空腹${c.hungry}日）` : ''}</span><span>🌀 <b>${sim.fmtPt(c.pts)}</b>/${sim.fmtPt(sim.ptCap(c))}pt</span>${c.halvedDay === sim.day ? '<span>😵 力が半減中</span>' : ''}</div>`
      + `<div class="pl-st">${escapeHtml(sim.displayAct(c).text)}</div>`
      + `<div class="pl-tog"><label><input type="checkbox" data-cmd="auto" ${c.ctrl.auto ? 'checked' : ''}> 自動移動</label><label><input type="checkbox" data-cmd="home" ${c.ctrl.home ? 'checked' : ''}> 自動帰宅</label></div></div>`;
  }
  btn(op, label, a = null, cls = '') { return `<button data-op="${op}" ${a ? `data-a='${escapeHtml(JSON.stringify(a))}'` : ''} class="${cls}">${label}</button>`; }
  tab_act(c) {
    const { sim } = this.app;
    if (c.ctrl.auto) return '<p class="pl-note">自動移動中です。チェックを外すと、その場で止まって操作できます。</p>';
    if (c.ctrl.home) return '<p class="pl-note">自動帰宅中です。いちばん安い道で家へ向かいます（ptが足りない時は、足りる所まで）。</p>';
    if (sim.transitOf(c)) return c.transit?.downed ? `<p class="pl-note">宇宙で倒れています。周辺3マスの世界線に救難信号を出せます。</p><div class="pl-grid">${this.btn('sos', '🆘 救難信号')}</div>${c.items.beacon ? `<div class="pl-grid">${this.btn('use', '💧 復活のしずく', { id: 'beacon' })}</div>` : ''}` : '<p class="pl-note">移動中です。</p>';
    const hot = [];
    const r = sim.raidAt(c.world);
    if (r?.phase === 'gather') hot.push(['raid', '🐉 レイドに参加']);
    if (sim.hordeAt(c.world)) hot.push(['defend', '🛡️ 町を守る']);
    if (sim.races.some((x) => x.world === c.world)) hot.push(['dig', '🗺️ 宝を掘る']);
    if (sim.partyAt(c.world)) hot.push(['party', '🎂 パーティーへ']);
    if (sim.contests.some((x) => x.world === c.world && x.started)) hot.push(['contest', '🚩 対抗戦を見る']);
    if (sim.repair[c.world] > sim.t) hot.push(['repair', '🧹 町の片付け']);
    const sleeping = c.state === 'sleep' || c.state === 'camp';
    return `<p class="pl-note">地面をタップするとそこへ歩きます。寝ないで朝を迎えると、その日は戦闘力が半減します。</p><div class="pl-grid">`
      + hot.map(([op, l]) => this.btn(op, l, null, 'hot')).join('') + (sleeping ? this.btn('wake', '☀️ 起きる', null, 'hot') : this.btn('sleep', '💤 寝る'))
      + ACTS.map(([op, l]) => this.btn(op, l)).join('') + '</div>';
  }
  tab_move(c) {
    const { sim, model } = this.app;
    if (c.transit) return this.tab_act(c);
    const w = model.worlds.get(c.world), dan = sim.danOf(c);
    const row = (t, sub, op, a, l) => `<div class="pl-row"><span>${t}<small>${sub}</small></span>${this.btn(op, l, a)}</div>`;
    let html = '<div class="pl-sec">隣の世界線</div>' + w.neighbors.map((id) => {
      const odds = Math.round(sim.travelOdds(c, id) * 100), cost = sim.hopPrice(c, c.world, id);
      return row(escapeHtml(sim.wname(id)), `${cost}pt ・ 魔物Lv${sim.routeLevel(c.world, id)} ・ 勝率の目安 ${odds}%`, 'hop', { to: id }, '行く');
    }).join('');
    html += '<div class="pl-sec">世界団の移動</div>';
    if (sim.atEdge(c)) html += dan.neighbors.map((d) => row(`世界団 ${escapeHtml(d)}`, `${sim.danPrice(c, d)}pt ・ 魔物Lv${sim.routeLevel(c.world, sim.edgeOf(d))}が2回 ・ 勝率の目安 ${Math.round(sim.danOdds(c, d) * 100)}%`, 'dan', { to: d }, '越える')).join('');
    else html += `<p class="pl-note">世界団を移動できるのは世界線の果て（${escapeHtml(sim.wname(dan.edge))}）からです。</p>`;
    const sos = sim.spaceDowned().filter((o) => o !== c && o.transit.downed.sos && sim.sosWorlds(o.transit).has(c.world));
    if (sos.length) html += '<div class="pl-sec">救難信号</div>' + sos.map((o) => row(`🆘 ${escapeHtml(o.name)}`, `「${escapeHtml(sim.wname(o.transit.from))}」の周辺で倒れている`, 'rescue', { id: o.id }, '助けに行く')).join('');
    return html;
  }
  tab_bag(c) {
    const { sim } = this.app;
    const ids = Object.keys(c.items);
    const buyer = sim.seller('buyer', c.world);
    const near = sim.charsIn(c.world).filter((o) => o !== c && o.state === 'ok').slice(0, 30);
    const give = (id) => (near.length && !c.transit ? this.btn('give', '渡す', { to: this.giveTo(near), id }) : '');
    let html = `<p class="pl-note">食料 ${c.food}（毎朝1つ減ります。0のまま3日たつと2日後の朝まで倒れます）</p>`;
    if (near.length && !c.transit) html += `<div class="pl-grid">${this.btn('give', `🍙 ${escapeHtml(this.giveName(near))}に食料を渡す`, { to: this.giveTo(near), id: 'food' })}</div>`;
    if (!ids.length) return html + '<p class="pl-note">何も持っていません。</p>';
    return html + ids.map((id) => {
      const it = ITEMS[id], useBtn = ['exp', 'field', 'hold', 'food'].includes(it.kind) ? this.btn('use', it.kind === 'hold' ? (c.held === id ? '外す' : '持たせる') : '使う', { id }) : '';
      return `<div class="pl-row ${c.held === id ? 'held' : ''}"><span>${escapeHtml(it.name)} ×${c.items[id]}<small>${escapeHtml(it.desc)}</small></span>${useBtn}${give(id)}${buyer && !c.transit ? this.btn('sell', `売る ${sellPrice(id)}`, { id }) : ''}</div>`;
    }).join('');
  }
  giveTo(near) { return near[0].id; }
  giveName(near) { return near[0].name; }
  tab_shop(c) {
    const { sim } = this.app;
    if (c.transit) return '<p class="pl-note">移動中は店に行けません。</p>';
    const kinds = ['general', 'food', 'bread'].filter((k) => sim.seller(k, c.world));
    const list = kinds.map((k) => `<div class="pl-sec">${SHOP_NAMES[k]}</div>` + Object.entries(ITEMS).filter(([, it]) => it.shop === k).map(([id, it]) => `<div class="pl-row"><span>${escapeHtml(it.name)}<small>${escapeHtml(it.desc)}</small></span>${this.btn('buy', `${it.price}🪙`, { id })}</div>`).join('')).join('');
    return list || '<p class="pl-note">この世界線に店はありません。店は現代にあります（店の人が起きている時だけ）。遠い時は GUDAZON SHOP が使えます。</p>';
  }
  tab_net(c) {
    const { sim } = this.app;
    const dist = sim.distFromGenzai(c.transit ? c.transit.from : c.world);
    const orders = c.orders.length ? '<div class="pl-sec">配送中</div>' + c.orders.map((o) => `<div class="pl-row"><span>${escapeHtml(ITEMS[o.id].name)}<small>あと${Math.max(1, Math.ceil((o.at - sim.t) / 60))}時間で届く</small></span></div>`).join('') : '';
    return `<p class="pl-note">GUDAZON SHOP: 注文の1日後に確実に届きます。現代から遠いほど高くなります。</p>${orders}`
      + onlineItems().map((id) => `<div class="pl-row"><span>${escapeHtml(ITEMS[id].name)}<small>${escapeHtml(ITEMS[id].desc)}</small></span>${this.btn('order', `${onlinePrice(id, dist)}🪙`, { id })}</div>`).join('');
  }
  // 間違えて押さないよう、タブの奥で確認してからやめる
  tab_etc(c) {
    if (!this.asking) return `<p class="pl-note">操作をやめると、${escapeHtml(c.name)}は自分で行動するようになります。誰かが操作を始めると、戻れなくなることがあります。</p><div class="pl-grid"><button data-ask="yes">操作をやめる…</button></div>`;
    return `<p class="pl-note">本当に${escapeHtml(c.name)}の操作をやめますか？</p><div class="pl-grid"><button data-ask="no">やめない</button>${this.btn('release', 'やめる')}</div>`;
  }
  tab_ab(c) {
    const { sim } = this.app;
    const cur = sim.abilityOf(c);
    return c.abilities.map((a, i) => {
      if (!a) return '';
      const ok = sim.abilityOptions(c).some((x) => x.i === i);
      return `<div class="pl-row ${a === cur ? 'held' : ''}"><span>${i === 2 ? '夢特性' : `通常特性${i + 1}`}<small>${escapeHtml(a)}</small></span>${a === cur ? '<small>使用中</small>' : ok ? this.btn('ability', '使う', { i }) : '<small>Lv100で解禁</small>'}</div>`;
    }).join('');
  }

  // ---------- 手動の戦闘 ----------
  drawBattle(c) {
    const { sim } = this.app, box = $('#bt');
    const f = sim.fights.find((x) => x.manual === c.id);
    if (!f) { box.hidden = true; this.lastBt = ''; return; }
    box.hidden = false;
    const bars = sim.fightBars(f);
    const unit = (b) => `<div class="bt-u"><b>${escapeHtml(b.nm)}</b> <small>Lv${b.lv}${b.ss?.length ? ` ・ ${escapeHtml(b.ss.join('・'))}` : ''}${b.sh ? ` ・ 🛡${b.sh}` : ''}</small> <small>${b.hp}/${b.max}</small><span class="hpbar"><i style="width:${Math.max(0, b.pct)}%"></i></span></div>`;
    const mine = bars.filter((b) => b.side === 0), foes = bars.filter((b) => b.side === 1);
    const moves = (f.moves || []).map(([i, nm, t, cat, pw, left, pp, no, eff]) => `<button data-op="move" data-a='{"i":${i}}' ${no ? 'disabled' : ''} title="${escapeHtml(eff)}">${escapeHtml(nm)}<small>${escapeHtml(t)} ${CAT[cat]}${pw ? ` 威力${pw}` : ''} PP${left}/${pp}${no ? ` ・ ${escapeHtml(no)}` : ''}</small></button>`).join('');
    const items = Object.keys(c.items).filter((id) => ['heal', 'cure', 'buff', 'shield'].includes(ITEMS[id].kind)).map((id) => `<button data-op="bitem" data-a='{"id":"${id}"}'>${escapeHtml(ITEMS[id].name)}×${c.items[id]}</button>`).join('');
    const run = f.transit ? '' : `<button data-op="run">🏃 逃げる${c.items.bread ? `（みるくパン×${c.items.bread}）` : ''}</button>`;
    const html = `<div class="bt-bars"><div>${mine.map(unit).join('')}</div><div>${foes.map(unit).join('')}</div></div><div class="bt-log">${(f.text || []).map(escapeHtml).join('<br>')}</div>`
      + `<div class="bt-moves">${moves}</div><div class="bt-acts">${items}${run}<small class="pl-note">ターン ${f.turn}</small></div>`;
    if (html === this.lastBt) return;
    box.innerHTML = html;
    const log = box.querySelector('.bt-log');
    log.scrollTop = log.scrollHeight;
    this.lastBt = html;
  }
}
