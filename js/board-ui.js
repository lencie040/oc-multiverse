import { escapeHtml } from './util.js?v=58';
import { rankLabel } from './model.js?v=58';
import { MOODS, moodOf } from './audio.js?v=58';
import { TILES } from './board-map.js?v=58';
import { canCarry, ITEMS } from './board-items.js?v=58';
import { CRYSTAL_PRICE, BoardGame, levelCost } from './board-game.js?v=58';
import { FORMATIONS, TECHS } from './board-battle.js?v=58';
import { performance as scoreOf, targets } from './board-minigames.js?v=58';
import { BoardScene } from './board-draw.js?v=58';
import { BoardRoom } from './board-room.js?v=58';

const SAVE = 'oc-multiverse-sugoroku-v1';
const E = escapeHtml;
const disabled = (value) => value ? ' disabled' : '';
const statusName = (p) => p.duel ? '決闘中' : p.mini ? 'ミニゲーム中' : p.battle ? '戦闘中' : p.offer?.kind === 'branch' ? '分岐を選択中' : p.rolling ? '移動中' : '待機中';

function updateHtml(el, html) {
  if (el.contentVersion !== html) {
    el.innerHTML = html;
    el.contentVersion = html;
  }
}

export class BoardUI {
  constructor(app) {
    this.app = app;
    this.dialog = document.getElementById('board-dialog');
    this.dialog.addEventListener('click', (e) => this.click(e));
    this.dialog.addEventListener('close', () => this.stop());
    this.dialog.addEventListener('toggle', (e) => {
      if (e.target.isConnected && e.target.dataset?.keep === 'tech') this.techOpen = e.target.open;
    }, true);
    for (const id of ['tg-board', 'tab-board']) document.getElementById(id).addEventListener('click', () => this.open());
  }

  get openNow() { return this.dialog.open; }
  get active() { return this.openNow && !!this.game; }
  get me() { return this.game?.player(this.room?.id ?? 'local'); }
  get time() {
    return this.game.time + (this.room && !this.room.isHost && this.room.ready
      ? Math.min(0.22, (performance.now() - this.room.lastReceived) / 1000) : 0);
  }

  open() {
    if (this.openNow) return;
    this.app.ui.setSheet(null);
    this.app.keys = {};
    this.dialog.show();
    this.lobby();
  }

  lobby() {
    this.stop();
    const { model, view, selected } = this.app;
    const defaultWorld = view.worldId ?? (view.danId && model.danById.get(view.danId)?.edge) ?? 'A0';
    const chosen = model.charById.get(selected) ?? model.chars.filter((c) => c.home === defaultWorld).sort((a, b) => b.rank - a.rank)[0] ?? model.chars[0];
    const saved = this.saved();
    this.dialog.innerHTML = `
      <div class="board-lobby">
        <button class="board-close" data-op="close" aria-label="観戦に戻る">×</button>
        <div class="board-orbits" aria-hidden="true"><span>◆</span><i></i><i></i><i></i></div>
        <h1 id="board-title">すごろくRTS</h1>
        <p>サイコロで世界線を巡り、クリスタルを集めながら部隊を育てよう。</p>
        <div class="board-lobby-fields">
          <label>キャラ<select data-field="char">
            ${model.chars.map((c) => `<option value="${E(c.id)}"${c.id === chosen.id ? ' selected' : ''}>${E(c.name)}［${rankLabel(c.rank)}］</option>`).join('')}
          </select></label>
          <label>出発する世界線<select data-field="world">
            ${[...model.worlds.values()].map((w) => `<option value="${E(w.id)}"${w.id === defaultWorld ? ' selected' : ''}>${E(w.name)} ・ ${E(w.id)}</option>`).join('')}
          </select></label>
        </div>
        <div class="board-lobby-actions">
          <button class="board-primary" data-op="online"${disabled(this.app.sync.manualSolo)}>みんなで遊ぶ</button>
          <button data-op="solo">CPUと遊ぶ</button>
          ${saved ? '<button data-op="resume">CPU戦の続き</button>' : ''}
        </div>
        <small>Lv1スタート ・ 世界線移動は Z 以上 ・ 世界団移動は ZZZ</small>
        ${this.app.sync.manualSolo ? '<small>ソロ表示です。オンラインで遊ぶには<a href="./">公開ページ</a>を開いてください。</small>'
          : !this.app.sync.catalog.checkedAt ? '<small>保存済みデータと同じ版の参加者と接続します。</small>' : ''}
      </div>`;
  }

  saved() {
    try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; }
  }

  persist() {
    if (!this.game || this.room || !this.me) return;
    try { localStorage.setItem(SAVE, JSON.stringify(this.game.state)); } catch { /* プライベートブラウズ等 */ }
  }

  start(mode) {
    const char = this.dialog.querySelector('[data-field="char"]').value;
    const world = this.dialog.querySelector('[data-field="world"]').value;
    this.game = new BoardGame(this.app.model);
    this.follow = null;
    this.exact = false;
    this.saveAt = 0;
    document.body.classList.add('board-active');
    if (this.app.director?.on) this.app.director.toggle(false);
    this.app.stopFollow();
    if (mode === 'online') {
      this.net = 'connecting';
    } else {
      this.net = 'solo';
      if (mode !== 'resume' || !this.game.restore(this.saved()) || !this.me) {
        this.game = new BoardGame(this.app.model);
        this.game.join('local', char, world);
        this.game.seedBots(world, char);
      }
      this.persist();
    }
    this.dialog.innerHTML = `
      <header class="board-head">
        <div><h1 id="board-title">すごろくRTS</h1><div class="board-world" data-region="world"></div></div>
        <div class="board-head-end"><span class="board-network" data-region="network"></span>
          <button data-op="frame">盤面を見渡す</button><button data-op="lobby">対戦メニュー</button>
          <button class="board-close" data-op="close" aria-label="観戦に戻る">×</button>
        </div>
      </header>
      <div class="board-body">
        <div class="board-main">
          <div data-region="players" class="board-players"></div>
          <div data-region="challenge" class="board-challenge"></div>
          <div data-region="status" class="board-status"></div>
          <div class="board-legend">
            <span><i style="--tile:#469aff"></i>＋3</span><span><i style="--tile:#f26877"></i>−3</span>
            <span><i style="--tile:#62d8aa"></i>緑のイベント</span><span><i style="--tile:#292537"></i>黒マス</span>
            <span><i class="pass-dot"></i>通過点 ◆ クリスタル ｜ ▣ 店 ｜ ⟡ ゲート</span>
          </div>
        </div>
        <aside class="board-sidebar">
          <div data-region="controls"></div>
          <div data-region="growth"></div>
          <div data-region="items"></div>
          <details class="board-guide">
            <summary>遊び方</summary>
            <p>サイコロは1〜10。光る分岐で道を選びます。水色の点は歩数に数えず、通過時に立ち寄れます。</p>
            <p>クリスタルは各世界線に1か所。20コインで購入すると、購入点が移ります。1個＝1pt。世界線移動は1／5pt、世界団移動は40／120ptです。</p>
            <p>コインでレベルを上げ、クリスタルで技を覚えます。ほかの駒と同じマスに止まると決闘になり、勝者が両者の賭けコインを受け取ります。</p>
            <p>持てるアイテムは3種類まで、同じ種類は10個までです。</p>
          </details>
          <div class="board-feed"><h2>できごと</h2><div data-region="log" aria-live="polite"></div></div>
        </aside>
      </div>`;
    this.regions = Object.fromEntries([...this.dialog.querySelectorAll('[data-region]')].map((el) => [el.dataset.region, el]));
    if (mode === 'online') this.connectRoom(char, world);
    this.refresh();
  }

  async connectRoom(char, world) {
    const game = this.game;
    try {
      const client = await this.app.sync.connect();
      if (this.game !== game || !this.openNow) return;
      this.room = new BoardRoom(game, client, this.app.sync.catalog.revision, (status) => {
        if (this.game === game && status !== this.net) { this.net = status; this.refresh(); }
      });
      this.room.start(char, world);
    } catch (error) {
      console.warn('すごろくのオンライン接続:', error);
      if (this.game === game) { this.net = 'failed'; this.refresh(); }
    }
  }

  stop() {
    this.persist();
    this.room?.stop();
    this.scene?.dispose();
    this.scene = null;
    document.body.classList.remove('board-active');
    this.room = null;
    this.game = null;
    this.net = null;
    this.regions = null;
  }

  tick(dt) {
    if (!this.openNow || !this.game) return;
    if (!this.room && !document.hidden) this.game.update(dt);
    const p = this.game.player(this.follow) ?? this.me;
    if (p) {
      if (this.app.view.worldId !== p.world) this.app.openWorld(p.world);
      if (this.scene?.view !== this.app.view) {
        this.scene?.dispose();
        this.scene = new BoardScene(this.app.view, this.game.board(p.world));
        this.scene.frame();
      }
      this.scene.update(this.game, p, dt);
    }
    this.paintIn = (this.paintIn ?? 0) - dt;
    if (this.paintIn > 0) return;
    this.paintIn = 0.08;
    if (!this.room && this.game.time >= (this.saveAt ?? 0)) {
      this.saveAt = this.game.time + 1.2;
      this.persist();
    }
    this.refresh();
  }

  refresh() {
    if (!this.regions || !this.game) return;
    const me = this.me;
    const { world: place, network, players, controls, growth, items, challenge, status, log } = this.regions;
    const netName = { online: '● オンライン', solo: '● CPU対戦', connecting: '接続中…', failed: '接続できません', reconnect: '再接続中…' };
    network.textContent = netName[this.net] ?? '';
    if (!me) {
      updateHtml(controls, this.net === 'failed' ? '<p>オンライン接続に失敗しました。通信環境を確認し、対戦メニューからもう一度接続してください。</p>' : '<p>盤面を準備しています…</p>');
      return;
    }
    const focus = this.game.player(this.follow) ?? me;
    const w = this.game.model.worlds.get(focus.world);
    updateHtml(place, `${E(w.name)} <b>${E(w.id)}</b> <span>♪ ${E(MOODS[moodOf(w)].name)}</span>`);
    updateHtml(players, this.game.state.players.map((p) => {
      const c = this.game.char(p);
      const detail = `${p === me ? 'あなた' : p.bot ? 'CPU' : statusName(p)} ・ ${this.game.model.worlds.get(p.world).name}`;
      const avatar = c.img ? `<img src="${E(c.img)}" alt="">` : `<i>${E(c.kanji)}</i>`;
      return `<button class="board-player${p === focus ? ' on' : ''}" data-op="follow" data-value="${E(p.id)}" style="--pawn:${E(p.color)}" aria-pressed="${p === focus}">
        ${avatar}<span><b>${E(c.name)}</b><small>${E(detail)}</small></span><strong><span>◆ ${p.crystals}</span><span>● ${p.coins}</span></strong>
      </button>`;
    }).join(''));
    updateHtml(controls, this.controls(me));
    updateHtml(growth, this.growth(me));
    updateHtml(items, this.items(me));
    updateHtml(challenge, this.challenge(focus));
    const duel = this.game.state.duels.find((d) => d.id === focus.duel);
    const minigame = duel?.game ?? focus.mini?.game;
    if (minigame) {
      const remaining = Math.max(0, minigame.limit - Math.max(0, this.time - minigame.start));
      challenge.querySelector('.board-minitime i').style.width = (100 * remaining / minigame.limit) + '%';
      const playerScore = duel?.scores[focus.id] ?? focus.mini.score;
      const peer = duel?.ids.find((id) => id !== focus.id);
      challenge.querySelector('.board-miniscore').textContent = scoreOf(minigame, playerScore) + '点'
        + (peer ? ' ／ 相手 ' + scoreOf(minigame, duel.scores[peer]) + '点' : '');
    }
    const count = me.rolling ? `残り ${me.remaining} 歩` : me.turn ? `第${me.turn}投` : '次の手を選ぶ';
    updateHtml(status, `<span><b>${focus === me ? count : E(this.game.char(focus).name) + 'を観戦中'}</b>
      ${me.roll?.length ? `<span class="board-die-result">${me.roll.map((n) => `<i>${n}</i>`).join('')}</span>` : ''}</span>
      <span>${focus === me ? E(statusName(me)) : '<button data-op="follow">自分の駒へ戻る</button>'}</span>`);
    updateHtml(log, this.game.state.log.slice(-8).reverse().map((e) => `<p><b>${E(e.name)}</b> ${E(e.text)}</p>`).join(''));
  }

  controls(p) {
    if (p.duel) {
      const d = this.game.state.duels.find((d) => d.id === p.duel);
      const q = this.game.player(d.ids.find((id) => id !== p.id));
      if (d.game) return `<section class="board-card"><h2>決闘 ・ ${d.stake}コインずつ</h2><p>対戦相手 ${E(this.game.char(q).name)}</p></section>`;
      if (d.owner !== p.id) return `<section class="board-card"><h2>決闘</h2><p>${E(this.game.char(q).name)}が賭け額を選んでいます。</p></section>`;
      const max = Math.min(p.coins, q.coins);
      return `<section class="board-card"><h2>賭けコインを選ぶ</h2><p>${E(this.game.char(q).name)}と各自同額を賭けます。</p>
        <div class="board-buttons">${[1, 3, 5, 10, 20, max].filter((v, i, a) => v <= max && a.indexOf(v) === i).map((v) => `<button data-op="stake" data-value="${v}" data-token="${d.id}">${v}</button>`).join('')}</div>
        <label class="board-stake">好きな額 <input type="number" min="1" max="${max}" value="${Math.min(5, max)}"><button data-op="own-stake" data-token="${d.id}">賭ける</button></label></section>`;
    }
    if (p.battle) return `<section class="board-card"><h2>部隊の指示</h2>
      <p>${p.battle.burst < 2 ? ['上段', '中央', '下段'][p.battle.lane] + 'に大技が来る！' : '前衛・術士・援護が交戦中'}</p><div class="board-buttons">
      ${Object.entries(FORMATIONS).map(([id, [name, desc]]) => `<button class="${id === p.battle.stance ? 'on' : ''}" data-op="stance" data-value="${id}" title="${desc}">${name}</button>`).join('')}</div>
      <p>${FORMATIONS[p.battle.stance][1]}</p>
      <div class="board-buttons">${p.techs.map((id) => `<button data-op="cast" data-value="${id}"${disabled(p.battle.tech > 0 || this.time < p.battleStart)}>${TECHS[id].name}</button>`).join('')}</div>
    </section>`;
    if (p.mini) return '<section class="board-card"><h2>ハプニング</h2><p>盤面上のミニゲームに挑戦中。</p></section>';
    if (p.offer) return this.offer(p);
    return `<section class="board-card board-roll"><button class="board-primary" data-op="roll"${disabled(p.rolling || p.cooldown > 0)}>⚄ サイコロを振る</button>
      ${p.rolling ? '<p>盤上を移動中</p>' : '<small>1〜10</small>'}</section>`;
  }

  offer(p) {
    const o = p.offer, skip = `<button data-op="skip" data-token="${o.token}">通過する</button>`;
    const action = (op, id, name, locked = false) => `<button data-op="${op}" data-value="${E(id)}" data-token="${o.token}"${disabled(locked)}>${name}</button>`;
    if (o.kind === 'branch') {
      const from = this.game.board(p.world).tiles[p.tile];
      return `<section class="board-card"><h2>分岐を選ぶ</h2><p>盤面の黄色い輪をタップできます。</p><div class="board-buttons">${o.data.map((id, i) => {
        const t = this.game.board(p.world).tiles[id];
        const route = t.ring === from.ring ? '同じ周回路' : ['外周', '中周', '内周'][t.ring] + 'へ';
        return action('path', id, `${i + 1}　${route} ・ ${TILES[this.game.tileType(p.world, id)].name}`);
      }).join('')}</div></section>`;
    }
    if (o.kind === 'crystal') {
      const price = this.game.price(p, CRYSTAL_PRICE);
      return `<section class="board-card board-crystal"><h2>◆ クリスタル</h2><p>${price}コインで購入。購入場所が移ります。</p>
        <div class="board-buttons">${action('crystal', '', '購入する', p.coins < price)}${skip}</div></section>`;
    }
    if (o.kind === 'gate') return `<section class="board-card"><h2>⟡ 移動ゲート</h2>
      <div class="board-shop">${this.game.travelOptions(p).map(({ id, cost, kind, rank, allowed, blocked }) => {
        const w = this.game.model.worlds.get(id);
        const title = kind === 'dan' ? '世界団 ' + w.dan + ' ・ ' + w.name : w.name;
        return action('travel', id, `<b>${E(title)}</b><small>${rankLabel(rank)} 以上　◆ ${cost}pt${blocked ? ' ・ 赤いノイズで通行止め' : ''}</small>`, !allowed);
      }).join('')}</div>${skip}</section>`;
    return `<section class="board-card"><h2>▣ ショップ</h2><div class="board-shop">
      ${(o.data ?? this.game.stocks(p.world, p.tile)).map((id) => {
        const it = ITEMS[id], price = this.game.price(p, it.price);
        return action('buy', id, `<b>${it.name} ・ ${price}コイン</b><small>${it.desc}</small>`, p.coins < price || !canCarry(p.items, id));
      }).join('')}</div>${skip}</section>`;
  }

  growth(p) {
    return `<section class="board-card board-growth"><h2>部隊の育成 <em>Lv${p.lv} ・ ${rankLabel(this.game.char(p).rank)}</em></h2>
      <button data-op="level"${disabled(p.lv >= 30 || p.coins < levelCost(p) || !!p.duel)}>${p.lv >= 30 ? '上限 Lv30' : 'レベルアップ ・ ' + levelCost(p) + 'コイン'}</button>
      <details ${this.techOpen ? 'open' : ''} data-keep="tech"><summary>習得技 ${p.techs.length} / 4</summary>
      <div class="board-shop">${Object.entries(TECHS).map(([id, t]) => `<button data-op="learn" data-value="${id}"${disabled(p.techs.includes(id) || p.lv < t.lv || p.crystals < t.cost || !!p.duel)}>
        <b>${t.name} ・ ${p.techs.includes(id) ? '習得済み' : 'Lv' + t.lv + ' / ◆ ' + t.cost}</b><small>${t.desc}</small></button>`).join('')}</div></details></section>`;
  }

  items(p) {
    const lock = p.rolling || p.offer || p.battle || p.duel || p.mini || p.cooldown > 0;
    return `<section class="board-card"><h2>持ち物 <em>${Object.keys(p.items).length} / 3種</em></h2>
      ${Object.entries(p.items).map(([id, n]) => `<div class="board-item"><button data-op="${id === 'exact' ? 'exact' : 'use'}" data-value="${id}"${disabled(lock || (ITEMS[id].effect === 'soloDuel' && p.coins < ITEMS[id].value))}>
         <b>${ITEMS[id].name} ×${n}</b><small>${ITEMS[id].desc}</small></button>
         <button data-op="discard" data-value="${id}" title="1個捨てる" aria-label="${ITEMS[id].name}を1個捨てる"${disabled(lock)}>×</button></div>`).join('') || '<p>ショップやアイテムマスで入手できます。</p>'}
      ${this.exact && !lock && p.items.exact ? `<div class="board-buttons">${Array.from({ length: 10 }, (_, i) => `<button data-op="exact-roll" data-value="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}
      ${this.buffs(p)}</section>`;
  }

  buffs(p) {
    const messages = { reverse: '逆回り', key: '抜け道', shield: 'おまもり', trap: 'トラップ', markup: '値上げ', load: 'おもり', fruitPass: '木の実チケット', cursePass: '呪いチケット' };
    const names = Object.entries(messages).filter(([id]) => p.buffs[id]).map(([, name]) => name);
    return names.length ? `<small>効果中　${names.join(' ・ ')}</small>` : '';
  }

  challenge(p) {
    const d = this.game.state.duels.find((d) => d.id === p.duel);
    const game = d?.game ?? p.mini?.game;
    const score = d?.scores?.[p.id] ?? p.mini?.score;
    if (!game || !score) return '';
    const mine = p === this.me, elapsed = this.time - game.start;
    const buttons = (ids) => ids.map((id) => `<button data-op="input" data-value="${id}"${disabled(!mine || score.done || elapsed < 0)}>${E(game.icons[id])}</button>`).join('');
    let play = '';
    if (elapsed < 0) play = `<strong class="board-target">${Math.ceil(-elapsed)}</strong>`;
    else if (game.mode === 0) {
      const cue = game.cues.findIndex((t, i) => Math.abs(t - elapsed) <= game.window && !score.used.includes(i));
      play = `<button class="board-pulse${cue >= 0 ? ' lit' : ''}" data-op="input" data-value="0" aria-label="合図を押す"${disabled(!mine)}>◆</button>`;
    } else if (game.mode === 1 && elapsed < game.preview) {
      play = `<strong class="board-target">${E(game.sequence.map((id) => game.icons[id]).join('　'))}</strong>`;
    } else if (game.mode === 1) {
      play = `<p>${score.step} / ${game.steps}${game.reverse ? ' ・ 逆順' : ''}</p><div class="board-minibtns">${buttons([0, 1, 2, 3])}</div>`;
    } else {
      const target = score.done ? '完了' : game.icons[game.sequence[score.step]];
      play = `<strong class="board-target">${E(target)}</strong><div class="board-minibtns">${buttons(targets(game, score.step))}</div>`;
    }
    return `<div class="board-mini">
      <h2>${E(game.name)}</h2><p>${E(game.help)}</p>
      <div class="board-minitime"><i></i></div>
      <div class="board-miniplay">${play}</div>
      <small class="board-miniscore"></small>
    </div>`;
  }

  action(op, value, token) {
    if (!this.me || (this.room && (this.net === 'reconnect' || this.net === 'failed'))) return;
    this.follow = null;
    if (this.room) this.room.send(op, value, token);
    else this.game.act(this.me, op, value, token);
    this.refresh();
  }

  click(e) {
    const b = e.target.closest('button[data-op]');
    if (!b || b.disabled) return;
    const { op, value, token } = b.dataset;
    if (op === 'close') return this.dialog.close();
    if (op === 'lobby') return this.lobby();
    if (op === 'frame') return this.scene?.frame();
    if (['online', 'solo', 'resume'].includes(op)) return this.start(op);
    this.techOpen = !!this.dialog.querySelector('[data-keep="tech"]')?.open;
    if (op === 'follow') { this.follow = value || null; return this.refresh(); }
    if (op === 'exact') { this.exact = !this.exact; return this.refresh(); }
    if (op === 'exact-roll') { this.exact = false; return this.action('use', { id: 'exact', die: Number(value) }); }
    if (op === 'use') return this.action('use', { id: value });
    if (op === 'own-stake') return this.action('stake', b.parentElement.querySelector('input').valueAsNumber, Number(token));
    this.action(op, ['input', 'path', 'stake'].includes(op) ? Number(value) : value, Number(token));
  }

  key(e) {
    if (e.target.matches('input,select,button') || e.repeat) return;
    if (/^[1-9]$/.test(e.key) && this.me?.offer?.kind === 'branch') {
      const { data, token } = this.me.offer;
      const id = data[Number(e.key) - 1];
      if (id != null) this.action('path', id, token);
    }
  }

  mapClick(ndc) {
    const p = this.me, o = p?.offer;
    if (!o || o.kind !== 'branch' || (this.follow && this.follow !== p.id)) return false;
    const id = this.scene?.pick(ndc);
    if (id == null || !o.data.includes(id)) return false;
    this.action('path', id, o.token);
    return true;
  }
}
