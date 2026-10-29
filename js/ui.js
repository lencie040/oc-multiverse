// 画面まわり (パンくず・時計・検索・出来事・情報パネル)
import { CATS } from './sim.js?v=14';
import { prioOf } from './director.js?v=14';
import { fmtTime, escapeHtml, colorOf, luminance } from './util.js?v=14';

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
    $('#tg-director').addEventListener('click', () => app.director.toggle());
    $('#tg-news').addEventListener('click', () => this.showNews(true));
    $('#tg-toast').addEventListener('change', (e) => { app.settings.toasts = e.target.checked; });
    $('#news').addEventListener('click', (e) => { if (e.target.id === 'news' || e.target.closest('.x')) $('#news').hidden = true; });
    this.shownReport = app.sim.report?.id ?? 0;
    // 音
    const snd = app.sound;
    $('#vol-bgm').value = Math.round(snd.bgmVol * 100);
    $('#vol-se').value = Math.round(snd.seVol * 100);
    $('#tg-sound').textContent = snd.muted ? '🔇' : '🔊';
    $('#tg-sound').addEventListener('click', () => this.toggleMute());
    $('#vol-bgm').addEventListener('input', (e) => snd.setVolumes({ bgm: e.target.value / 100 }));
    $('#vol-se').addEventListener('input', (e) => { snd.setVolumes({ se: e.target.value / 100 }); snd.play('click'); });
    document.addEventListener('click', (e) => { if (e.target.closest('button, .row, .ev, .r, a.wchip, .raidbox, .toast')) snd.play('click'); });
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
    const tr = this.app.sound.trackName;
    if (tr !== this.lastTrack) { $('#track').textContent = tr; this.lastTrack = tr; }
    const rep = this.app.sim.report;
    if (rep && rep.id !== this.shownReport && this.app.settings.news) this.showNews();
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
    if (this.app.settings.toasts && prioOf(e) >= 60) this.toast(e);
    if (!this.evMatch(e)) return;
    const box = $('#evlist');
    if (box.firstElementChild && !box.firstElementChild.dataset.w) box.innerHTML = '';
    box.insertAdjacentHTML('afterbegin', this.evHtml(e));
    while (box.children.length > 150) box.lastElementChild.remove();
  }

  toggleMute() {
    const snd = this.app.sound;
    snd.init();
    snd.setVolumes({ muted: !snd.muted });
    $('#tg-sound').textContent = snd.muted ? '🔇' : '🔊';
  }

  // ---------- 実況テロップ ----------
  toast(e) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (prioOf(e) >= 88 ? ' big' : '');
    el.innerHTML = `${this.wchip(e.world)}${escapeHtml(e.text)}`;
    el.addEventListener('click', () => {
      if (e.ids[0]) this.app.selectChar(e.ids[0], { focus: true });
      else this.app.openWorld(e.world);
    });
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6500);
  }
  caption(text) {
    const el = $('#caption');
    el.hidden = !text;
    if (text) el.textContent = text;
  }

  // ---------- 日報 ----------
  showNews(force = false) {
    const r = this.app.sim.report;
    const box = $('#news');
    if (!r) {
      if (force) { box.innerHTML = `<div class="paper"><button class="x">×</button><div class="mast"><h1>多元日報</h1></div><p>まだ日報はありません。朝6時に前の日の出来事がまとまります。</p></div>`; box.hidden = false; }
      return;
    }
    this.shownReport = r.id;
    const { model } = this.app;
    const wn = (id) => model.worlds.get(id)?.name ?? id;
    const rare = r.treasures.filter((x) => x.rare);
    const head = r.raidsWon.length ? `号外！ レイドボス「${r.raidsWon[0].name}」を${r.raidsWon[0].n}人で撃破！`
      : rare.length ? `大発見！ ${rare[0].name}が「${rare[0].item}」を発見`
      : r.raidsLost.length ? `レイドボス「${r.raidsLost[0].name}」の猛威…${r.raidsLost[0].n}人が倒れる`
      : r.bestFriends.length ? `${r.bestFriends[0][0]}と${r.bestFriends[0][1]}が親友に`
      : r.danJumps.length ? `${r.danJumps[0].name}、世界団を越える`
      : r.mvp.length ? `魔物退治のMVPは${r.mvp[0].name}（${r.mvp[0].n}体）` : '今日も多元宇宙は平和でした';
    const li = (arr, f) => arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<ul><li>なし</li></ul>';
    box.innerHTML = `<div class="paper"><button class="x" title="閉じる">×</button>`
      + `<div class="mast"><h1>多元日報</h1><small>${r.day + 1}日目の出来事（朝6時〜翌朝6時）</small></div>`
      + `<div class="head">${escapeHtml(head)}</div>`
      + `<div class="nums"><div><b>${r.battles}</b><span>魔物退治</span></div><div><b>${r.downs}</b><span>気絶</span></div><div><b>${r.travels}</b><span>世界線移動</span></div><div><b>${r.camps}</b><span>野宿</span></div><div><b>${r.duels}</b><span>撃退騒ぎ</span></div></div>`
      + `<h4>⚔️ 魔物退治MVP</h4>${li(r.mvp, (m, i) => `${escapeHtml(m.name)} … ${m.n}体`)}`
      + `<h4>🐉 レイド</h4>${li([...r.raidsWon.map((x) => ({ ...x, win: true })), ...r.raidsLost], (x) => `${escapeHtml(wn(x.world))}の「${escapeHtml(x.name)}」… ${x.win ? `${x.n}人で撃破🏆` : `${x.n}人が敗北💥`}`)}`
      + `<h4>💕 新しい親友</h4>${li(r.bestFriends, ([a, b]) => `${escapeHtml(a)} と ${escapeHtml(b)}`)}`
      + `<h4>💎 見つかった宝物</h4>${li([...rare, ...r.treasures.filter((x) => !x.rare)].slice(0, 8), (x) => `${x.rare ? '💎' : '✨'} ${escapeHtml(x.name)}「${escapeHtml(x.item)}」`)}`
      + `<h4>🌌 世界団を越えたキャラ</h4>${li(r.danJumps, (x) => `${escapeHtml(x.name)}（${escapeHtml(wn(x.from))} → ${escapeHtml(wn(x.to))}）`)}`
      + `</div>`;
    box.hidden = false;
    this.app.sound.play('paper');
    // おまかせ観戦中は少し読んだら自動で閉じる
    clearTimeout(this.newsTimer);
    if (this.app.director.on && !force) this.newsTimer = setTimeout(() => { box.hidden = true; }, 15000);
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

  rankings() {
    const { model, sim } = this.app;
    const boards = [
      ['⚔️ 魔物退治', (c) => c.kills, '体'], ['🧳 世界線移動', (c) => c.travels, '回'], ['💎 宝物', (c) => c.treasures, '個'],
      ['🐉 レイド勝利', (c) => c.raidWins, '回'], ['💕 友達の数', (c) => sim.friendCount(c), '人'],
    ];
    const medal = ['🥇', '🥈', '🥉'];
    return `<h3>🏆 ランキング</h3><div class="rank-grid">${boards.map(([title, f, unit]) => {
      const top = model.chars.map((c) => [c, f(c)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return `<div class="rk"><b>${title}</b>${top.map(([c, v], i) => `<div class="row" data-c="${escapeHtml(c.id)}"><span class="medal">${medal[i]}</span>${escapeHtml(c.name)}<small>${v}${unit}</small></div>`).join('') || '<div class="sub">まだいません</div>'}</div>`;
    }).join('')}</div>`;
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
      + this.rankings()
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

  friendList(c) {
    const { model, sim } = this.app;
    const rel = Object.entries(c.friends).filter(([, v]) => v >= 5 || v <= -10).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!rel.length) return '';
    return `<h3>💕 なかま関係</h3><div class="list">${rel.map(([id, v]) => {
      const o = model.charById.get(id);
      const lbl = sim.relationLabel(v);
      const icon = v >= 25 ? '💕' : v >= 10 ? '🤝' : v <= -10 ? '⚡' : '🙂';
      return `<div class="row" data-c="${escapeHtml(id)}"><span class="medal">${icon}</span>${escapeHtml(o.name)}<small>${lbl}（${v}）</small></div>`;
    }).join('')}</div>`;
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
      + this.friendList(c)
      + `<h3>種族値</h3><div class="bars">${c.stats.map((v, i) => `<span>${STAT_NAMES[i]}</span><span class="b"><i style="width:${Math.min(100, (v / maxStat) * 100)}%"></i></span><span>${v}</span>`).join('')}</div>`
      + `<h3>最近の出来事</h3><div class="mlog">${c.log.slice().reverse().map((e) => { const t = fmtTime(e.t); return `<div>${t.day}日目 ${t.hh}:${t.mm} ${escapeHtml(e.text)}</div>`; }).join('') || 'まだありません'}</div>`;
  }
}
