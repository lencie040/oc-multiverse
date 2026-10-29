// 世界線ごとの雰囲気 (地面の色・空の色・構造物・自然物・パーティクル・ランドマーク・好まれる趣味)
// props は "種類[#色]:重み" をカンマ区切り
import * as THREE from 'three';

const T = {
  現代: ['#7fbf5a', '#87c5ff', 'building:4,tree:3,lamp:2,bush:1', 'leaf', 'tower', 'ゲーム,カラオケ'],
  古代: ['#c9a86a', '#f3d9a0', 'pillar:3,ruin:3,pyramid:1,palm:2,rock:2', 'dust', 'pyramid', '石版の解読'],
  零界: ['#b8d8e8', '#dfeefa', 'crystal#d8f0ff:3,icespike:2,rock#c8d8e0:2,pine#e0f0ff:1', 'snow', 'obelisk', '雪だるま作り'],
  未来: ['#5a6b8c', '#1b2a4a', 'skyscraper:4,neon:3,lamp:2', 'spark', 'skyscraper', 'VRゲーム,ドローン操縦'],
  魔界: ['#4a2350', '#2a0d2e', 'spike:4,tree#3a2a3a:2,lava:1,crystal#a040ff:2', 'ember', 'obelisk', '黒魔術の研究'],
  異界: ['#6a8f7c', '#3e2f5b', 'crystal#9fffd0:2,eye:2,knot#7affc0:2,mushroom#c080ff:2', 'spark', 'knot', '不思議な石集め'],
  冥界: ['#3b3f4f', '#121826', 'tomb:4,lantern:3,tree#2d2d33:2', 'wisp', 'temple', '墓参り'],
  天界: ['#f2f0e6', '#cfe8ff', 'cloud:4,temple:1,pillar#ffffff:2,flower#ffffff:2', 'petal', 'temple', '雲の上でお昼寝,ハープ演奏'],
  賢界: ['#4f7fa6', '#a7c4dc', 'books:4,tower:1,lamp:2,tree:2', 'paper', 'tower', '読書,論文執筆'],
  妖星: ['#8a6fd1', '#24184d', 'star:3,mushroom#ff9ad5:3,crystal#e0b0ff:2,flower#ffd0ff:2', 'star', 'star', '星占い'],
  然界: ['#3f9b3a', '#9fdc9a', 'tree:5,pine:3,flower:2,rock:1,pond:1', 'leaf', 'bigtree', '虫取り,森林浴'],
  憶界: ['#a68a9f', '#5d4b63', 'frame:3,clock:2,paper:2,ruin:1', 'dust', 'clock', 'アルバム整理'],
  飴界: ['#ffb3d1', '#ffe0ee', 'lollipop:4,candycane:3,donut:1', 'spark', 'lollipop', '飴細工'],
  幼界: ['#ffd98a', '#fff2c2', 'ball:3,crate#ff9a9a:3,flower:2,tree:1', 'bubble', 'ball', '積み木,かくれんぼ'],
  海界: ['#2f8fbf', '#8fd4ff', 'coral:3,seaweed:3,pond:2,rock#8aa0a8:2,palm:1', 'bubble', 'coral', '釣り,水泳'],
  炎界: ['#b33a1a', '#3a1208', 'volcano:2,lava:3,rock#5a2a1a:3,flame:2', 'ember', 'volcano', '焚き火'],
  旧界: ['#8c7b62', '#b6a98e', 'ruin:3,tree#7a6a4a:2,crate:2,lamp:1', 'dust', 'clock', '骨董品集め'],
  初界: ['#a6e3a1', '#e9fff0', 'flower:4,bush:3,tree:2', 'petal', 'bigtree', '日記を書く'],
  幽界: ['#5d6e8f', '#1d2338', 'lantern:3,tomb:2,tree#3d4a5c:3', 'wisp', 'torii', '肝試し'],
  回界: ['#c96fb0', '#4d2040', 'spiral:4,knot:2,clock:1', 'spark', 'spiral', 'コマ回し'],
  還界: ['#6fc9b8', '#2a5a52', 'spiral:2,clock:3,pond:2', 'bubble', 'clock', '思い出巡り'],
  数界: ['#e8e8ff', '#3a3a70', 'numblock:5,obelisk:1', 'spark', 'numblock', '数独,計算'],
  脱界: ['#b4c44a', '#e6eb9e', 'crate:3,pipe:2,rock:2,building:1', 'dust', 'tower', '脱出ゲーム'],
  黒界: ['#2a2a2a', '#0a0a0a', 'spike:4,rock#111111:2,crystal#555555:2', 'ash', 'obelisk', '影絵'],
  闇界: ['#1d1430', '#060310', 'spike:3,eye:2,crystal#4b2a8a:2', 'wisp', 'obelisk', '闇鍋'],
  孕界: ['#e7a6a0', '#ffd6cc', 'blob#ffc0cb:3,flower:3,nest:2', 'petal', 'heart', '子守唄'],
  菓界: ['#d9a066', '#ffe8c8', 'cake:3,donut:3,candycane:1,lollipop:1', 'spark', 'cake', 'お菓子作り'],
  風界: ['#b6e0c8', '#d8f4ff', 'windmill:4,bush:2,tree:2', 'leaf', 'windmill', '凧揚げ'],
  紀界: ['#8d9b5a', '#c8d68a', 'pine:3,bone:2,rock:2,bush:2,volcano:1', 'leaf', 'bone', '化石掘り'],
  団界: ['#e0b04a', '#ffe7a8', 'banner:4,stage:1,tree:2', 'spark', 'stage', '団体練習'],
  書界: ['#e9dcc0', '#f7efe0', 'books:5,paper:2,lamp:1', 'paper', 'books', '読書,執筆'],
  音界: ['#3a3f8f', '#1c1f50', 'note:4,speaker:3,stage:1', 'note', 'speaker', '楽器演奏,作曲'],
  写界: ['#a0a0a8', '#dcdce4', 'frame:4,tv:2,lamp:2', 'spark', 'frame', '写真撮影'],
  耗界: ['#9c8a70', '#6d6152', 'rock:3,ruin:2,dustpile:3', 'dust', 'obelisk', '修理'],
  虚界: ['#6e6a8a', '#0e0c1c', 'crystal#b6a8ff:3,mirror:2,blob#2a2840:2', 'star', 'mirror', '瞑想'],
  夢界: ['#c5a3ff', '#5e4a9e', 'cloud#e8dcff:3,star:3,ball#ffccff:2', 'bubble', 'star', '夢日記'],
  姫界: ['#ffc2e6', '#ffe3f4', 'flower#ff8fc7:3,heart:2,temple#fff0f8:1,tree#f7a8d0:2', 'petal', 'castle', 'お茶会'],
  枢界: ['#7b8794', '#c7d0d8', 'gear:3,pipe:2,tower:1,building:2', 'spark', 'gear', '機械いじり'],
  護界: ['#6b8f5e', '#b6cfae', 'pillar#8a9a80:2,tower:2,tree:2,rock:2', 'leaf', 'tower', '剣の素振り'],
  箱界: ['#c28f5b', '#f1d9b8', 'crate:6', 'dust', 'crate', '箱の整理'],
  轟界: ['#d14a2a', '#4a1c10', 'speaker:3,rock:2,spike#7a2a1a:2,flame:1', 'ember', 'speaker', 'ドラム'],
  銅界: ['#b87333', '#6a4a35', 'ingot#b87333:4,gear#a06030:2,pipe#b87333:2', 'spark', 'tower', '金属加工'],
  鉄界: ['#6f747a', '#3c4045', 'ingot#8a9097:4,pipe:2,gear:2', 'spark', 'tower', '鍛冶'],
  埃界: ['#b5ab99', '#cfc6b5', 'dustpile:4,rock:2,crate:1', 'dust', 'dustpile', '掃除'],
  桃界: ['#ffb6b9', '#ffe2e2', 'fruittree#ffb0b8:5,flower:2', 'petal', 'bigtree', '桃狩り'],
  式界: ['#d5e0f0', '#2c3e5c', 'numblock:3,letterblock:2,obelisk:2', 'spark', 'numblock', '数式を解く'],
  恋界: ['#ff7a9c', '#ffd1df', 'heart:4,flower#ff5577:3,tree#ffb3c6:2', 'heart', 'heart', 'ラブレター書き'],
  金界: ['#e6c34a', '#fff1b0', 'ingot#ffd700:4,crystal#ffe680:2,pillar#ffe9a0:2', 'spark', 'obelisk', '宝石磨き'],
  塔界: ['#9aa5b8', '#c5d6ef', 'tower:5,rock:1', 'leaf', 'tower', '塔登り'],
  曖界: ['#b9a6c9', '#9e93b0', 'blob#d4c8e0:3,cloud#c7bbd6:3,mirror:1', 'dust', 'mirror', 'ぼんやりする'],
  南界: ['#e8d27a', '#8fe0ff', 'palm:4,parasol:2,pond:1,flower#ff6a3d:2', 'leaf', 'palm', '日光浴'],
  種界: ['#7a5a3a', '#c2e3a6', 'bush#6fcf5f:4,flower:2,tree:2', 'leaf', 'bigtree', 'ガーデニング'],
  脳界: ['#f0a8b8', '#3d2a4a', 'blob#f4b6c4:4,knot#ff9ec0:2', 'spark', 'blob', 'パズル'],
  片界: ['#9e8fa3', '#4b4152', 'crystal#c9b8d0:3,ruin:2,frame:2', 'dust', 'crystal', 'かけら集め'],
  球界: ['#4fb06a', '#9ed4ff', 'ball:5,banner:1', 'leaf', 'ball', '球技'],
  心界: ['#ff9eb5', '#ffdfe7', 'heart:3,flower:2,bush:2', 'heart', 'heart', 'カウンセリングごっこ'],
  銀界: ['#c0c6cc', '#e6ebf0', 'ingot#d8dde2:3,crystal#e8f0f8:2,pillar#dfe3e8:2', 'snow', 'obelisk', '銀細工'],
  鴢界: ['#4fa3a5', '#bfe8e6', 'pond:3,nest:2,bush:2,tree:1', 'leaf', 'pond', '水浴び'],
  線界: ['#f4f4f4', '#202020', 'pole:3,spiral:2,pipe#222222:1', 'spark', 'obelisk', '線画'],
  乖界: ['#8f6fa8', '#2d1f3d', 'spike#a07ec4:3,crystal:2,ruin:2', 'wisp', 'spike', 'いたずら'],
  脈界: ['#b03a4a', '#3a0d14', 'knot#d04050:3,blob#c04050:2,pipe#a02030:2', 'ember', 'knot', '脈を測る'],
  滴界: ['#5ab4d8', '#cdeefc', 'drop:4,pond:3,bush:1', 'rain', 'drop', '雨音を聴く'],
  紙界: ['#f2ead8', '#fffaf0', 'paper:4,books:2,crate#f0e6d0:1', 'paper', 'books', '折り紙'],
  鏡界: ['#b8d4e0', '#e8f4fa', 'mirror:5,crystal:2', 'spark', 'mirror', '鏡磨き'],
  骨界: ['#d9d1bf', '#6a6252', 'bone:5,rock:2,tomb:1', 'dust', 'bone', '骨格標本作り'],
  灼界: ['#e0602a', '#ff9a4a', 'volcano:2,lava:2,flame:3,rock#7a3010:2', 'ember', 'volcano', '温泉'],
  毒界: ['#6a9a2a', '#2e3a10', 'mushroom#9be03a:3,toxic:3,tree#3a4a1a:2', 'bubble', 'mushroom', '薬草調合'],
  翠界: ['#2fbf8f', '#c4f2e0', 'crystal#3fd9a0:3,bamboo:3,tree:2', 'leaf', 'crystal', '翡翠探し'],
  蜜界: ['#f2b632', '#ffe7a0', 'honeycomb:4,flower:3', 'spark', 'honeycomb', '養蜂'],
  画界: ['#f6efe3', '#c6e2ff', 'easel:4,flower:2,tree:2', 'petal', 'easel', 'お絵かき'],
  戯界: ['#c74f8b', '#3a1f4a', 'stage:2,ball:2,banner:2,crate:1', 'spark', 'stage', 'ボードゲーム'],
  劇界: ['#8a1f2f', '#1e0a10', 'stage:2,banner#c0283a:3,lamp:2', 'spark', 'stage', '演劇の稽古'],
  橙界: ['#9a4a1e', '#3a1f4a', 'pumpkin:5,tree#3a2a3a:3,tomb:2,lantern#ff8a1a:2,bat:2', 'ember', 'pumpkin', '仮装,お菓子集め,ジャック・オー・ランタン作り'],
  夏界: ['#f0d890', '#6fd0ff', 'palm:3,parasol:3,pond:2', 'leaf', 'parasol', 'スイカ割り,水泳'],
  夜界: ['#26305a', '#070b1e', 'lamp:3,star:2,tree#1e2a4a:2', 'star', 'tower', '天体観測'],
  宵界: ['#7a4a7a', '#ff8a6a', 'lantern:3,tree#5a3a5a:2,lamp:1', 'wisp', 'torii', '夕涼み'],
  綿界: ['#f7f3ee', '#e6f0ff', 'cotton:5,cloud:2', 'snow', 'cotton', '編み物'],
  鳥界: ['#9fd36a', '#a8e0ff', 'nest:3,tree:3,pine:1', 'petal', 'bigtree', 'バードウォッチング'],
  飛界: ['#a8d8f0', '#d0f0ff', 'cloud:3,windmill:2,nest:1', 'leaf', 'windmill', '紙飛行機'],
  愴界: ['#5e6670', '#3a4048', 'tomb:2,tree#4a4f55:3,rock:2', 'rain', 'obelisk', '詩を書く'],
  七界: ['#9aa0ff', '#ffe0f0', 'crystal#ff7aa0:1,crystal#7affa0:1,crystal#7aa0ff:1,ball:2,flower:2', 'spark', 'star', '虹探し'],
  䟖界: ['#5a8f6a', '#d0e8c0', 'bush:3,tree:2,mushroom:2,rock:2', 'leaf', 'bigtree', '散策'],
  機界: ['#5a6070', '#2a2e38', 'gear:4,pipe:3,tv:1', 'spark', 'gear', 'ロボット作り'],
  隔界: ['#4a4a6a', '#12121e', 'pillar#6a6a9a:3,crystal:2,obelisk:2', 'spark', 'obelisk', '壁当て'],
  聖界: ['#fff6d8', '#fff0b8', 'temple:2,pillar#ffffff:3,flower#fff3a0:2', 'spark', 'temple', 'お祈り'],
  鍵界: ['#b89a5a', '#3a2e1e', 'key:4,crate:2,ingot#d4b060:1', 'spark', 'key', '鍵開けの練習'],
  晶界: ['#a6e0ff', '#2a3e60', 'crystal:6', 'spark', 'crystal', '鉱石採集'],
  字界: ['#f0f0e0', '#d0d8e0', 'letterblock:5,books:1', 'paper', 'letterblock', '書道'],
  儡界: ['#8a6a5a', '#3a2a2a', 'puppet:4,stage:1,crate:1', 'dust', 'puppet', '人形劇'],
  月界: ['#c8c8d0', '#05060f', 'moonrock:4,crystal#e0e0ff:1,rock#a0a0a8:2', 'star', 'obelisk', '月見'],
  彩界: ['#ff8fd1', '#fff0a0', 'flower:3,ball:2,easel:1,crystal#7affea:2', 'petal', 'crystal', '色塗り'],
  布界: ['#c9a0dc', '#f0e0ff', 'banner:4,cotton:1,parasol:1', 'petal', 'banner', '裁縫'],
  虎界: ['#e0a030', '#ffe3a0', 'bamboo:4,rock:2,bush:2', 'leaf', 'torii', '狩りごっこ'],
  暗界: ['#20232a', '#050608', 'rock#1a1a20:3,spike:2,lantern:1', 'wisp', 'obelisk', '暗闇探検'],
  火界: ['#ff6a20', '#ffb070', 'flame:4,rock:2,volcano:1', 'ember', 'volcano', '焚き火'],
  暴界: ['#7a1a1a', '#200505', 'spike#3a0a0a:3,rock#4a1010:3,flame:2', 'ember', 'spike', '腕相撲'],
  汽界: ['#d9b0ff', '#ffd6f0', 'cake:2,cloud:2,star:2,donut:1', 'bubble', 'cake', 'お菓子の夢を見る'],
  薥界: ['#e0e4ff', '#10142e', 'cloud:2,moonrock:2,temple:1,star:2', 'star', 'temple', '月光浴'],
  使界: ['#ffe9a8', '#6a5a90', 'ball:2,spike:2,crate:2', 'spark', 'obelisk', 'おままごと'],
  宇宙A: ['#14143a', '#000000', 'star:4,moonrock:3,crystal#8080ff:1', 'star', 'star', '宇宙遊泳'],
  対界: ['#9a8cc0', '#e0dcf0', 'mirror:3,obelisk:2,pillar:2', 'spark', 'mirror', 'にらめっこ'],
  呪界: ['#8a3a1a', '#2a0a00', 'ruin:3,flame:2,pyramid:1,tomb:1', 'ember', 'pyramid', '呪文の練習'],
  筋界: ['#c86a3a', '#3a1a10', 'speaker:2,ingot#555555:3,rock:2', 'ember', 'speaker', '筋トレ'],
  勉界: ['#8fbfdf', '#e0f0ff', 'books:3,lamp:2,building:1,tree:2', 'paper', 'tower', '勉強'],
  氷界: ['#c6ecff', '#a8d8f0', 'icespike:4,crystal#ccffff:2,pine#e0f0ff:2', 'snow', 'icespike', 'スケート'],
  飾界IF: ['#f0c0e0', '#fff0f8', 'banner:2,crystal#ffb0e0:2,flower:2,lantern:1', 'spark', 'heart', 'アクセサリー作り'],
};

// EX / IF / SP 系は元の世界線をベースに色味を変える
function variant(base, kind) {
  const b = T[base];
  if (!b) return null;
  const g = new THREE.Color(b[0]);
  const s = new THREE.Color(b[1]);
  const hsl = {};
  if (kind === 'EX') {
    g.getHSL(hsl); g.setHSL((hsl.h + 0.04) % 1, Math.min(1, hsl.s * 1.2 + 0.1), hsl.l * 0.62);
    s.getHSL(hsl); s.setHSL((hsl.h + 0.75) % 1, Math.min(1, hsl.s + 0.2), hsl.l * 0.45);
    return ['#' + g.getHexString(), '#' + s.getHexString(), b[2] + ',crystal#ff4fa0:2,spike#30203a:1', 'spark', b[4], b[5]];
  }
  if (kind === 'IF') {
    g.getHSL(hsl); g.setHSL((hsl.h + 0.08) % 1, hsl.s * 0.75, Math.min(0.85, hsl.l * 0.8 + 0.25));
    s.getHSL(hsl); s.setHSL((hsl.h + 0.9) % 1, hsl.s * 0.8, Math.min(0.9, hsl.l * 0.7 + 0.3));
    return ['#' + g.getHexString(), '#' + s.getHexString(), b[2] + ',cloud#ffe8ff:2', 'bubble', b[4], b[5]];
  }
  g.getHSL(hsl); g.setHSL((hsl.h + 0.12) % 1, Math.min(1, hsl.s + 0.15), hsl.l * 0.9);
  s.getHSL(hsl); s.setHSL((hsl.h + 0.6) % 1, Math.min(1, hsl.s + 0.2), hsl.l * 0.6);
  return ['#' + g.getHexString(), '#' + s.getHexString(), b[2] + ',star:2', 'star', b[4], b[5]];
}

const cache = new Map();

export function themeOf(world) {
  if (cache.has(world.id)) return cache.get(world.id);
  let row = T[world.name];
  if (!row) {
    const m = world.name.match(/^(.+?)(EX|IF|SP)$/);
    if (m) row = variant(m[1], m[2]);
  }
  if (!row) row = ['#8fae7a', '#a8c8e8', 'tree:3,rock:2,bush:2', 'leaf', 'obelisk', '散歩'];
  const props = row[2].split(',').map((p) => {
    const [k, w] = p.split(':');
    const [kind, color] = k.split('#');
    return { kind, color: color ? '#' + color : null, weight: Number(w) || 1 };
  });
  const th = {
    ground: row[0], sky: row[1], props, particle: row[3], landmark: row[4],
    hobbies: (row[5] || '').split(',').filter(Boolean),
    water: /pond|coral|seaweed|drop/.test(row[2]),
  };
  cache.set(world.id, th);
  return th;
}
