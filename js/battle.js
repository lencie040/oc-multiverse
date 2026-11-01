// バトルのしくみ。オリキャラ図鑑の対戦エンジンを移植し、レベルと複数人の戦いに対応させたもの
// 特性と技の文章を読み取って効果を決める。戦闘は startBattle で始め、battleTurn でターンを回す
import { typeMult, splitTypes } from './types.js?v=45';

const rnd = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), pick = (a) => a[Math.floor(rnd() * a.length)];
const mult = (t, x) => typeMult(t, x);
let TYPES = [], ABILITIES = [], VB = null;
const lvK = (m) => Math.floor((2 * m.lv) / 5) + 2; // ダメージ式のレベルの項 (Lv50で22)
const hpSnap = () => VB.sd.flatMap((x) => x.tm.map((m) => [m.id, m.hp, m.max, m.vol.sh ? m.vol.sh.hp : 0]));
const TIMES=['早朝','朝','昼','夕方','夜','深夜'],WEATHERS=['晴れ','雨','雷雨','砂嵐','雪','晴天'];
const PLACE={草原:{},砂漠:{炎:1.3},深海:{水:1.3},街中:{無:1.3},神域:{光:1.5},砂浜:{水:1.5},月海:{月:1.5}};
const MONTH={1:{氷:1.2},2:{氷:1.4},3:{氷:1.2,妖:1.2},4:{妖:1.4},5:{妖:1.2,花:1.2},6:{花:1.4},7:{花:1.2,虫:1.2},8:{虫:1.4},9:{虫:1.2,闇:1.2},10:{闇:1.4},11:{闇:1.2,氷:1.2},12:{氷:1.2,水:1.2}};
const CATN={p:'物理',s:'特殊',x:'変化',v:'虚空',a:'反質',f:'封印'};
const STN={A:'攻撃',B:'防御',C:'特攻',D:'特防',S:'素早さ',acc:'命中率',eva:'回避率',mot:'モチベーション',kire:'キレ',sug:'糖度'};
const SCAP={mot:[-4,4],kire:[-4,4],sug:[0,3]};
const SSN={獄炎:'獄炎',やけど:'やけど',まひ:'まひ',麻痺:'まひ',こおり:'こおり',もうどく:'もうどく',どく:'どく',硬直:'硬直',ビター:'ビター',混乱:'こんらん',こんらん:'こんらん',瘴気:'瘴気',オーブン:'オーブン',ミイラ:'ミイラ',フローズン:'フローズン',シャーベット:'シャーベット',断裂:'断裂',封印:'封印',呪い:'呪い',紅色:'紅色',しおづけ:'しおづけ',塩漬け:'しおづけ',怯み:'怯み',怯む:'怯み',怯ま:'怯み',ひるみ:'怯み',メロメロ:'メロメロ',ねむり:'ねむり'};
const SSRE=new RegExp('('+Object.keys(SSN).sort((a,b)=>b.length-a.length).join('|')+')','g');
const MAINS=['やけど','まひ','こおり','どく','もうどく','ねむり'],ORIG=['硬直','断裂','ミイラ','オーブン','ビター','フローズン','シャーベット'];
const SHC={赤:'red',緑:'green',紫:'purple',白:'white'},SHN={red:'赤',green:'緑',purple:'紫',white:'白'};
/* --- 文章の正規化・段階変化の読み取り --- */
function abNorm(s){s=String(s||'').replace(/^「[^」]*」/,'').replace(/もぐもぐ\(食\)/g,'食');
 [['ノーマル','無'],['ほのお','炎'],['みず','水'],['でんき','電'],['電気','電'],['くさ','草'],['こおり','氷'],['かくとう','闘'],['どく','毒'],['じめん','地'],['ひこう','飛'],['エスパー','超'],['むし','虫'],['いわ','岩'],['ゴースト','霊'],['ドラゴン','竜'],['あく','悪'],['はがね','鋼'],['フェアリー','妖'],['やみ','闇'],['虚空','虚']].forEach(([a,b])=>{s=s.replace(new RegExp(a+'(?=タイプ|技)','g'),b)});
 return s.replace(/タイプの技|タイプ技/g,'技').replace(/タイプ/g,'').replace(/魔法攻撃/g,'C').replace(/素早さ|すばやさ/g,'S').replace(/特攻|とくこう/g,'C').replace(/特防/g,'D').replace(/防御/g,'B').replace(/実数値/g,'').replace(/ゆき/g,'雪').replace(/はれ/g,'晴れ').replace(/モチベーション/g,'M').replace(/キレ(?:ランク)?/g,'K').replace(/糖度(?:ランク)?/g,'T')}
const lets=s=>[...new Set([...s.replace(/攻撃力?/g,'A').matchAll(/[HABCDS]/g)].map(x=>x[0]))];
const SK2={e:'eva',a:'acc',M:'mot',K:'kire',T:'sug'};
function stg(s){const o=[];for(const x of s.matchAll(/(\d)段階(?:ずつ)?(アップ|上昇|上が|上げ|ダウン|下が|下げ)/g)){
 const pre=s.slice(0,x.index),cl=pre.slice(Math.max(pre.lastIndexOf('、'),pre.lastIndexOf('。'),pre.lastIndexOf('＿'),pre.lastIndexOf('／'))+1);
 const ks=[...new Set([...cl.replace(/攻撃/g,'A').replace(/回避率/g,'e').replace(/命中率/g,'a').matchAll(/[ABCDSeaMKT]/g)].map(y=>SK2[y[0]]||y[0]))];
 if(ks.length)o.push({ks,n:+x[1]*(/ダウン|下/.test(x[2])?-1:1),p:+((cl.match(/(\d+)%/)||[])[1]||100)/100,who:/相手|敵/.test(cl)?'foe':/味方全体|味方全員/.test(cl)?'team':'self',at:x.index})}return o}
function sFx(t){const o=[],T=(t.match(/(\d)ターンの間/)||[])[1];if(/いずれか/.test(t)){const L=[...t.matchAll(SSRE)].map(x=>SSN[x[1]]);return L.length?[{any:L,p:+((t.match(/(\d+)%/)||[])[1]||100)/100,who:'foe'}]:[]}t.split(/[、。,／]|させるが|が、/).forEach(cl=>{if(/場合|なら|無効|治す|デバフ|無視|ならない/.test(cl))return;const L=[...cl.matchAll(SSRE)].map(x=>SSN[x[1]]);if(!L.length)return;
 const p=+((cl.match(/(\d+(?:\.\d+)?)%/)||[])[1]||100)/100,who=/自身|自分/.test(cl)&&!/相手|敵/.test(cl)?'self':'foe',t2=+((cl.match(/(\d)ターン/)||[])[1]||T||0),n=+((cl.match(/(\d)回の怯み/)||[])[1]||1);
 if(/いずれか/.test(cl))o.push({any:L,p,who});else L.forEach(s=>o.push({s,p,who,t:t2,n}))});return o}
const TRG=[['enter',/登場|場に出た時/g],['pinch',/(?:HP|体力)が?\d\/\d以下/g],['hit',/攻撃を受けた時|接触技を受けた時/g],['end',/ターンが終わるたびに|ターン終了|毎ターン/g],['e2',/2ターンに一度/g],['ko',/倒すと/g],['x',/味方の|状態に?なった時|状態異常|受けるたび|下げられると|受けるとき|受けた次|使った直後|月が|受けるまで|技を外した/g]];
function trigAt(s,i){let b=null,bi=-1;TRG.forEach(([k,re])=>{for(const m of s.matchAll(re))if(m.index<i&&m.index>bi){bi=m.index;b=k}});return b}
function shParse(s){const m=s.match(/(紫|緑|赤|白|通常)?シールド\(HP?(\d+)(?:,?\s*B(\d+))?(?:,?\s*D(\d+))?\)/);return m?{hp:+m[2],B:m[3]?+m[3]:null,D:m[4]?+m[4]:null,col:SHC[m[1]]||null}:null}
/* --- 特性 --- */
const ABC=new Map();
function parseAb(raw){if(ABC.has(raw))return ABC.get(raw);
 const TT=TYPES.join(''),T=`[${TT}]`,f={sm:{},tp:{},imm:[],abs:{},half:[],tIn:{},wm:{},wAcc:{},wReg:{},st:{},priT:{},stk:{},sImm:[],ok:[]},ok=t=>f.ok.push(t),N=v=>+v;
 let s=abNorm(raw),m;const cut=x=>{s=s.replace(x[0],'＿')};
 for(const x of [...s.matchAll(/([^、。＿]+?)状態(?:無効|にならない)/g)])x[1].split(/[,・、や]/).forEach(n=>{n=SSN[n.trim()];if(n){f.sImm.push(n)}});if(f.sImm.length)ok(f.sImm.join('・')+'にならない');
 for(const x of [...s.matchAll(new RegExp(`(${T}+)技(?:のダメージ)?を[^。＿]*?(?:ダメージを受けず|ダメージを無効化|無効化)([^。]*)`,'g'))]){
  const r=x[2],e={heal:/回復/.test(r)?.25:0,st:stg(r).map(o=>({...o,who:'self'})),flash:N((r.match(/威力が(\d+(?:\.\d+)?)倍/)||[])[1]||0)};
  if(!e.st.length){const k=(r.match(/([ABCDS]|攻撃)が上が/)||[])[1];if(k)e.st=[{ks:[k==='攻撃'?'A':k],n:1,p:1,who:'self'}]}
  [...x[1]].forEach(t=>f.abs[t]=e);if(/寄せつけ|味方含め/.test(x[0])){f.draw=[...x[1]];ok('ダブルで'+x[1]+'技を引き寄せ')}ok(x[1]+'技を吸収');cut(x)}
 for(const x of [...s.matchAll(new RegExp(`(${T}+)技(?:無効(?!化)|を受けない)`,'g'))]){f.imm.push(...x[1]);ok(x[1]+'技無効');cut(x)}
 for(const x of [...s.matchAll(new RegExp(`(${T}+)技半減`,'g'))]){f.half.push(...x[1]);ok(x[1]+'技半減');cut(x)}
 for(const x of [...s.matchAll(/(?:攻撃するたびに|攻撃時、?)(?:自身の)?((?:[ACS]|攻撃力?|と)+)を?(\d\.\d+)倍/g)]){lets(x[1]).forEach(k=>f.stk[k]=N(x[2]));ok('攻撃ごとに'+lets(x[1]).join('')+'×'+x[2]);cut(x)}
 if(m=s.match(/攻撃を一度受けるまで((?:[ABCDS]|攻撃|と)+)(\d+(?:\.\d+)?)倍/)){f.uh={};lets(m[1]).forEach(k=>f.uh[k]=N(m[2]));ok('被弾まで'+lets(m[1]).join('')+'×'+m[2]);cut(m)}
 for(const x of [...s.matchAll(/(?:天候\[|天候が|天気が)(雨|雪|晴れ|晴天)\]?の?(?:時|とき)?[、,]\s*((?:[ABCDS]|と)+)(\d+(?:\.\d+)?)倍/g)]){const w=x[1]==='晴れ'?'晴天':x[1];f.wm[w]=f.wm[w]||{};lets(x[2]).forEach(k=>f.wm[w][k]=N(x[3]));ok(w+'で'+lets(x[2]).join('')+'×'+x[3]);cut(x)}
 if(m=s.match(/天候\[(雪|雨|晴れ)\], 敵の命中率(\d\.\d+)倍/)){f.wAcc[m[1]]=N(m[2]);ok(m[1]+'で相手の命中×'+m[2]);cut(m)}
 if(!/味方の「|以下になると/.test(s))for(const x of [...s.matchAll(/((?:[HABCDS]|と)+)(?:が|を)?(\d+(?:\.\d+)?)倍/g)]){if(!lets(x[1]).length)continue;lets(x[1]).forEach(k=>f.sm[k]=(f.sm[k]||1)*N(x[2]));ok(lets(x[1]).join('')+'×'+x[2]);cut(x)}
 for(const x of [...s.matchAll(new RegExp(`(${T}+)(?:技|の)の?(?:威力|与ダメージ)(?:が|を)?(\\d+(?:\\.\\d+)?)倍`,'g'))]){[...x[1]].forEach(t=>f.tp[t]=(f.tp[t]||1)*N(x[2]));ok(x[1]+'技×'+x[2]);cut(x)}
 if(m=s.match(new RegExp(`（([${TT}・]+)）の?技の威力が(\\d+(?:\\.\\d+)?)倍`))){m[1].split('・').forEach(t=>f.tp[t]=(f.tp[t]||1)*N(m[2]));ok(m[1]+'技×'+m[2])}
 if(m=s.match(/全ての攻撃技の威力が(\d+(?:\.\d+)?)倍/)){f.allPow=N(m[1]);ok('全技×'+m[1])}
 if(m=s.match(/物理技の威力(\d+(?:\.\d+)?)倍/)){f.physPow=N(m[1]);ok('物理技×'+m[1])}
 if(m=s.match(/瘴気ダメージとしてさらに(\d?\.\d+)倍/)){f.mia=N(m[1]);ok('瘴気+'+m[1]+'倍')}
 if(m=s.match(/(?:天気|天候)を(雨|雪|晴れ|晴天|砂嵐|雷雨|古代)/)){f.weather=m[1]==='晴れ'?'晴天':m[1];ok('天気:'+f.weather)}
 if(m=s.match(/場所を(\S+?)にし/)){if(PLACE[m[1]]){f.place=m[1];ok('場所:'+m[1])}}
 if(m=s.match(/月を(\d+)月に/)){f.month=N(m[1]);ok(m[1]+'月にする')}
 if(/時刻を深夜に固定/.test(s)){f.timeFix='深夜';ok('時刻を深夜に固定')}
 if(/「夜」と「深夜」の間だけでループ/.test(s)){f.timeLoop=1;ok('時刻が夜⇔深夜')}
 if(/現在の時刻を1段階進める/.test(s)){f.timeAdv=1;ok('時刻を進める')}
 if(/トリックルーム/.test(s)){f.tr=1;ok('トリックルーム')}
 if(m=shParse(s)){f.shield=m;const t=s.match(/(\d)ターン目開始時に解除/);if(t)f.shieldT=N(t[1]);ok((m.col?SHN[m.col]:'')+'シールド'+m.hp)}
 if(m=s.match(/毎ターン最大HPの1\/(\d+)回復/)){f.regen=1/N(m[1]);ok('毎ターン回復')}
 if(m=s.match(/(雨|雪)のとき(?:少しずつ)?HPを?(?:少しずつ)?回復/)){f.wReg[m[1]]=1/16;ok(m[1]+'で回復')}
 if(/引っ込むとHPが少し回復/.test(s)){f.outHeal=1/3;ok('交代で回復')}if(/手持ちに戻る時、HPを1\/4回復/.test(s)){f.outHeal=1/4;ok('交代で回復')}
 if(/一撃で倒されることがない/.test(s)){f.sturdy=1;ok('満タンなら耐える')}
 if(/HP1で耐える/.test(s)){f.endure=1;ok('1度だけ耐える')}
 if(m=s.match(/(?:HP|体力)が?(\d)\/(\d)以下/))f.pinchR=N(m[1])/N(m[2]);
 if(m=s.match(/(?:HP|体力)が?(\d)\/(\d)以下[^。]*?威力が?(\d)段階上が/)){f.pinchPow=1+.5*N(m[3]);ok('ピンチで威力×'+f.pinchPow)}
 if(m=s.match(/(?:HP|体力)(\d)\/(\d)以下になると技威力が(\d\.\d+)倍/)){f.pinchPow=N(m[3]);ok('ピンチで威力×'+m[3])}
 if(m=s.match(/与えたダメージの1\/(\d)を回復/)){f.drain=1/N(m[1]);ok('与ダメ吸収')}
 if(m=s.match(/与えたダメージの(\d+)%を回復/)){f.drain=N(m[1])/100;ok('与ダメ吸収')}
 if(m=s.match(/受けるダメージが(\d\.\d+)倍/)){f.inc=N(m[1]);ok('被ダメ×'+m[1])}
 if(m=s.match(/与えるダメージが(\d\.\d+)倍/)){f.out=N(m[1]);ok('与ダメ×'+m[1])}
 if(m=s.match(/被ダメージを(\d+)%ダウン/)){f.inc=1-N(m[1])/100;ok('被ダメ-'+m[1]+'%')}
 if(/必ず攻撃が命中|技が必中/.test(s)){f.sure=1;ok('必中')}
 if(/急所確率常時2倍/.test(s)){f.crit=2;ok('急所2倍')}
 if(m=s.match(/渾身の一撃の確率を\+?(\d+)%/)){f.kon=N(m[1])/100;ok('渾身+'+m[1]+'%')}
 if(/最初に与えるダメージは確定で渾身の一撃/.test(s)){f.firstKon=1;ok('初撃が渾身')}
 if(m=s.match(/弱点をついた時の威力(\d\.\d+)倍/)){f.se=N(m[1]);ok('抜群×'+m[1])}
 if(/物理技を受けた時、ダメージを3\/4/.test(s)){f.physIn=.75;ok('物理被ダメ3/4')}
 if(/接触技を受けた時、受けるダメージを半分|接触する技のダメージを半減/.test(s)){f.contIn=.5;ok('接触被ダメ半減')}
 if(m=s.match(/特殊技のダメージを常に(\d+)%軽減/)){f.specIn=1-N(m[1])/100;ok('特殊被ダメ-'+m[1]+'%')}
 if(m=s.match(new RegExp(`(${T})技のダメージは(\\d)倍`))){f.tIn[m[1]]=N(m[2])}
 if(/HPが満タンの時、受けるダメージを半減/.test(s)){f.fullHalf=1;ok('満タン時半減')}
 if(/行動するまで、受けるダメージを半減/.test(s)){f.preAct=1;ok('行動前半減')}
 if(m=s.match(/自分とおなじ技の威力が(\d\.\d+)倍/)){f.stab=N(m[1]);ok('タイプ一致×'+m[1])}
 if(m=s.match(new RegExp(`無技が(${T})(?:技)?にな`))){f.skin=m[1];f.skinPow=N((s.match(/威力が(\d\.\d+)倍/)||[,1.2])[1]);ok('無技→'+m[1])}
 if(/まもる.{0,4}貫通|攻撃無効を必ず貫通/.test(s)){f.pierce=1;ok('まもる貫通')}
 if(/全てのタイプにダメージ/.test(s)){f.noImm=1;ok('効果なしを等倍に')}
 for(const x of s.matchAll(new RegExp(`(${T})技を優先度\\+(\\d)`,'g'))){f.priT[x[1]]=N(x[2]);ok(x[1]+'技先制')}
 if(m=s.match(/変化技の優先度が(\d)段階/)){f.priX=N(m[1]);ok('変化技先制')}
 if(m=s.match(/自身より低いコストに対して与えるダメージ(\d\.\d+)倍/)){f.lowCost=N(m[1]);ok('低コスト特効')}
 if(m=s.match(/登場時、相手の体力を(\d+)%減少/)){f.enterHit=N(m[1])/100;ok('登場時削り')}
 if(m=s.match(/毎ターン開始時に[^。]*?(\d+)ダメージ/)){f.tickDmg=N(m[1]);ok('毎ターン固定ダメ')}
 if(m=s.match(/攻撃時、追加で[^。]*?固定(\d+)ダメージ/)){f.fixAdd=N(m[1]);ok('追加固定ダメ')}
 if(/接触技を受けた時、ダメージを受けず受けるはずだったダメージをそのまま相手に返/.test(s)){f.reflect=/×0\.5回復/.test(s)?.5:0;f.reflectOn=1;ok('接触技を跳ね返す')}
 if(m=s.match(/(\d+)%の復活予約/)){f.revive=N(m[1])/100;ok('復活予約'+m[1]+'%')}
 if(m=s.match(/回避率\+(\d+)%/)){f.evaAdd=N(m[1])/100;ok('回避+'+m[1]+'%')}
 if(/登場|場に出た時/.test(s)){f.enterSS=sFx(s);f.enterSS.forEach(o=>ok('登場時'+(o.who==='self'?'自分':'相手')+'に'+(o.s||o.any.join('/'))))}
 for(const o of stg(s)){const t=trigAt(s,o.at);if(!t||t==='x')continue;if(t==='ko')o.who='self';(f.st[t]=f.st[t]||[]).push(o);ok({enter:'登場時',pinch:'ピンチ時',hit:'被弾時',end:'毎ターン',e2:'2ターン毎',ko:'撃破時'}[t]+(o.who==='foe'?'相手':'')+o.ks.map(k=>k.length>1?STN[k]:k).join('')+(o.n>0?'+':'')+o.n)}
 if(/味方が受ける攻撃を一度だけ肩代わり/.test(s)){f.guard='once';ok('ダブルで1度だけ味方をかばう')}else if(/味方が受ける攻撃をすべて肩代わり/.test(s)){f.guard='all';ok('ダブルで味方をかばう')}else if(/味方が受ける攻撃を肩代わり/.test(s)){f.guard='always';ok('ダブルで味方をかばう')}
 if(m=s.match(/威力(\d+)以下の攻撃は肩代わりしない/))f.guardMin=+m[1];if(/自身が受けるダメージを半減/.test(s)){f.inc=(f.inc||1)*.5;ok('被ダメ半減')}
 if(m=s.match(/ダブルバトルなら、毎ターン反対側の敵に(\d+)の固定ダメージを与え、自身は(\d+)固定回復/)){f.hai={d:+m[1],h:+m[2]};ok('ダブルで正面に固定ダメ')}
 if(m=s.match(/ターン開始時、(\d+)%の確率で二人を行動不能にし、自身は行動不能/)){f.stun=+m[1]/100;ok('ダブルで相手2人を止める')}
 if(m=s.match(/場に味方の「(.+?)」がいる時、自分の([ABCD])と([ABCD])が(\d\.\d+)倍/)){f.allyB={nm:m[1],ks:[m[2],m[3]],m:+m[4]};ok('味方'+m[1]+'がいると'+m[2]+m[3]+'×'+m[4]);if(/50%の確率で「急所」/.test(s))f.allyCrit=1}
 EXTRA[(String(raw).match(/^「([^」]+)」/)||[])[1]]?.(f,raw);f.ok=[...new Set(f.ok)];ABC.set(raw,f);return f}
/* --- 技 --- */
const fx0=()=>({ss:[],st:[],ok:[]});
function mvFx(o,cond){const f=fx0(),N=Number,t=abNorm(o),A=cond+'／'+o;let m;
 f.ss=sFx(o);
 if(/高い方を1段階下げる/.test(t))f.lowerHi=1;else if(!/自身をひんしにする代わりに/.test(o))f.st=stg(t);
 for(const x of o.matchAll(/(自|敵)((?:(?:[ABCDS]|避|命中)\d[↑↓])+)/g))for(const y of x[2].matchAll(/([ABCDS]|避|命中)(\d)([↑↓])/g))f.st.push({ks:[{避:'eva',命中:'acc'}[y[1]]||y[1]],n:+y[2]*(y[3]==='↑'?1:-1),p:1,who:x[1]==='自'?'self':'foe'});
 if(m=t.match(/(?:相手|敵)の(A|B|C|D|S|攻撃力?)を下げる/))f.st.push({ks:[lets(m[1])[0]],n:-1,p:+((t.match(/(\d+)%/)||[])[1]||100)/100,who:'foe'});
 if(/敵断/.test(o))f.ss.push({s:'断裂',p:1,who:'foe'});
 if(m=o.match(/(\d)[〜~](\d)(?:回の連続攻撃|回連続|連)/))f.hits=[N(m[1]),N(m[2])];else if(m=o.match(/(\d)(?:回連続攻撃|連続攻撃|連撃)/))f.hits=[N(m[1]),N(m[1])];
 if(/1\/2反動|与えたダメージの半分を反動/.test(o))f.recoil=.5;else if(/1\/3を反動/.test(o))f.recoil=1/3;
 if(m=o.match(/与えたダメージの(\d+)%分(?:、自分のHPを)?回復/))f.drain=N(m[1])/100;if(/半分を自分の体力として吸収/.test(o))f.drain=.5;
 if(/1\/3で急所/.test(o))f.critR=1/3;else if(m=o.match(/(\d+(?:\.\d+)?)%(?:の確率)?で急所/))f.critR=N(m[1])/100;
 if(m=o.match(/(\d+)%の確率で渾身の一撃/))f.kon=N(m[1])/100;
 if(m=o.match(/(\d+)%の確率で一撃必殺/))f.ohko=N(m[1])/100;else if(/一撃必殺/.test(o))f.ohko=1;
 if(m=o.match(/\[敵記号1字目:(\S)\]/))f.symReq=m[1];
 if(/自身は戦闘不能/.test(o))f.selfKO=1;
 if(/1ターン動けなくなる|次のターンは反動で動けなくなる/.test(A))f.recharge=1;
 if(/能力上昇を戻す|全能力上昇をリセット|ランク上昇（バフ）」?をすべてリセット/.test(o))f.resetFoe=1;
 if(/能力下降をすべてリセット/.test(o))f.resetSelf=1;
 if(/能力上昇を無視して攻撃/.test(o))f.unaware=1;
 if(/回避率の上昇ランクを無視/.test(o))f.ignEva=1;
 if(/まもる等\)?を貫通/.test(o))f.pierce=1;
 if(/シールド破壊\(紫除く\)/.test(o))f.shBreak='np';if(/緑シールドを強引に破壊/.test(o))f.shBreak='green';if(/赤シールドを無視/.test(o))f.shIgn='red';if(/シールドの耐久値を無視/.test(o))f.shIgn='all';
 if(/電気無効」を無視/.test(o))f.ignImm=1;
 if(/タイプ相性を2倍として計算/.test(o))f.eff2=1;
 if(/攻撃側はC、防御側はB/.test(A))f.cb=1;
 if(/自分のBの数値が高ければ高いほど/.test(A))f.body=1;
 if(m=A.match(/\[時:(\S+?)\]威\+(\d+)/))f.timePow={t:m[1],add:N(m[2])};
 if(m=o.match(/時刻を「?(早朝|朝|昼|夕方|夜|深夜)」?に変更/))f.setTime=m[1];
 if(/昼もしくは天候が晴天の時は威力が半分/.test(o))f.dayHalf=1;
 if(/HPが低いほど威力アップ/.test(o))f.lowHp=1;
 if(/試合中復活できない/.test(o))f.noRev=1;
 if(/植物や虫ベース/.test(o))f.plant2=1;
 if(/メロメロかこんらん状態の場合威力が2倍/.test(o))f.conf2=1;
 if(/フィールドを虚無の境界/.test(o))f.field='虚無の境界';
 if(m=o.match(/(?:体力|HP)を(?:さらに)?(\d+)%(?:ずつ)?回復(?!させ)/))f.heal=N(m[1])/100;if(/状態異常をすべて治す/.test(o))f.cure=1;
 if(m=o.match(/相手の体力を(\d+)%回復させてしまう/))f.healFoe=N(m[1])/100;
 if(m=o.match(/次に繰り出す食タイプの攻撃技の威力が(\d)倍/))f.food=N(m[1]);
 if(m=o.match(/(\d)ターン無敵/))f.inv=N(m[1]);
 if(/復活予約/.test(o)&&!/トッピング/.test(o))f.revive=+((o.match(/(\d+)%の復活予約/)||[])[1]||50)/100;
 if(/再行動|もう一度行動/.test(o))f.extra=1;
 if(/特性を、その戦闘中ランダムな別の特性/.test(o))f.scramble=1;
 if(/タイプを戦闘終了まで「食タイプ」単一/.test(o))f.toFood=1;
 if(/受ける予定だったダメージの50%を相手に跳ね返す/.test(o))f.amber=1;
 if(m=shParse(o))f.shield=m;
 if(m=o.match(/ため状態」になり、3ターン目の開始時に自分の全ステータスが(\d)段階/))f.ferment=N(m[1]);
 if(/3ターン後に自分がひんし/.test(o))f.doom=3;
 if(/自身をひんしにする代わりに、次に場に出る味方/.test(o))f.sac=1;
 if(/上昇を交代するまで不可/.test(o))f.noMot=1;
 if(m=o.match(/(\d)ターンの間交代不可/))f.bind=N(m[1]);else if(/交代できなくする/.test(o))f.bind=4;
 if(/アイテムの効果を次のターン終了時まで無効化/.test(o))f.itemOff=2;if(/もちもの」の効果をその戦闘中、完全に無効化/.test(o))f.itemOff=999;
 if(/きのみを持っていた場合、それを奪って/.test(o))f.steal=1;else if(/きのみを食べる/.test(o))f.eatBerry=1;
 if(/残りPPをランダムで1つ1減少/.test(o))f.ppDrain=1;
 if(/虚空攻撃から守る/.test(o))f.psy=1;
 if(/変化技を使おうとしていた場合、30%で怯ませ/.test(o)){f.mind=.3;f.ss=f.ss.filter(x=>x.s!=='怯み')}
 if(/水タイプの技の威力が次ターンだけ1\.2倍/.test(o))f.hydro=1;
 if(/試合中一切の回復を不可/.test(o))f.noHeal=1;
 if(/トッピングが設定されていない場合/.test(o))f.topping='恋月星(れんげつしぇー)';
 if(/2連続不可/.test(cond))f.noRep=1;
 if(m=cond.match(/HPが(半分|1\/4)以下/))f.hpReq=m[1]==='半分'?.5:.25;
 if(/溜め技/.test(cond))f.charge=1;
 if(/相手が攻撃技を選択している時のみ/.test(cond))f.needAtk=1;
 if(/『食べる』か『捕食』を使った直後/.test(cond))f.afterEat=1;
 if(/撃破した場合/.test(o)){f.koSt=f.st;f.st=[]}
 if(/1\/4を反動/.test(o))f.recoil=.25;
 if(m=o.match(/天候を(雨|雪|晴天|砂嵐|雷雨)に/))f.weather=m[1];
 if(/雨・雷雨のとき必中/.test(cond))f.wSure=['雨','雷雨'];if(/雪のとき必中/.test(cond))f.wSure=['雪'];if(/晴天なら溜めなし/.test(cond))f.sunNC=1;
 if(/手持ちと交代する/.test(o))f.uturn=1;if(/相手を強制的に交代させる/.test(o))f.phaze=1;
 if(/(撒く|張る)$|(撒く|張る)。/.test(o)&&(m=o.match(/(ステルスロック|まきびし|どくびし|ねばねばネット)/)))f.hz={ステルスロック:'sr',まきびし:'sp',どくびし:'ts',ねばねばネット:'web'}[m[1]];
 if(/自分の場のまきびし等を取り除く/.test(o))f.spin=1;if(/お互いの場のまきびし等/.test(o))f.defog=1;
 if(/物理と特殊のダメージを半減する壁/.test(o))f.screen='a';else if(/物理ダメージを半減する壁/.test(o))f.screen='r';else if(/特殊ダメージを半減する壁/.test(o))f.screen='l';
 if(/相手の壁を壊す/.test(o))f.brick=1;if(/味方の素早さを2倍/.test(o))f.tw=1;
 if(m=o.match(/(エレキ|グラス|サイコ|ミスト)フィールドにする/))f.terrain=m[1];
 if(/変化技を使えなくなる/.test(o))f.taunt=3;if(/やどりぎを植え付け/.test(o))f.seed=1;if(/みがわりを出す/.test(o))f.sub=1;
 if(m=o.match(/自分のHPを(\d+)%失/))f.cost=+m[1]/100;
 if(/HPを全回復し、2ターンねむり/.test(o)){f.rest=1;f.ss=[]}
 if(/登場した最初のターンのみ/.test(cond))f.first=1;
 if(/持ち物を入れ替える/.test(o))f.trick=1;if(/持ち物をはたき落とす/.test(o))f.knock=1;if(/相手の持ち物を奪う/.test(o))f.thief=1;
 if(/相手の特性を消す/.test(o))f.gastro=1;if(/HPを平均にする/.test(o))f.pain=1;if(/そのターン、HP1で耐える/.test(o))f.endT=1;
 if(/お互いの能力変化を元に戻す/.test(o))f.haze=1;if(/急所に当たりやすくなる/.test(o))f.focus=1;if(/持ち物がないと威力2倍/.test(o))f.acro=1;
 if(/相手のAで攻撃する/.test(o))f.foul=1;if(/自分のBで攻撃する/.test(o))f.body=1;
 return f}
const smul=s=>s>=0?(2+s)/2:2/(2-s),amul=s=>s>=0?(3+s)/3:3/(3-s);
const who=m=>m.nm,an=m=>`特性：${m.abN}`,fxm=(m,k)=>({id:m.id,k});
const slotM=(s,i)=>{const j=VB.sd[s].on[i];return j>=0?VB.sd[s].tm[j]:null};
const actv=s=>VB.sd[s].on.map((j,i)=>slotM(s,i)).filter(m=>m&&m.hp>0);
const foesOf=m=>actv(1-m.s),allyOf=m=>actv(m.s).find(x=>x!==m)||null,allAct=()=>[...actv(0),...actv(1)];
const alive=s=>VB.sd[s].tm.some(m=>m.hp>0);
const benchOf=(s,res=[])=>VB.sd[s].tm.map((m,i)=>i).filter(i=>VB.sd[s].tm[i].hp>0&&!VB.sd[s].on.includes(i)&&!res.includes(i));
const act_=s=>actv(s)[0]||slotM(s,0);
const actOf=m=>VB.acts0&&VB.acts0[m.s]?VB.acts0[m.s][m.slot]:null;
function stat(m,k,o={}){const w=VB.w;let v=m.st[k]*(m.ab.sm[k]||1)*(m.stk[k]||1)*(m.vol.hit?1:(m.ab.uh?.[k]||1))*((m.vol.hits2||0)>=2?1:(m.ab.uh2?.[k]||1))*(m.ab.wm[w]?.[k]||1);
 if(!o.noMot&&m.stg.mot)v*=1+.1*m.stg.mot;if(m.vol.gk>=VB.turn)v*=1.3;if(m.stg.sug>=3)v*=.6;
 const al=m.ab.allyB;if(al&&al.ks.includes(k)&&m.slot>=0&&allyOf(m)?.nm===al.nm)v*=al.m;
 if(k==='A'&&m.ss.オーブン)v/=3;if(k==='S'){if(m.ss.まひ)v*=.5;if(m.ss.シャーベット)v/=3}return v}
const sideOf=m=>m.s,gnd=m=>!m.types.includes('飛')&&!m.ab.imm.includes('地');
const spd=m=>{const x=VB.sd[m.s];return stat(m,'S')*smul(m.stg.S)*(x&&x.tw>=VB.turn?2:1)};
function mtypes(a,mv){let T=mv.types.map(t=>a.ab.skin&&t==='無'&&mv.cat!=='x'?a.ab.skin:t);if(VB.month===1)T=T.map(t=>t==='水'?'氷':t);return T}
const effOf=(d,t)=>d.types.reduce((p,x)=>p*mult(t,x),1),effM=(d,T)=>T.reduce((p,t)=>p*effOf(d,t),1);
function tboost(t){const w=VB.w;let k=(PLACE[VB.place]?.[t]||1)*(MONTH[VB.month]?.[t]||1);if((w==='雨'||w==='雷雨')&&t==='水')k*=1.5;if(w==='雨'&&t==='炎')k*=.5;if(w==='晴天'){if(t==='炎')k*=1.5;if(t==='水')k*=.5}if(w==='古代'&&t==='古')k*=1.5;return k}
function dSt(d,k,o){const w=VB.w;let v=d.ss.断裂?d.st[k]:stat(d,k);const g=d.stg[k]||0;v*=smul(o.ign||o.crit||d.ss.断裂?Math.min(0,g):g);
 if(!d.ss.断裂&&(k==='B'||k==='D')){if(w==='雪'&&d.types.includes('氷'))v*=1.5;if(w==='砂嵐'&&d.types.some(t=>t==='岩'||t==='地'))v*=1.5}return v}
function aSt(a,k,o){const g=a.stg[k]||0;return stat(a,k)*smul(o.crit?Math.max(0,g):g)}
function calc(a,d,mv,o={}){const T=mtypes(a,mv),cat=a.ab.anti&&mv.cat!=='x'?'a':mv.cat,f=mv.fx;let e=f.eff2?2:effM(d,T);if(!e&&a.ab.noImm)e=1;if(!e)return{dmg:0,e,T};
 let pw=mv.pw;if(f.timePow&&VB.time===f.timePow.t)pw+=f.timePow.add;if(f.dayHalf&&(VB.time==='昼'||VB.w==='晴天'))pw*=.5;if(f.lowHp){const r=d.hp/d.max;pw=r<=.25?200:r<=.5?100:pw}
 if(f.plant2&&d.types.some(t=>'草虫花'.includes(t)))pw*=2;if(f.conf2&&d.vol.conf)pw*=2;
 pw*=Math.max(...T.map(t=>a.ab.tp[t]||1))*(a.ab.allPow||1)*(cat==='p'?a.ab.physPow||1:1);if(a.ab.skin&&mv.types.includes('無'))pw*=a.ab.skinPow||1.2;
 if(a.ab.pinchPow&&a.hp<=a.max*(a.ab.pinchR||.5))pw*=a.ab.pinchPow;if(a.vol.flash)pw*=a.vol.flash;if(e>1&&a.ab.se)pw*=a.ab.se;if(a.vol.food&&T.includes('食'))pw*=a.vol.food;if(a.vol.hydro===VB.turn&&T.includes('水'))pw*=1.2;
 if(VB.field==='虚無の境界'&&(cat==='p'||cat==='s'))pw*=.5;pw*=Math.max(...T.map(tboost));if(f.acro&&!a.item)pw*=2;if(f.knock&&d.item)pw*=1.5;
 const TR=VB.ter&&VB.ter.t;if(TR&&gnd(a)&&T.includes({エレキ:'電',グラス:'草',サイコ:'超'}[TR]))pw*=1.3;if(TR==='ミスト'&&T.includes('竜')&&gnd(d))pw*=.5;
 pw*=extraPow(a,d,mv,T,e,cat);const sh=o.sh,ig={ign:f.unaware||a.ab.unaware||(a.ab.ignBD&&T.some(t=>a.ab.ignBD.includes(t))),crit:o.crit};let as,ds;
 if(cat==='v'){as=(Math.max(stat(a,'A',{noMot:1}),stat(a,'C',{noMot:1}))+Math.max(0,a.stg.mot))/2;ds=(sh?1:1+Math.max(0,d.stg.mot))*Math.max(1,d.lv/50)}
 else if(cat==='a'){as=Math.max(aSt(a,'A',ig),aSt(a,'C',ig));ds=sh?Math.max(sh.B||0,sh.D||0)||Math.max(dSt(d,'B',ig),dSt(d,'D',ig)):Math.max(dSt(d,'B',ig),dSt(d,'D',ig))}
 else if(cat==='f'){as=Math.max(aSt(a,'A',ig),aSt(a,'C',ig));ds=dSt(d,'S',ig)}
 else{const dk=cat==='p'||f.cb?'B':'D';as=f.body?aSt(a,'B',ig):f.foul?aSt(d,'A',ig):aSt(a,cat==='p'?'A':'C',ig);ds=sh&&sh[dk]!=null?sh[dk]:dSt(d,dk,ig)}
 let dm=Math.floor(Math.floor(lvK(a)*pw*as/Math.max(1,ds))/50)+2,k=(o.r??1)*(o.crit===2?2:o.crit?1.5:1)*e*(o.sp||1);
 const nm=T.filter(t=>a.types.includes(t)).length;if(nm)k*=a.ab.stab||(nm>=2&&T.length>=2?1.7:1.5);
 k*=(a.ab.out||1)*(d.ab.inc||1)*Math.max(...T.map(t=>d.ab.tIn[t]||1));if(e>1&&d.ab.seTaken)k*=d.ab.seTaken;if(d.ab.dull)k*=2/3;if(d.vol.halfDmg===VB.turn)k*=.5;if(T.some(t=>d.ab.half.includes(t)))k*=.5;
 if(cat==='p'&&d.ab.physIn)k*=d.ab.physIn;if(mv.contact&&d.ab.contIn)k*=d.ab.contIn;if(cat==='s'&&d.ab.specIn)k*=d.ab.specIn;if(d.ab.fullHalf&&d.hp===d.max)k*=.5;if(d.ab.preAct&&!d.vol.acted)k*=.5;
 if(a.ab.lowCost&&d.cost<a.cost)k*=a.ab.lowCost;if(cat==='p'&&a.ss.やけど)k*=.5;
 if(T.includes('食'))k*=[1,1.2,1.5,2][d.stg.sug]||1;const ds_=VB.sd[d.s];if(ds_&&!o.crit&&!sh){const sc=ds_.scr||{},dv=VB.ns>1?2/3:.5;if((cat==='p'&&(sc.r>=VB.turn||sc.a>=VB.turn))||(cat==='s'&&(sc.l>=VB.turn||sc.a>=VB.turn)))k*=dv}if(d.vol.gkTurn===VB.turn)k*=.75;
 return{dmg:Math.max(1,Math.floor(dm*k)),e,T}}
// 経過の記録。テキストと、その時点の全員のHPを残す (早送り中は何も残さない)
const say=(t,fx)=>{if(!VB.quiet)VB.q.push({t,fx,hp:hpSnap()})};
function hurt(m,d,mia){d=Math.max(0,Math.min(Math.floor(d),m.hp));m.hp-=d;if(mia||m.ss.呪い)m.mia=Math.min(m.max,m.mia+d);return d}
function heal(m,v){if(m.noHeal||m.hp<=0)return 0;const h=Math.max(0,Math.min(m.max-m.mia-m.hp,Math.floor(v)));m.hp+=h;return h}
function stages(src,L,lab,tgt,from){L.forEach(o=>{let p=o.p;if(p<1&&from)p*=kireM(from);if(p<1&&rnd()>=p)return;
 const T=o.who==='foe'?(tgt?[tgt]:foesOf(src)):o.who==='team'?(src.slot>=0?actv(src.s):[src]):[src];
 T.forEach(t=>{if(!t||t.hp<=0)return;o.ks.forEach(k=>{if(k==='H'){const g=smul(o.n);t.max=Math.max(1,Math.floor(t.max*g));t.hp=Math.min(t.hp,t.max);return}if(k==='mot'&&o.n>0&&t.vol.noMot)return;if(o.n<0&&t!==src&&noDrop(t,k)){say(`${who(t)}の 能力は 下がらなかった！`);return}const cap=t.ab.statCap||6,[lo,hi]=SCAP[k]||[-cap,cap],b=t.stg[k]||0;t.stg[k]=clamp(b+o.n,lo,hi);if(t.stg[k]!==b)statChanged(t,k,o.n,src);if(t.stg[k]!==b)say(`${who(t)}の${STN[k]||k}が${Math.abs(o.n)>=2?'ぐーんと':''}${o.n>0?'上がった':'下がった'}！${lab?`（${lab}）`:''}`)})})})}
const kireM=m=>{const k=m.stg.kire;return(k>=0?1+.2*k:1-.15*-k)*(m.vol.niha?1.5:1)};
const TR_=()=>VB.ter&&VB.ter.t;
function inflict(m,n,o={}){if(!m||m.hp<=0)return;n=SSN[n]||n;const W=who(m);
 if(m.ab.sImm.includes(n)){say(`${W}には ${n}が効かない（${an(m)}）`);return}
 if(n==='怯み'){if(!m.vol.acted)m.vol.flinch=Math.max(m.vol.flinch||0,o.n||1);else if((o.n||1)>1)m.vol.flinch=(o.n||1)-1;return}
 if(n==='こんらん'){if(TR_()==='ミスト'&&gnd(m))return;if(m.vol.conf)return;m.vol.conf=2+Math.floor(rnd()*4);say(`${W}は 混乱した！`);return}
 if(n==='メロメロ'&&m.ss.メロメロ)return;const TR=TR_();if(TR==='ミスト'&&gnd(m)&&MAINS.includes(n))return;if(TR==='エレキ'&&n==='ねむり'&&gnd(m))return;
 if(MAINS.includes(n)){if(MAINS.some(k=>m.ss[k]))return;if(n==='ねむり'){m.ss.ねむり={c:o.sleep||1+Math.floor(rnd()*3)};say(`${W}は 眠ってしまった！`);return}if((n==='やけど'&&m.types.includes('炎'))||(n==='こおり'&&m.types.includes('氷'))||((n==='どく'||n==='もうどく')&&m.types.some(t=>t==='毒'||t==='鋼'))||(n==='まひ'&&m.types.includes('電')))return}
 if(m.ss[n])return;m.ss[n]={t:o.t?VB.turn+o.t:0,c:0};say(`${W}は ${n}状態になった！`);statusGot(m,n);
 if(ORIG.includes(n)&&m.item?.cure&&!m.vol.itemOff){ORIG.forEach(k=>delete m.ss[k]);say(`${W}は ${m.item.nm}で 状態異常が治った！`);m.item=null}}
function ko(m){if(!m||m.hp>0||m.vol.ko)return false;
 if(m.vol.rev&&!m.vol.noRevNow){m.hp=Math.max(1,Math.floor(m.max*m.vol.rev));m.vol.rev=0;say(`${who(m)}は 復活予約で よみがえった！`);return false}
 m.vol.ko=1;say(`${who(m)}は たおれた！`,fxm(m,'ko'));return true}
function shOn(m,sh){m.vol.sh={...sh}}
function enter(m){const s=m.s,sd=VB.sd[s],f=m.ab;m.vol={entered:VB.turn,fresh:1};if(VB.turn)say(`${m.nm}が 現れた！`);
 const hz=sd.hz||{},W=who(m);if(hz.sr){const d=hurt(m,m.max*effM(m,['岩'])/8);if(d)say(`${W}に とがった岩が 食い込んだ！ ${d} ダメージ`,fxm(m,'hit'))}
 if(gnd(m)){if(hz.sp){const d=hurt(m,m.max*[0,1/8,1/6,1/4][hz.sp]);if(d)say(`${W}は まきびしで ${d} ダメージ！`,fxm(m,'hit'))}if(hz.ts){if(m.types.includes('毒')){hz.ts=0;say(`${W}が どくびしを 取り除いた！`)}else inflict(m,hz.ts>=2?'もうどく':'どく')}if(hz.web)stages(m,[{ks:['S'],n:-1,p:1,who:'self'}],'ねばねばネット')}
 if(ko(m))return;
 if(sd.sac){sd.sac=0;stages(m,[{ks:['A','C','S'],n:3,p:1,who:'self'}],'古の生贄');heal(m,m.max)}
 if(f.weather&&VB.w!==f.weather&&VB.w!=='終焉'){VB.w=f.weather;say(`${m.nm}の${an(m)}で 天気が${f.weather}になった！`)}
 if(f.place){VB.place=f.place;say(`場所が ${f.place}になった！（${an(m)}）`)}if(f.month){VB.month=f.month;say(`月が ${f.month}月になった！（${an(m)}）`)}
 if(f.timeFix){VB.time=f.timeFix;say(`時刻が ${VB.time}に固定された！`)}if(f.timeAdv){VB.time=TIMES[(TIMES.indexOf(VB.time)+1)%6];say(`時刻が ${VB.time}に進んだ！`)}
 if(f.tr){VB.tr=5;say(`${an(m)}！ 時空がゆがんだ！（トリックルーム）`)}
 if(f.shield&&!(m.shUsed&&/試合中1回だけ/.test(m.abT))){m.shUsed=1;shOn(m,f.shield);m.vol.shEnd=f.shieldT?VB.turn+f.shieldT-1:999;say(`${m.nm}は ${f.shield.col?SHN[f.shield.col]:''}シールドを張った！（${an(m)}）`)}
 if(f.revive&&!m.revUsed){m.vol.rev=f.revive;m.revUsed=1}
 if(f.st.enter&&!(m.stUsed&&/試合中1回だけ/.test(m.abT))){m.stUsed=1;stages(m,f.st.enter,an(m))}
 const F=foesOf(m);if(f.enterSS)f.enterSS.forEach(x=>{if(x.p<1&&rnd()>=x.p)return;const T=x.who==='self'?[m]:/1人|一人/.test(m.abT)?[pick(F)].filter(Boolean):F;T.forEach(t=>inflict(t,x.s||pick(x.any),{t:x.t,n:x.n}))});
 enterExtra(m);if(f.enterHit)F.forEach(o=>{const d=hurt(o,o.hp*f.enterHit);say(`${an(m)}！ ${who(o)}の体力が ${d} 減った！`,fxm(o,'hit'));ko(o)})}
/* --- 技の対象 --- */
function toFoe(mv){const f=mv.fx;return f.ss.some(x=>x.who==='foe')||f.st.some(x=>x.who==='foe')||f.healFoe||f.scramble||f.toFood||f.ppDrain||f.eatBerry||f.steal||f.taunt||f.seed||f.gastro||f.trick||f.phaze}
function rngOf(mv){if(mv.rng&&mv.rng!=='e1')return mv.rng;if(mv.cat==='x')return toFoe(mv)?'e1':'self';return'e1'}
function needTg(m,mv){const R=rngOf(mv);return VB.ns>1&&((R==='e1'&&foesOf(m).length>1)||(R==='ally'&&actv(m.s).length>1))}
function tgtsOf(a,mv,x){const R=rngOf(mv),F=foesOf(a),al=allyOf(a);
 if(R==='eA')return F;if(R==='all')return al?[...F,al]:F;if(R==='allyAll')return a.slot>=0?actv(a.s):[a];
 if(R==='ally'){const t=x&&x.tg?slotM(x.tg.s,x.tg.slot):null;return[t&&t.hp>0&&t.s===a.s?t:a]}
 if(R!=='e1')return[];
 let t=x&&x.tg?slotM(x.tg.s,x.tg.slot):null;if(!t||t.hp<=0||t.s===a.s)t=F.length?pick(F):null;
 if(t&&mv.cat!=='x'){const T=mtypes(a,mv),g=actv(t.s).find(h=>h!==t&&((h.ab.draw||[]).some(y=>T.includes(y))||(h.ab.guard&&!(h.ab.guard==='once'&&h.vol.guardUsed)&&(h.ab.guard==='all'||mv.pw>(h.ab.guardMin||0)))));
  if(g){if(g.ab.guard==='once')g.vol.guardUsed=1;say(`${who(g)}が 攻撃を 引き受けた！（${an(g)}）`);t=g}}
 return t?[t]:[]}
/* --- 技の実行 --- */
function useMove(a,mv,x){if(a.hp<=0)return;const f=mv.fx,W=who(a);
 a.vol.last=mv.key;if(mv.left!=null)mv.left--;a.vol.acted=1;if(mv.cat==='x'&&a.ss.獄炎){const x=hurt(a,a.max/3);say(`${W}は 獄炎で ${x} ダメージ！`,fxm(a,'hit'));if(ko(a))return}if(a.hp<=0)return;a.vol.charging=null;if(mv.nm==='食べる'||mv.nm==='捕食')a.vol.ate=VB.turn;
 say(`${W}の ${mv.nm}！`);
 if(mv.prot){if(a.vol.lastProt){say('しかし うまく決まらなかった！')}else{a.vol.prot=1;say(`${W}は 守りの体勢に入った！`)}a.vol.protNow=1;return}
 if(f.cost){if(a.hp<=Math.floor(a.max*f.cost)){say('しかし 体力が 足りない！');return}if(f.sub&&a.vol.sh?.sub){say('しかし みがわりは もう出ている！');return}hurt(a,a.max*f.cost)}
 if(f.endT){if(a.vol.lastProt){say('しかし うまく決まらなかった！')}else{a.vol.endT=VB.turn;say(`${W}は こらえる体勢に入った！`)}a.vol.protNow=1;return}
 if(f.rest){if(a.hp>=a.max-a.mia||a.noHeal){say('しかし うまく決まらなかった！');return}MAINS.forEach(k=>delete a.ss[k]);heal(a,a.max);a.ss.ねむり={c:2};say(`${W}は 眠って 元気になった！`);return}
 const T=tgtsOf(a,mv,x),R=rngOf(mv);
 if(f.needAtk){const atk=o=>{const y=actOf(o);return y&&y.t==='mv'&&y.i>=0&&o.moves[y.i]?.cat!=='x'&&!o.vol.acted};if(mv.cat==='x'?!foesOf(a).some(atk):!T.some(atk)){say('しかし うまく決まらなかった！');return}}
 if(mv.cat==='x'){
  if(R==='ally'||R==='allyAll'){T.forEach(t=>{if(f.heal&&heal(t,t.max*f.heal))say(`${who(t)}の HPが 回復した！`);if(f.cure){MAINS.concat(ORIG).forEach(k=>delete t.ss[k]);t.vol.conf=0}if(f.psy)t.vol.psy=VB.turn});if(f.cure)say('状態異常が 治った！');if(f.psy)say('虚空攻撃を防ぐ空間が 味方を包んだ！');post(a,null,{...mv,fx:{...f,heal:0,cure:0,psy:0}},1);return}
  if(R!=='e1'&&R!=='eA'&&R!=='all'){post(a,null,mv,1);return}
  if(!T.length){say('しかし 相手が いなかった！');return}
  let first=1;T.forEach(d=>{const D=who(d);if((d.vol.prot||d.vol.inv>=VB.turn)&&!f.pierce){say(`${D}は 身を守った！`);return}if(d.vol.sh?.sub&&!f.phaze){say(`${D}の みがわりに 防がれた！`);return}
   if(mv.acc&&!a.ab.sure&&rnd()*100>=mv.acc*amul(clamp(a.stg.acc-d.stg.eva,-6,6))){say(`${D}には 当たらなかった！`);onMiss(a,d,mv);return}if(d.ab.mirror&&toFoe(mv)){say(`${D}は 技を 跳ね返した！（${an(d)}）`);post(d,a,mv,first);return}post(a,d,mv,first);first=0});return}
 if(!T.length){say('しかし 相手が いなかった！');return}
 if(f.brick){const sd=VB.sd[T[0].s];if(sd.scr&&Object.values(sd.scr).some(v=>v>=VB.turn)){sd.scr={};say(`${sd.nm}の場の 壁を 壊した！`)}}
 const spread=T.length>1;let first=1;for(const d of T){if(a.hp<=0)break;if(d.hp<=0)continue;if(hitOne(a,d,mv,spread,first))first=0}
 ko(a)}
function hitOne(a,d,mv,spread,first){const f=mv.fx,W=who(a),D=who(d),T=mtypes(a,mv),w=VB.w;
 if(d.vol.prot&&!a.ab.pierce&&!f.pierce&&!(a.ab.pierceT&&T.includes(a.ab.pierceT))){say(`${D}は 攻撃から 身を守った！`);return 0}
 if(d.vol.inv>=VB.turn){say(`${D}は 無敵だ！`);return 0}if(d.vol.psy===VB.turn&&mv.cat==='v'){say(`${D}は 虚空攻撃から守られている！`);return 0}
 if(mv.acc&&!a.ab.sure&&!(f.wSure&&f.wSure.includes(w))){const ohk=f.ohko===1&&!mv.pw,acc=ohk?mv.acc:mv.acc*amul(clamp(a.stg.acc-(f.ignEva?Math.min(0,d.stg.eva):d.stg.eva),-6,6))*(d.ab.wAcc[w]||1)*(1-(d.ab.evaAdd||0))*(a.ab.accMul||1);if(rnd()*100>=acc){say(`${D}には 当たらなかった！`);onMiss(a,d,mv);return 0}}
 if(d.ab.dodgeBig&&a.cost>d.cost&&rnd()<d.ab.dodgeBig){say(`${D}は ひらりとかわした！（${an(d)}）`);onMiss(a,d,mv);return 0}if(d.feather>0&&mv.pw){d.feather--;say(`${D}は ミストリシェーの羽で 攻撃を防いだ！`);return 0}
 if(a.ab.noGhost&&d.types.includes('霊')){say(`${D}には 当たらなかった！（${an(a)}）`);return 0}if(d.vol.bar>=VB.turn&&T.some(t=>BASE18.includes(t))){say(`${D}の バリアが 攻撃を無効化した！`);return 0}
 if(!f.ignImm&&!a.ab.mold&&T.some(t=>d.ab.imm.includes(t))){say(`${D}には 効果がないようだ…（${an(d)}）`);return 0}
 const ab=a.ab.mold?null:T.map(t=>d.ab.abs[t]).find(Boolean);if(ab&&!f.ignImm){say(`${D}は 技を 吸収した！（${an(d)}）`);if(ab.heal&&heal(d,d.max*ab.heal))say(`${D}の HPが 回復した！`);if(ab.st.length)stages(d,ab.st);if(ab.flash){d.vol.flash=ab.flash;say(`${D}の 次の技の威力が上がった！`)}return 0}
 const e0=f.eff2?2:effM(d,T);if(!e0&&!a.ab.noImm){say(`${D}には 効果がないようだ…`);return 0}
 if(f.ohko===1&&!mv.pw){if(f.symReq&&d.sym[0]!==f.symReq){say(`${D}には 効果がないようだ…`);return 0}if(d.ab.sturdy){say(`${D}は こらえた！（${an(d)}）`);return 0}d.vol.noRevNow=f.noRev;hurt(d,d.hp);say('一撃必殺！',fxm(d,'hit'));post(a,d,mv,first);ko(d);return 1}
 const n=f.hits?f.hits[0]+Math.floor(rnd()*(f.hits[1]-f.hits[0]+1)):1;let tot=0,hits=0,lastE=1;
 for(let h=0;h<n&&d.hp>0&&a.hp>0;h++){hits++;
  const kon=(f.kon||0)+(a.ab.kon||0)+(a.vol.gekii?.15:0),ac=a.ab.allyCrit&&allyOf(a)?.nm===a.ab.allyB?.nm?.5:0,crit=(a.ab.firstKon&&!a.dealt)||rnd()<kon?2:rnd()<Math.max(f.critR||(1/24)*(a.ab.crit||1),a.vol.focus?.5:0,ac)?1:0;
  let sh=d.vol.sh;if(sh&&(f.shIgn==='all'||(f.shIgn==='red'&&sh.col==='red')||(a.ab.stormPierce&&w==='雷雨')))sh=null;
  if(sh&&f.shBreak&&(f.shBreak==='np'?sh.col!=='purple':sh.col===f.shBreak)){d.vol.sh=null;sh=null;say(`${D}の シールドを 破壊した！`)}
  if(sh){const okc=!sh.col||(sh.col==='red'&&mv.cat==='p')||(sh.col==='green'&&mv.cat==='s')||(sh.col==='purple'&&mv.cat==='v')||(sh.col==='white'&&mv.sig);
   if(!okc){say(`${SHN[sh.col]}シールドに 防がれた！`);continue}const r=calc(a,d,mv,{crit,r:.85+rnd()*.15,sh,sp:spread?.75:1});sh.hp-=r.dmg;a.dealt=1;
   if(sh.hp<=0){d.vol.sh=null;say(`${D}の ${sh.sub?'みがわり':'シールド'}が ${sh.sub?'消えた':'割れた'}！`,fxm(d,'hit'))}else say(`${sh.sub?'みがわり':'シールド'}に ${r.dmg} ダメージ！（残り${sh.hp}）`,fxm(d,'hit'));continue}
  let{dmg,e}=calc(a,d,mv,{crit,r:.85+rnd()*.15,sp:spread?.75:1});lastE=e;a.vol.flash=0;
  if(e>=2&&d.item?.berry&&T.includes(d.item.berry)&&!d.vol.itemOff){dmg=Math.floor(dmg/2);say(`${D}は ${d.item.nm}で ダメージを弱めた！`);d.item=null}
  if(d.ab.reflectOn&&mv.contact){const r=hurt(a,dmg);say(`${D}は 攻撃を 跳ね返した！ ${W}に ${r} ダメージ！（${an(d)}）`,fxm(a,'hit'));if(d.ab.reflect)heal(d,dmg*d.ab.reflect);ko(a);return 1}
  let endured=0;if(dmg>=d.hp&&d.vol.endT===VB.turn){dmg=d.hp-1;endured=1}else if(dmg>=d.hp&&((d.ab.sturdy&&d.hp===d.max)||(d.ab.endure&&!d.endured))){dmg=d.hp-1;d.endured=1;endured=1}
  if(f.noRev)d.vol.noRevNow=1;const dd=hurt(d,dmg);tot+=dd;a.dealt=1;d.vol.hit=1;
  say(`${crit===2?'渾身の一撃！ ':crit?'急所に当たった！ ':''}${e>=2?'効果は ばつぐんだ！ ':e<1?'効果は いまひとつのようだ… ':''}${D}に ${dd} ダメージ！`,fxm(d,'hit'));
  if(endured)say(`${D}は 攻撃を こらえた！`);
  if(d.vol.amber===VB.turn&&dd){const r=hurt(a,dd*.5);say(`因果が逆転！ ${W}に ${r} ダメージ！`,fxm(a,'hit'))}
  if(f.ohko&&f.ohko<1&&d.hp>0&&rnd()<f.ohko*kireM(a)){if(d.ab.sturdy)say(`${D}は 一撃必殺をこらえた！`);else{hurt(d,d.hp);say('一撃必殺！',fxm(d,'hit'))}}}
 if(hits>1)say(`${hits}回 当たった！`);
 if(tot){if(a.ab.mia&&d.hp>0){const x=hurt(d,Math.max(1,tot*a.ab.mia),1);say(`瘴気が ${D}を むしばむ！ ${x} ダメージ！`,fxm(d,'hit'))}
  if(a.ab.fixAdd&&first)foesOf(a).forEach(o=>{const x=hurt(o,a.ab.fixAdd);say(`追撃！ ${who(o)}に ${x} ダメージ！`,fxm(o,'hit'));ko(o)});
  if(a.ab.drain&&heal(a,tot*a.ab.drain))say(`${W}は HPを回復した！`);if(f.drain&&heal(a,tot*f.drain))say(`${W}は HPを吸い取った！`);
  if(f.recoil||f.recoilMax){const r=hurt(a,f.recoilMax?a.max*f.recoilMax:tot*f.recoil);if(r)say(`${W}は 反動で ${r} ダメージ！`,fxm(a,'hit'))}
  Object.keys(a.ab.stk).forEach(k=>a.stk[k]=(a.stk[k]||1)*a.ab.stk[k]);a.vol.food=0;
  afterHit(a,d,mv,tot,T,lastE);if(mv.cat==='v'&&d.item&&!d.vol.itemOff){if(d.item.voidHp&&d.hp>0){d.max=Math.floor(d.max*1.5);d.hp=d.max-d.mia;say(`${D}は ${d.item.nm}で 最大HPが上がり 全回復した！`);d.item=null}else if(d.item.voidHit){const r=hurt(a,a.max/8);say(`${d.item.nm}！ ${W}に ${r} ダメージ！`,fxm(a,'hit'));d.item=null}}
  if(d.hp>0&&d.ab.st.hit)stages(d,d.ab.st.hit,an(d));pinch(d);pinch(a)}
 if(tot||hits)post(a,d,mv,first);if(ko(d)&&a.hp>0){if(a.ab.st.ko)stages(a,a.ab.st.ko,an(a));if(f.koSt)stages(a,f.koSt,mv.nm)}ko(a);return hits?1:0}
function pinch(m){if(m.hp<=0)return;trySummon(m);if(m.ab.herbAt&&!m.herbDone&&m.hp<=m.max*m.ab.herbAt){m.herbDone=1;m.vol.herb=1;say(`${who(m)}は ハーブ効果を得た！（${an(m)}）`)}if(m.ab.st.pinch&&!m.pinchDone&&m.hp<=m.max*(m.ab.pinchR||.5)){m.pinchDone=1;stages(m,m.ab.st.pinch,an(m))}
 if(m.item?.pinch&&!m.vol.itemOff&&m.hp<=m.max/4){const p=m.item.pinch;if(p==='kire'){m.vol.niha=1;say(`${who(m)}は ${m.item.nm}で キレが鋭くなった！`)}else if(p==='kon'){m.vol.gekii=1;say(`${who(m)}は ${m.item.nm}で 渾身の一撃が出やすくなった！`)}else stages(m,[{ks:['mot'],n:1,p:1,who:'self'}],m.item.nm);m.item=null}}
function post(a,d,mv,first){const f=mv.fx,W=who(a),D=d?who(d):'',dl=d&&d.hp>0;
 f.ss.forEach(x=>{if(x.who==='self'){if(first)inflict(a,x.s||pick(x.any),{t:x.t});return}if(!dl)return;let p=x.p;if(p<1)p*=kireM(a);if(p<1&&rnd()>=p)return;inflict(d,x.s||pick(x.any),{t:x.t,n:x.n})});
 if(f.mind&&dl){const y=actOf(d);if(y&&y.t==='mv'&&d.moves[y.i]?.cat==='x'&&!d.vol.acted&&rnd()<f.mind*kireM(a))d.vol.flinch=1}
 if(f.st.length){const sf=f.st.filter(x=>x.who!=='foe'),fo=f.st.filter(x=>x.who==='foe');if(first&&sf.length)stages(a,sf,'',null,a);if(dl&&fo.length)stages(a,fo,'',d,a)}
 if(dl){if(f.lowerHi){const k=stat(d,'A')>=stat(d,'C')?'A':'C';stages(d,[{ks:[k],n:-1,p:1,who:'self'}])}
  if(f.resetFoe){Object.keys(d.stg).forEach(k=>{if(d.stg[k]>0&&k!=='sug')d.stg[k]=0});say(`${D}の 能力上昇が 元に戻った！`)}
  if(f.healFoe)heal(d,d.max*f.healFoe);
  if(f.scramble){const x=pick(ABILITIES);d.ab=parseAb(x);d.abT=x;d.abN=(x.match(/^「([^」]+)」/)||[,''])[1];say(`${D}の 特性が ${d.abN}に 変わった！`)}
  if(f.toFood){d.types=['食'];say(`${D}は 食タイプになった！`)}if(f.noMot)d.vol.noMot=1;if(f.bind){d.vol.bind=VB.turn+f.bind;say(`${D}は 交代できなくなった！`)}
  if(f.itemOff&&d.item){d.vol.itemOff=f.itemOff>=999?999:VB.turn+f.itemOff-1;say(`${D}の 持ち物が 使えなくなった！`)}
  if((f.steal||f.eatBerry)&&d.item?.berry){const it=d.item;d.item=null;if(f.steal&&!a.item)a.item=it;say(`${W}は ${it.nm}を 奪った！`)}
  if(f.ppDrain){const L=d.moves.filter(m=>m.left>0);if(L.length){pick(L).left--;say(`${D}の 技のPPが 減った！`)}}
  if(f.noHeal){d.noHeal=1;say(`${D}は 回復できなくなった！`)}
  if(f.taunt){d.vol.taunt=VB.turn+f.taunt;say(`${D}は ちょうはつに 乗ってしまった！`)}
  if(f.seed){if(d.types.includes('草')||d.vol.seed)say(`${D}には 効果がないようだ…`);else{d.vol.seed={s:a.s};say(`${D}に やどりぎを 植え付けた！`)}}
  if(f.gastro){d.ab=parseAb('');d.abT='';d.abN='（なし）';say(`${D}の 特性が 消された！`)}
  if(f.trick&&(a.item||d.item)){[a.item,d.item]=[d.item,a.item];say(`${W}は 持ち物を すりかえた！`)}
  if(f.knock&&d.item){say(`${D}の ${d.item.nm}を はたき落とした！`);d.item=null}
  if(f.thief&&d.item&&!a.item){a.item=d.item;d.item=null;say(`${W}は ${a.item.nm}を 奪った！`)}
  if(f.pain&&a.hp>0){const v=Math.floor((a.hp+d.hp)/2);a.hp=Math.min(v,a.max-a.mia);d.hp=Math.min(v,d.max-d.mia);say('お互いの 体力を 分け合った！')}
  if(f.phaze){const L=benchOf(d.s);if(L.length){say(`${D}は 引きずり出された！`);doSwitch(d.s,d.slot,pick(L),1)}}}
 if(!first)return;
 if(f.resetSelf){Object.keys(a.stg).forEach(k=>{if(a.stg[k]<0)a.stg[k]=0});say(`${W}の 能力下降が 元に戻った！`)}
 if(f.heal){if(heal(a,a.max*f.heal))say(`${W}の HPが 回復した！`);else say(`${W}の HPは 回復しなかった`)}
 if(f.cure){MAINS.concat(ORIG).forEach(k=>delete a.ss[k]);a.vol.conf=0}
 if(f.food){a.vol.food=f.food;say(`${W}の 次の食技の威力が上がった！`)}
 if(f.inv){a.vol.inv=VB.turn+f.inv-1;say(`${W}は 無敵のバリアを張った！`)}if(f.revive){a.vol.rev=f.revive;say(`${W}は 復活予約をした！`)}
 if(f.psy){a.vol.psy=VB.turn;say(`${W}は 虚空攻撃を防ぐ空間を作った！`)}if(f.amber){a.vol.amber=VB.turn;say(`${W}は 因果を固めた！`)}
 if(f.shield){shOn(a,f.shield);a.vol.shEnd=999;say(`${W}は ${f.shield.col?SHN[f.shield.col]:''}シールドを張った！`)}
 if(f.ferment){a.vol.ferment=VB.turn+2;say(`${W}は じっくり熟成を始めた…`)}if(f.doom){a.vol.doom=VB.turn+f.doom}
 if(f.hydro)a.vol.hydro=VB.turn+1;if(f.field){VB.field=f.field;say(`フィールドが ${f.field}になった！`)}if(f.setTime){VB.time=f.setTime;say(`時刻が ${f.setTime}になった！`)}
 const ms=VB.sd[a.s],os=VB.sd[1-a.s];
 
 if(f.weather){if(VB.w==='終焉')say('しかし 天気は変わらなかった');else{VB.w=f.weather;say(`天気が ${f.weather}になった！`)}}
 if(f.terrain){VB.ter={t:f.terrain,n:5};say(`足元が ${f.terrain}フィールドになった！`)}
 if(f.screen){if(f.screen==='a'&&VB.w!=='雪')say('しかし 雪でないので 失敗した！');else{ms.scr=ms.scr||{};ms.scr[f.screen]=VB.turn+4;say(`${ms.nm}の場に ${{r:'リフレクター',l:'ひかりのかべ',a:'オーロラベール'}[f.screen]}が 張られた！`)}}
 if(f.tw){ms.tw=VB.turn+3;say(`${ms.nm}の場に おいかぜが 吹いた！`)}
 if(f.hz){os.hz=os.hz||{};const k=f.hz,mx={sr:1,sp:3,ts:2,web:1}[k];if((os.hz[k]||0)>=mx)say('しかし これ以上 撒けない！');else{os.hz[k]=(os.hz[k]||0)+1;say(`${os.nm}の場に ${{sr:'ステルスロック',sp:'まきびし',ts:'どくびし',web:'ねばねばネット'}[k]}が 設置された！`)}}
 if(f.spin&&a.hp>0&&ms.hz&&Object.values(ms.hz).some(Boolean)){ms.hz={};say(`${W}は 足元の設置物を 取り払った！`)}
 if(f.defog){VB.sd.forEach(x=>x.hz={});os.scr={};say('設置物と 壁が 吹き飛ばされた！')}
 if(f.haze){allAct().forEach(m=>{['A','B','C','D','S','acc','eva','mot','kire'].forEach(k=>m.stg[k]=0)});say('全員の 能力変化が 元に戻った！')}
 if(f.focus){a.vol.focus=1;say(`${W}は 張り切っている！`)}
 if(f.sub&&a.hp>0){a.vol.sh={hp:Math.floor(a.max/4),B:null,D:null,col:null,sub:1};say(`${W}の みがわりが 現れた！`)}
 if(f.uturn&&a.hp>0&&a.slot>=0&&benchOf(a.s).length&&!ms.pend.includes(a.slot)){ms.pend.push(a.slot);say(`${W}は 戻っていく！（ターンの終わりに交代）`)}
 if(f.sac){ms.sac=1;hurt(a,a.hp)}if(f.selfKO&&a.hp>0){hurt(a,a.hp);say(`${W}は 力を使い果たした…`)}if(f.recharge)a.vol.recharge=1;
 if(f.extra&&a.hp>0&&!a.vol.extraDone&&foesOf(a).length){a.vol.extraDone=1;say(`${W}は もう一度 行動する！`);const y=cpuPick(a,1);if(y.i>=0)useMove(a,a.moves[y.i],y)}
 ko(a)}
function canUse(m,mv){if(mv.left<=0)return'PP切れ';if(GATED[mv.nm]&&!(m.ab.unlock===mv.nm&&m.hp<=m.max*(m.ab.unlockAt||1)))return'使用不可';if(mv.cat==='x'&&m.vol.taunt>VB.turn)return'ちょうはつ中';if(mv.fx.first&&!m.vol.fresh)return'最初のターンのみ';if(mv.fx.noRep&&m.vol.last===mv.key)return'2連続不可';if(mv.sig&&m.ss.封印)return'封印中';if(mv.fx.hpReq&&m.hp>m.max*mv.fx.hpReq)return'HP条件';if(mv.fx.afterEat&&m.vol.ate!==VB.turn)return'条件未達';if((mv.prot||mv.fx.endT)&&m.vol.protNow)return'連続不可';return''}
const STRUG={key:'b:わるあがき',nm:'わるあがき',types:['―'],cat:'p',contact:1,pw:50,acc:0,pri:0,fx:{...fx0(),recoilMax:.25,ignImm:1},basic:1};
function canSw(m){return!(m&&m.hp>0&&(m.vol.bind>=VB.turn||m.ss.フローズン))}
function doSwitch(s,slot,to,forced){const sd=VB.sd[s],o=slotM(s,slot);
 if(o){if(!forced&&o.hp>0){if(o.ab.outHeal)heal(o,o.max*o.ab.outHeal)}if(o.vol.gk>=VB.turn){o.max=Math.round(o.max/1.3);o.hp=Math.min(o.hp,o.max)}o.stg=z0();o.stk={};o.vol={};delete o.ss.硬直;o.slot=-1}
 sd.on[slot]=to;const n=sd.tm[to];n.slot=slot;enter(n)}
function prio(m,x){if(x.t!=='mv')return 10;if(m.ss.シャーベット)return-10;const mv=x.i<0?STRUG:m.moves[x.i];return(mv.pri||0)+(m.ab.priT[mtypes(m,mv)[0]]||0)+(mv.cat==='x'?m.ab.priX||0:0)}
function canAct(m){const W=who(m);if(m.vol.stun===VB.turn){say(`${W}は 動けない！`);return 0}if(m.vol.recharge){m.vol.recharge=0;say(`${W}は 反動で 動けない！`);return 0}
 if(m.ss.ねむり){if(m.ss.ねむり.c>0){m.ss.ねむり.c--;say(`${W}は ぐうぐう 眠っている`);return 0}delete m.ss.ねむり;say(`${W}は 目を覚ました！`)}
 if(m.ss.硬直){say(`${W}は 硬直して 動けない！`);return 0}if(m.ss.フローズン){say(`${W}は フローズン状態で 動けない！`);return 0}
 if(m.ss.こおり){if(rnd()<.2){delete m.ss.こおり;say(`${W}の こおりが とけた！`)}else{say(`${W}は 凍って 動けない！`);return 0}}
 if(m.vol.flinch>0){m.vol.flinch--;say(`${W}は ひるんで 動けない！`);return 0}
 if(m.ss.メロメロ&&rnd()<.5){say(`${W}は メロメロで 動けない！`);return 0}if(m.ss.まひ&&!m.ab.paraBoost&&rnd()<.25){say(`${W}は 体がしびれて 動けない！`);return 0}if(m.ss.シャーベット&&rnd()<.25){say(`${W}は 冷えて 動けない！`);return 0}if(m.stg.sug>=2&&rnd()<.25){say(`${W}は 甘さで 動けない！`);return 0}
 if(m.vol.conf){if(--m.vol.conf<=0){m.vol.conf=0;say(`${W}の 混乱が とけた！`)}else if(rnd()<1/3){const d=Math.floor(Math.floor(lvK(m)*40*stat(m,'A')/Math.max(1,stat(m,'B')))/50)+2;hurt(m,d);say(`${W}は 混乱して 自分を攻撃した！ ${d} ダメージ`,fxm(m,'hit'));ko(m);return 0}}return 1}
function runTurn(acts){VB.turn++;VB.acts0=acts;if(!VB.quiet)VB.q.push({turn:VB.turn});
 allAct().forEach(m=>{m.vol.lastProt=m.vol.protNow;m.vol.protNow=0;m.vol.prot=0;m.vol.acted=0;m.vol.extraDone=0;
  if(m.vol.shEnd&&VB.turn>m.vol.shEnd&&m.vol.sh){m.vol.sh=null;say(`${who(m)}の シールドが消えた`)}
  if(m.vol.ferment===VB.turn){stages(m,[{ks:['A','B','C','D','S'],n:2,p:1,who:'self'}],'熟成発酵');m.vol.ferment=0}
  if(m.ss.紅色&&m.hp>0){const d=hurt(m,m.hp*.25);say(`${who(m)}は 紅色状態で ${d} ダメージ！`,fxm(m,'hit'));ko(m)}});
 [0,1].forEach(s=>(acts[s]||[]).forEach((x,slot)=>{if(x&&x.t==='mv'&&x.gk&&!VB.sd[s].gkUsed){const m=slotM(s,slot);if(m&&m.hp>0&&!m.ss.封印){VB.sd[s].gkUsed=1;m.vol.gk=VB.turn+2;m.vol.gkTurn=VB.turn;m.max=Math.round(m.max*1.3);m.hp=Math.round(m.hp*1.3);say(`${who(m)}の 全界解放！ 力があふれ出す！`,fxm(m,'gk'))}}}));
 allAct().forEach(m=>{if(m.ab.tickDmg&&m.hp>0)foesOf(m).forEach(o=>{const d=hurt(o,m.ab.tickDmg);say(`${who(m)}の ${an(m)}！ ${who(o)}に ${d} ダメージ！`,fxm(o,'hit'));ko(o)})});
 allAct().forEach(m=>{if(m.ab.stun&&VB.ns>1&&rnd()<m.ab.stun){const F=foesOf(m);if(F.length){F.forEach(o=>o.vol.stun=VB.turn);m.vol.stun=VB.turn;say(`${who(m)}の ${an(m)}！ 相手を巻き込んで 全員 動けなくなった！`)}}});
 const L=[];[0,1].forEach(s=>(acts[s]||[]).forEach((x,slot)=>{const m=slotM(s,slot);if(x&&m)L.push({s,slot,m,x,p:prio(m,x),v:spd(m)*(VB.tr>0?-1:1),r:rnd()})}));
 L.sort((a,b)=>b.p-a.p||b.v-a.v||a.r-b.r);
 for(let qi=0;qi<L.length;qi++){const{s,slot,m,x}=L[qi];if(VB.done)break;if(m.vol.delayed&&qi<L.length-1){m.vol.delayed=0;L.push(L.splice(qi,1)[0]);qi--;continue}if(x.t==='run'){say(`${who(m)}は 逃げ出した！`);VB.fled=s;VB.done=1;break}if(x.t==='item'){if(m.hp>0)VB.useItem?.(m,x.id,say,heal);m.vol.acted=1;continue}
  if(x.t==='sw'){const sd=VB.sd[s];if(sd.tm[x.to].hp>0&&!sd.on.includes(x.to)&&m.slot===slot)doSwitch(s,slot,x.to);continue}
  if(m.slot!==slot||m.hp<=0||m.vol.entered===VB.turn)continue;
  const mv=x.i<0?STRUG:m.moves[x.i];if(!canAct(m)){m.vol.acted=1;continue}
  if(x.i>=0&&mv.cat==='x'&&m.vol.taunt>=VB.turn){m.vol.acted=1;say(`${who(m)}は ちょうはつされて ${mv.nm}を 出せない！`);continue}
  if(x.i>=0&&mv.sig&&m.ss.封印){m.vol.acted=1;say(`${who(m)}は 封印されていて ${mv.nm}を 出せない！`);continue}
  if(mv.fx.charge&&!m.vol.charging&&!m.vol.herb&&!(mv.fx.sunNC&&VB.w==='晴天')){m.vol.charging=mv.key;m.vol.chTg=x.tg;m.vol.acted=1;say(`${who(m)}は 力を溜めている！`);continue}
  if(x.i<0)say(`${who(m)}は 出せる技がない！`);useMove(m,mv,x)}
 endTurn()}
function endTurn(){const w=VB.w;
 allAct().forEach(m=>{if(m.hp<=0)return;const W=who(m),tick=(d,t,mia)=>{const x=hurt(m,d,mia);if(x)say(`${W}は ${t}で ${x} ダメージ！`,fxm(m,'hit'));return ko(m)};
  if(w==='砂嵐'&&!m.types.some(t=>t==='岩'||t==='地')&&tick(Math.max(1,m.max/16),'砂嵐'))return;
  if(m.ss.やけど&&tick(m.max/16,'やけど'))return;if(m.ss.どく&&tick(m.max/8,'どく'))return;if(m.ss.もうどく&&tick(m.max*(++m.ss.もうどく.c)/16,'もうどく'))return;
  if(m.ss.オーブン&&tick(m.max/8,'オーブン'))return;if(m.ss.ビター&&tick(m.max*Math.min(4,++m.ss.ビター.c)/8,'ビター'))return;
  if(m.ss.しおづけ&&tick(m.max/(m.types.some(t=>t==='水'||t==='鋼')?4:8),'しおづけ'))return;if(m.ss.瘴気&&tick(m.max/8,'瘴気',1))return;
  if(m.ss.ミイラ){const L=m.moves.filter(x=>x.left>0);if(L.length)pick(L).left--;if(tick(m.max/8,'ミイラ'))return;if(++m.ss.ミイラ.c>=3){delete m.ss.ミイラ;say(`${W}の ミイラ状態が とけた`)}}
  Object.keys(m.ss).forEach(k=>{if(m.ss[k].t&&VB.turn>=m.ss[k].t){delete m.ss[k];say(`${W}の ${k}状態が とけた`)}});
  if(m.vol.seed){const x=hurt(m,m.max/8),F=actv(m.vol.seed.s);if(x){say(`やどりぎが ${W}の 体力を 吸い取る！`,fxm(m,'hit'));if(F.length)heal(pick(F),x)}if(ko(m))return}
  if(m.ab.hai&&VB.ns>1){const o=slotM(1-m.s,m.slot);if(o&&o.hp>0){const x=hurt(o,m.ab.hai.d);heal(m,m.ab.hai.h);say(`${W}の ${an(m)}！ ${who(o)}に ${x} ダメージ、自分は回復！`,fxm(o,'hit'));ko(o)}}
  if(VB.ter?.t==='グラス'&&gnd(m)&&heal(m,m.max/16))say(`${W}は グラスフィールドで 回復した`);
  if(m.ab.regen&&heal(m,m.max*m.ab.regen))say(`${W}は HPを回復した！（${an(m)}）`);if(m.ab.wReg[w]&&heal(m,m.max*m.ab.wReg[w]))say(`${W}は ${w}で HPを回復した！（${an(m)}）`);
  if(m.ab.st.end)stages(m,m.ab.st.end,an(m));if(m.ab.st.e2&&VB.turn%2===0)stages(m,m.ab.st.e2,an(m));
  endExtra(m);if(m.hp<=0)return;if(m.vol.doom&&VB.turn>=m.vol.doom){hurt(m,m.hp);say(`${W}は 限界を迎えた…`);ko(m);return}
  if(m.vol.gk&&VB.turn===m.vol.gk){m.max=Math.round(m.max/1.3);m.hp=Math.min(m.hp,m.max);say(`${W}の 全界解放が 終わった`)}
  if(m.vol.itemOff&&m.vol.itemOff<999&&VB.turn>=m.vol.itemOff)m.vol.itemOff=0});
 const A=allAct(),lp=A.some(m=>m.ab.timeLoop),fx=A.find(m=>m.ab.timeFix);
 A.forEach(m=>{if(m.vol.entered<VB.turn)m.vol.fresh=0});if(VB.ter&&--VB.ter.n<=0){say(`${VB.ter.t}フィールドが 消えた`);VB.ter=null}
 VB.time=fx?fx.ab.timeFix:lp?(VB.time==='夜'?'深夜':'夜'):TIMES[(TIMES.indexOf(VB.time)+1)%6];if(VB.tr>0&&--VB.tr===0)say('ゆがんだ時空が 元に戻った');
 checkEnd()}
function checkEnd(){const a0=alive(0),a1=alive(1);if(!a0||!a1){VB.done=1;VB.win=a0?0:a1?1:-1}}
/* --- CPU --- */
function estDmg(a,d,mv,sp){if(mv.cat==='x'||!(mv.pw||mv.fx.ohko))return 0;const T=mtypes(a,mv);if(!mv.fx.ignImm&&T.some(t=>d.ab.imm.includes(t)||d.ab.abs[t]))return 0;
 if(!mv.pw)return(mv.fx.symReq&&d.sym[0]!==mv.fx.symReq)?0:d.hp*(mv.acc||100)/100;const h=mv.fx.hits?(mv.fx.hits[0]+mv.fx.hits[1])/2:1;let v=calc(a,d,mv,{r:.92,sp}).dmg*h*(mv.acc||100)/100;if(d.vol.sh)v*=.4;return v}
function bestDmg(a,d){let b=0;a.moves.forEach(mv=>{if(!canUse(a,mv))b=Math.max(b,estDmg(a,d,mv))});return b}
const tgOf=m=>m?{s:m.s,slot:m.slot}:null;
function cpuPick(m,atkOnly){const s=m.s,F=foesOf(m),lv=2,sd=VB.sd[s],al=allyOf(m);
 if(m.vol.charging){const i=m.moves.findIndex(x=>x.key===m.vol.charging);if(i>=0)return{t:'mv',i,tg:m.vol.chTg}}
 if(!F.length){const i=m.moves.findIndex(v=>!canUse(m,v));return{t:'mv',i}}
 const o=F[0],sc=m.moves.map((mv,i)=>{if(canUse(m,mv))return{v:-1};if(atkOnly&&mv.cat==='x')return{v:-1};const f=mv.fx;
  if(mv.cat==='x'){if(mv.prot)return{v:VB.ns>1?.14:.08};const R=rngOf(mv);let v=0;if(f.heal)v=Math.max(v,(R==='ally'&&al&&al.hp<al.max*.5)||m.hp<m.max*.5?.55:0);if(f.st.some(x=>x.who!=='foe'&&x.n>0))v=Math.max(v,m.hp>m.max*.6&&Object.values(m.stg).every(x=>x<2)?.3:.02);
   if(f.ss.some(x=>x.who==='foe')&&F.some(x=>!Object.keys(x.ss).length))v=Math.max(v,.28);if(f.st.some(x=>x.who==='foe'))v=Math.max(v,R==='eA'?.25:.15);if(f.shield||f.inv||f.revive)v=Math.max(v,.25);
   const os=VB.sd[1-s],ms=sd,boosted=m2=>Object.entries(m2.stg).some(([k,x])=>k!=='sug'&&x>0);
   if(f.hz)v=Math.max(v,(os.hz?.[f.hz]||0)>=({sr:1,sp:3,ts:2,web:1}[f.hz])?0:.32);if(f.screen)v=Math.max(v,(ms.scr?.[f.screen]||0)>=VB.turn||(f.screen==='a'&&VB.w!=='雪')?0:.3);
   if(f.weather)v=Math.max(v,VB.w===f.weather?0:.12);if(f.terrain)v=Math.max(v,VB.ter?.t===f.terrain?0:.12);if(f.tw)v=Math.max(v,ms.tw>=VB.turn?0:VB.ns>1?.35:.2);
   if(f.taunt)v=Math.max(v,o.vol.taunt>=VB.turn?0:.15);if(f.seed)v=Math.max(v,o.vol.seed||o.types.includes('草')?0:.28);if(f.sub)v=Math.max(v,m.vol.sh||m.hp<m.max*.5?0:.22);
   if(f.rest)v=Math.max(v,m.hp<m.max*.4?.6:0);if(f.phaze||f.haze)v=Math.max(v,F.some(boosted)?.4:.03);if(f.spin||f.defog)v=Math.max(v,ms.hz&&Object.values(ms.hz).some(Boolean)?.35:.02);
   if(f.pain)v=Math.max(v,m.hp<m.max*.4&&o.hp>o.max*.6?.4:0);if(f.trick||f.gastro||f.focus||f.endT)v=Math.max(v,.06);if(f.cost&&m.hp<=m.max*f.cost)v=-1;if(f.psy&&R==='allyAll')v=Math.max(v,.1);
   if(f.sac||f.doom)v=.01;let tg=null;if(R==='e1')tg=tgOf(pick(F));else if(R==='ally')tg=tgOf(al&&al.hp<al.max*.5?al:m);return{v:v+rnd()*.05,tg}}
  const R=rngOf(mv),sp=(R==='eA'||R==='all')&&(F.length+(R==='all'&&al?1:0))>1?.75:1,val=d=>{const v=estDmg(m,d,mv,sp);return Math.min(v,d.hp)/d.max+(v>=d.hp?.5:0)};
  let v,tg=null;if(R==='e1'){const b=F.map(d=>({d,v:val(d)})).sort((p,q)=>q.v-p.v)[0];v=b.v;tg=tgOf(b.d)}else{v=F.reduce((a,d)=>a+val(d),0);if(R==='all'&&al)v-=val(al)*1.2}
  if(f.recoil)v-=.05;if(f.selfKO)v-=.6;if(f.recharge)v-=.1;return{v,tg}});
 if(sc.every(x=>x.v<0))return{t:'mv',i:-1};
 if(lv===0&&rnd()<.5){const ok=sc.map((x,i)=>x.v>=0?i:-1).filter(i=>i>=0),i=pick(ok);return{t:'mv',i,tg:sc[i].tg}}
 let bi=sc.findIndex(x=>x.v>=0);const jit=()=>lv===1?rnd()*.15:0;sc.forEach((x,i)=>{if(x.v+jit()>sc[bi].v+jit())bi=i});
 const gk=!atkOnly&&m.canGk&&!sd.gkUsed&&!sd.gkPlan&&!m.ss.封印&&m.hp>m.max*.5&&rnd()<.35;if(gk)sd.gkPlan=1;return{t:'mv',i:bi,gk,tg:sc[bi].tg}}
const cpuRep=s=>benchOf(s)[0];

// ---------- 技の一覧 ----------
const MOVES = new Map();
const RANGE = { 敵全体: 'eA', 敵全: 'eA', 味方全体: 'allyAll', 味方全: 'allyAll', '自分/味方': 'ally', 自分: 'self', 自編成: 'self', 全場: 'side' };
const CAT = { 物理: 'p', 特殊: 's', 変化: 'x', 虚空: 'v', 反質: 'a', 封印: 'f' };
export function loadBattleData(types, moves, chars) {
  TYPES = types;
  ABILITIES = [...new Set(chars.flatMap((c) => c.abilities).filter(Boolean))];
  MOVES.clear();
  for (const r of moves) {
    let cat = CAT[r.cat] || 'x';
    const pw = Math.abs(parseFloat(r.power)) || 0, acc = parseFloat(r.acc);
    if (cat === 'x' && pw > 0) cat = 's';
    MOVES.set(r.name, {
      rng: RANGE[r.range], key: r.name, nm: r.name, types: (r.type || '無').split('／').filter(Boolean), cat, contact: r.contact,
      pw: cat === 'x' ? 0 : pw, acc: Number.isNaN(acc) ? 0 : acc, pp: +r.pp || 5, pri: parseInt(r.pri, 10) || 0, cond: r.cond, eff: r.eff, desc: r.desc, sig: r.sig,
      prot: /そのターン攻撃を防ぐ/.test(r.eff), fx: mvFx(r.eff || r.desc || '', r.cond),
    });
  }
}
// 名前だけで効果の分からない技や、覚えられる技がない時のための基本の攻撃
const basicMove = (t, ph, pw = 70, nm = `${t}アタック`) => ({ key: 'b:' + nm, nm, types: [t], cat: ph ? 'p' : 's', contact: ph, pw, acc: 100, pp: 30, pri: 0, cond: '', eff: '', fx: fx0(), basic: 1 });
// 覚えている技: 自分の専用技を優先し、誰の専用技でもない技のうちタイプが一致するもの (超シリーズもここに入る)
export function learnset(c) {
  const T = new Set(splitTypes(c.type).length ? splitTypes(c.type) : ['無']);
  const ph = c.stats[1] >= c.stats[3];
  const list = c.sigs.map((n) => (MOVES.has(n) ? { ...MOVES.get(n), sig: 1 } : { ...basicMove([...T][0], ph, 120, n), sig: 1, pp: 5 }));
  for (const m of MOVES.values()) if (!m.sig && !list.some((x) => x.nm === m.nm) && m.types.some((t) => T.has(t))) list.push(m);
  if (!list.some((m) => m.cat !== 'x')) list.push(basicMove([...T][0], ph));
  return list;
}

// ---------- 戦う人の作成 ----------
export const statsAt = (base, lv) => ({
  H: Math.floor(((2 * base[0] + 31) * lv) / 100) + lv + 10,
  A: Math.floor(((2 * base[1] + 31) * lv) / 100) + 5, B: Math.floor(((2 * base[2] + 31) * lv) / 100) + 5,
  C: Math.floor(((2 * base[3] + 31) * lv) / 100) + 5, D: Math.floor(((2 * base[4] + 31) * lv) / 100) + 5, S: Math.floor(((2 * base[5] + 31) * lv) / 100) + 5,
});
// o: { id, name, types, stats, lv, ability, moves, cost, sym, item, canGk, ctrl }
export function makeUnit(o) {
  const ab = parseAb(o.ability || ''), st = statsAt(o.stats, o.lv);
  st.H = Math.floor(st.H * (ab.sm.H || 1));
  return {
    id: o.id, nm: o.name, lv: o.lv, sym: o.sym || '', cost: o.cost || 0, types: o.types.length ? [...o.types] : ['無'], st, max: st.H, hp: st.H, ab, abT: o.ability || '',
    abN: ((o.ability || '').match(/^「([^」]+)」/) || [, ''])[1], moves: o.moves.map((m) => ({ ...m, left: m.pp })), item: o.item || null, canGk: !!o.canGk,
    stg: z0(), stk: {}, vol: {}, ss: {}, mia: 0, src: o,
  };
}
// 技が多いキャラは、相手に合わせて強い順に絞る (計算を軽くするため。操作中のキャラは全部使う)
export function bestMoves(u, foes, n = 5) {
  if (u.moves.length <= n) return u.moves;
  const scored = u.moves.map((m) => {
    if (m.cat === 'x') return { m, v: 40 + rnd() * 30 };
    const e = Math.max(...foes.map((d) => m.types.reduce((p, t) => p * d.types.reduce((q, x) => q * typeMult(t, x), 1), 1)));
    const stab = m.types.some((t) => u.types.includes(t)) ? 1.5 : 1;
    const pw = m.cat === 'v' ? m.pw * 45 : m.pw;
    return { m, v: pw * e * stab * ((m.acc || 100) / 100) * (m.left <= 1 ? 0.5 : 1) };
  }).sort((a, b) => b.v - a.v);
  return scored.slice(0, n).map((x) => x.m);
}

// ---------- 戦闘の進行 ----------
const z0 = () => ({ A: 0, B: 0, C: 0, D: 0, S: 0, acc: 0, eva: 0, mot: 0, kire: 0, sug: 0 });
export function startBattle(left, right, { slots = [1, 1], quiet = false, summon = null, useItem = null, weather, time, month, place = '草原' } = {}) {
  VB = {
    ns: Math.max(...slots), turn: 0, q: [], done: 0, w: weather ?? pick(WEATHERS), time: time ?? pick(TIMES), month: month ?? 1 + Math.floor(rnd() * 12), place, field: null, tr: 0, ter: null, quiet, summon, useItem,
    sd: [left, right].map((tm, s) => ({ nm: s ? '相手' : '味方', hz: {}, scr: {}, tw: 0, pend: [], tm, on: Array.from({ length: slots[s] }, (_, i) => (i < tm.length ? i : -1)) })),
  };
  VB.sd.forEach((sd, s) => { sd.tm.forEach((m) => { m.s = s; m.slot = -1; }); sd.on.forEach((j, i) => { if (j >= 0) sd.tm[j].slot = i; }); });
  allAct().sort((a, b) => spd(b) - spd(a)).forEach((m) => { if (m.hp > 0) enter(m); });
  checkEnd();
  return VB;
}
// 1ターン進める。choose(unit) が行動を返さなかった人は自動で動く
export function battleTurn(B, choose = null) {
  VB = B;
  const acts = [[], []];
  for (const s of [0, 1]) VB.sd[s].on.forEach((j, slot) => {
    const m = slotM(s, slot);
    if (!m || m.hp <= 0) return;
    const ch = m.vol.charging && m.moves.findIndex((x) => x.key === m.vol.charging);
    acts[s][slot] = m.vol.charging && ch >= 0 ? { t: 'mv', i: ch, tg: m.vol.chTg } : choose?.(m) ?? cpuPick(m, 0);
  });
  VB.sd.forEach((x) => { x.gkPlan = 0; });
  runTurn(acts);
  for (const s of [0, 1]) {
    const sd = VB.sd[s];
    sd.pend.length = 0;
    sd.on.forEach((j, slot) => {
      const m = slotM(s, slot), rest = benchOf(s);
      if ((!m || m.hp <= 0) && rest.length) doSwitch(s, slot, cpuRep(s), 1);
    });
  }
  checkEnd();
  return VB;
}
// 決着までまとめて進める。最後まで決まらなければ残りHPの割合で勝敗を決める
export function autoBattle(B, maxTurns = 30) {
  while (!B.done && B.turn < maxTurns) battleTurn(B);
  if (!B.done) {
    const r = (s) => B.sd[s].tm.reduce((v, m) => v + Math.max(0, m.hp) / m.max, 0) / B.sd[s].tm.length;
    B.done = 1;
    B.win = r(0) >= r(1) ? 0 : 1;
    B.timeout = 1;
  }
  return B;
}
export const canUseMove = (B, m, mv) => { VB = B; return canUse(m, mv); };
export const boost = (B, m, ks, n) => { VB = B; stages(m, [{ ks, n, p: 1, who: 'self' }], ''); };
export const typeBoost = (m, t) => (m.types.includes(t) ? 1.5 : 1);
export { parseAb, mvFx, STN };

// ---------- 文章の読み取りだけでは表せない特性 ----------
const BASE18 = ['無', '炎', '水', '電', '草', '氷', '闘', '毒', '地', '飛', '超', '虫', '岩', '霊', '竜', '悪', '鋼', '妖'];
const GATED = { 怒りの極意: 1, 落ち着きの極意: 1 }; // 特性で解放されるまで使えない専用技
const mark = (f, label) => f.ok.push(label);
const set = (o, label) => (f) => { Object.assign(f, o); mark(f, label); };
const EXTRA = {
  クマノミ一族: set({ summon: { at: 0.5, kin: 'クマノミ', lvR: 0.5 } }, '仲間を呼ぶ'), 'クマノミ一族＋': set({ summon: { at: 0.75, kin: 'クマノミ', lvR: 0.5 } }, '仲間を呼ぶ'),
  へっふー族: set({ summon: { at: 0, kin: 'へっふー', lvR: 0.4 } }, '仲間を呼ぶ'),
  団界: set({ summon: { at: 0.25, world: '団界', lv: 25 } }, '仲間を呼ぶ'), '団界＋': set({ summon: { at: 1 / 3, world: '団界', lv: 25 } }, '仲間を呼ぶ'),
  店の店主: set({ shop: 1 }, '毎ターン品物を使う'), ぜんちぜんのう: set({ noImm: 1 }, '効果なしを等倍に'),
  零界EX: set({ barrier: 2 }, '登場時バリア'), ワンダーエボリューション: set({ hDown: 1 }, '登場時HP減'), 黒界の主: set({ hDown: 1 }, '登場時HP減'),
  腐敗: set({ rot: 0.3 }, '接触した相手の特性を腐敗に'), 回界: set({ retry: 1 }, '外すともう一度'), 写界: set({ copyUp: 1 }, '能力上昇をまねる'), '写界＋': set({ copyUp: 2 }, '能力上昇をまねる'),
  耗界: set({ ppHit: 1 }, 'PPを削る'), はとむね: set({ noDrop: ['B'] }, 'Bが下がらない'), 紀界: set({ rewind: 0.08 }, '相手の時間を戻す'), '紀界＋': set({ rewind: 0.12 }, '相手の時間を戻す'),
  オジリンメモリー: set({ fullGuard: 1 }, '満タンで特性を受けない'), てんねん: set({ unaware: 1 }, '能力変化を無視'), クリアボディ: set({ noDrop: true }, '能力が下がらない'),
  にげあし: set({ runAway: 1 }, '必ず逃げられる'), すてみ: set({ recoilPow: 1.2 }, '反動技×1.2'), アンチスキン: set({ skin: '反', skinPow: 1.2 }, '無技→反'), かたやぶり: set({ mold: 1 }, '相手の特性を無視'),
  熟成アルコール: set({ poisonPow: 1.5 }, '毒の相手に×1.5'), フラワーヴェール: set({ veil: 1 }, '花・水の能力が下がらない'), 隊長の統率力: set({ cheer: { kin: 'クマノミ', n: 1 } }, '一族を鼓舞'),
  不意打ちの一撃: set({ lagPow: 1.5 }, '後攻で×1.5'), シュガーハイ: set({ missS: 2 }, '外す・避けるとS+2'), かるわざ: set({ unburden: 1 }, '道具がなくなるとS増'), うるおいボディ: set({ rainCure: 1 }, '雨で状態異常回復'),
  ふしぎなうろこ: set({ marvel: 1 }, '状態異常でB増'), げきりゅう: set({ tpPinch: { t: '水', r: 1 / 3, k: 1.5 } }, 'ピンチで水技×1.5'), 感情豊か: set({ moody: 1 }, '得意不得意が強まる'),
  黒い体: set({ darkBody: 1 }, '悪技を受けた次の威力×2'), 黒き魂: set({ blackSoul: 1 }, '受けた次の威力×2'), まけんき: set({ defiant: 1 }, '下げられるとA+2'), くいしんぼう: set({ glutton: 1 }, '木の実を早く食べる'),
  天気を操る者: set({ weatherEvery: 3 }, '天候を操る'), '天気を操る者＋': set({ weatherEvery: 3, weatherAncient: 1 }, '天候を操る'), 天気を操る者EX: set({ weatherEvery: 1, weatherAncient: 1 }, '天候を操る'),
  ねばねば: set({ webHit: 1 }, '接触でネバネバネット'), そうしょく(f) { f.abs.草 = { heal: 0, st: [{ ks: ['A'], n: 1, p: 1, who: 'self' }], flash: 0 }; mark(f, '草技を吸収'); },
  どんかん: set({ sImm: ['メロメロ'] }, 'メロメロにならない'), あおい追撃: set({ allyAfter: { nm: 'ぴんぺん', cat: 's', k: 'A' } }, '味方に続いてA+1'), ぴんくの援護: set({ allyAfter: { nm: 'あおぺん', cat: 'p', k: 'C' } }, '味方に続いてC+1'),
  ちびっこチャージ: set({ paraBoost: 1 }, 'まひで強くなる'), 古代のあしおと: set({ delayFoe: 0.3 }, '物理で相手を遅らせる'), ちびみみずく: set({ dodgeBig: 0.3 }, '格上の攻撃を避ける'),
  メロメロボディ: set({ charm: 0.3 }, '接触でメロメロ'), むしのしらせ: set({ tpPinch: { t: '虫', r: 1 / 3, k: 1.5 } }, 'ピンチで虫技×1.5'), いやしのこころ: set({ healer: 0.3 }, '味方の状態異常を治す'),
  かんそうはだ(f) { f.abs.水 = { heal: 0.25, st: [], flash: 0 }; f.tIn.炎 = 1.25; f.wReg.雨 = 1 / 16; f.sunBurn = 1; mark(f, '雨と水で回復'); }, ちからもち: set({ sm: { A: 2 } }, 'A×2'), ものひろい: set({ pickup: 1 }, '道具を拾う'),
  よんしょく(f) { for (const t of '炎水草電') f.tp[t] = (f.tp[t] || 1) * 1.2; mark(f, '4タイプ×1.2'); }, ｷﾞｬｯ: set({ flyEvery: 2 }, '2ターンごとに空へ'), 'ユッフー！': set({ firstHeal: 0.1 }, '先制で回復'), 行きます: set({ dragOut: 0.5 }, '相手を交代させる'),
  あやかしのりんぷん: set({ dust: 1 }, '被弾で相手が妖に弱くなる'), 耗界の特異点: set({ seTaken: 4 }, '弱点を突かれると×4'), 虚空の統率者: set({ guard: 'all' }, '味方をかばう'), ここにはえいえんにいられない: set({ doomIn: 3 }, '3ターン後に倒れる'),
  W23は来ない: set({ doomIn: 22 }, '22ターン後に倒れる'), スーパートロピカル: set({ statCap: 8 }, 'ランク最大8'), アクトオブタイム: set({ stopFoe: 1 }, '登場時に相手を止める'), スプラッシュトリック: set({ stealItem: 1 }, '登場時に持ち物を奪う'),
  '知らんけど〜！': set({ dull: 1 }, '相手の攻撃を弱める'), 'こまるしてやるー！': set({ enterBlast: 30 }, '登場時に全体攻撃'), 明日への希望を抱きながら: set({ place: '月海' }, '場所:月海'), アナイアレイション: set({ catPow: { a: 3 } }, '反質技×3'),
  早く帰りたいのです: set({ herbAt: 0.95 }, 'ハーブ効果'), リアクター: set({ reactor: 1 }, '今ひとつを受けるとCS+1'), はりきり: set({ sm: { A: 1.5 }, accMul: 0.8 }, 'A×1.5・命中×0.8'), するどいめ: set({ noDrop: ['acc'] }, '命中が下がらない'),
  こだいかっせい: set({ protosyn: 1 }, '晴天で最高能力×1.3'), 'ちからずく・改': set({ effPow: 1.3 }, '追加効果の技×1.3'), アニマルサポート: (f, raw) => { f.hitHeal = /特殊/.test(raw) ? { r: 0.3, cat: 's' } : { r: 1 / 3 }; mark(f, '攻撃時に回復'); },
  二人のヴァンパイア: (f, raw) => { f.duo = { nm: raw.includes('アカナシェー') ? 'アカナシェー' : 'ツイナシェー', n: 2 }; mark(f, '相棒とモチベ+2'); }, 獄炎の呪い: set({ mia: 0.2, hellfire: 1 }, '瘴気+獄炎'), 共鳴する音: set({ sm: { A: 2 }, noGhost: 1 }, 'A×2・霊に当たらない'),
  'すーぱーうるとられぼりゅーしょん！': set({ voidUp: 1 }, '虚空技でC・キレ+1'), 'わたしもやるのです！': set({ joinIn: 1 }, '味方に続いて攻撃'), エレメンタルソード: set({ element: 10 }, '4属性の追撃'), 音楽ゲーム: set({ notes: 1 }, '技の威力が上がる'),
  スペシャルシルバー: set({ kon: 0.1 }, '渾身+10%'), 純白の結晶: set({ whiteCrystal: 1 }, '1月にBD+2'), '真・零峰': set({ sm: { C: 7 }, anti: 1 }, 'C×7・常に反質'), 霧の力: set({ mist: 1 }, '羽で攻撃を無効化'),
  怒りの心: set({ unlock: '怒りの極意', unlockAt: 0.5 }, '専用技が解放'), 激昂な心: set({ unlock: '怒りの極意' }, '専用技が解放'), 落ち着きの心: set({ unlock: '落ち着きの極意', unlockAt: 0.5 }, '専用技が解放'), 不羈な心: set({ unlock: '落ち着きの極意' }, '専用技が解放'),
  完熟の電撃: set({ paraMul: 2 }, 'まひ確率2倍'), 'マジックミラー＋': set({ mirror: 1 }, '変化技を跳ね返す'), 天雷の裁き: set({ ignBD: ['電', '飛'] }, '電飛で能力上昇を無視'), 加速する電解: set({ shockHeal: 0.3 }, '電技で味方を回復'),
  風の便り: set({ stormPierce: 1 }, '雷雨でシールド無視'), ハッピーエコー: set({ cheerAll: 1 }, '味方のモチベ+1'), テレパシー共鳴: set({ pierceT: '超' }, '超技が防御貫通'), 青銅の避雷針(f) { f.tIn.炎 = 0.75; f.tIn.電 = 0.75; mark(f, '炎電-25%'); },
  'ナイト♢オブ♢ルチノー♢スペシャル': set({ nightSp: 1 }, '深夜にしてC+2'), 'リミットシールド・改': set({ limit: 1 }, 'AC+1'), 'ヴォイド・スター': set({ sm: { H: 1.2 } }, 'HP×1.2'), 'あたしって悪い子なの？': set({ addType: '悪' }, '悪タイプ追加'),
  'ふろすとあたーっく...なのです！': set({ frost: 1, uh2: { C: 3 } }, '登場時に氷の一撃'), 'ちくでん＋': set({}, '電技を吸収'),
};
function noDrop(t, k) {
  if (t.ab.noDrop === true || t.ab.noDrop?.includes(k)) return true;
  return t.types.some((x) => x === '花' || x === '水') && actv(t.s).some((x) => x.ab.veil);
}
// 能力が変わった時に反応する特性
function statChanged(t, k, n, src) {
  if (n < 0 && t !== src && t.ab.defiant && !VB.chain) { VB.chain = 1; stages(t, [{ ks: ['A'], n: 2, p: 1, who: 'self' }], an(t)); VB.chain = 0; }
  if (n > 0 && !VB.chain) for (const o of foesOf(t)) {
    if (!o.ab.copyUp || (o.ab.copyUp === 1 && o.vol.copied === VB.turn)) continue;
    o.vol.copied = VB.turn;
    VB.chain = 1; stages(o, [{ ks: [k], n, p: 1, who: 'self' }], an(o)); VB.chain = 0;
  }
}
function statusGot(m, n) {
  if (m.ab.marvel) stages(m, [{ ks: ['B'], n: 1, p: 1, who: 'self' }], an(m));
  if (m.ab.paraBoost && n === 'まひ') stages(m, [{ ks: ['C', 'S'], n: 1, p: 1, who: 'self' }], an(m));
}
function onMiss(a, d) {
  if (a.ab.missS) stages(a, [{ ks: ['S'], n: a.ab.missS, p: 1, who: 'self' }], an(a));
  if (d?.ab.missS) stages(d, [{ ks: ['S'], n: d.ab.missS, p: 1, who: 'self' }], an(d));
  if (a.ab.retry && !a.vol.retried && foesOf(a).length) {
    a.vol.retried = 1;
    say(`${who(a)}は もう一度 行動する！（${an(a)}）`);
    const y = cpuPick(a, 1);
    if (y.i >= 0) useMove(a, a.moves[y.i], y);
  }
}
function extraPow(a, d, mv, T, e, cat) {
  const g = a.ab;
  let k = g.catPow?.[cat] || 1;
  if (g.poisonPow && (d.ss.どく || d.ss.もうどく)) k *= g.poisonPow;
  if (g.lagPow && d.vol.acted) k *= g.lagPow;
  if (g.recoilPow && (mv.fx.recoil || mv.fx.recoilMax)) k *= g.recoilPow;
  if (a.vol.nextPow >= VB.turn) k *= 2;
  if (g.effPow && mv.eff) k *= g.effPow;
  if (g.tpPinch && T.includes(g.tpPinch.t) && a.hp <= a.max * g.tpPinch.r) k *= g.tpPinch.k;
  if (g.notes) k *= 1 + (5 * (1 + Math.floor(rnd() * 4))) / Math.max(20, mv.pw);
  if (d.vol.weakFairy >= VB.turn && T.includes('妖')) k *= 2;
  if (g.protosyn && VB.w === '晴天') k *= 1.3;
  return k;
}
// 攻撃が当たった直後
function afterHit(a, d, mv, tot, T, e) {
  const g = a.ab, h = d.ab, cover = () => d.hp > 0 && !(h.fullGuard && d.hp === d.max);
  if (g.ppHit && d.vol.last) { const m = d.moves.find((x) => x.key === d.vol.last); if (m?.left > 0) m.left--; }
  if (g.rewind && cover() && rnd() < g.rewind) { d.vol.flinch = 1; say(`${who(d)}の時間が 巻き戻された！（${an(a)}）`); }
  if (g.delayFoe && mv.cat === 'p' && !d.vol.acted && rnd() < g.delayFoe) d.vol.delayed = 1;
  if (g.firstHeal && !d.vol.acted && heal(a, a.max * g.firstHeal)) say(`${who(a)}は HPを回復した！（${an(a)}）`);
  if (g.hitHeal && (!g.hitHeal.cat || g.hitHeal.cat === mv.cat) && heal(a, a.max * g.hitHeal.r)) say(`${who(a)}は HPを回復した！（${an(a)}）`);
  if (g.voidUp && mv.cat === 'v') stages(a, [{ ks: ['C', 'kire'], n: 1, p: 1, who: 'self' }], an(a));
  if (g.hellfire && cover()) inflict(d, '獄炎');
  if (g.shockHeal && T.includes('電')) for (const o of actv(a.s)) heal(o, tot * g.shockHeal);
  if (g.element && d.hp > 0) for (const t of ['炎', '水', '地', '電']) { if (d.hp <= 0) break; const r = calc(a, d, { ...mv, types: [t], pw: g.element, cat: 's', fx: fx0() }, { r: 1 }); say(`${t}の追撃！ ${who(d)}に ${hurt(d, r.dmg)} ダメージ！`, fxm(d, 'hit')); }
  if (g.dragOut && d.hp > 0 && rnd() < g.dragOut && benchOf(d.s).length) { say(`${who(d)}は 引きずり出された！`); doSwitch(d.s, d.slot, pick(benchOf(d.s)), 1); }
  if (mv.contact && d.hp > 0) {
    if (h.rot && a.ab !== h && rnd() < h.rot) { a.ab = parseAb(d.abT); a.abT = d.abT; a.abN = d.abN; say(`${who(a)}の 特性が ${d.abN}に 変わった！`); }
    if (h.charm && rnd() < h.charm) inflict(a, 'メロメロ');
    if (h.webHit) { const hz = VB.sd[a.s].hz; hz.web = 1; say(`${who(a)}の足元に ネバネバネットが 張られた！`); }
  }
  if (h.dust) a.vol.weakFairy = VB.turn + 1;
  if (h.reactor && e < 1 && d.hp > 0) stages(d, [{ ks: ['C', 'S'], n: 1, p: 1, who: 'self' }], an(d));
  if (h.darkBody && T.includes('悪')) d.vol.nextPow = VB.turn + 1;
  if (h.blackSoul) d.vol.nextPow = VB.turn + 1;
  if (h.uh2 && d.hp > 0) d.vol.hits2 = (d.vol.hits2 || 0) + 1;
  for (const o of actv(a.s)) {
    if (o === a) continue;
    if (o.ab.allyAfter?.nm === a.nm && o.ab.allyAfter.cat === mv.cat) stages(o, [{ ks: [o.ab.allyAfter.k], n: 1, p: 1, who: 'self' }], an(o));
    if (o.ab.joinIn && !o.vol.joined && o.vol.last && d.hp > 0) { const m = o.moves.find((x) => x.key === o.vol.last); if (m && m.cat !== 'x') { o.vol.joined = VB.turn; say(`${who(o)}も 続いて攻撃した！（${an(o)}）`); hitOne(o, d, m, false, false); } }
  }
}
function trySummon(m) {
  const f = m.ab.summon;
  if (!f || m.summoned || m.isSummon || !VB.summon || m.hp > m.max * (f.at || 1)) return;
  m.summoned = 1;
  const u = VB.summon(m, f);
  if (!u) return;
  const sd = VB.sd[m.s];
  u.s = m.s; u.isSummon = 1; u.slot = sd.on.length;
  sd.tm.push(u);
  sd.on.push(sd.tm.length - 1);
  VB.ns = Math.max(VB.ns, sd.on.length);
  say(`${who(m)}の呼びかけで ${u.nm}が 駆けつけた！（${an(m)}）`);
  enter(u);
}
function enterExtra(m) {
  const f = m.ab, F = foesOf(m);
  if (f.summon && !f.summon.at) trySummon(m);
  if (f.hDown) stages(m, [{ ks: ['H'], n: -1, p: 1, who: 'self' }]);
  if (f.barrier) { m.vol.bar = VB.turn + f.barrier - 1; say(`${who(m)}は バリアを張った！（${an(m)}）`); }
  if (f.doomIn) m.vol.doom = VB.turn + f.doomIn;
  if (f.whiteCrystal && VB.month === 1) stages(m, [{ ks: ['B', 'D'], n: 2, p: 1, who: 'self' }], an(m));
  if (f.limit) stages(m, [{ ks: ['A', 'C'], n: 1, p: 1, who: 'self' }], an(m));
  if (f.nightSp) { VB.time = '深夜'; stages(m, [{ ks: ['C'], n: 2, p: 1, who: 'self' }], an(m)); }
  if (f.addType && !m.types.includes(f.addType)) m.types.push(f.addType);
  if (f.mist) m.feather = 1;
  if (f.moody) { const o = ['A', 'B', 'C', 'D', 'S'].sort((a, b) => m.st[b] - m.st[a]); m.st[o[0]] = Math.floor(m.st[o[0]] * 1.3); m.st[o[4]] = Math.floor(m.st[o[4]] * 0.7); }
  if (f.cheerAll) stages(m, [{ ks: ['mot'], n: 1, p: 1, who: 'team' }], an(m));
  if (f.cheer) actv(m.s).filter((o) => o.src?.zoku === f.cheer.kin).forEach((o) => stages(o, [{ ks: ['mot'], n: f.cheer.n, p: 1, who: 'self' }], an(m)));
  if (f.duo && actv(m.s).some((o) => o.nm === f.duo.nm)) stages(m, [{ ks: ['mot'], n: f.duo.n, p: 1, who: 'self' }], an(m));
  if (f.stopFoe && !m.stopUsed) { m.stopUsed = 1; F.forEach((o) => { o.vol.flinch = 1; }); say(`${an(m)}！ 相手の時間が 巻き戻された！`); }
  if (f.stealItem) for (const o of F) if (o.item) { m.item = m.item || o.item; o.item = null; say(`${who(m)}は ${who(o)}の持ち物を 奪った！`); }
  const blast = (pw, t, list) => list.forEach((o) => { const x = hurt(o, calc(m, o, { types: [t], cat: 's', pw, fx: fx0() }, { r: 1 }).dmg); say(`${an(m)}！ ${who(o)}に ${x} ダメージ！`, fxm(o, 'hit')); ko(o); });
  if (f.enterBlast) blast(f.enterBlast, '無', F);
  if (f.frost && F.length) blast(100, '氷', [pick(F)]);
}
const BEST_WEATHER = { 水: '雨', 炎: '晴天', 氷: '雪', 岩: '砂嵐', 地: '砂嵐', 電: '雷雨', 古: '古代' };
function endExtra(m) {
  const f = m.ab, W = who(m);
  if (f.shop) { VB.useItem?.(m, null, say, heal); }
  if (f.rainCure && VB.w === '雨') MAINS.forEach((k) => delete m.ss[k]);
  if (f.sunBurn && VB.w === '晴天') { const x = hurt(m, m.max / 8); if (x) say(`${W}は 日差しで ${x} ダメージ！`, fxm(m, 'hit')); ko(m); }
  if (f.healer && rnd() < f.healer) for (const o of actv(m.s)) MAINS.concat(ORIG).forEach((k) => delete o.ss[k]);
  if (f.weatherEvery && VB.turn % f.weatherEvery === 0 && VB.w !== '終焉') {
    const w = m.types.map((t) => BEST_WEATHER[t]).find((x) => x && (x !== '古代' || f.weatherAncient));
    if (w && VB.w !== w) { VB.w = w; say(`${an(m)}！ 天気が${w}になった！`); }
  }
  if (f.flyEvery && VB.turn % f.flyEvery === 0) { m.vol.inv = VB.turn + 1; say(`${W}は 空へ飛び上がった！（${an(m)}）`); }
  if (f.mist && VB.turn % 2 === 0) m.feather = Math.min(2, (m.feather || 0) + 1);
}
