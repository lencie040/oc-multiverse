import { hashStr } from './util.js?v=58';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1v2nMhZftw4EIEVcpOMluSK8nlz62roy7OMkh23AyvE4/gviz/tq';
const CACHE_NAME = 'oc-multiverse-catalog';
const WORLD_FIELDS = ['汎異記号', '世界線名', '読み方', '世界団名'];
const STATS = ['H', 'A', 'B', 'C', 'D', 'S'];
const COLORS = ['カラー1', 'カラー2', 'カラー3'];
const ABILITIES = ['通常特性1', '通常特性2', '夢特性'];
const SIGS = ['専用技1', '専用技2', '専用技3'];
const CHAR_FIELDS = ['全界番号', 'キャラ名', 'キャラ名読み', '汎異記号', '世界団', '最大ランク(並び替え用)', '漢字', 'タイプ', '族', '勢力', '誕生日', 'コスト', ...STATS, ...COLORS, ...ABILITIES, ...SIGS];

function readCsv(csv, fields) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') { value += c; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(value.trim());
      value = '';
      if (c !== ',') {
        rows.push(row);
        row = [];
        if (c === '\r' && csv[i + 1] === '\n') i++;
      }
    } else value += c;
  }
  if (quoted) throw new Error('CSV の引用符が閉じていません');
  if (row.length || value) rows.push([...row, value.trim()]);
  const header = rows.shift() || [];
  const columns = fields.map((field) => header.indexOf(field));
  if (columns.includes(-1) || rows.some((r) => r.some(Boolean) && r.length !== header.length)) {
    throw new Error('スプレッドシートの列を確認してください');
  }
  return rows.map((r) => Object.fromEntries(fields.map((field, i) => [field, r[columns[i]] ?? ''])));
}

async function fetchRows(gid, fields, signal) {
  const url = new URL(SHEET_URL);
  url.search = new URLSearchParams({ gid, headers: '1', tqx: 'out:csv' });
  const res = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!res.ok || !res.headers.get('content-type')?.includes('text/csv')) {
    throw new Error(`シート ${gid} を取得できません (${res.status})`);
  }
  return readCsv((await res.text()).replace(/^\uFEFF/, ''), fields);
}

function number(value) {
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
const withoutDash = (value) => value === '-' ? '' : value;
const usableKey = (key) => key && !Object.hasOwn(Object.prototype, key);

async function fetchCatalog() {
  const checkedAt = Date.now();
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 8000);
  const [worldRows, charRows] = await Promise.all([
    fetchRows('457238230', WORLD_FIELDS, ctl.signal),
    fetchRows('0', CHAR_FIELDS, ctl.signal),
  ]).finally(() => { clearTimeout(timeout); ctl.abort(); });
  const worlds = new Map();
  for (const row of worldRows) {
    const { 汎異記号: id, 世界線名: label, 読み方: yomi, 世界団名: dan } = row;
    if (!usableKey(id) || !label || !usableKey(dan)) continue;
    const match = /^(.+?)[(（](.+)[)）]$/.exec(label);
    const [, sub, name] = match ?? ['', '', label];
    worlds.set(id, { id, name, sub, yomi, num: Number(/\d+/.exec(id)?.[0] ?? 0), dan });
  }
  const chars = new Map();
  for (const row of charRows) {
    const { 全界番号: id, キャラ名: name, キャラ名読み: yomi, 汎異記号: hani, 世界団: group } = row;
    // 派生形態・イベント衣装・種族値が未入力のキャラは従来どおり登場させない。
    if (!usableKey(id) || id.includes('[') || id.startsWith('EV') || !name || !hani || !row.H) continue;
    const [, dan, danYomi] = /^(.+?)[(（](.+)[)）]$/.exec(group) ?? ['', group, ''];
    const character = {
      id, name, yomi, hani, rank: parseInt(row['最大ランク(並び替え用)'], 10) || 1,
      kanji: [...(row['漢字'] || name)][0], colors: COLORS.map((field) => row[field]).filter(Boolean),
      stats: STATS.map((field) => Math.trunc(number(row[field]))), type: row['タイプ'],
      zoku: withoutDash(row['族']), seiryoku: withoutDash(row['勢力']), birthday: row['誕生日'],
      cost: number(row['コスト']), abilities: ABILITIES.map((field) => row[field]),
      sigs: SIGS.map((field) => row[field]).filter(Boolean),
    };
    chars.set(id, { character, dan, danYomi });
  }
  if (!worlds.size || !chars.size) throw new Error('スプレッドシートのデータが空です');
  return {
    checkedAt,
    rows: new Map([
      ...[...worlds].map(([id, world]) => [`world:${id}`, world]),
      ...[...chars].map(([id, entry]) => [`char:${id}`, entry]),
    ]),
  };
}

function openCache() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rows', { keyPath: 'key' });
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function cachedRows(latest) {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('rows', latest ? 'readwrite' : 'readonly');
      const store = tx.objectStore('rows');
      const req = store.getAll();
      let rows;
      req.onsuccess = () => {
        const previous = new Map(req.result.map(({ key, data }) => [key, data]));
        const checkedAt = previous.get('checkedAt') ?? 0;
        previous.delete('checkedAt');
        rows = previous;
        if (!latest || latest.checkedAt < checkedAt) return;
        rows = latest.rows;
        for (const [key, data] of rows) {
          if (JSON.stringify(data) !== JSON.stringify(previous.get(key))) store.put({ key, data });
        }
        for (const key of previous.keys()) if (!rows.has(key)) store.delete(key);
        store.put({ key: 'checkedAt', data: latest.checkedAt });
      };
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function mergeCatalog(base, rows) {
  const worlds = new Map(base.worlds.map((w) => [w.id, w]));
  const chars = new Map(base.chars.map((c) => [c.id, c]));
  const dans = new Map(base.dans.map((d) => [d.id, d]));
  const readings = new Map();
  // IndexedDB はキー順で返すので、新規データの並びを初回とキャッシュ利用時で揃える。
  const keys = [...rows.keys()].sort();
  for (const key of keys) {
    if (!key.startsWith('world:')) continue;
    const world = rows.get(key);
    worlds.set(world.id, world);
  }
  for (const key of keys) {
    if (!key.startsWith('char:')) continue;
    const { character, dan, danYomi } = rows.get(key);
    if (danYomi) readings.set(dan, danYomi);
    if (!worlds.has(character.hani)) continue;
    const img = chars.get(character.id)?.img ?? null;
    chars.set(character.id, { ...character, img });
  }
  const usedDans = new Set([...worlds.values()].map((world) => world.dan));
  for (const dan of usedDans) {
    if (!dans.has(dan)) dans.set(dan, { id: dan, yomi: readings.get(dan) ?? '' });
  }
  return { ...base, worlds: [...worlds.values()], chars: [...chars.values()], dans: [...dans.values()].filter((dan) => usedDans.has(dan.id)) };
}

async function loadPortraits() {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch('data/portraits.json', { cache: 'no-cache', signal: ctl.signal });
    if (!res.ok) return new Set();
    const ids = await res.json();
    return new Set(Array.isArray(ids) ? ids : []);
  } catch (e) {
    console.warn('イラスト一覧を取得できません:', e);
    return new Set();
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadGameData() {
  const bundled = fetch('data/data.json?v=58', { cache: 'force-cache' }).then((res) => {
    if (!res.ok) throw new Error(`同梱データを取得できません (${res.status})`);
    return res.json();
  });
  const remote = fetchCatalog().catch((e) => { console.warn('シートの取得に失敗しました:', e); return null; });
  const [base, latest, portraits] = await Promise.all([bundled, remote, loadPortraits()]);
  const rows = await cachedRows(latest).catch((e) => {
    console.warn('データキャッシュにアクセスできません:', e);
    return latest?.rows ?? new Map();
  });
  const raw = mergeCatalog(base, rows);
  // イラストだけの更新で、参加できるオンライン対戦の部屋が変わらないようにする。
  const revision = hashStr(JSON.stringify(raw));
  for (const c of raw.chars) {
    if (portraits.has(c.id)) c.img = `img/${encodeURIComponent(c.id)}.png`;
  }
  return { raw, revision, checkedAt: latest?.checkedAt ?? 0 };
}
