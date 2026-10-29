// 共通ユーティリティ: 乱数・色・時間

export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 再現性のある乱数 (mulberry32)
export function seeded(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

export function weighted(entries) {
  // entries: [[value, weight], ...]
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

// スプレッドシートの色名 → HEX
export const COLOR_NAMES = {
  白: '#f4f4f4', 黒: '#2c2c2c', 灰: '#9a9a9a', 赤: '#e04646', 薄赤: '#f19a9a',
  橙: '#f39a3b', 薄橙: '#fbc994', 黄: '#f5d43a', 薄黄: '#fbeea0', 濃黄: '#e0b000',
  黄緑: '#a5d64a', 薄黄緑: '#d2ef9e', 緑: '#3cb45a', 濃緑: '#1f6b34', 青緑: '#2fb3a0',
  水: '#7ecbf0', 薄水: '#bfe6f7', 青: '#3a6fd8', 薄青: '#a9c2f0', 紫: '#9a5cc8',
  薄紫: '#cdb3ea', 桃: '#f28ab0', 薄桃: '#f8c6d6', 茶: '#8a5a33', 濃茶: '#5a3a1e',
  薄茶: '#c8a27a', 虹: 'rainbow',
};
export const colorOf = (name, fallback = '#cccccc') => COLOR_NAMES[name] || fallback;

export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// 時間: 1日 = 現実の20分
export const MIN_PER_DAY = 1440;
export const REAL_SEC_PER_GAME_MIN = (20 * 60) / MIN_PER_DAY;

export function fmtTime(t) {
  const day = Math.floor(t / MIN_PER_DAY) + 1;
  const m = Math.floor(t % MIN_PER_DAY);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { day, hh, mm, text: `${day}日目 ${hh}:${mm}` };
}

export const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
