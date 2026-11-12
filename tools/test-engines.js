// 牌型 / 牌力 / 计分 / 四款游戏机器人对局回归测试
import { DouDizhu, parsePlay, canBeat, findBeats, chooseLead } from '../server/games/doudizhu.js';
import { ZhaJinHua } from '../server/games/zhajinhua.js';
import { TexasHoldem } from '../server/games/texas.js';
import { ShengJi } from '../server/games/shengji.js';
import { eval3, compare3, eval5, bestHand, compareEval, buildPots, capFoldedContribs } from '../server/games/cards.js';
import { parseDdz, ddzCanBeat } from '../public/js/combos.js';
import { chipStackHtml } from '../public/js/chips.js';

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.error('  ✗', msg);
  }
}
function cards(list) {
  return list.map(([r, s]) => ({ r, s, id: Math.random() }));
}

console.log('· 牌型与牌力');
{
  const p = (arr) => parsePlay(cards(arr));
  ok(p([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0]])?.type === 'straight', '顺子');
  ok(p([[3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1]])?.type === 'pairseq', '连对');
  ok(p([[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2]])?.type === 'plane', '飞机');
  ok(p([[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [6, 0]])?.type === 'plane1', '飞机带单');
  ok(p([[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [6, 0], [6, 1]])?.type === 'plane2', '飞机带对');
  ok(p([[4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [6, 0]])?.type === 'four2', '四带二');
  ok(p([[4, 0], [4, 1], [4, 2], [4, 3], [5, 0], [5, 1], [6, 0], [6, 1]])?.type === 'four2p', '四带两对');
  ok(p([[3, 0], [3, 1], [3, 2], [3, 3]])?.type === 'bomb', '炸弹');
  ok(p([[15, -1], [16, -1]])?.type === 'rocket', '王炸');
  ok(!p([[3, 0], [4, 0], [5, 0], [6, 0]]), '四张顺子非法');
  const bomb = p([[3, 0], [3, 1], [3, 2], [3, 3]]);
  const straight = p([[4, 0], [5, 0], [6, 0], [7, 0], [8, 0]]);
  ok(canBeat(bomb, straight), '炸弹压顺子');
  ok(!canBeat(straight, bomb), '顺子不能压炸弹');
  ok(canBeat(p([[16, -1], [15, -1]]), bomb), '王炸压炸弹');
  ok(!canBeat(p([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0]]), p([[4, 0], [5, 0], [6, 0], [7, 0], [8, 0]])), '小顺子压不过大顺子');
  const hand = cards([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 2], [9, 3], [16, -1]]);
  ok(findBeats(hand, p([[3, 0], [4, 0], [5, 0], [6, 0], [7, 0]])).length > 0, '找压牌');
  ok(chooseLead(hand)?.pattern, '领出建议');
}

console.log('· 前端牌型预判与服务器一致');
{
  // 线性同余随机，保证结果可复现
  let seed = 20260101;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const deck = [];
  let id = 0;
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ r, s, id: id++ });
  deck.push({ r: 15, s: -1, id: id++ }, { r: 16, s: -1, id: id++ });

  let mismatch = 0;
  let beatMismatch = 0;
  const sample = () => {
    const n = 1 + Math.floor(rand() * 12);
    const pool = deck.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  };
  for (let i = 0; i < 600; i++) {
    const a = sample();
    const b = sample();
    const pa = parsePlay(a);
    const pb = parseDdz(a);
    if (JSON.stringify(pa) !== JSON.stringify(pb)) mismatch++;
    if (canBeat(pa, parsePlay(b)) !== ddzCanBeat(pb, parseDdz(b))) beatMismatch++;
  }
  ok(mismatch === 0, `前端 parseDdz 与服务器 parsePlay 口径一致（${mismatch} 处不一致）`);
  ok(beatMismatch === 0, `前端 ddzCanBeat 与服务器 canBeat 口径一致（${beatMismatch} 处不一致）`);
}

console.log('· 炸金花牌型');
{
  ok(eval3(cards([[14, 0], [3, 1], [2, 2]])).cat === 3, 'A23 算顺子');
  ok(eval3(cards([[14, 0], [13, 0], [12, 0]])).cat === 5, '顺金');
  ok(eval3(cards([[14, 0], [14, 1], [14, 2]])).cat === 6, '豹子');
  ok(eval3(cards([[14, 0], [13, 0], [9, 0]])).cat === 4, '金花');
  ok(eval3(cards([[14, 0], [14, 1], [3, 2]])).cat === 2, '对子');
  ok(eval3(cards([[14, 0], [13, 0], [12, 0]])).cat > eval3(cards([[14, 0], [13, 0], [9, 0]])).cat, '顺金大于金花');
  ok(compare3(eval3(cards([[4, 0], [3, 1], [2, 2]])), eval3(cards([[3, 0], [4, 1], [5, 2]]))) < 0, 'A23 小于 345');
}

console.log('· 德州牌力');
{
  const royal = eval5(cards([[14, 0], [13, 0], [12, 0], [11, 0], [10, 0]]));
  ok(royal.cat === 8, '皇家同花顺');
  const wheel = eval5(cards([[14, 0], [2, 1], [3, 2], [4, 3], [5, 0]]));
  ok(wheel.cat === 4 && wheel.tie[0] === 5, 'A2345 轮子顺');
  const fh = eval5(cards([[9, 0], [9, 1], [9, 2], [4, 0], [4, 1]]));
  ok(fh.cat === 6, '葫芦');
  const quads = eval5(cards([[8, 0], [8, 1], [8, 2], [8, 3], [2, 0]]));
  ok(quads.cat === 7, '四条');
  const two = eval5(cards([[10, 0], [10, 1], [4, 0], [4, 1], [2, 0]]));
  ok(two.cat === 2, '两对');
  const best = bestHand(cards([[14, 0], [13, 0], [12, 0], [11, 0], [10, 0], [2, 1], [3, 2]]));
  ok(best.cat === 8, '7 选 5 同花顺');
  ok(compareEval(royal, wheel) > 0, '同花顺大于顺子');
}

console.log('· 边池');
{
  const pots = buildPots([
    { seat: 0, contrib: 100, folded: false },
    { seat: 1, contrib: 50, folded: false },
    { seat: 2, contrib: 100, folded: true }
  ]);
  ok(pots.reduce((s, p) => s + p.amount, 0) === 250, '边池总额');
  ok(pots.length === 2, '边池层数');
  ok(pots[0].eligible.join(',') === '0,1', '主池参与者');
  ok(pots[1].eligible.join(',') === '0', '边池参与者');
  const refund = [
    { seat: 0, contrib: 50, folded: false, chips: 0 },
    { seat: 1, contrib: 50, folded: false, chips: 0 },
    { seat: 2, contrib: 100, folded: true, chips: 0 }
  ];
  capFoldedContribs(refund);
  ok(refund[2].contrib === 50 && refund[2].chips === 50, '弃牌者超额投入退回');
}

console.log('· 筹码素材拆分');
{
  ok(chipStackHtml(0) === '', '0 筹码不生成图片');
  const h = chipStackHtml(30);
  ok(h.includes('chip-25') && h.includes('chip-5') && !h.includes('chip-100'), '30 拆成 25+5 两张筹码');
  const capped = chipStackHtml(2000, { max: 3 });
  ok((capped.match(/class="chip /g) || []).length === 3, '筹码堆最多显示指定张数');
}

console.log('· 斗地主本轮出牌记录');
{
  const e = new DouDizhu(
    Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
    {}
  );
  // 直接构造出牌阶段，方便断言“当前一轮”的记录
  e.phase = 'play';
  e.landlord = 0;
  e.turn = 0;
  e.base = 3;
  e.lastPlay = null;
  e.passes = 0;
  e.trick = [];
  e.trickOver = false;
  e.hands = [
    [{ r: 3, s: 0, id: 101 }, { r: 4, s: 0, id: 102 }, { r: 9, s: 0, id: 107 }],
    [{ r: 5, s: 0, id: 103 }, { r: 6, s: 0, id: 104 }],
    [{ r: 7, s: 0, id: 105 }, { r: 8, s: 0, id: 106 }]
  ];

  let v = e.view(0);
  ok(v.trick.length === 0 && !v.trickOver, '出牌阶段本轮为空');
  ok(e.act(0, { type: 'play', cards: [101] }).ok, 'P0 出单张');
  v = e.view(1);
  ok(v.trick.length === 1 && v.trick[0].seat === 0 && v.trick[0].type === 'play', '出牌进入本轮记录');
  ok(v.trick[0].pattern === 'single' && v.trick[0].cards.length === 1, '本轮记录牌型与牌');

  ok(e.act(1, { type: 'pass' }).ok && e.act(2, { type: 'pass' }).ok, '两家不出');
  v = e.view(2);
  ok(v.trickOver && v.trick.length === 3, '两家不出后标记本轮结束');
  ok(v.trick.filter((a) => a.type === 'pass').length === 2, '本轮保留两次不出');
  ok(v.trick.filter((a) => a.type === 'pass').every((a) => a.cards === undefined), '不出记录不携带牌');
  ok(v.turn === 0 && v.lastPlay === null, '牌权回到最后出牌者');

  ok(e.act(0, { type: 'play', cards: [102] }).ok, '新一轮先手出牌');
  v = e.view(1);
  ok(!v.trickOver && v.trick.length === 1 && v.trick[0].seat === 0, '新一轮重新开始记录');
}

console.log('· 斗地主 300 局');
{
  let stuck = 0;
  for (let g = 0; g < 300; g++) {
    const e = new DouDizhu(
      Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { roundNo: g + 1 }
    );
    let steps = 0;
    while (!e.isOver && steps++ < 2500) {
      const r = e.act(e.turn, e.botAction(e.turn));
      if (!r.ok) {
        console.error('   ddz action failed', r.error);
        stuck++;
        break;
      }
    }
    if (!e.isOver) stuck++;
    else {
      const sum = e.result.deltas.reduce((a, b) => a + b, 0);
      if (sum !== 0) {
        console.error('   ddz score not zero-sum', sum);
        stuck++;
      }
    }
  }
  ok(stuck === 0, `斗地主无死局（${stuck} 异常）`);
}

console.log('· 炸金花 300 局');
{
  let stuck = 0;
  for (let g = 0; g < 300; g++) {
    const n = 3 + (g % 4);
    const chips = Array.from({ length: n }, () => 2000);
    const e = new ZhaJinHua(
      Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { chips, ante: 10, roundNo: g + 1 }
    );
    let steps = 0;
    while (!e.isOver && steps++ < 600) {
      const a = e.botAction(e.turn);
      if (!a) {
        console.error('   zjh no action');
        stuck++;
        break;
      }
      const r = e.act(e.turn, a);
      if (!r.ok) {
        console.error('   zjh action failed', r.error);
        stuck++;
        break;
      }
    }
    if (!e.isOver) stuck++;
    else {
      const sum = e.result.deltas.reduce((a, b) => a + b, 0);
      if (sum !== 0) stuck++;
    }
  }
  ok(stuck === 0, `炸金花无死局（${stuck} 异常）`);
}

console.log('· 德州 300 局');
{
  let stuck = 0;
  for (let g = 0; g < 300; g++) {
    const n = 2 + (g % 7);
    const chips = Array.from({ length: n }, () => 2000);
    const e = new TexasHoldem(
      Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { chips, bigBlind: 20, roundNo: g + 1 }
    );
    let steps = 0;
    while (!e.isOver && steps++ < 3000) {
      const a = e.botAction(e.turn);
      if (!a) {
        console.error('   texas no action', e.turn, e.phase);
        stuck++;
        break;
      }
      const r = e.act(e.turn, a);
      if (!r.ok) {
        console.error('   texas action failed', r.error, a);
        stuck++;
        break;
      }
    }
    if (!e.isOver) stuck++;
    else {
      const sum = e.result.deltas.reduce((a, b) => a + b, 0);
      if (sum !== 0) stuck++;
    }
  }
  ok(stuck === 0, `德州无死局（${stuck} 异常）`);
}

console.log('· 德州短码/全下 200 局');
{
  let stuck = 0;
  for (let g = 0; g < 200; g++) {
    const n = 2 + (g % 7);
    const chips = Array.from({ length: n }, () => 30 + Math.floor(Math.random() * 420));
    const e = new TexasHoldem(
      Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { chips, bigBlind: 20, roundNo: g + 1 }
    );
    let steps = 0;
    while (!e.isOver && steps++ < 3000) {
      const a = e.botAction(e.turn);
      if (!a) {
        stuck++;
        break;
      }
      const r = e.act(e.turn, a);
      if (!r.ok) {
        console.error('   texas short action failed', r.error, a);
        stuck++;
        break;
      }
    }
    if (!e.isOver) stuck++;
  }
  ok(stuck === 0, `德州短码无死局（${stuck} 异常）`);
}

console.log('· 德州全下跟注');
{
  const e = new TexasHoldem(
    Array.from({ length: 3 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
    { chips: [1000, 1000, 1000], bigBlind: 20 }
  );
  e.phase = 'river';
  e.street = 'river';
  e.community = cards([[2, 0], [7, 1], [8, 2], [3, 3], [4, 0]]);
  e.deck = [];
  e.result = null;
  e.players[0].allin = true;
  e.players[0].chips = 0;
  e.players[0].bet = 100;
  e.players[0].contrib = 100;
  e.players[0].folded = false;
  e.players[0].hole = cards([[13, 0], [12, 1]]);
  e.players[1].allin = false;
  e.players[1].chips = 900;
  e.players[1].bet = 0;
  e.players[1].contrib = 0;
  e.players[1].folded = false;
  e.players[1].hole = cards([[9, 0], [9, 1]]);
  e.players[2].folded = true;
  e.players[2].chips = 980;
  e.players[2].bet = 0;
  e.players[2].contrib = 20;
  e.currentBet = 100;
  e.minRaise = 20;
  e.turn = 1;
  e.needsAction = new Set([1]);
  const ran = e.maybeRunout();
  ok(ran === false && e.phase === 'river' && e.turn === 1 && e.toCall(1) === 100, '全下后仍须由剩余玩家跟注');
  const r = e.act(1, { type: 'call' });
  ok(r.ok && e.isOver, '跟注后正常摊牌');
  ok(e.players.reduce((sum, p) => sum + p.chips, 0) === 2000, '全下跟注后筹码守恒');
  ok(e.players[1].chips === 1020, '跟注者赢下底池');
}

console.log('· 升级 100 局');
{
  let stuck = 0;
  for (let g = 0; g < 100; g++) {
    const e = new ShengJi(
      Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { banker: g % 4, teamLevels: [2 + (g % 3), 3 + (g % 2)], roundNo: g + 1 }
    );
    let steps = 0;
    while (!e.isOver && steps++ < 6000) {
      const seat = e.phase === 'declare' ? e.declareTurn : e.phase === 'bury' ? e.banker : e.turn;
      const a = e.botAction(seat);
      if (!a) {
        console.error('   shengji no action', e.phase);
        stuck++;
        break;
      }
      const r = e.act(seat, a);
      if (!r.ok) {
        console.error('   shengji action failed', r.error, a);
        stuck++;
        break;
      }
    }
    if (!e.isOver) stuck++;
    else {
      if (!(e.result.defPoints >= 0)) stuck++;
      if (!(e.result.next.banker >= 0 && e.result.next.banker < 4)) stuck++;
    }
  }
  ok(stuck === 0, `升级无死局（${stuck} 异常）`);
}

console.log('· 升级计分');
{
  const mk = () => {
    const e = new ShengJi(
      Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: '🙂' })),
      { banker: 0, teamLevels: [2, 2] }
    );
    e.hands = [[], [], [], []];
    e.bottom = [];
    e.bottomPoints = 0;
    return e;
  };
  const a = mk();
  a.defPoints = 0;
  a.finish(0);
  ok(a.result.winnerTeam === 0 && a.result.levelGain === 3, '闲家 0 分，庄家 +3');
  const b = mk();
  b.defPoints = 40;
  b.finish(0);
  ok(b.result.winnerTeam === 0 && b.result.levelGain === 1, '闲家 40 分，庄家 +1');
  const c = mk();
  c.defPoints = 80;
  c.finish(1);
  ok(c.result.winnerTeam === 1 && c.result.levelGain === 1 && c.result.next.banker === 1, '闲家 80 分下庄');
  const d = mk();
  d.defPoints = 200;
  d.finish(1);
  ok(d.result.winnerTeam === 1 && d.result.levelGain === 4, '闲家 200 分 +4');
}

console.log('');
console.log(fail === 0 ? `PASS · ${pass} 项断言全部通过` : `FAIL · ${fail} 项失败 / ${pass} 项通过`);
if (fail) process.exit(1);
