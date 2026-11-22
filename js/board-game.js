import { danCost, hopCost, WORLD_RANK, DAN_RANK } from './model.js?v=55';
import { moodOf } from './audio.js?v=55';
import { pick, randInt, chance } from './util.js?v=55';
import { CORE_ITEMS, ITEM_IDS, ITEMS, canCarry } from './board-items.js?v=55';
import { TILES, makeBoard } from './board-map.js?v=55';
import { FORMATIONS, TECHS, startSkirmish, updateSkirmish, castTech } from './board-battle.js?v=55';
import { makeChallenge, newScore, pressChallenge, performance } from './board-minigames.js?v=55';

export const CRYSTAL_PRICE = 20;
export const PLAYER_COLORS = ['#ffe481', '#f08db4', '#91d5ff', '#c0a1ff', '#81e6ad', '#ffad82', '#b9b6ff', '#ddf696'];
export const levelCost = (p) => 6 + Math.floor(p.lv * 1.6);
const MAX_LEVEL = 30;
const STEP = 0.22;
const busy = (p) => p.rolling || p.offer || p.battle || p.mini || p.duel;

export class BoardGame {
  constructor(model) {
    this.model = model;
    this.boards = new Map();
    this.state = { v: 1, time: 0, players: [], crystals: {}, duels: [], log: [], serial: 0 };
  }

  board(id) {
    if (!this.boards.has(id)) this.boards.set(id, makeBoard(this.model.worlds.get(id)));
    return this.boards.get(id);
  }

  player(id) { return this.state.players.find((p) => p.id === id); }

  restore(state) {
    if (state?.v !== 1 || !Array.isArray(state.players) || !Array.isArray(state.duels)
      || !state.crystals || !Number.isFinite(state.time) || !state.players.every((p) =>
        this.model.charById.has(p.char) && this.model.worlds.has(p.world) && this.board(p.world).tiles[p.tile])) return false;
    this.state = state;
    return true;
  }

  defaultWorld(preferred) {
    return this.model.worlds.get(preferred) ?? this.model.worlds.get('A0') ?? this.model.worlds.values().next().value;
  }

  join(id, char, world, bot = false) {
    if (this.player(id) || this.state.players.length >= 12 || !this.model.charById.has(char)) return;
    const w = this.defaultWorld(world);
    const p = {
      id, char, world: w.id, tile: 0, previous: null, lastStop: 0, bot,
      color: PLAYER_COLORS[this.state.players.length % PLAYER_COLORS.length],
      coins: 30, crystals: 0, earned: 0, lv: 1, items: { double: 1 },
      techs: [], buffs: {}, turn: 0, cooldown: bot ? randInt(5, 12) : 0,
    };
    this.state.players.push(p);
    this.crystal(w.id);
    this.log(p, w.name + 'の盤面に参加した');
  }

  seedBots(world, avoid) {
    const sorted = this.model.chars.filter((c) => c.id !== avoid)
      .sort((a, b) => Number(b.home === world) - Number(a.home === world) || b.rank - a.rank);
    for (const i of [0, 1, 2]) {
      if (sorted[i]) this.join('cpu-' + i, sorted[i].id, world, true);
    }
  }

  leave(id) {
    const p = this.player(id);
    if (!p) return;
    const duel = this.state.duels.find((d) => d.id === p.duel);
    if (duel) this.resolveDuel(duel, duel.stake ? duel.ids.find((peer) => peer !== id) : null);
    this.state.players = this.state.players.filter((a) => a !== p);
  }

  get time() { return this.state.time; }
  char(p) { return this.model.charById.get(p.char); }

  log(p, message) {
    this.state.log.push({ id: ++this.state.serial, player: p.id, name: this.char(p).name, text: message });
    if (this.state.log.length > 30) this.state.log.shift();
  }

  crystal(world) {
    if (!this.board(world).tiles[this.state.crystals[world]]) this.moveCrystal(world);
    return this.state.crystals[world];
  }

  moveCrystal(world) {
    const old = this.state.crystals[world];
    const taken = new Set(this.state.players.filter((p) => p.world === world).map((p) => p.tile));
    const options = this.board(world).tiles.filter((t) => t.id !== old && t.id !== 0 && !taken.has(t.id) && t.type === 'blue');
    this.state.crystals[world] = pick(options)?.id ?? old;
  }

  tileType(world, tile) {
    return this.crystal(world) === tile ? 'crystal' : this.board(world).tiles[tile].type;
  }

  choices(p) {
    const tile = this.board(p.world).tiles[p.tile];
    // 逆走はアイテムの効果。分岐では直前の枝に引き返さない。
    const options = [...new Set([tile.next, ...tile.links, ...(p.buffs.reverse ? [tile.back] : [])])];
    const forward = options.filter((id) => id !== p.previous);
    return forward.length ? forward : options;
  }

  path(p, goal, start, reverse = !!p.buffs.reverse) {
    const tiles = this.board(p.world).tiles;
    const distances = new Map([[start, 0]]);
    const queue = [start];
    for (const id of queue) {
      if (id === goal) return distances.get(id);
      const t = tiles[id];
      for (const next of [t.next, ...t.links, ...(reverse ? [t.back] : [])]) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(id) + (TILES[this.tileType(p.world, next)].pass ? 0.35 : 1));
        queue.push(next);
      }
    }
    return 999;
  }

  travelOptions(p) {
    const world = this.model.worlds.get(p.world), group = this.model.danById.get(world.dan);
    const rank = this.char(p).rank;
    return [
      ...world.neighbors.map((id) => ({ id, kind: 'world', cost: hopCost(this.model.worlds, world.id, id), rank: WORLD_RANK })),
      ...(group.edge === world.id ? [
        ...group.neighbors.map((id) => {
          const to = this.model.danById.get(id);
          return { id: to.edge, kind: 'dan', cost: danCost(group, to), rank: DAN_RANK };
        }),
        ...group.blockedRoutes.map(({ id, cost }) => ({ id: this.model.danById.get(id).edge, kind: 'dan', cost, rank: DAN_RANK, blocked: true })),
      ] : []),
    ].map((o) => ({ ...o, allowed: !o.blocked && rank >= o.rank && p.crystals >= o.cost }));
  }

  stocks(world, tile) {
    const shop = this.board(world).tiles[tile]?.ring ?? 0;
    const extras = ITEM_IDS.filter((id) => !CORE_ITEMS.includes(id));
    const start = (tile + shop * 3 + Math.floor(this.time / 90)) % extras.length;
    return [...CORE_ITEMS, ...Array.from({ length: 9 }, (_, i) => extras[(start + i) % extras.length])];
  }

  price(p, amount) { return amount * (p.buffs.markup ? 2 : 1); }

  rewardItem(p, preferred) {
    const available = ITEM_IDS.filter((id) => canCarry(p.items, id));
    const id = preferred && available.includes(preferred) ? preferred : pick(available);
    if (!id) {
      this.log(p, '持ち物がいっぱいなので4コインを獲得');
      p.coins += 4;
      return;
    }
    p.items[id] = (p.items[id] || 0) + 1;
    this.log(p, ITEMS[id].name + 'を手に入れた');
  }

  take(p, id) {
    if (--p.items[id] === 0) delete p.items[id];
  }

  lose(p, coins, crystals = 0) {
    if (p.buffs.shield) {
      delete p.buffs.shield;
      this.log(p, 'おまもりで損失を回避');
      return;
    }
    const c = Math.min(p.coins, coins), x = Math.min(p.crystals, crystals);
    p.coins -= c;
    p.crystals -= x;
    if (c || x) this.log(p, (c ? c + 'コイン' : '') + (c && x ? 'と' : '') + (x ? x + 'クリスタル' : '') + 'を失った');
  }

  gainCrystal(p) { p.crystals++; p.earned++; }

  roll(p, dice = 1, upper = 10, exact = null, pay = false, mach = false, extra = 0) {
    if (busy(p) || p.cooldown > 0) return;
    const buff = p.buffs;
    if (buff.cursePass) {
      upper = Math.min(upper, 3);
      buff.cursePass--;
    }
    if (buff.fruitPass) {
      extra += 3;
      buff.fruitPass--;
    }
    const rolls = exact == null ? Array.from({ length: dice }, () => randInt(1, upper)) : [Math.min(upper, exact)];
    const total = rolls.reduce((a, b) => a + b, 0);
    if (pay) p.coins += total;
    else if (dice > 1 && rolls.every((value) => value === rolls[0])) {
      p.coins += dice * 4;
      this.log(p, 'ゾロ目ボーナス +' + (dice * 4) + 'コイン');
    }
    p.roll = rolls;
    p.remaining = Math.max(1, total + extra - (buff.load ? 2 : 0));
    delete buff.load;
    p.rolling = true;
    p.mach = mach;
    p.turn++;
    p.lastStop = p.tile;
    p.delay = 0.38;
    this.log(p, rolls.join(' ＋ ') + ' → ' + p.remaining + '歩' + (pay ? '・+' + total + 'コイン' : ''));
  }

  use(p, id, value) {
    if (!p.items[id] || busy(p) || p.cooldown > 0 || !Object.hasOwn(ITEMS, id)) return;
    const { name, effect, value: amount } = ITEMS[id], buffs = p.buffs;
    if (effect === 'exact' && (!Number.isInteger(value) || value < 1 || value > 10)) return;
    if (effect === 'soloDuel' && p.coins < amount) return;
    this.take(p, id);
    this.log(p, name + 'を使った');
    switch (effect) {
      case 'dice': return this.roll(p, amount);
      case 'paydice': return this.roll(p, amount, 10, null, true);
      case 'mach': return this.roll(p, 4, 10, null, false, true);
      case 'bonus': return this.roll(p, 1, 10, null, false, false, amount);
      case 'exact': return this.roll(p, 1, 10, value);
      case 'curlimit':
        if (amount === 2) buffs.shield = true;
        return this.roll(p, 1, amount);
      case 'charges':
        if (amount > 0) buffs.fruitPass = amount;
        else buffs.cursePass = -amount;
        return;
      case 'whistle': return this.moveCrystal(p.world);
      case 'shop': return this.offer(p, 'shop');
      case 'risk': return chance(0.5) ? (p.coins += 14) : this.lose(p, 7);
      case 'load': buffs.load = true; buffs.shield = true; return;
      case 'trap': buffs.trap = amount; return;
      case 'shield': buffs.shield = true; return;
      case 'reverse': buffs.reverse = true; return;
      case 'key': buffs.key = true; return;
      case 'markup': buffs.markup = true; return;
      case 'gift': p.coins += randInt(8, amount); return;
      case 'hidden':
        if (chance(0.12)) this.gainCrystal(p);
        else p.coins += randInt(12, 25);
        return;
      case 'bag': for (let i = 0; i < amount; i++) this.rewardItem(p); return;
      case 'soloDuel':
        p.coins -= amount;
        this.startMini(p, amount);
        return;
      default: return this.warp(p, effect);
    }
  }

  warp(p, effect) {
    const { tiles, rings } = this.board(p.world);
    const current = tiles[p.tile];
    const eligible = (t) => !TILES[this.tileType(p.world, t.id)].pass;
    const positions = tiles.filter(eligible);
    const nearest = (type) => tiles.filter((t) => t.type === type).reduce((a, b) =>
      this.path(p, a.id, p.tile) <= this.path(p, b.id, p.tile) ? a : b);
    const nearestPawn = this.state.players.find((q) => q !== p && q.world === p.world);
    let go;
    switch (effect) {
      case 'toCrystal': go = tiles[this.crystal(p.world)].back; break;
      case 'toShop': go = nearest('shop').back; break;
      case 'toGate': go = nearest('gate').back; break;
      case 'toPawn': go = nearestPawn ? tiles[nearestPawn.tile].back : pick(positions).id; break;
      case 'last': go = p.lastStop; break;
      case 'inner': go = pick(rings[2]); break;
      case 'tide': go = pick(rings[current.ring === 2 ? 0 : 2]); break;
      case 'outer':
      case 'opposite': {
        const ring = rings[effect === 'outer' ? 0 : current.ring];
        go = ring[(ring.indexOf(current.id) + Math.floor(ring.length / 2) + ring.length) % ring.length];
        break;
      }
      default: go = pick(positions).id;
    }
    while (!eligible(tiles[go])) go = tiles[go].back;
    p.tile = go;
    p.previous = null;
    p.landed = false;
  }

  offer(p, kind, data) {
    p.offer = { kind, data, until: this.time + (p.bot ? 0.3 : kind === 'shop' ? 40 : 23), token: ++this.state.serial };
  }

  step(p, choice) {
    const opts = this.choices(p);
    if (!opts.includes(choice)) return;
    if (opts.length > 1 && p.buffs.key) {
      p.remaining += 2;
      delete p.buffs.key;
    }
    p.previous = p.tile;
    p.tile = choice;
    const kind = this.tileType(p.world, p.tile);
    const pass = TILES[kind].pass;
    if (!pass) p.remaining--;
    p.delay = pass ? STEP * 0.75 : STEP;
    if (kind === 'gate' && this.travelOptions(p).length) this.offer(p, 'gate');
    else if (!p.mach && kind === 'crystal') this.offer(p, 'crystal');
    else if (!p.mach && kind === 'shop') this.offer(p, 'shop', this.stocks(p.world, p.tile));
  }

  finish(p) {
    p.rolling = false;
    p.cooldown = p.bot ? randInt(4, 8) : 0.9;
    p.landed = true;
    delete p.buffs.reverse;
    delete p.buffs.key;
    const kind = this.tileType(p.world, p.tile);
    if (p.mach) { p.mach = false; return; }
    if ((kind === 'red' || kind === 'black') && p.buffs.trap) {
      const value = p.buffs.trap;
      delete p.buffs.trap;
      if (value < 0) this.gainCrystal(p);
      else p.coins += value === 25 ? Math.min(25, Math.floor(p.coins / 2)) : value;
      this.log(p, 'トラップでマスの効果を反転した');
    } else if (kind === 'blue') { p.coins += 3; this.log(p, '青マス +3コイン'); }
    else if (kind === 'red') this.lose(p, 3);
    else if (kind === 'item' || (kind === 'lucky' && chance(0.5))) this.rewardItem(p);
    else if (kind === 'lucky') {
      const n = randInt(6, 14);
      p.coins += n;
      this.log(p, 'ラッキーマス +' + n + 'コイン');
    } else if (kind === 'unlucky') this.lose(p, randInt(3, 8), chance(0.15) ? 1 : 0);
    else if (kind === 'black') {
      if (chance(0.1)) this.log(p, '黒マスをすり抜けた！');
      else this.lose(p, randInt(10, 19), chance(0.78) ? 1 : 0);
    } else if (kind === 'event') this.startMini(p);
    else if (kind === 'enemy') {
      p.battle = startSkirmish(this.char(p), p.lv, this.model.worlds.get(p.world), p.turn);
      p.battleStart = this.time + (p.bot ? 0.4 : 1.8);
      this.log(p, '魔物とリアルタイム戦闘');
    }
    if (!busy(p)) this.detectDuel(p);
  }

  detectDuel(p) {
    if (p.coins < 1 || !p.landed) return;
    const other = this.state.players.find((q) => q !== p && !busy(q) && q.landed && q.coins > 0
      && p.world === q.world && p.tile === q.tile && !(p.bot && q.bot));
    if (!other) return;
    const id = ++this.state.serial;
    const owner = p.bot ? other : p;
    p.duel = other.duel = id;
    this.state.duels.push({ id, ids: [p.id, other.id], owner: owner.id, until: this.time + 16, stake: 0 });
    this.log(p, this.char(other).name + 'と同じマスで決闘！');
  }

  wager(duel, stake) {
    if (duel.stake) return;
    const players = duel.ids.map((id) => this.player(id));
    const max = Math.min(...players.map((p) => p.coins));
    if (!Number.isInteger(stake) || stake < 1 || stake > max) return;
    duel.stake = stake;
    const w = this.model.worlds.get(players[0].world);
    duel.game = makeChallenge(w, moodOf(w), randInt(0, 999999), this.time + 2.5, true);
    duel.scores = Object.fromEntries(players.map((p) => [p.id, newScore()]));
    for (const p of players) p.coins -= stake;
  }

  resolveDuel(duel, winner) {
    for (const id of duel.ids) {
      const p = this.player(id);
      if (!p) continue;
      delete p.duel;
      if (!winner) p.coins += duel.stake;
      if (id === winner) {
        p.coins += duel.stake * 2;
        this.log(p, '決闘に勝利！ +' + duel.stake * 2 + 'コイン');
      } else if (!winner && id === duel.owner) this.log(p, '引き分け。賭けコインを返却');
      p.cooldown = Math.max(p.cooldown, 0.9);
    }
    this.state.duels = this.state.duels.filter((d) => d !== duel);
  }

  startMini(p, wager = 0) {
    const w = this.model.worlds.get(p.world);
    const game = makeChallenge(w, moodOf(w), randInt(0, 999999), this.time + 2, wager > 0);
    p.mini = { game, score: newScore(), wager };
    this.log(p, game.name + 'に挑戦');
  }

  finishMini(p) {
    const { game, score, wager } = p.mini;
    const win = (p.bot ? chance(0.65) : performance(game, score) >= game.steps * (wager ? 61 : 52));
    delete p.mini;
    if (wager) {
      if (win) { p.coins += wager * 2; this.log(p, '決闘チャレンジ成功 +' + wager * 2 + 'コイン'); }
      else this.log(p, '決闘チャレンジ失敗');
    } else if (win) {
      p.coins += 12;
      this.log(p, game.name + '成功 +12コイン');
    } else this.lose(p, 4);
    this.detectDuel(p);
  }

  act(p, op, value, token) {
    if (!p) return;
    if (op === 'input') {
      const duel = this.state.duels.find((d) => d.id === p.duel);
      if (duel?.game) pressChallenge(duel.game, duel.scores[p.id], value, this.time);
      else if (p.mini) pressChallenge(p.mini.game, p.mini.score, value, this.time);
      return;
    }
    if (op === 'stake') {
      const duel = this.state.duels.find((d) => d.id === p.duel && d.owner === p.id && d.id === token);
      if (duel) this.wager(duel, value);
      return;
    }
    if (op === 'stance' && p.battle && Object.hasOwn(FORMATIONS, value)) p.battle.stance = value;
    if (op === 'cast' && p.battle && p.techs.includes(value) && this.time >= p.battleStart) castTech(p.battle, value);
    if (op === 'level' && !p.duel && p.lv < MAX_LEVEL && p.coins >= levelCost(p)) {
      p.coins -= levelCost(p);
      p.lv++;
      this.log(p, 'Lv' + p.lv + 'に育成');
    }
    const tech = op === 'learn' && Object.hasOwn(TECHS, value) && TECHS[value];
    if (tech && !p.duel && p.lv >= tech.lv && !p.techs.includes(value) && p.crystals >= tech.cost) {
      p.crystals -= tech.cost;
      p.techs.push(value);
      this.log(p, tech.name + 'を習得');
    }
    if (op === 'roll') this.roll(p);
    if (op === 'use') this.use(p, value?.id, value?.die);
    if (op === 'discard' && !busy(p) && Object.hasOwn(ITEMS, value) && p.items[value]) this.take(p, value);
    if (p.offer && p.offer.token === token) this.answer(p, op, value);
  }

  answer(p, op, value) {
    const offer = p.offer;
    if (op === 'skip') { delete p.offer; return; }
    if (offer.kind === 'branch' && op === 'path' && offer.data.includes(value)) {
      delete p.offer;
      return this.step(p, value);
    }
    if (offer.kind === 'shop' && op === 'buy' && (offer.data ?? this.stocks(p.world, p.tile)).includes(value) && canCarry(p.items, value)) {
      const price = this.price(p, ITEMS[value].price);
      if (p.coins < price) return;
      p.coins -= price;
      delete p.buffs.markup;
      this.rewardItem(p, value);
      return;
    }
    if (offer.kind === 'crystal' && op === 'crystal' && p.tile === this.crystal(p.world)) {
      const price = this.price(p, CRYSTAL_PRICE);
      if (p.coins < price) return;
      p.coins -= price;
      delete p.buffs.markup;
      delete p.offer;
      this.gainCrystal(p);
      this.moveCrystal(p.world);
      this.log(p, 'クリスタル獲得！ 購入場所が移動した');
      return;
    }
    if (offer.kind === 'gate' && op === 'travel') {
      const gate = this.travelOptions(p).find((o) => o.id === value && o.allowed);
      if (!gate) return;
      p.crystals -= gate.cost;
      p.world = gate.id;
      p.tile = 0;
      p.previous = null;
      p.delay = 0.55;
      delete p.offer;
      this.crystal(p.world);
      this.log(p, this.model.worlds.get(p.world).name + 'へ移動 −' + gate.cost + 'pt');
    }
  }

  autoOffer(p) {
    const { kind, data } = p.offer;
    if (kind === 'branch') {
      const goal = this.crystal(p.world);
      const route = [...data].sort((a, b) => this.path(p, goal, a) - this.path(p, goal, b));
      return this.answer(p, 'path', p.coins >= CRYSTAL_PRICE || !p.bot ? route[0] : pick(route));
    }
    if (p.bot && kind === 'crystal') this.answer(p, 'crystal');
    if (p.bot && kind === 'shop' && p.coins >= 27 && chance(0.4)) this.answer(p, 'buy', pick(['double', 'triple', 'exact', 'fruit']));
    if (p.bot && kind === 'gate' && p.crystals >= 4 && chance(0.2)) {
      const gate = pick(this.travelOptions(p).filter((o) => o.allowed));
      if (gate) this.answer(p, 'travel', gate.id);
    }
    delete p.offer;
  }

  update(dt) {
    this.state.time += dt;
    for (const duel of [...this.state.duels]) {
      if (!duel.stake) {
        if (this.time >= duel.until) {
          const max = Math.min(...duel.ids.map((id) => this.player(id).coins));
          if (max > 0) this.wager(duel, Math.min(max, 5));
          else this.resolveDuel(duel, null);
        }
        continue;
      }
      const game = duel.game;
      if (this.time < game.start + game.limit && !Object.values(duel.scores).every((score) => score.done)) continue;
      const result = duel.ids.map((id) => [id, this.player(id).bot ? randInt(125, game.steps * 86) : performance(game, duel.scores[id])])
        .sort((a, b) => b[1] - a[1]);
      this.log(this.player(result[0][0]), game.name + ' ' + result.map((entry) => entry[1] + '点').join(' 対 '));
      this.resolveDuel(duel, result[0][1] === result[1][1] ? null : result[0][0]);
    }

    for (const p of this.state.players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.duel) continue;
      if (p.battle) {
        if (this.time < p.battleStart) continue;
        if (p.bot) {
          p.battle.stance = p.battle.burst < 0.85 ? 'split' : 'push';
          if (p.techs.length && p.battle.tech <= 0) castTech(p.battle, p.techs.at(-1));
        }
        const result = updateSkirmish(p.battle, dt);
        if (result) {
          delete p.battle;
          if (result === 'win') { p.coins += 11; this.log(p, '戦闘勝利 +11コイン'); }
          else this.lose(p, 7);
          this.detectDuel(p);
        }
        continue;
      }
      if (p.mini) {
        if (p.mini.score.done || this.time >= p.mini.game.start + p.mini.game.limit) this.finishMini(p);
        continue;
      }
      if (p.offer) {
        if (p.offer.kind === 'crystal' && this.crystal(p.world) !== p.tile) delete p.offer;
        else if (this.time >= p.offer.until) this.autoOffer(p);
        continue;
      }
      if (p.rolling) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        if (p.remaining <= 0) { this.finish(p); continue; }
        const options = this.choices(p);
        if (options.length > 1) this.offer(p, 'branch', options);
        else this.step(p, options[0]);
      } else if (p.bot && p.cooldown <= 0) {
        if (p.coins >= 25 + levelCost(p) && chance(0.35)) this.act(p, 'level');
        const tech = Object.keys(TECHS).find((id) => p.lv >= TECHS[id].lv && !p.techs.includes(id) && p.crystals >= TECHS[id].cost + 1);
        if (tech) this.act(p, 'learn', tech);
        const item = ['double', 'triple', 'fruit', 'exact'].find((id) => p.items[id] > 0);
        if (item && chance(0.45)) this.use(p, item, 6);
        else this.roll(p);
      }
    }
  }
}
