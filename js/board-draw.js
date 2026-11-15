import { seeded, hashStr } from './util.js?v=52';
import { MAP_W, MAP_H, TILES } from './board-map.js?v=52';

const drawCircle = (ctx, x, y, r, fill, stroke, weight = 1) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = weight; ctx.stroke(); }
};

function text(ctx, value, x, y, color, font = '700 14px system-ui', align = 'center') {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function staticBoard(world, board) {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const ctx = canvas.getContext('2d');
  const fill = ctx.createRadialGradient(490, 310, 40, 495, 330, 560);
  fill.addColorStop(0, world.theme.ground + '40');
  fill.addColorStop(0.65, '#172036');
  fill.addColorStop(1, '#090d1c');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const rng = seeded(hashStr('canvas:' + world.id));
  for (let i = 0; i < 185; i++) {
    drawCircle(ctx, rng.range(0, MAP_W), rng.range(0, MAP_H), rng.range(0.3, 1.5), i % 7 === 0 ? '#c8d6ef88' : '#c8d6ef35');
  }
  for (let i = 0; i < 13; i++) {
    ctx.beginPath();
    for (let j = 0; j <= 100; j++) {
      const a = j * Math.PI * 2 / 100;
      const ripple = 1 + 0.034 * Math.cos(a * 7 + i * 0.17) + 0.032 * Math.sin(a * 3 - i * 0.19);
      const x = 500 + (190 + i * 23) * Math.cos(a) * ripple;
      const y = 340 + (104 + i * 15.5) * Math.sin(a) * ripple;
      if (!j) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 3 === 0 ? '#c1d6ed29' : '#b4cbe713';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  const line = (a, b) => {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  };
  ctx.beginPath();
  for (const a of board.tiles) line(a, board.tiles[a.next]);
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7f9cc440';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#aec6ed65';
  ctx.stroke();
  ctx.beginPath();
  for (const a of board.tiles) for (const b of a.links) if (a.id < b) line(a, board.tiles[b]);
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = '#8aeddc9b';
  ctx.stroke();
  ctx.setLineDash([]);

  const font = '"M PLUS Rounded 1c","OC Jigmo",system-ui';
  text(ctx, world.id, 500, 304, '#a9c4e9', '800 15px ' + font);
  text(ctx, world.name, 500, 343, '#f4f6ff', '800 40px ' + font);
  text(ctx, world.yomi || world.dan, 500, 380, '#b4c6e1', '700 15px ' + font);
  return canvas;
}

export class BoardDrawing {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.locations = new Map();
  }

  draw(game, view, time) {
    const ctx = this.ctx, board = game.board(view.world), world = game.model.worlds.get(view.world);
    if (this.world !== world.id) {
      this.world = world.id;
      this.base = staticBoard(world, board);
      this.locations.clear();
    }
    if (view.battle) return this.battle(view, time);
    ctx.drawImage(this.base, 0, 0);
    const crystal = game.state.crystals[world.id];
    const options = view.offer?.kind === 'branch' ? view.offer.data : [];
    for (const id of options) {
      const a = board.tiles[view.tile], b = board.tiles[id];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffe487';
      ctx.stroke();
    }
    for (const tile of board.tiles) {
      const type = tile.id === crystal ? 'crystal' : tile.type, data = TILES[type], { x, y } = tile;
      if (data.pass) {
        const star = type === 'crystal';
        drawCircle(ctx, x, y, star ? 14 + Math.sin(time * 5) * 3 : 10, star ? '#77eaff39' : '#77eaff22');
        drawCircle(ctx, x, y, star ? 5 : 4, '#83efff', '#d3fbff', 1);
        const icon = star ? '◆' : type === 'shop' ? '▣' : '⟡';
        text(ctx, icon, x, y - 15, star ? '#e1fbff' : '#a5e8ff', '800 ' + (star ? 18 : 13) + 'px system-ui');
      } else {
        drawCircle(ctx, x, y + 2, 10, '#060b16a8');
        drawCircle(ctx, x, y, 9.8, data.color, '#c2d3ebbb', 1.25);
        text(ctx, data.label, x, y + 0.5, type === 'black' ? '#fff' : '#0b1428', '800 10px system-ui');
      }
    }
    options.forEach((id, i) => {
      const t = board.tiles[id];
      drawCircle(ctx, t.x, t.y, 16, null, '#ffe487', 3);
      drawCircle(ctx, t.x + 13, t.y - 13, 7.6, '#ffe487');
      text(ctx, i + 1, t.x + 13, t.y - 13, '#182034', '800 11px system-ui');
    });
    const players = game.state.players.filter((p) => p.world === view.world);
    players.forEach((p, i) => {
      const tile = board.tiles[p.tile];
      const together = players.filter((q) => q.tile === p.tile);
      const offset = (together.indexOf(p) - (together.length - 1) / 2) * 20;
      const target = { x: tile.x + offset, y: tile.y - 22 };
      const pos = this.locations.get(p.id) ?? target;
      pos.x += (target.x - pos.x) * 0.32;
      pos.y += (target.y - pos.y) * 0.32;
      this.locations.set(p.id, pos);
      drawCircle(ctx, pos.x, pos.y, p === view ? 13 : 11, p.color, p === view ? '#fff' : '#132344', 2);
      const token = p === view ? '◎' : p.bot ? 'C' + (i + 1) : '◇';
      text(ctx, token, pos.x, pos.y + 0.5, '#17213a', '900 11px system-ui');
      if (p.duel) text(ctx, '⚔', pos.x, pos.y - 21, '#ffb8d4', '800 17px system-ui');
    });
  }

  battle(p, time) {
    const ctx = this.ctx, b = p.battle, order = ['上段', '中央', '下段'];
    ctx.fillStyle = '#10152a';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    text(ctx, '魔物とのリアルタイム戦闘', 500, 82, '#f5e4fa', '800 30px system-ui');
    for (let lane = 0; lane < 3; lane++) {
      const y = 160 + lane * 143;
      ctx.fillStyle = lane === b.lane && b.burst < 2 ? '#692f50' : '#1c2643';
      ctx.fillRect(64, y, 872, 119);
      text(ctx, order[lane], 112, y + 21, '#a8bde1');
      if (lane === b.lane && b.burst < 2) text(ctx, '敵の大技まで ' + Math.max(0, b.burst).toFixed(1) + '秒', 490, y + 20, '#ffc5d7', '800 16px system-ui');
    }
    for (const [army, color] of [[b.allies, p.color], [b.enemies, '#ff8da6']]) {
      for (const u of army) {
        const x = 70 + u.x * 8.5, y = 220 + u.lane * 143 + (u.homeLane != null && u.homeLane !== u.lane ? 27 : 0);
        drawCircle(ctx, x, y, 22, u.hp <= 0 ? '#646274' : u.hit > 0 ? '#fff' : color, '#ffffff88', 2);
        ctx.fillStyle = '#090c18';
        ctx.fillRect(x - 31, y + 28, 62, 6);
        ctx.fillStyle = u.hp > 0 ? color : '#575869';
        ctx.fillRect(x - 31, y + 28, 62 * u.hp / u.max, 6);
        text(ctx, u.name, x, y - 31, '#f2f5ff', '800 14px system-ui');
      }
    }
    if (time < p.battleStart) text(ctx, '戦闘開始まで ' + (p.battleStart - time).toFixed(1) + '秒', 500, 625, '#ffe487', '800 22px system-ui');
    else text(ctx, '残り ' + Math.max(0, Math.ceil(28 - b.sec)) + '秒', 500, 625, '#b7c7e4', '800 21px system-ui');
  }
}
