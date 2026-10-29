// BGM と効果音。音声ファイルは使わず Web Audio API でその場で作曲・合成する
import { hashStr, seeded } from './util.js?v=12';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];

// 曲調: scale / root(MIDI) / テンポ / コード進行(度数) / 各パート
export const MOODS = {
  space: { name: '星の海', scale: LYDIAN, root: 50, bpm: 58, prog: [0, 4, 5, 3], lead: 'bell', density: 0.22, pad: 'soft', bass: 'drone', drums: null, delay: 0.55 },
  calm: { name: 'のどかな日常', scale: MAJOR, root: 60, bpm: 96, prog: [0, 5, 3, 4], lead: 'triangle', density: 0.55, pad: 'soft', bass: 'root', drums: 'soft', delay: 0.25 },
  cute: { name: 'あまいメロディ', scale: MAJOR, root: 65, bpm: 116, prog: [0, 3, 4, 0], lead: 'musicbox', density: 0.6, pad: null, bass: 'pizz', drums: 'soft', delay: 0.3 },
  nature: { name: '森のささやき', scale: MAJOR, root: 67, bpm: 84, prog: [0, 3, 0, 4], lead: 'flute', density: 0.45, pad: 'soft', bass: 'root', drums: null, delay: 0.35 },
  ocean: { name: '波と太陽', scale: MAJOR, root: 69, bpm: 104, prog: [0, 4, 5, 3], lead: 'marimba', density: 0.6, pad: null, bass: 'eighth', drums: 'shaker', delay: 0.2 },
  dark: { name: '闇のささやき', scale: MINOR, root: 57, bpm: 68, prog: [0, 5, 3, 4], lead: 'sine', density: 0.3, pad: 'dark', bass: 'drone', drums: 'slow', delay: 0.5 },
  spooky: { name: 'ハロウィンの夜', scale: HARM_MINOR, root: 64, bpm: 124, prog: [0, 5, 3, 4], lead: 'pluck', density: 0.65, pad: null, bass: 'oompah', drums: 'soft', delay: 0.2 },
  fire: { name: '灼熱の大地', scale: PHRYGIAN, root: 62, bpm: 132, prog: [0, 1, 0, 6], lead: 'saw', density: 0.55, pad: 'dark', bass: 'eighth', drums: 'full', delay: 0.15 },
  ice: { name: '凍てつく結晶', scale: LYDIAN, root: 64, bpm: 76, prog: [0, 1, 4, 5], lead: 'bell', density: 0.35, pad: 'soft', bass: 'root', drums: null, delay: 0.6 },
  future: { name: '電子の街', scale: DORIAN, root: 60, bpm: 120, prog: [0, 3, 6, 4], lead: 'square', density: 0.5, pad: 'soft', bass: 'eighth', drums: 'electro', arp: true, delay: 0.3 },
  holy: { name: '祈りの光', scale: MAJOR, root: 63, bpm: 64, prog: [0, 3, 4, 0], lead: 'bell', density: 0.3, pad: 'choir', bass: 'drone', drums: null, delay: 0.55 },
  ancient: { name: '古の砂', scale: HIJAZ, root: 62, bpm: 90, prog: [0, 1, 0, 6], lead: 'pluck', density: 0.5, pad: 'dark', bass: 'root', drums: 'hand', delay: 0.3 },
  music: { name: 'リズムの国', scale: MIXO, root: 67, bpm: 128, prog: [0, 6, 3, 4], lead: 'square', density: 0.6, pad: null, bass: 'eighth', drums: 'full', delay: 0.2 },
  battle: { name: 'レイドバトル！', scale: MINOR, root: 60, bpm: 150, prog: [0, 5, 6, 4], lead: 'saw', density: 0.7, pad: 'dark', bass: 'eighth', drums: 'full', arp: true, delay: 0.15 },
};

const BY_NAME = {
  現代: 'calm', 現代EX: 'future', 現代IF: 'calm', 古代: 'ancient', 古代EX: 'ancient', 呪界: 'ancient', 旧界: 'ancient', 憶界: 'ancient', 耗界: 'ancient', 骨界: 'ancient', 紀界: 'ancient', 片界: 'ancient',
  零界: 'ice', 零界EX: 'ice', 氷界: 'ice', 銀界: 'ice', 晶界: 'ice', 鏡界: 'ice',
  未来: 'future', 未来EX: 'future', 機界: 'future', 枢界: 'future', 鉄界: 'future', 銅界: 'future', 数界: 'future', 式界: 'future', 線界: 'future', 脳界: 'future', 宇宙A: 'space',
  魔界: 'dark', 闇界: 'dark', 黒界: 'dark', 冥界: 'dark', 幽界: 'dark', 暗界: 'dark', 暴界: 'fire', 乖界: 'dark', 愴界: 'dark', 異界: 'dark', 虚界: 'space', 宵界: 'dark', 夜界: 'space', 隔界: 'dark', 儡界: 'spooky',
  橙界: 'spooky', 炎界: 'fire', 灼界: 'fire', 火界: 'fire', 脈界: 'fire',
  天界: 'holy', 聖界: 'holy', 薥界: 'holy', 月界: 'space', 夢界: 'space', 妖星: 'space', 妖星EX: 'space', 妖星SP: 'space',
  飴界: 'cute', 菓界: 'cute', 菓界SP: 'cute', 菓界IF: 'cute', 汽界: 'cute', 幼界: 'cute', 幼界IF: 'cute', 姫界: 'cute', 恋界: 'cute', 心界: 'cute', 桃界: 'cute', 綿界: 'cute', 孕界: 'cute', 孕界IF: 'cute', 蜜界: 'cute', 飾界IF: 'cute', 使界: 'cute', 七界: 'cute', 彩界: 'cute',
  然界: 'nature', 鳥界: 'nature', 種界: 'nature', 翠界: 'nature', 風界: 'nature', 飛界: 'nature', 初界: 'nature', 䟖界: 'nature', 虎界: 'nature', 鴢界: 'nature',
  海界: 'ocean', 滴界: 'ocean', 南界: 'ocean', 夏界: 'ocean',
  音界: 'music', 轟界: 'music', 筋界: 'music', 団界: 'music', 劇界: 'music', 戯界: 'music', 球界: 'music', 球界EX: 'music',
};
const BY_PARTICLE = { ember: 'fire', snow: 'ice', wisp: 'dark', star: 'space', bubble: 'cute', petal: 'cute', leaf: 'nature', spark: 'future', note: 'music', rain: 'ocean', dust: 'ancient', paper: 'calm', heart: 'cute', ash: 'dark' };
export const moodOf = (w) => BY_NAME[w.name] || BY_PARTICLE[w.theme.particle] || 'calm';

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const SAVE_KEY = 'oc-multiverse-audio';

export class Sound {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { /* 保存できない環境 */ }
    this.muted = saved.muted ?? false;
    this.bgmVol = saved.bgmVol ?? 0.55;
    this.seVol = saved.seVol ?? 0.7;
    this.ctx = null;
    this.mood = null;
    this.night = false;
    this.last = {};
    // 自動再生の制限があるので、最初の操作で音を出し始める
    const start = () => { this.init(); removeEventListener('pointerdown', start); removeEventListener('keydown', start); };
    addEventListener('pointerdown', start);
    addEventListener('keydown', start);
    // タブが隠れている・最小化されている間は音を止める
    document.addEventListener('visibilitychange', () => this.syncVisibility());
    addEventListener('pagehide', () => this.ctx?.suspend());
  }

  syncVisibility() {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend();
    else this.ctx.resume();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.bgmBus = ctx.createGain();
    this.bgmFade = ctx.createGain();
    this.bgmTone = ctx.createBiquadFilter();
    this.bgmTone.type = 'lowpass';
    this.bgmTone.frequency.value = 12000;
    this.bgmFade.connect(this.bgmTone).connect(this.bgmBus).connect(this.master);
    this.seBus = ctx.createGain();
    this.seBus.connect(this.master);
    // やまびこ (ディレイ)
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.33;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.35;
    this.delaySend = ctx.createGain();
    this.delaySend.connect(this.delay).connect(this.fb).connect(this.delay);
    this.delay.connect(this.bgmFade);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    if (document.hidden) ctx.suspend();
    if (this.pendingMood) this.setMood(...this.pendingMood);
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ muted: this.muted, bgmVol: this.bgmVol, seVol: this.seVol })); } catch (e) { /* 保存できない環境 */ }
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.bgmBus.gain.setTargetAtTime(this.bgmVol * 0.5, t, 0.05);
    this.seBus.gain.setTargetAtTime(this.seVol * 0.6, t, 0.05);
  }
  setVolumes({ muted, bgm, se }) {
    if (muted !== undefined) this.muted = muted;
    if (bgm !== undefined) this.bgmVol = bgm;
    if (se !== undefined) this.seVol = se;
    this.applyVolumes();
    this.save();
  }

  // ---------- BGM ----------
  setMood(key, night = false, seedKey = key) {
    if (!this.ctx) { this.pendingMood = [key, night, seedKey]; return; }
    if (key === this.mood && night === this.night && seedKey === this.seedKey) return;
    const t = this.ctx.currentTime;
    const first = !this.mood;
    this.bgmFade.gain.cancelScheduledValues(t);
    this.bgmFade.gain.setTargetAtTime(0, t, 0.15);
    const apply = () => {
      this.mood = key;
      this.night = night;
      this.seedKey = seedKey;
      const m = MOODS[key];
      this.cfg = { ...m, bpm: night && key !== 'battle' ? m.bpm * 0.85 : m.bpm, density: night && key !== 'battle' ? m.density * 0.6 : m.density };
      this.rng = seeded(hashStr('bgm:' + seedKey));
      this.motifs = new Map();
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      const now = this.ctx.currentTime;
      this.bgmTone.frequency.setTargetAtTime(night ? 2200 : 12000, now, 0.3);
      this.delaySend.gain.value = m.delay;
      this.bgmFade.gain.setTargetAtTime(1, now, 0.4);
    };
    if (first) apply();
    else { clearTimeout(this.moodTimer); this.mood = key; this.night = night; this.seedKey = seedKey; this.moodTimer = setTimeout(apply, 550); }
  }
  get trackName() {
    const m = MOODS[this.mood];
    return m ? `♪ ${m.name}${this.night && this.mood !== 'battle' ? '（夜）' : ''}` : '';
  }

  schedule() {
    if (!this.cfg || this.ctx.state !== 'running') return;
    const sp16 = 60 / this.cfg.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime, sp16);
      this.nextTime += sp16;
      this.step++;
    }
  }

  chordAt(bar) {
    const c = this.cfg;
    const deg = c.prog[bar % c.prog.length];
    return [0, 2, 4].map((k) => this.degree(deg + k));
  }
  degree(d) {
    const s = this.cfg.scale;
    const oct = Math.floor(d / s.length);
    return this.cfg.root + s[((d % s.length) + s.length) % s.length] + 12 * oct;
  }
  // 4小節ごとのフレーズを作り、2回くり返してから作り直す
  motif(bar) {
    const key = Math.floor(bar / 8) * 4 + (bar % 4);
    if (this.motifs.has(key)) return this.motifs.get(key);
    const c = this.cfg, r = this.rng;
    const deg = c.prog[bar % c.prog.length];
    const notes = [];
    let cur = deg + 7 + r.int(0, 2) * 2;
    for (let i = 0; i < 8; i++) {
      const strong = i % 4 === 0;
      if (!strong && r() > c.density) { notes.push(null); continue; }
      if (strong) cur = deg + 7 + [0, 2, 4][r.int(0, 2)];
      else cur += r.pick([-2, -1, -1, 1, 1, 2]);
      cur = Math.max(deg + 3, Math.min(deg + 13, cur));
      notes.push({ d: cur, len: r() < 0.25 ? 2 : 1 });
    }
    this.motifs.set(key, notes);
    if (this.motifs.size > 24) this.motifs.delete(this.motifs.keys().next().value);
    return notes;
  }

  playStep(step, t, sp16) {
    const c = this.cfg;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = this.chordAt(bar);
    const barLen = sp16 * 16;
    if (s === 0 && c.pad) for (const n of chord) this.pad(n, t, barLen, c.pad);
    // ベース
    const root = chord[0] - 24;
    if (c.bass === 'drone' && s === 0) this.tone(root, t, barLen * 0.95, 'sine', 0.22, 0.3, 0.5);
    if (c.bass === 'root' && (s === 0 || s === 8)) this.tone(root, t, sp16 * 6, 'triangle', 0.28, 0.01, 0.15);
    if (c.bass === 'eighth' && s % 2 === 0) this.tone(s % 8 === 6 ? root + 7 : root, t, sp16 * 1.6, 'sawtooth', 0.12, 0.005, 0.05, 900);
    if (c.bass === 'pizz' && s % 4 === 0) this.tone(s % 8 === 4 ? root + 7 : root, t, sp16 * 1.2, 'triangle', 0.25, 0.003, 0.08);
    if (c.bass === 'oompah' && s % 4 === 0) this.tone(s % 8 === 4 ? chord[2] - 12 : root, t, sp16 * 1.5, 'triangle', 0.25, 0.003, 0.06);
    // メロディ (8分音符)
    if (s % 2 === 0) {
      const n = this.motif(bar)[s / 2];
      if (n) this.lead(this.degree(n.d), t, sp16 * 2 * n.len, c.lead);
    }
    // アルペジオ
    if (c.arp && !this.night) this.tone(chord[s % 3] + 12, t, sp16 * 0.8, 'square', 0.035, 0.002, 0.04, 2400);
    // ドラム
    const dr = this.night && this.mood !== 'battle' ? (c.drums ? 'slow' : null) : c.drums;
    if (dr === 'soft') { if (s === 0 || s === 8) this.kick(t, 0.5); if (s % 4 === 2) this.hat(t, 0.15); }
    if (dr === 'slow') { if (s === 0) this.kick(t, 0.45); }
    if (dr === 'shaker') { if (s === 0 || s === 10) this.kick(t, 0.45); this.hat(t, s % 2 ? 0.08 : 0.16); }
    if (dr === 'hand') { if (s === 0 || s === 6 || s === 10) this.kick(t, 0.35, 120); if (s === 4 || s === 12) this.snare(t, 0.2, true); }
    if (dr === 'full') { if (s === 0 || s === 6 || s === 8) this.kick(t, 0.7); if (s === 4 || s === 12) this.snare(t, 0.4); if (s % 2 === 0) this.hat(t, 0.2); }
    if (dr === 'electro') { if (s % 4 === 0) this.kick(t, 0.6); if (s === 4 || s === 12) this.snare(t, 0.3); if (s % 4 === 2) this.hat(t, 0.25); }
  }

  // ---------- 楽器 ----------
  tone(midi, t, dur, type, gain, attack = 0.01, release = 0.1, cutoff = 0, dest = this.bgmFade, detune = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq(midi), t);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur), release / 3);
    let node = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = o.connect(f);
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + release + 0.1);
    return g;
  }
  lead(midi, t, dur, kind) {
    const send = (g) => g.connect(this.delaySend);
    switch (kind) {
      case 'bell':
        send(this.tone(midi + 12, t, 0.05, 'sine', 0.16, 0.003, 1.4));
        this.tone(midi + 12, t, 0.05, 'sine', 0.04, 0.003, 0.5, 0, this.bgmFade, 1240);
        break;
      case 'musicbox':
        send(this.tone(midi + 12, t, 0.04, 'triangle', 0.16, 0.002, 0.7));
        this.tone(midi + 24, t, 0.03, 'sine', 0.04, 0.002, 0.3);
        break;
      case 'marimba':
        send(this.tone(midi, t, 0.03, 'sine', 0.24, 0.002, 0.35));
        this.tone(midi + 24, t, 0.02, 'sine', 0.05, 0.002, 0.08);
        break;
      case 'pluck': send(this.tone(midi, t, 0.05, 'triangle', 0.28, 0.002, 0.3)); break;
      case 'flute': send(this.tone(midi, t, dur * 0.9, 'sine', 0.15, 0.06, 0.2)); break;
      case 'saw': send(this.tone(midi, t, dur * 0.8, 'sawtooth', 0.07, 0.01, 0.1, 2600)); break;
      case 'square': send(this.tone(midi, t, dur * 0.7, 'square', 0.06, 0.005, 0.08, 3000)); break;
      case 'sine': send(this.tone(midi - 12, t, dur, 'sine', 0.18, 0.05, 0.4)); break;
      default: send(this.tone(midi, t, dur * 0.85, 'triangle', 0.16, 0.01, 0.15));
    }
  }
  pad(midi, t, dur, kind) {
    const cutoff = kind === 'dark' ? 600 : kind === 'choir' ? 1600 : 1000;
    const gain = kind === 'choir' ? 0.045 : 0.035;
    for (const det of [-8, 8]) this.tone(midi, t, dur, 'sawtooth', gain, dur * 0.25, dur * 0.4, cutoff, this.bgmFade, det);
  }
  noiseHit(t, gain, type, f, dur, dest = this.bgmFade) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return flt;
  }
  kick(t, gain, top = 150, dest = this.bgmFade) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(top, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.35);
  }
  snare(t, gain, soft = false) {
    this.noiseHit(t, gain, soft ? 'bandpass' : 'highpass', soft ? 900 : 1500, soft ? 0.1 : 0.16);
  }
  hat(t, gain) { this.noiseHit(t, gain * 0.6, 'highpass', 7000, 0.04); }

  // ---------- 効果音 ----------
  // 同じ音を短い間に何度も鳴らさない
  ok(name, gap) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -9) < gap) return false;
    this.last[name] = now;
    return true;
  }
  seq(notes, type, gain, step, len = 0.12, release = 0.2) {
    const t = this.ctx.currentTime;
    notes.forEach((m, i) => this.tone(m, t + i * step, len, type, gain, 0.005, release, 0, this.seBus));
  }
  play(name) {
    if (!this.ok(name, { hit: 0.07, boss: 0.09, pop: 0.12, talk: 0.15, click: 0.04 }[name] ?? 0.25)) return;
    const t = this.ctx.currentTime;
    const se = this.seBus;
    switch (name) {
      case 'click': this.tone(88, t, 0.03, 'sine', 0.18, 0.002, 0.05, 0, se); break;
      case 'pop': this.tone(84 + Math.floor(Math.random() * 5), t, 0.02, 'sine', 0.08, 0.002, 0.06, 0, se); break;
      case 'talk': this.tone(79 + Math.floor(Math.random() * 7), t, 0.03, 'square', 0.035, 0.002, 0.03, 2500, se); break;
      case 'hit': this.kick(t, 0.35, 220, se); this.noiseHit(t, 0.25, 'lowpass', 1800, 0.08, se); break;
      case 'boss': this.kick(t, 0.55, 120, se); this.noiseHit(t, 0.35, 'lowpass', 900, 0.18, se); break;
      case 'whoosh': {
        const f = this.noiseHit(t, 0.35, 'bandpass', 300, 0.5, se);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
        break;
      }
      case 'portal': this.seq([72, 79, 84, 88, 91], 'sine', 0.12, 0.05, 0.05, 0.4); break;
      case 'dan': {
        for (const m of [48, 55, 60, 64]) this.tone(m, t, 1.2, 'sawtooth', 0.05, 0.4, 1, 0, se);
        const f = this.noiseHit(t, 0.2, 'bandpass', 400, 1.6, se);
        f.frequency.exponentialRampToValueAtTime(6000, t + 1.5);
        setTimeout(() => this.ctx && this.seq([84, 88, 91, 96], 'sine', 0.1, 0.07, 0.05, 0.6), 900);
        break;
      }
      case 'horn':
        for (let i = 0; i < 2; i++) for (const m of [45, 52]) this.tone(m + i, t + i * 0.55, 0.4, 'sawtooth', 0.11, 0.12, 0.25, 900, se);
        break;
      case 'fanfare':
        this.seq([72, 76, 79], 'square', 0.08, 0.11, 0.09, 0.1);
        for (const m of [72, 76, 79, 84]) this.tone(m, t + 0.36, 0.5, 'square', 0.05, 0.01, 0.4, 3000, se);
        break;
      case 'lose': this.seq([67, 63, 60, 55], 'triangle', 0.14, 0.16, 0.14, 0.3); break;
      case 'treasure': this.seq([79, 83, 86, 91, 95], 'sine', 0.12, 0.06, 0.05, 0.5); break;
      case 'heart': this.seq([88, 92], 'sine', 0.13, 0.14, 0.1, 0.6); break;
      case 'chime': this.seq([84, 79], 'sine', 0.09, 0.12, 0.06, 0.5); break;
      case 'paper':
        this.noiseHit(t, 0.25, 'bandpass', 2500, 0.12, se);
        this.noiseHit(t + 0.13, 0.2, 'bandpass', 3200, 0.1, se);
        break;
    }
  }
}
