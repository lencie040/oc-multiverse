// BGM・環境音・効果音。音声ファイルは使わず Web Audio API でその場で作曲・合成する
import { hashStr, seeded } from './util.js?v=37';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
const HIJAZ = [0, 1, 4, 5, 7, 8, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];

// 曲調: scale / root(MIDI) / テンポ / A・B のコード進行(度数) / 楽器 / swing=はね / wet=残響 / seven=7thコード / amb=環境音
export const MOODS = {
  space: { name: '星の海', scale: LYDIAN, root: 50, bpm: 60, prog: [0, 4, 5, 3], progB: [5, 3, 0, 4], lead: 'bell', sub: 'harp', density: 0.22, pad: 'soft', bass: 'drone', drums: null, delay: 0.5, wet: 0.75, seven: true, amb: 'space' },
  calm: { name: 'のどかな日常', scale: MAJOR, root: 60, bpm: 98, prog: [0, 5, 3, 4], progB: [3, 4, 2, 5], lead: 'piano', sub: 'flute', density: 0.55, pad: 'warm', bass: 'root', drums: 'soft', swing: 0.12, delay: 0.2, wet: 0.3, seven: true, amb: 'town' },
  cute: { name: 'あまいメロディ', scale: MAJOR, root: 65, bpm: 118, prog: [0, 3, 4, 0], progB: [5, 1, 4, 4], lead: 'musicbox', sub: 'pluck', density: 0.6, pad: null, bass: 'pizz', drums: 'soft', swing: 0.2, delay: 0.25, wet: 0.3, amb: 'breeze' },
  nature: { name: '森のささやき', scale: MAJOR, root: 67, bpm: 84, prog: [0, 3, 0, 4], progB: [5, 3, 1, 4], lead: 'flute', sub: 'harp', density: 0.45, pad: 'warm', bass: 'root', drums: null, delay: 0.3, wet: 0.45, seven: true, amb: 'forest' },
  ocean: { name: '波と太陽', scale: MAJOR, root: 69, bpm: 104, prog: [0, 4, 5, 3], progB: [3, 0, 4, 4], lead: 'marimba', sub: 'pluck', density: 0.6, pad: null, bass: 'eighth', drums: 'shaker', swing: 0.15, delay: 0.2, wet: 0.3, amb: 'ocean' },
  dark: { name: '闇のささやき', scale: MINOR, root: 57, bpm: 68, prog: [0, 5, 3, 4], progB: [5, 6, 0, 4], lead: 'choirlead', sub: 'sine', density: 0.3, pad: 'dark', bass: 'drone', drums: 'slow', delay: 0.45, wet: 0.6, amb: 'cave' },
  spooky: { name: 'ハロウィンの夜', scale: HARM_MINOR, root: 64, bpm: 124, prog: [0, 5, 3, 4], progB: [3, 0, 5, 4], lead: 'pluck', sub: 'musicbox', density: 0.65, pad: null, bass: 'oompah', drums: 'soft', swing: 0.18, delay: 0.2, wet: 0.35, amb: 'night' },
  fire: { name: '灼熱の大地', scale: PHRYGIAN, root: 62, bpm: 132, prog: [0, 1, 0, 6], progB: [5, 6, 0, 1], lead: 'synth', sub: 'pluck', density: 0.55, pad: 'dark', bass: 'eighth', drums: 'full', delay: 0.15, wet: 0.25, amb: 'fire' },
  ice: { name: '凍てつく結晶', scale: LYDIAN, root: 64, bpm: 76, prog: [0, 1, 4, 5], progB: [3, 5, 1, 4], lead: 'bell', sub: 'harp', density: 0.35, pad: 'soft', bass: 'root', drums: null, delay: 0.55, wet: 0.7, seven: true, amb: 'wind' },
  future: { name: '電子の街', scale: DORIAN, root: 60, bpm: 120, prog: [0, 3, 6, 4], progB: [5, 3, 0, 4], lead: 'synth', sub: 'square', density: 0.5, pad: 'soft', bass: 'eighth', drums: 'electro', arp: true, delay: 0.3, wet: 0.35, seven: true, amb: 'hum' },
  holy: { name: '祈りの光', scale: MAJOR, root: 63, bpm: 64, prog: [0, 3, 4, 0], progB: [5, 3, 1, 4], lead: 'bell', sub: 'harp', density: 0.3, pad: 'choir', bass: 'drone', drums: null, delay: 0.5, wet: 0.8, amb: 'breeze' },
  ancient: { name: '古の砂', scale: HIJAZ, root: 62, bpm: 90, prog: [0, 1, 0, 6], progB: [3, 1, 0, 0], lead: 'koto', sub: 'flute', density: 0.5, pad: 'dark', bass: 'root', drums: 'hand', delay: 0.25, wet: 0.4, amb: 'wind' },
  music: { name: 'リズムの国', scale: MIXO, root: 67, bpm: 128, prog: [0, 6, 3, 4], progB: [3, 0, 6, 4], lead: 'synth', sub: 'marimba', density: 0.6, pad: null, bass: 'eighth', drums: 'full', delay: 0.2, wet: 0.25, amb: 'town' },
  battle: { name: 'レイドバトル！', scale: MINOR, root: 60, bpm: 152, prog: [0, 5, 6, 4], progB: [3, 6, 5, 4], lead: 'brass', sub: 'synth', density: 0.7, pad: 'dark', bass: 'eighth', drums: 'full', arp: true, delay: 0.12, wet: 0.25, amb: null },
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

// 曲ごとの音量の差をそろえる補正 (dB)
const TRIM = { ocean: 5.5, music: 4, fire: 3.5, future: 3, cute: 2.5, battle: 3.5, spooky: 2, ancient: 0.5 };
const freq = (m) => 440 * 2 ** ((m - 69) / 12);
const SAVE_KEY = 'oc-multiverse-audio';

// メロディのリズム (16分音符の位置)。音符が多いものほど後ろ
const RHYTHMS = [[0, 8], [0, 6, 8], [0, 4, 8, 12], [0, 3, 6, 8, 12], [0, 4, 6, 8, 10, 12], [0, 2, 4, 6, 8, 11, 12, 14]];

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

  // ctx を渡すと、その文脈で組み立てる (音量の確認用に OfflineAudioContext を渡せる)
  init(offline = null) {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!offline && !AC) return;
    const ctx = (this.ctx = offline || new AC());
    // 仕上げ: 軽いサチュレーション → コンプレッサー
    this.master = ctx.createGain();
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15); }
    shape.curve = curve;
    shape.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2; comp.knee.value = 12;
    this.master.connect(shape).connect(comp).connect(ctx.destination);
    // BGM: パート → フェード → 音色 → 音量 → ダッキング (大きな効果音の間だけ下げる)
    this.bgmBus = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.bgmFade = ctx.createGain();
    this.bgmTone = ctx.createBiquadFilter();
    this.bgmTone.type = 'lowpass';
    this.bgmTone.frequency.value = 16000;
    this.bgmFade.connect(this.bgmTone).connect(this.bgmBus).connect(this.duckGain).connect(this.master);
    this.seBus = ctx.createGain();
    this.seBus.connect(this.master);
    // 環境音
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0;
    this.ambBus.connect(this.bgmBus);
    // 残響
    const ir = this.impulse(2.8);
    this.verbSend = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    this.verbOut = ctx.createGain();
    this.verbSend.connect(verb).connect(this.verbOut).connect(this.bgmFade);
    this.seVerbSend = ctx.createGain();
    this.seVerbSend.gain.value = 0.5;
    const seVerb = ctx.createConvolver();
    seVerb.buffer = ir;
    this.seVerbSend.connect(seVerb).connect(this.seBus);
    // 左右に跳ねるやまびこ
    this.delaySend = ctx.createGain();
    this.dL = ctx.createDelay(1.5);
    this.dR = ctx.createDelay(1.5);
    const panL = ctx.createStereoPanner(), panR = ctx.createStereoPanner();
    panL.pan.value = -0.7; panR.pan.value = 0.7;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.38;
    const dTone = ctx.createBiquadFilter();
    dTone.type = 'lowpass'; dTone.frequency.value = 3200;
    this.delaySend.connect(this.dL).connect(this.dR).connect(dTone).connect(this.fb).connect(this.dL);
    this.dL.connect(panL).connect(this.bgmFade);
    this.dR.connect(panR).connect(this.bgmFade);
    // パートごとの出口 (定位・残響の量)
    this.parts = {
      lead: this.part(0, 1, 1), sub: this.part(-0.32, 0.8, 0.5), arp: this.part(0.38, 0.5, 0.6),
      pad: this.part(0, 1, 0), bass: this.part(0, 0.06, 0), drums: this.part(0, 0.14, 0), hat: this.part(0.18, 0.1, 0),
    };
    // 波形
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.waves = {
      flute: this.wave([1, 0.32, 0.12, 0.05, 0.02]),
      clarinet: this.wave([1, 0.02, 0.5, 0.02, 0.26, 0.02, 0.12]),
      brass: this.wave([1, 0.72, 0.56, 0.4, 0.3, 0.22, 0.15, 0.1, 0.06]),
      organ: this.wave([1, 0.5, 0.3, 0.2, 0.08, 0.12]),
      koto: this.wave([1, 0.6, 0.42, 0.3, 0.2, 0.14, 0.1]),
    };
    this.applyVolumes();
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    if (!offline) {
      this.timer = setInterval(() => this.schedule(), 25);
      if (document.hidden) ctx.suspend();
    }
    if (this.pendingMood) this.setMood(...this.pendingMood);
  }
  // 部屋の響き: 減衰するノイズを、後ろほどこもらせる
  impulse(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, env = Math.exp(-t * 3.1) * Math.min(1, t * 90);
        const k = 0.5 * Math.exp(-t * 1.6) + 0.04;
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * env;
      }
      // 初期反射
      for (const [ms, g] of [[17, 0.5], [29, 0.4], [41, 0.3], [63, 0.24]]) d[Math.floor(sr * (ms + ch * 3) / 1000)] += g;
    }
    return buf;
  }
  wave(amps) {
    const n = amps.length + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    amps.forEach((a, i) => { imag[i + 1] = a; });
    return this.ctx.createPeriodicWave(real, imag);
  }
  part(pan, wet, delay) {
    const ctx = this.ctx;
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.bgmFade);
    const w = ctx.createGain(), dl = ctx.createGain();
    w.gain.value = wet; dl.gain.value = delay;
    g.connect(w).connect(this.verbSend);
    if (delay) g.connect(dl).connect(this.delaySend);
    return g;
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ muted: this.muted, bgmVol: this.bgmVol, seVol: this.seVol })); } catch (e) { /* 保存できない環境 */ }
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.bgmBus.gain.setTargetAtTime(this.bgmVol * 0.62, t, 0.05);
    this.seBus.gain.setTargetAtTime(this.seVol * 0.7, t, 0.05);
  }
  setVolumes({ muted, bgm, se }) {
    if (muted !== undefined) this.muted = muted;
    if (bgm !== undefined) this.bgmVol = bgm;
    if (se !== undefined) this.seVol = se;
    this.applyVolumes();
    this.save();
  }
  // 大きな効果音の間だけ BGM を下げる
  duck(depth = 0.45, hold = 0.8) {
    const t = this.ctx.currentTime, g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.03);
    g.setTargetAtTime(1, t + hold, 0.5);
  }

  // ---------- BGM ----------
  // smooth: 宇宙から観戦中の切り替え。同じ曲調なら止めずにメロディだけ替え、違う曲調ならゆっくり入れ替える
  setMood(key, night = false, seedKey = key, smooth = false) {
    if (!this.ctx) { this.pendingMood = [key, night, seedKey]; return; }
    if (key === this.mood && night === this.night && seedKey === this.seedKey) return;
    if (smooth && key === this.mood && night === this.night && this.cfg) {
      this.seedKey = seedKey;
      this.rng = seeded(hashStr('bgm:' + seedKey));
      this.motifs = new Map();
      return;
    }
    const t = this.ctx.currentTime;
    const first = !this.mood;
    this.bgmFade.gain.cancelScheduledValues(t);
    this.bgmFade.gain.setTargetAtTime(0, t, smooth ? 0.5 : 0.15);
    const apply = () => {
      this.mood = key;
      this.night = night;
      this.seedKey = seedKey;
      const m = MOODS[key];
      const calmNight = night && key !== 'battle';
      this.cfg = { ...m, bpm: calmNight ? m.bpm * 0.88 : m.bpm, density: calmNight ? m.density * 0.65 : m.density };
      this.rng = seeded(hashStr('bgm:' + seedKey));
      this.motifs = new Map();
      this.voiced = null;
      this.step = 0;
      const now = this.ctx.currentTime;
      this.nextTime = now + 0.05;
      this.bgmTone.frequency.setTargetAtTime(calmNight ? 5200 : 16000, now, 0.3);
      this.verbOut.gain.setTargetAtTime((calmNight ? 1.2 : 1) * m.wet * 0.75, now, 0.2);
      const beat = 60 / this.cfg.bpm;
      this.dL.delayTime.value = beat * 0.75;
      this.dR.delayTime.value = beat * 0.75;
      this.delaySend.gain.value = m.delay * 0.7;
      this.bgmFade.gain.setTargetAtTime(10 ** ((TRIM[key] || 0) / 20), now, smooth ? 0.9 : 0.4);
      if (m.amb !== null) this.setAmbience(m.amb, night);
    };
    if (first) apply();
    else { clearTimeout(this.moodTimer); this.mood = key; this.night = night; this.seedKey = seedKey; this.moodTimer = setTimeout(apply, smooth ? 1500 : 550); }
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
    this.ambEvents();
  }

  // 曲の形: 8小節ずつ A A' B A' をくり返す
  section(bar) {
    const i = Math.floor(bar / 8) % 4;
    return { name: i === 2 ? 'B' : 'A', index: i, inBar: bar % 8, loop: Math.floor(bar / 32) };
  }
  chordAt(bar) {
    const c = this.cfg, sec = this.section(bar);
    const prog = sec.name === 'B' ? c.progB : c.prog;
    let deg = prog[sec.inBar % prog.length];
    // 区切りの2小節は V → I で締める
    if (sec.name === 'A' && sec.index === 3 && sec.inBar === 6) deg = 4;
    if (sec.name === 'A' && sec.index === 3 && sec.inBar === 7) deg = 0;
    const notes = (c.seven ? [0, 2, 4, 6] : [0, 2, 4]).map((k) => this.degree(deg + k));
    return { deg, notes };
  }
  degree(d) {
    const s = this.cfg.scale;
    const oct = Math.floor(d / s.length);
    return this.cfg.root + s[((d % s.length) + s.length) % s.length] + 12 * oct;
  }
  // 前の和音からなるべく動かない形に並べ替える
  voice(notes) {
    const base = this.voiced || notes;
    const center = base.reduce((a, b) => a + b, 0) / base.length;
    const out = notes.map((n) => {
      let m = n;
      while (m - center > 6) m -= 12;
      while (center - m > 6) m += 12;
      return m;
    }).sort((a, b) => a - b);
    this.voiced = out;
    return out;
  }
  // 1小節ぶんのメロディ。2小節の動機を作り、くり返しの2回目は少し変える
  motif(bar) {
    const sec = this.section(bar);
    const key = `${sec.name}:${sec.loop % 3}:${sec.index === 3 ? 'e' : ''}:${sec.inBar}`;
    if (this.motifs.has(key)) return this.motifs.get(key);
    const c = this.cfg, r = this.rng;
    const { deg } = this.chordAt(bar);
    const dens = sec.name === 'B' ? Math.min(1, c.density + 0.15) : c.density;
    const ri = Math.min(RHYTHMS.length - 1, Math.floor(dens * RHYTHMS.length + (r() - 0.5)));
    const rhythm = RHYTHMS[Math.max(0, ri)];
    const tones = [0, 2, 4, 7, 9, 11].map((k) => deg + k + 5 + (sec.name === 'B' ? 2 : 0));
    let cur = r.pick(tones.slice(1, 4));
    const notes = [];
    rhythm.forEach((s, i) => {
      const strong = s % 8 === 0;
      if (!strong && r() > 0.85) return;
      if (strong) cur = tones.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
      else cur += r.pick([-2, -1, -1, 1, 1, 2]);
      cur = Math.max(deg + 3, Math.min(deg + 15, cur));
      const next = rhythm[i + 1] ?? 16;
      notes.push({ s, d: cur, len: Math.max(1, next - s), v: strong ? 1 : 0.8 + r() * 0.15 });
    });
    // フレーズの終わりは長く伸ばす
    if (sec.inBar % 4 === 3) { notes.length = Math.min(notes.length, 2); if (notes.length) notes[notes.length - 1].len = 16 - notes[notes.length - 1].s; }
    this.motifs.set(key, notes);
    if (this.motifs.size > 60) this.motifs.delete(this.motifs.keys().next().value);
    return notes;
  }

  playStep(step, t0, sp16) {
    const c = this.cfg;
    const bar = Math.floor(step / 16), s = step % 16;
    const sec = this.section(bar);
    const { notes } = this.chordAt(bar);
    const barLen = sp16 * 16;
    // はね (裏の16分を少し遅らせる) と、人が弾くようなわずかなズレ
    const t = t0 + (s % 4 === 2 ? (c.swing || 0) * sp16 : 0);
    const hum = () => (Math.random() - 0.5) * 0.008;
    const P = this.parts;
    const chord = s === 0 ? this.voice(notes) : this.voiced || notes;
    if (s === 0 && c.pad) for (const n of chord) this.pad(n, t, barLen, c.pad);
    // ベース
    const root = notes[0] - 24;
    if (c.bass === 'drone' && s === 0) { this.tone(root, t, barLen * 0.95, 'sine', 0.26, 0.3, 0.5, 0, P.bass); this.tone(root + 12, t, barLen * 0.9, 'triangle', 0.05, 0.4, 0.5, 0, P.bass); }
    if (c.bass === 'root' && (s === 0 || s === 8 || (s === 14 && sec.inBar % 2))) this.pluckBass(s === 14 ? root + 7 : root, t, sp16 * 6);
    if (c.bass === 'eighth' && s % 2 === 0) this.tone(s % 8 === 6 ? root + 7 : root, t, sp16 * 1.6, 'sawtooth', 0.15, 0.005, 0.05, 700 + (s % 4 ? 0 : 300), P.bass);
    if (c.bass === 'pizz' && s % 4 === 0) this.pluckBass(s % 8 === 4 ? root + 7 : root, t, sp16 * 1.4);
    if (c.bass === 'oompah' && s % 4 === 0) this.pluckBass(s % 8 === 4 ? notes[2] - 12 : root, t, sp16 * 1.5);
    // メロディ
    for (const n of this.motif(bar)) if (n.s === s) this.lead(this.degree(n.d), t + hum(), sp16 * n.len, c.lead, n.v, P.lead);
    // Bメロと2周目から、後ろで分散和音を鳴らす
    if (c.sub && (sec.name === 'B' || sec.loop > 0 || sec.index === 3) && s % 4 === 2 && !this.night) {
      const m = chord[(s / 2 + bar) % chord.length];
      this.lead(m + 12, t + hum(), sp16 * 2, c.sub, 0.42, P.sub);
    }
    if (c.arp && !this.night) this.tone(chord[s % chord.length] + 12, t, sp16 * 0.8, 'square', 0.035, 0.002, 0.04, 2400, P.arp);
    // ドラム
    const dr = this.night && this.mood !== 'battle' ? (c.drums ? 'slow' : null) : c.drums;
    const fill = sec.inBar === 7 && s >= 12;
    if (fill && dr && dr !== 'slow') { this.tom(t, s % 2 ? 150 : 110, 0.42); return; }
    if (sec.inBar === 0 && s === 0 && dr && dr !== 'slow' && sec.index !== 1) this.crash(t, 0.3);
    if (dr === 'soft') { if (s === 0 || s === 8) this.kick(t, 0.55); if (s === 4 || s === 12) this.snare(t, 0.16, true); if (s % 4 === 2) this.hat(t, 0.15); }
    if (dr === 'slow') { if (s === 0) this.kick(t, 0.45); if (s === 8) this.snare(t, 0.09, true); }
    if (dr === 'shaker') { if (s === 0 || s === 10) this.kick(t, 0.5); this.hat(t, s % 2 ? 0.08 : 0.17); if (s === 4 || s === 12) this.snare(t, 0.14, true); }
    if (dr === 'hand') { if (s === 0 || s === 6 || s === 10) this.tom(t, 92, 0.42); if (s === 4 || s === 12) this.snare(t, 0.2, true); if (s % 2 === 1) this.hat(t, 0.06); }
    if (dr === 'full') { if (s === 0 || s === 6 || s === 8) this.kick(t, 0.75); if (s === 4 || s === 12) this.snare(t, 0.42); if (s % 2 === 0) this.hat(t, 0.2); if (s === 14) this.hat(t, 0.3, true); }
    if (dr === 'electro') { if (s % 4 === 0) this.kick(t, 0.68); if (s === 4 || s === 12) this.clap(t, 0.34); if (s % 4 === 2) this.hat(t, 0.26, true); else if (s % 2 === 0) this.hat(t, 0.12); }
  }

  // ---------- 楽器 ----------
  tone(midi, t, dur, type, gain, attack = 0.01, release = 0.1, cutoff = 0, dest = this.bgmFade, detune = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
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
    o.stop(t + dur + release * 1.6 + 0.1);
    return g;
  }
  // FM合成: 金属的な鐘やエレピのような響き
  fm(midi, t, dur, { ratio = 2, index = 2, indexDecay = 0.4, gain = 0.15, attack = 0.002, release = 0.6, dest = this.seBus, detune = 0 }) {
    const ctx = this.ctx;
    const f = freq(midi);
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; car.detune.value = detune;
    mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.setTargetAtTime(f * index * 0.08, t, indexDecay / 3);
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur), release / 3);
    car.connect(g).connect(dest);
    const end = t + dur + release * 1.6 + 0.1;
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
    return g;
  }
  pluckBass(midi, t, dur) {
    const P = this.parts.bass;
    this.tone(midi, t, dur, 'triangle', 0.3, 0.004, 0.14, 0, P);
    this.tone(midi + 12, t, 0.03, 'sine', 0.06, 0.002, 0.06, 0, P);
  }
  lead(midi, t, dur, kind, v, dest) {
    switch (kind) {
      case 'bell':
        this.fm(midi + 12, t, 0.05, { ratio: 3.5, index: 1.6, indexDecay: 0.5, gain: 0.13 * v, release: 1.8, dest });
        break;
      case 'piano':
        this.fm(midi, t, dur * 0.8, { ratio: 1, index: 1.1, indexDecay: 0.35, gain: 0.16 * v, release: 0.5, dest });
        this.fm(midi + 12, t, 0.05, { ratio: 4, index: 0.5, indexDecay: 0.1, gain: 0.03 * v, release: 0.25, dest });
        break;
      case 'musicbox':
        this.fm(midi + 12, t, 0.03, { ratio: 5, index: 0.9, indexDecay: 0.15, gain: 0.13 * v, release: 0.9, dest });
        break;
      case 'marimba':
        this.fm(midi, t, 0.02, { ratio: 4, index: 1.2, indexDecay: 0.06, gain: 0.22 * v, release: 0.32, dest });
        break;
      case 'harp':
        this.tone(midi, t, 0.04, this.waves.koto, 0.11 * v, 0.002, 0.8, 3200, dest);
        break;
      case 'koto':
        this.tone(midi, t, 0.05, this.waves.koto, 0.18 * v, 0.002, 0.45, 3800, dest);
        this.noiseHit(t, 0.03 * v, 'bandpass', 3000, 0.02, dest);
        break;
      case 'pluck': this.tone(midi, t, 0.05, 'triangle', 0.24 * v, 0.002, 0.3, 0, dest); break;
      case 'flute':
        this.tone(midi, t, dur * 0.92, this.waves.flute, 0.15 * v, 0.05, 0.16, 0, dest);
        this.noiseHit(t, 0.012 * v, 'bandpass', 2400, 0.08, dest);
        break;
      case 'brass':
        this.tone(midi, t, dur * 0.85, this.waves.brass, 0.12 * v, 0.03, 0.1, 3200, dest);
        this.tone(midi - 12, t, dur * 0.85, this.waves.brass, 0.05 * v, 0.03, 0.1, 1800, dest);
        break;
      case 'synth':
        for (const det of [-7, 7]) this.tone(midi, t, dur * 0.85, 'sawtooth', 0.055 * v, 0.008, 0.1, 2800, dest, det);
        break;
      case 'square': this.tone(midi, t, dur * 0.7, 'square', 0.05 * v, 0.005, 0.08, 3000, dest); break;
      case 'choirlead': this.choir(midi - 12, t, dur, 0.1 * v, dest); break;
      case 'sine': this.tone(midi - 12, t, dur, 'sine', 0.16 * v, 0.05, 0.4, 0, dest); break;
      default: this.tone(midi, t, dur * 0.85, 'triangle', 0.16 * v, 0.01, 0.15, 0, dest);
    }
  }
  choir(midi, t, dur, gain, dest) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 1;
    for (const [f, q, a] of [[720, 7, 1], [1150, 9, 0.6], [2500, 11, 0.3]]) {
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
      const h = ctx.createGain();
      h.gain.value = a;
      g.connect(b).connect(h).connect(dest);
    }
    for (const det of [-9, 0, 9]) this.tone(midi, t, dur, 'sawtooth', gain * 1.2, dur * 0.3, dur * 0.5, 0, g, det);
  }
  pad(midi, t, dur, kind) {
    const P = this.parts.pad;
    if (kind === 'choir') return this.choir(midi, t, dur, 0.06, P);
    if (kind === 'warm') {
      this.tone(midi, t, dur, this.waves.organ, 0.032, dur * 0.2, dur * 0.4, 1400, P, -5);
      this.tone(midi, t, dur, this.waves.organ, 0.032, dur * 0.2, dur * 0.4, 1400, P, 5);
      return;
    }
    const cutoff = kind === 'dark' ? 620 : 1100;
    for (const det of [-11, 0, 11]) this.tone(midi, t, dur, 'sawtooth', 0.024, dur * 0.25, dur * 0.45, cutoff, P, det);
  }
  noiseHit(t, gain, type, f, dur, dest = this.parts.drums) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return flt;
  }
  kick(t, gain, top = 150, dest = this.parts.drums) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(top, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.36);
    this.noiseHit(t, gain * 0.12, 'highpass', 3000, 0.012, dest);
  }
  snare(t, gain, soft = false, dest = this.parts.drums) {
    if (!soft) this.tone(62, t, 0.03, 'triangle', gain * 0.5, 0.001, 0.08, 0, dest);
    this.noiseHit(t, gain, soft ? 'bandpass' : 'highpass', soft ? 1100 : 1700, soft ? 0.09 : 0.17, dest);
  }
  clap(t, gain) {
    for (const d of [0, 0.011, 0.023]) this.noiseHit(t + d, gain * 0.7, 'bandpass', 1700, 0.05);
    this.noiseHit(t + 0.03, gain, 'bandpass', 1500, 0.16);
  }
  tom(t, f, gain) {
    const ctx = this.ctx, P = this.parts.drums;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(P);
    o.start(t);
    o.stop(t + 0.25);
  }
  hat(t, gain, open = false) { this.noiseHit(t, gain * 0.5, 'highpass', 7800, open ? 0.16 : 0.035, this.parts.hat); }
  crash(t, gain) { this.noiseHit(t, gain * 0.5, 'highpass', 5200, 1.3, this.parts.hat); }

  // ---------- 環境音 ----------
  // 風・波・たき火など。世界線の雰囲気に合わせて後ろでうっすら鳴らす
  setAmbience(kind, night) {
    if (!this.ctx) return;
    this.ambNight = night;
    if (kind === this.ambKind) return;
    this.ambKind = kind;
    const ctx = this.ctx, now = ctx.currentTime;
    this.ambBus.gain.setTargetAtTime(0, now, 0.25);
    clearTimeout(this.ambTimer);
    this.ambTimer = setTimeout(() => {
      for (const s of this.ambNodes || []) { try { s.stop(); } catch (e) { /* すでに止まっている */ } }
      this.ambNodes = [];
      const layer = (type, f, q, gain, lfoHz = 0, lfoAmt = 0) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = type; flt.frequency.value = f; flt.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(flt).connect(g).connect(this.ambBus);
        src.start(0, Math.random());
        this.ambNodes.push(src);
        if (lfoHz) {
          const l = ctx.createOscillator(), a = ctx.createGain();
          l.frequency.value = lfoHz; a.gain.value = lfoAmt;
          l.connect(a).connect(g.gain);
          l.start();
          this.ambNodes.push(l);
        }
      };
      if (kind === 'wind' || kind === 'breeze') layer('bandpass', kind === 'wind' ? 520 : 760, 0.8, kind === 'wind' ? 0.14 : 0.07, 0.11, kind === 'wind' ? 0.08 : 0.04);
      if (kind === 'ocean') { layer('lowpass', 900, 0.5, 0.15, 0.13, 0.12); layer('bandpass', 2600, 0.7, 0.03, 0.13, 0.024); }
      if (kind === 'forest') layer('bandpass', 1500, 0.6, 0.035, 0.07, 0.02);
      if (kind === 'fire') layer('lowpass', 420, 0.7, 0.12, 0.3, 0.05);
      if (kind === 'cave') layer('lowpass', 260, 0.8, 0.16, 0.05, 0.05);
      if (kind === 'night') layer('bandpass', 620, 0.8, 0.05, 0.09, 0.03);
      if (kind === 'town') layer('bandpass', 900, 0.5, 0.06, 0.05, 0.03);
      if (kind === 'space' || kind === 'hum') {
        layer('lowpass', kind === 'space' ? 120 : 220, 1.2, 0.2, 0.04, 0.08);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = kind === 'space' ? 55 : 110; g.gain.value = 0.02;
        o.connect(g).connect(this.ambBus);
        o.start();
        this.ambNodes.push(o);
      }
      this.ambBus.gain.setTargetAtTime(kind ? 1 : 0, ctx.currentTime, 0.8);
    }, 300);
  }
  // ときどき鳴る音 (鳥・虫・たき火のはぜる音など)
  ambEvents() {
    const t = this.ctx.currentTime;
    if (t < (this.ambNext ?? 0)) return;
    this.ambNext = t + 0.25;
    const k = this.ambKind, night = this.ambNight, B = this.ambBus;
    const pan = (node) => { const p = this.ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; node.connect(p).connect(B); return p; };
    if ((k === 'forest' || k === 'town' || k === 'breeze') && !night && Math.random() < (k === 'forest' ? 0.16 : 0.05)) this.bird(t, pan(this.ctx.createGain()));
    if ((k === 'forest' || k === 'town' || k === 'night') && night && Math.random() < 0.3) this.cricket(t, pan(this.ctx.createGain()));
    if (k === 'fire' && Math.random() < 0.45) this.noiseHit(t + Math.random() * 0.2, 0.05 + Math.random() * 0.1, 'highpass', 2200, 0.02, pan(this.ctx.createGain()));
  }
  bird(t, dest) {
    const ctx = this.ctx, n = 2 + Math.floor(Math.random() * 3), base = 2400 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), st = t + i * 0.13;
      o.frequency.setValueAtTime(base * 1.25, st);
      o.frequency.exponentialRampToValueAtTime(base * 0.85, st + 0.09);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.02, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.1);
      o.connect(g).connect(dest);
      o.start(st); o.stop(st + 0.12);
    }
  }
  cricket(t, dest) {
    const ctx = this.ctx, f = 4300 + Math.random() * 600;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), st = t + i * 0.07;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.012, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      o.connect(g).connect(dest);
      o.start(st); o.stop(st + 0.06);
    }
  }

  // ---------- 効果音 ----------
  // 同じ音を短い間に何度も鳴らさない
  ok(name, gap) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -9) < gap) return false;
    this.last[name] = now;
    return true;
  }
  // 残響つきの出口 (vol: 距離による音量、pan: 左右)
  outlet(vol = 1, pan = 0, wet = 0.35) {
    const ctx = this.ctx;
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.value = vol; p.pan.value = pan;
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(p).connect(this.seBus);
    g.connect(w).connect(this.seVerbSend);
    return g;
  }
  seq(notes, type, gain, step, len, release, se, t = this.ctx.currentTime) {
    notes.forEach((m, i) => this.tone(m, t + i * step, len, type, gain, 0.005, release, 0, se));
  }
  bells(notes, gain, step, se, t = this.ctx.currentTime, release = 1.1) {
    notes.forEach((m, i) => this.fm(m, t + i * step, 0.03, { ratio: 3.5, index: 1.3, indexDecay: 0.3, gain, release, dest: se }));
  }
  // vol: 0〜1 (遠いほど小さく)、pan: -1〜1
  play(name, { vol = 1, pan = 0 } = {}) {
    if (vol < 0.03) return;
    if (!this.ok(name, { hit: 0.07, boss: 0.09, pop: 0.12, talk: 0.15, click: 0.04, spark: 0.1 }[name] ?? 0.25)) return;
    const t = this.ctx.currentTime;
    const dry = this.outlet(vol, pan, 0.08), se = this.outlet(vol, pan, 0.4), wide = this.outlet(vol, pan, 0.9);
    const rp = () => Math.floor(Math.random() * 5);
    switch (name) {
      case 'click': this.fm(90, t, 0.01, { ratio: 2, index: 0.6, indexDecay: 0.03, gain: 0.1, release: 0.06, dest: dry }); break;
      case 'pop': this.fm(82 + rp(), t, 0.01, { ratio: 2, index: 0.8, indexDecay: 0.05, gain: 0.1, release: 0.1, dest: se }); break;
      case 'talk': this.tone(77 + rp() * 2, t, 0.03, 'square', 0.03, 0.002, 0.03, 2400, dry); break;
      case 'spark': this.noiseHit(t, 0.1, 'highpass', 5000, 0.08, se); break;
      case 'hit':
        this.kick(t, 0.32, 240 + rp() * 20, dry);
        this.noiseHit(t, 0.22, 'bandpass', 1900 + rp() * 200, 0.07, dry);
        break;
      case 'boss':
        this.kick(t, 0.6, 130, se);
        this.noiseHit(t, 0.36, 'lowpass', 1100, 0.2, se);
        break;
      case 'whoosh': {
        const f = this.noiseHit(t, 1, 'bandpass', 260, 0.6, wide);
        f.Q.value = 1.4;
        f.frequency.exponentialRampToValueAtTime(3600, t + 0.5);
        break;
      }
      case 'warp': {
        const f = this.noiseHit(t, 0.3, 'bandpass', 180, 0.75, wide);
        f.Q.value = 2.2;
        f.frequency.exponentialRampToValueAtTime(5200, t + 0.68);
        this.tone(36, t, 0.5, 'sine', 0.24, 0.05, 0.3, 0, wide);
        break;
      }
      case 'portal': {
        this.bells([72, 79, 84, 88, 91], 0.09, 0.05, wide, t, 0.9);
        const f = this.noiseHit(t, 0.12, 'bandpass', 500, 0.5, wide);
        f.frequency.exponentialRampToValueAtTime(4000, t + 0.45);
        break;
      }
      case 'dan': {
        this.duck(0.5, 1.8);
        for (const m of [36, 48, 55, 60, 64]) this.tone(m, t, 1.3, 'sawtooth', 0.045, 0.45, 1.1, 1400, wide);
        const f = this.noiseHit(t, 0.2, 'bandpass', 300, 1.8, wide);
        f.frequency.exponentialRampToValueAtTime(7000, t + 1.6);
        this.bells([84, 88, 91, 96, 103], 0.09, 0.08, wide, t + 0.95, 1.6);
        break;
      }
      case 'horn':
        this.duck(0.45, 1.6);
        for (let i = 0; i < 2; i++) for (const m of [45, 52, 57]) this.tone(m + i, t + i * 0.6, 0.45, this.waves.brass, 0.14, 0.1, 0.35, 1300, wide);
        this.kick(t, 0.5, 90, wide);
        this.kick(t + 0.6, 0.5, 90, wide);
        break;
      case 'fanfare': {
        this.duck(0.4, 1.5);
        const b = this.waves.brass;
        [72, 72, 72, 76].forEach((m, i) => this.tone(m, t + i * 0.1, 0.07, b, 0.13, 0.008, 0.08, 3600, se));
        for (const m of [60, 67, 72, 76, 79, 84]) this.tone(m, t + 0.42, 0.75, b, 0.075, 0.01, 0.55, 3800, wide);
        this.kick(t + 0.42, 0.55, 110, wide);
        this.crash2(t + 0.42, wide);
        break;
      }
      case 'lose':
        this.duck(0.6, 1.2);
        this.seq([67, 63, 60, 55], this.waves.clarinet, 0.13, 0.17, 0.15, 0.35, wide);
        this.tone(31, t + 0.5, 0.8, 'sine', 0.2, 0.05, 0.5, 0, wide);
        break;
      case 'treasure': this.bells([79, 83, 86, 91, 95, 98], 0.1, 0.06, wide, t, 1.2); break;
      case 'heart': this.bells([88, 92, 96], 0.1, 0.13, wide, t, 1); break;
      case 'chime': this.bells([84, 79], 0.09, 0.13, wide, t, 0.9); break;
      case 'party':
        this.duck(0.55, 1.2);
        this.bells([72, 76, 79, 84, 88, 91], 0.09, 0.07, wide, t, 0.9);
        this.noiseHit(t, 0.2, 'highpass', 4200, 0.25, se);
        break;
      case 'firework': {
        // ひゅー → どん → ぱらぱら
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(2200, t + 0.9);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.018, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
        o.connect(g).connect(se);
        o.start(t); o.stop(t + 1.05);
        this.kick(t + 1.05, 0.65, 95, wide);
        this.noiseHit(t + 1.05, 0.3, 'lowpass', 1500, 0.45, wide);
        for (let i = 0; i < 12; i++) this.noiseHit(t + 1.2 + Math.random() * 0.8, 0.05, 'highpass', 5000, 0.03, wide);
        break;
      }
      case 'paper':
        this.noiseHit(t, 0.6, 'bandpass', 2500, 0.12, dry);
        this.noiseHit(t + 0.13, 0.5, 'bandpass', 3200, 0.1, dry);
        break;
      case 'cutin':
        this.noiseHit(t, 0.4, 'highpass', 2600, 0.22, se);
        this.fm(69, t + 0.03, 0.03, { ratio: 2.01, index: 3, indexDecay: 0.2, gain: 0.2, release: 0.5, dest: wide });
        break;
    }
  }
  crash2(t, dest) { this.noiseHit(t, 0.22, 'highpass', 4800, 1.4, dest); }
}
