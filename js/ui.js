// 画面まわり (パンくず・時計・検索・出来事・情報パネル)
import { CATS } from './sim.js?v=7';
import { fmtTime, escapeHtml, colorOf, luminance } from './util.js?v=7';

const $ = (s) => document.querySelector(s);
const STAT_NAMES = ['H', 'A', 'B', 'C', 'D', 'S'];

export class UI {
  constructor(app) {
    this.app = app;
    this.evFilter = 'all';
    this.infoT = 0;
    this.lastInfo = '';

    $('#speed').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) app.setSpeed(Number(b.dataset.s));
    });
    $('#tg-names').addEventListener('change', (e) => { app.settings.names = e.target.checked; });
    $('#tg-wnames').addEventListener('change', (e) => {
      app.settings.worldNames = e.target.checked;
      app.view.applyLabelSettings?.();
      app.view.refresh?.();
    });
    $('#tg-panels').addEventListener('click', () => document.body.classList.toggle('nopanels'));
    $('#tg-minor').addEventListener('change', (e) => { app.settings.minor = e.target.checked; this.renderEvents(); });
    document.querySelector('#events .tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.evFilter = b.dataset.f;
      for (const x of document.querySelectorAll('#events .tabs button')) x.classList.toggle('on', x === b);
      this.renderEvents();
    });

    // 一覧クリックは描き換えの影響を受けないよう pointerdown で拾う
    const nav = (e) => {
      const el = e.target.closest('[data-w],[data-c],[data-dan],[data-act]');
      if (!el || e.button !== 0) return;
      e.preventDefault();
      if (el.dataset.act === 'close') return app.selectChar(null);
      if (el.dataset.act === 'follow') return app.toggleFollow();
      if (el.dataset.c) return app.selectChar(el.dataset.c, { focus: true });
      if (el.dataset.w) return app.openWorld(el.dataset.w);
      if (el.dataset.dan) return app.openDan(el.dataset.dan);
    };
    $('#info').addEventListener('pointerdown', nav);
    $('#evlist').addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.ev');
      if (!el || e.button !== 0) return;
      if (el.dataset.c) app.selectChar(el.dataset.c, { focus: true });
      else if (el.dataset.w) app.openWorld(el.dataset.w);
    });
    $('#crumbs').addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      if (a.dataset.go === 'u') app.goUniverse();
      else if (a.dataset.dan) app.openDan(a.dataset.dan);
    });

    this.setupSearch();
    app.sim.listen((e) => this.onEvent(e));
    $('#legend').innerHTML = Object.values(CATS).map((c) => `<span><b style="background:${c.color}"></b>${c.icon}${c.label}</span>`).join('');
    this.renderEvents();
  }

  wchip(id, link = false) {
    const w = this.app.model.worlds.get(id);
    if (!w) return '';
    return link
      ? `<a class="wchip" data-w="${escapeHtml(id)}" style="--c:${w.theme.ground}">${escapeHtml(w.name)}</a>`
      : `<span class="wchip" style="--c:${w.theme.ground}">${escapeHtml(w.name)}</span>`;
  }

  // 今いる場所 (移動中なら 出発→到着)
  whereChip(c, link = false) {
    const tr = this.app.sim.transitOf(c);
    return tr ? `${tr.kind === 'dan' ? '🌌' : '🌀'}${this.wchip(tr.from, link)}→${this.wchip(tr.to, link)}` : this.wchip(c.world, link);
  }

  // ---------- パンくず・タイトル ----------
  onViewChange() {
    const v = this.app.view;
    const { model } = this.app;
    let html = `<a data-go="u" class="${v.kind === 'universe' ? 'cur' : ''}">🌌 宇宙</a>`;
    const danId = v.kind === 'dan' ? v.danId : v.kind === 'world' ? v.world.dan : null;
    if (danId) {
      const d = model.danById.get(danId);
      html += `<span class="sep">›</span><a data-dan="${escapeHtml(danId)}" class="${v.kind === 'dan' ? 'cur' : ''}">世界団 ${escapeHtml(d.id)}（${escapeHtml(d.yomi)}）</a>`;
    }
    if (v.kind === 'world') html += `<span class="sep">›</span><a class="cur">${escapeHtml(v.world.name)}</a>`;
    $('#crumbs').innerHTML = html;
    const wt = $('#wtitle');
    if (v.kind === 'world' && this.app.settings.worldNames) {
      const w = v.world;
      wt.hidden = false;
      wt.innerHTML = `<h1>${escapeHtml(w.name)}</h1><p>${escapeHtml(w.yomi)} ・ ${escapeHtml(w.id)}${w.sub ? ` ・ ${escapeHtml(w.sub)}` : ''} ・ 世界団 ${escapeHtml(w.dan)}</p>`;
    } else wt.hidden = true;
    this.lastInfo = '';
    this.renderEvents();
    this.renderInfo();
  }

  // ---------- 時計 ----------
  tick(dt) {
    const { sim } = this.app;
    const tm = fmtTime(sim.t);
    const h = sim.hour;
    $('#clk-icon').textContent = h >= 22 || h < 5 ? '🌙' : h < 7 ? '🌅' : h < 17.5 ? '☀️' : h < 20 ? '🌇' : '🌙';
    $('#clk-text').textContent = tm.text;
    if ((this.infoT -= dt) <= 0) { this.renderInfo(); this.infoT = 0.5; }
  }

  // ---------- 出来事 ----------
  evMatch(e) {
    if (!e.major && !this.app.settings.minor) return false;
    if (this.evFilter === 'here' && this.app.view.kind === 'world') return e.world === this.app.view.worldId;
    if (this.evFilter === 'here' && this.app.view.kind === 'dan') return this.app.model.worlds.get(e.world)?.dan === this.app.view.danId;
    return true;
  }
  evHtml(e) {
    const tm = fmtTime(e.t);
    return `<div class="ev${e.major ? '' : ' minor-ev'}" data-w="${escapeHtml(e.world)}" ${e.ids[0] ? `data-c="${escapeHtml(e.ids[0])}"` : ''}>`
      + `<time>${tm.day}日目 ${tm.hh}:${tm.mm}</time>${this.wchip(e.world)}${escapeHtml(e.text)}</div>`;
  }
  renderEvents() {
    const list = this.app.sim.events.filter((e) => this.evMatch(e)).slice(-150).reverse();
    $('#evlist').innerHTML = list.length ? list.map((e) => this.evHtml(e)).join('') : '<div class="ev minor-ev">まだ何も起きていません…</div>';
  }
  onEvent(e) {
    if (!this.evMatch(e)) return;
    const box = $('#evlist');
    if (box.firstElementChild && !box.firstElementChild.dataset.w) box.innerHTML = '';
    box.insertAdjacentHTML('afterbegin', this.evHtml(e));
    while (box.children.length > 150) box.lastElementChild.remove();
  }

  // ---------- 検索 ----------
  setupSearch() {
    const input = $('#search'), res = $('#results');
    let items = [], sel = 0;
    const draw = () => {
      res.querySelectorAll('.r').forEach((el, i) => el.classList.toggle('sel', i === sel));
    };
    const go = (it) => {
      if (!it) return;
      res.hidden = true;
      input.value = '';
      input.blur();
      if (it.type === 'w') this.app.openWorld(it.id);
      else this.app.selectChar(it.id, { focus: true });
    };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { res.hidden = true; return; }
      const { model } = this.app;
      const ws = [...model.worlds.values()].filter((w) =>
        [w.name, w.yomi, w.id, w.sub].some((s) => s && s.toLowerCase().includes(q))).slice(0, 12);
      const cs = model.chars.filter((c) => [c.name, c.yomi, c.id].some((s) => s && s.toLowerCase().includes(q))).slice(0, 15);
      items = [...ws.map((w) => ({ type: 'w', id: w.id })), ...cs.map((c) => ({ type: 'c', id: c.id }))];
      sel = 0;
      let html = '';
      if (ws.length) html += '<div class="grp">世界線</div>' + ws.map((w) => `<div class="r">${this.wchip(w.id)}<span>${escapeHtml(w.yomi)}</span><small>${escapeHtml(w.id)} ・ ${escapeHtml(w.dan)}</small></div>`).join('');
      if (cs.length) html += '<div class="grp">キャラクター</div>' + cs.map((c) => `<div class="r"><span>${escapeHtml(c.name)}</span><small>${this.whereChip(c)}</small></div>`).join('');
      res.innerHTML = html || '<div class="grp">見つかりません</div>';
      res.hidden = false;
      res.querySelectorAll('.r').forEach((el, i) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); go(items[i]); }));
      draw();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') go(items[sel]);
      else if (e.key === 'Escape') { res.hidden = true; input.blur(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 150));
  }

  // ---------- 情報パネル ----------
  breakdown(chars) {
    const { sim } = this.app;
    const cnt = Object.fromEntries(Object.keys(CATS).map((k) => [k, 0]));
    let down = 0, sleep = 0, travel = 0;
    for (const c of chars) {
      const d = sim.displayAct(c);
      if (c.state === 'down') down++;
      else if (c.state === 'sleep' || c.state === 'camp') sleep++;
      cnt[d.cat] = (cnt[d.cat] || 0) + 1;
      if (c.world !== c.home) travel++;
    }
    const total = chars.length || 1;
    return `<div class="stack">${Object.entries(cnt).map(([k, v]) => `<i style="width:${(v / total) * 100}%;background:${CATS[k].color}" title="${CATS[k].label} ${v}"></i>`).join('')}</div>`
      + `<div class="leg">${Object.entries(cnt).filter(([k, v]) => v || k !== 'raid').map(([k, v]) => `<span><b style="background:${CATS[k].color}"></b>${CATS[k].label} ${v}</span>`).join('')}</div>`
      + `<div class="leg" style="margin-top:4px"><span>💤 睡眠 ${sleep}</span><span>💫 気絶 ${down}</span><span>🧳 旅行中 ${travel}</span></div>`;
  }

  raidBoxes(filter = () => true) {
    const { sim } = this.app;
    const rs = sim.raids.filter(filter);
    if (!rs.length) return '';
    return `<h3>🐉 発生中のレイド</h3>` + rs.map((r) => {
      const left = Math.max(0, Math.ceil(r.until - sim.t));
      return `<div class="raidbox" data-w="${escapeHtml(r.world)}">${this.wchip(r.world)}<b>${escapeHtml(r.name)}</b>`
        + `<small>戦闘力 ${r.power} ・ 集まった戦力 ${Math.round(sim.raidPower(r))}（${sim.raidFighters(r).length}組）`
        + ` ・ ${r.phase === 'fight' ? '激闘中！' : `あと${left}分で開戦`}</small></div>`;
    }).join('');
  }

  charRow(c, note) {
    const d = this.app.sim.displayAct(c);
    return `<div class="row" data-c="${escapeHtml(c.id)}"><i class="ico" style="background:${CATS[d.cat]?.color}">${d.icon}</i>${escapeHtml(c.name)}<small>${note ?? escapeHtml(d.text)}</small></div>`;
  }

  renderInfo() {
    const { app } = this;
    let html;
    if (app.selected) html = this.charInfo(app.model.charById.get(app.selected));
    else if (app.view.kind === 'world') html = this.worldInfo(app.view.world);
    else if (app.view.kind === 'dan') html = this.danInfo(app.model.danById.get(app.view.danId));
    else html = this.universeInfo();
    if (html !== this.lastInfo) {
      const box = $('#info');
      const st = box.scrollTop;
      box.innerHTML = html;
      box.scrollTop = st;
      this.lastInfo = html;
    }
  }

  universeInfo() {
    const { model, sim } = this.app;
    return `<h2>🌌 宇宙</h2><div class="sub">世界団をクリックすると中の世界線が見られます</div>`
      + `<div class="kv"><span>世界団</span><span>${model.dans.length}</span><span>世界線</span><span>${model.worlds.size}</span><span>キャラクター</span><span>${model.chars.length}</span></div>`
      + this.raidBoxes()
      + `<h3>みんなの今</h3>${this.breakdown(model.chars)}`
      + `<h3>世界団</h3><div class="list">${model.dans.map((d) => {
        const n = model.chars.filter((c) => model.worlds.get(c.world)?.dan === d.id).length;
        return `<div class="row" data-dan="${escapeHtml(d.id)}"><i class="ico" style="background:${d.color}"></i>${escapeHtml(d.id)}（${escapeHtml(d.yomi)}）<small>世界線 ${d.worlds.length} ・ 滞在 ${n}人</small></div>`;
      }).join('')}</div>`
      + `<h3>旅をしているキャラ</h3><div class="list">${model.chars.filter((c) => c.trip && !c.partyLeader).map((c) => this.charRow(c, this.whereChip(c))).join('') || '<div class="sub">今はいません</div>'}</div>`
      + `<h3>ルール</h3><div class="mlog">1日 = 現実の20分。全員Lv50。ランク9以上は1日3回まで隣の世界線へ移動でき、ランク10以上は余裕のあるランク分だけ同じ汎異記号の仲間を連れていけます。ランク11以上は3日に1回だけ世界団を越えられます（その日は力が半減）。汎異記号の数字が大きい世界線ほど魔物が多く、魔物に負けると朝まで倒れます。汎異記号の数字が20以上の世界線にはまれにレイドボスが現れ、その世界線にいるキャラと隣の世界線のランク9以上が集まってみんなで戦います（勝っても負けてもボスは消滅）。</div>`;
  }

  danInfo(d) {
    const { model, sim } = this.app;
    const ws = d.worlds.map((id) => model.worlds.get(id)).sort((a, b) => a.letter.localeCompare(b.letter) || a.num - b.num);
    const here = model.chars.filter((c) => model.worlds.get(c.world)?.dan === d.id);
    const flying = model.chars.filter((c) => c.transit?.kind === 'line' && model.worlds.get(c.transit.from).dan === d.id);
    return `<h2>世界団 ${escapeHtml(d.id)}</h2><div class="sub">${escapeHtml(d.yomi)} ・ 球体をクリックで世界線へ</div>`
      + `<div class="kv"><span>世界線</span><span>${ws.length}</span><span>滞在中</span><span>${here.length}人</span></div>`
      + this.raidBoxes((r) => model.worlds.get(r.world).dan === d.id)
      + `<h3>みんなの今</h3>${this.breakdown(here)}`
      + (flying.length ? `<h3>🌀 移動中（${flying.length}組）</h3><div class="list">${flying.map((c) => this.charRow(c, `${this.wchip(c.transit.from)}→${this.wchip(c.transit.to)}`)).join('')}</div>` : '')
      + `<h3>世界線一覧</h3><div class="list">${ws.map((w) => {
        const n = sim.charsIn(w.id).length, m = sim.monsters.get(w.id).length;
        return `<div class="row" data-w="${escapeHtml(w.id)}">${this.wchip(w.id)}<small>${escapeHtml(w.id)} ・ 👤${n}${m ? ` 👾${m}` : ''}</small></div>`;
      }).join('')}</div>`;
  }

  worldInfo(w) {
    const { model, sim } = this.app;
    const present = sim.charsIn(w.id);
    const away = w.residents.map((id) => model.charById.get(id)).filter((c) => c.world !== w.id);
    const mons = sim.monsters.get(w.id);
    const boss = mons.filter((m) => m.boss).length;
    return `<h2>${escapeHtml(w.name)}</h2><div class="sub">${escapeHtml(w.yomi)}${w.sub ? ` ・ ${escapeHtml(w.sub)}` : ''}</div>`
      + `<div class="kv"><span>汎異記号</span><span>${escapeHtml(w.id)}</span><span>世界団</span><span>${escapeHtml(w.dan)}</span>`
      + `<span>魔物の多さ</span><span>${w.num === 0 ? 'なし（平和）' : `Lv.${w.num}`}</span><span>魔物</span><span>${mons.length}体${boss ? `（大魔物 ${boss}）` : ''}</span>`
      + `<span>住人</span><span>${w.residents.length}人</span><span>今いる</span><span>${present.length}人</span></div>`
      + this.raidBoxes((r) => r.world === w.id)
      + `<h3>隣の世界線</h3><div>${w.neighbors.map((id) => this.wchip(id, true)).join('') || '<span class="sub">なし</span>'}</div>`
      + `<h3>みんなの今</h3>${this.breakdown(present)}`
      + `<h3>ここにいるキャラ（${present.length}）</h3><div class="list">${present.sort((a, b) => b.rank - a.rank).map((c) => this.charRow(c, c.home !== w.id ? `🧳 ${escapeHtml(sim.displayAct(c).text)}` : undefined)).join('') || '<div class="sub">誰もいません</div>'}</div>`
      + (away.length ? `<h3>お出かけ中の住人（${away.length}）</h3><div class="list">${away.map((c) => this.charRow(c, this.whereChip(c))).join('')}</div>` : '');
  }

  charInfo(c) {
    const { model, sim, following } = this.app;
    const d = sim.displayAct(c);
    const home = model.worlds.get(c.home);
    const c1 = colorOf(c.colors[0], '#dddddd'), c2 = colorOf(c.colors[1], '#ffffff');
    const bg = c1 === 'rainbow' ? 'linear-gradient(135deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff,#c77dff)' : c1;
    const fg = c1 === 'rainbow' || luminance(c1) > 0.55 ? '#222' : '#fff';
    const avatar = c.img ? `<img src="${escapeHtml(c.img)}" alt="">`
      : `<div class="kj" style="background:${bg};color:${fg};border-color:${c2 === 'rainbow' ? '#fff' : c2}">${escapeHtml(c.kanji)}</div>`;
    const pw = Math.round(sim.power(c));
    const maxStat = 200;
    const party = c.partyLeader ? [model.charById.get(c.partyLeader)] : c.party.map((id) => model.charById.get(id));
    const danNext = c.rank >= 11 ? (sim.canDan(c) ? '可能' : `あと${3 - (sim.day - c.lastDan)}日`) : '不可（ランク11未満）';
    const moves = c.rank >= 9 ? `残り ${c.movesLeft} / 3 回` : party.length && c.partyLeader ? 'リーダーと同行中' : '不可（ランク9未満）';
    return `<button class="close" data-act="close" title="閉じる (Esc)">×</button>`
      + `<div class="avatar">${avatar}</div>`
      + `<h2>${escapeHtml(c.name)}</h2><div class="sub">${escapeHtml(c.yomi)} ・ No.${escapeHtml(c.id)}</div>`
      + `<div class="btns"><button class="btn ${following ? 'on' : ''}" data-act="follow">🎥 ${following ? '追跡中' : '追跡する'} (T)</button>`
      + (this.app.view.worldId !== c.world || sim.transitOf(c) ? `<button class="btn" data-c="${escapeHtml(c.id)}">📍 いる場所へ</button>` : '') + `</div>`
      + `<h3>いま</h3><div class="row" style="cursor:default"><i class="ico" style="background:${CATS[d.cat]?.color}">${d.icon}</i>${escapeHtml(d.text)}</div>`
      + `<div class="kv"><span>現在地</span><span>${this.whereChip(c, true)}${sim.transitOf(c) ? '（移動中）' : c.world !== c.home ? '（旅行中）' : '（家）'}</span>`
      + `<span>所属世界線</span><span>${this.wchip(c.home, true)} ${escapeHtml(c.hani)}</span><span>世界団</span><span>${escapeHtml(home.dan)}</span>`
      + `<span>ランク</span><span>${c.rank}</span><span>レベル</span><span>50</span>`
      + `<span>戦闘力</span><span>${pw}${c.halvedDay === sim.day ? '（世界団移動で半減中）' : ''}${c.trainDay === sim.day ? '（修行で1割増し）' : ''}</span>`
      + `<span>世界線移動</span><span>${moves}</span><span>世界団移動</span><span>${danNext}</span>`
      + (party.length ? `<span>${c.partyLeader ? 'リーダー' : '仲間'}</span><span>${party.map((p) => escapeHtml(p.name)).join('、')}</span>` : '')
      + (c.type ? `<span>タイプ</span><span>${escapeHtml(c.type)}</span>` : '')
      + (c.zoku ? `<span>族</span><span>${escapeHtml(c.zoku)}</span>` : '')
      + (c.seiryoku ? `<span>勢力</span><span>${escapeHtml(c.seiryoku)}</span>` : '')
      + `<span>仕事</span><span>${escapeHtml(c.job)}</span><span>趣味</span><span>${c.hobbies.map(escapeHtml).join('、')}</span>`
      + `<span>記録</span><span>魔物退治 ${c.kills} ・ レイド勝利 ${c.raidWins} ・ 気絶 ${c.downs} ・ 移動 ${c.travels} ・ 発見した宝物 ${c.treasures}</span></div>`
      + `<h3>種族値</h3><div class="bars">${c.stats.map((v, i) => `<span>${STAT_NAMES[i]}</span><span class="b"><i style="width:${Math.min(100, (v / maxStat) * 100)}%"></i></span><span>${v}</span>`).join('')}</div>`
      + `<h3>最近の出来事</h3><div class="mlog">${c.log.slice().reverse().map((e) => { const t = fmtTime(e.t); return `<div>${t.day}日目 ${t.hh}:${t.mm} ${escapeHtml(e.text)}</div>`; }).join('') || 'まだありません'}</div>`;
  }
}
