// アイテムの一覧。shop は売っているキャラ、sell は買取の割合 (みみたんが 1/3〜1/2 で買い取る)
// kind: heal=回復 / cure=状態異常 / buff=戦闘中の能力アップ / exp=経験値 / food=食料 / bread=逃走 / hold=持たせる / field=移動・救助
export const ITEMS = {
  // くーたんの何でも屋
  kizu: { name: 'きずぐすり', price: 150, sell: 1 / 2, shop: 'general', kind: 'heal', hp: 0.3, desc: '戦闘中にHPを30%回復する' },
  kizu2: { name: 'いいきずぐすり', price: 500, sell: 1 / 2, shop: 'general', kind: 'heal', hp: 0.6, desc: '戦闘中にHPを60%回復する' },
  manten: { name: 'まんたんのくすり', price: 1400, sell: 1 / 2, shop: 'general', kind: 'heal', hp: 1, desc: '戦闘中にHPを全回復する' },
  nandemo: { name: 'なんでもなおし', price: 350, sell: 1 / 2, shop: 'general', kind: 'cure', desc: '戦闘中に状態異常をすべて治す' },
  power: { name: 'パワードリンク', price: 400, sell: 1 / 3, shop: 'general', kind: 'buff', st: ['A', 'C'], n: 1, desc: '戦闘中にAとCを1段階上げる' },
  guard: { name: 'ガードドリンク', price: 400, sell: 1 / 3, shop: 'general', kind: 'buff', st: ['B', 'D'], n: 1, desc: '戦闘中にBとDを1段階上げる' },
  speed: { name: 'スピードドリンク', price: 400, sell: 1 / 3, shop: 'general', kind: 'buff', st: ['S'], n: 2, desc: '戦闘中にSを2段階上げる' },
  kire: { name: 'キレのお香', price: 600, sell: 1 / 3, shop: 'general', kind: 'buff', st: ['kire'], n: 2, desc: '戦闘中にキレを2段階上げる' },
  motive: { name: 'やる気のお守り', price: 900, sell: 1 / 3, shop: 'general', kind: 'buff', st: ['mot'], n: 2, desc: '戦闘中にモチベーションを2段階上げる' },
  shield: { name: 'シールドの札', price: 1000, sell: 1 / 3, shop: 'general', kind: 'shield', desc: '戦闘中に最大HPの40%のシールドを張る' },
  candyS: { name: 'けいけんアメS', price: 300, sell: 1 / 3, shop: 'general', kind: 'exp', exp: 0.5, desc: '次のレベルまでの半分の経験値を得る' },
  candyM: { name: 'けいけんアメM', price: 1000, sell: 1 / 3, shop: 'general', kind: 'exp', exp: 2, desc: 'レベル2つ分の経験値を得る' },
  candyL: { name: 'けいけんアメL', price: 4500, sell: 1 / 3, shop: 'general', kind: 'exp', exp: 10, desc: 'レベル10個分の経験値を得る' },
  ptTicket: { name: '移動ポイント券', price: 2500, sell: 1 / 3, shop: 'general', kind: 'field', pts: 5, desc: '移動ptが5増える' },
  homeWing: { name: 'ふるさとの翼', price: 3000, sell: 1 / 3, shop: 'general', kind: 'field', desc: '世界線の中から、すぐ家に帰れる' },
  beacon: { name: '復活のしずく', price: 5000, sell: 1 / 2, shop: 'general', kind: 'field', desc: '宇宙で倒れた時に使うと、自力で立ち上がれる' },
  cloak: { name: 'ステルスマント', price: 3500, sell: 1 / 3, shop: 'general', kind: 'field', desc: '次の世界線移動で魔物に会わない' },
  // 持たせる木の実 (オリジナル持ち物シートより)
  radom: { name: 'ラドムのみ', price: 3200, sell: 2 / 5, shop: 'general', kind: 'hold', held: { cure: 1 }, desc: '持たせると、オリジナル状態異常を回復する' },
  gekii: { name: 'ゲキイのみ', price: 2000, sell: 2 / 5, shop: 'general', kind: 'hold', held: { pinch: 'kon' }, desc: '持たせると、ピンチの時に渾身の一撃が出やすくなる' },
  nihA: { name: 'ニハのみ', price: 3200, sell: 2 / 5, shop: 'general', kind: 'hold', held: { pinch: 'kire' }, desc: '持たせると、ピンチの時に1度だけキレが上がる' },
  kokoi: { name: 'ココイのみ', price: 2400, sell: 2 / 5, shop: 'general', kind: 'hold', held: { pinch: 'mot' }, desc: '持たせると、ピンチの時にモチベーションが上がる' },
  // きーたん&こーたんの八百屋
  onigiri: { name: 'おにぎり', price: 40, sell: 1 / 3, shop: 'food', kind: 'food', food: 1, desc: '食料が1増える' },
  yasai: { name: '野菜セット', price: 170, sell: 1 / 3, shop: 'food', kind: 'food', food: 5, desc: '食料が5増える' },
  bento: { name: 'まんぷく弁当', price: 320, sell: 1 / 3, shop: 'food', kind: 'food', food: 10, desc: '食料が10増える' },
  // みるくのパン屋
  bread: { name: 'みるくパン', price: 8000, sell: 1 / 2, shop: 'bread', kind: 'bread', max: 3, desc: '魔物にやられそうな時に逃げられる（宇宙では使えない・3個まで）' },
};

// 店を開いているキャラの名前
export const SELLERS = { general: ['くーたん'], buyer: ['みみたん'], food: ['きーたん', 'こーたん'], bread: ['みるく'] };
export const SHOP_NAMES = { general: 'くーたんの何でも屋', buyer: 'みみたんの買取屋', food: 'きーたん＆こーたんの八百屋', bread: 'みるくのパン屋' };
export const sellPrice = (id) => Math.floor(ITEMS[id].price * ITEMS[id].sell);
// GUDAZON SHOP で買える物 (パンは売っていない)
export const onlineItems = () => Object.keys(ITEMS).filter((id) => ITEMS[id].kind !== 'bread');
// 現代からの距離で値段が上がる。最低でも1.5倍
export const onlinePrice = (id, dist) => Math.ceil(ITEMS[id].price * (1.5 + Math.min(dist, 10) * 0.1));
