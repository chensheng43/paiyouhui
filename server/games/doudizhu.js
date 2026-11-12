// 斗地主：三人、叫分、标准牌型、炸弹/火箭、春天、累计计分
import { makeDeck, shuffle } from './cards.js';

const power = (c) => (c.r === 2 ? 15 : c.r >= 15 ? c.r + 1 : c.r);
const isJoker = (c) => c.r >= 15;
const cnt = (cards) => {
  const m = new Map();
  for (const c of cards) m.set(c.r, (m.get(c.r) || 0) + 1);
  return m;
};
const sortCards = (cards) => cards.slice().sort((a, b) => power(b) - power(a) || b.s - a.s);
const remove = (hand, cards) => {
  const ids = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
};
const powersOf = (cards) => cards.map(power).sort((a, b) => b - a);

function runWindows(counts, len, need = 1) {
  const out = [];
  for (let start = 3; start + len - 1 <= 14; start++) {
    let ok = true;
    for (let r = start; r < start + len; r++) if ((counts.get(r) || 0) < need) { ok = false; break; }
    if (ok) out.push({ start, end: start + len - 1 });
  }
  return out;
}

/** 解析一手牌，返回牌型；不合法返回 null */
export function parsePlay(cards) {
  const n = cards.length;
  if (!n) return null;
  const cs = cnt(cards);
  const entries = [...cs.entries()];
  const pw = powersOf(cards);
  const same = (k) => entries.length === 1 && entries[0][1] === k;

  // 火箭
  if (n === 2 && pw[0] === 17 && pw[1] === 16) return { type: 'rocket', len: 1, rank: 100, size: 2 };

  // 炸弹
  if (n === 4 && same(4)) return { type: 'bomb', len: 1, rank: power(cards[0]), size: 4 };

  if (n === 1) return { type: 'single', len: 1, rank: power(cards[0]), size: 1 };
  if (n === 2 && same(2)) return { type: 'pair', len: 1, rank: power(cards[0]), size: 2 };
  if (n === 3 && same(3)) return { type: 'trio', len: 1, rank: power(cards[0]), size: 3 };
  if (n === 4 && cs.size === 2 && [...cs.values()].includes(3)) {
    const trio = entries.find((e) => e[1] === 3)[0];
    return { type: 'trio1', len: 1, rank: power({ r: trio }), size: 4 };
  }
  if (n === 5 && cs.size === 2 && [...cs.values()].includes(3)) {
    const trio = entries.find((e) => e[1] === 3)[0];
    const two = entries.find((e) => e[1] === 2)[0];
    if (two !== undefined) return { type: 'trio2', len: 1, rank: power({ r: trio }), size: 5 };
  }

  // 顺子（不含 2 和王）
  if (n >= 5 && entries.length === n && entries.every((e) => e[0] <= 14)) {
    const rs = entries.map((e) => e[0]).sort((a, b) => a - b);
    if (rs[rs.length - 1] - rs[0] === n - 1) {
      return { type: 'straight', len: n, rank: rs[rs.length - 1], size: n };
    }
  }
  // 连对
  if (n >= 6 && n % 2 === 0 && entries.length === n / 2 && entries.every((e) => e[1] === 2 && e[0] <= 14)) {
    const rs = entries.map((e) => e[0]).sort((a, b) => a - b);
    if (rs[rs.length - 1] - rs[0] === rs.length - 1) {
      return { type: 'pairseq', len: rs.length, rank: rs[rs.length - 1], size: n };
    }
  }
  // 飞机（纯三顺）
  if (n >= 6 && n % 3 === 0 && entries.length === n / 3 && entries.every((e) => e[1] === 3 && e[0] <= 14)) {
    const rs = entries.map((e) => e[0]).sort((a, b) => a - b);
    if (rs[rs.length - 1] - rs[0] === rs.length - 1) {
      return { type: 'plane', len: rs.length, rank: rs[rs.length - 1], size: n };
    }
  }

  const counts = new Map(entries.map(([r, c]) => [r, c]));

  // 飞机带单
  if (n >= 8 && n % 4 === 0) {
    const k = n / 4;
    for (let start = 3; start + k - 1 <= 14; start++) {
      let ok = true;
      for (let r = start; r < start + k; r++) if ((counts.get(r) || 0) < 3) { ok = false; break; }
      if (!ok) continue;
      const used = new Set();
      for (let r = start; r < start + k; r++) used.add(r);
      let remain = 0;
      for (const [r, c] of counts) if (!used.has(r)) remain += c;
      if (remain !== k) continue;
      return { type: 'plane1', len: k, rank: start + k - 1, size: n };
    }
  }
  // 飞机带对
  if (n >= 10 && n % 5 === 0) {
    const k = n / 5;
    for (let start = 3; start + k - 1 <= 14; start++) {
      let ok = true;
      for (let r = start; r < start + k; r++) if ((counts.get(r) || 0) < 3) { ok = false; break; }
      if (!ok) continue;
      const used = new Set();
      for (let r = start; r < start + k; r++) used.add(r);
      let remain = 0;
      let pairs = 0;
      let bad = false;
      for (const [r, c] of counts) {
        if (used.has(r)) continue;
        remain += c;
        if (c % 2 !== 0) bad = true;
        pairs += c / 2;
      }
      if (bad || remain !== k * 2 || pairs !== k) continue;
      return { type: 'plane2', len: k, rank: start + k - 1, size: n };
    }
  }

  // 四带二 / 四带两对
  if (n === 6) {
    const quad = entries.find((e) => e[1] === 4);
    if (quad) return { type: 'four2', len: 1, rank: power({ r: quad[0] }), size: 6 };
  }
  if (n === 8) {
    const quad = entries.find((e) => e[1] === 4);
    if (quad) {
      const rest = entries.filter((e) => e[0] !== quad[0]);
      if (rest.length === 2 && rest.every((e) => e[1] === 2)) {
        return { type: 'four2p', len: 1, rank: power({ r: quad[0] }), size: 8 };
      }
    }
  }
  return null;
}

export function canBeat(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === 'rocket') return b.type !== 'rocket';
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb' && b.type !== 'bomb') return true;
  if (b.type === 'bomb' && a.type !== 'bomb') return false;
  if (a.type !== b.type || a.len !== b.len) return false;
  return a.rank > b.rank;
}

// ---------- 找出能压过 target 的出牌 ----------
function groups(hand) {
  const m = new Map();
  for (const c of hand) {
    if (!m.has(c.r)) m.set(c.r, []);
    m.get(c.r).push(c);
  }
  return m;
}

function pickLowest(hand, excludeIds, count) {
  const pool = hand.filter((c) => !excludeIds.has(c.id)).sort((a, b) => power(a) - power(b) || a.s - b.s);
  return pool.slice(0, count);
}

export function findBeats(hand, target) {
  if (!target) return [];
  const out = [];
  const g = groups(hand);
  const seen = new Set();
  const add = (cards) => {
    const p = parsePlay(cards);
    if (!p || !canBeat(p, target)) return;
    const key = cards.map((c) => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ cards, pattern: p });
  };

  const ranks = [...g.keys()].sort((a, b) => power({ r: a }) - power({ r: b }));

  if (target.type === 'single') {
    for (const r of ranks) if (power({ r }) > target.rank) add([g.get(r)[0]]);
  }
  if (target.type === 'pair') {
    for (const r of ranks) if (g.get(r).length >= 2 && power({ r }) > target.rank) add(g.get(r).slice(0, 2));
  }
  if (target.type === 'trio' || target.type === 'trio1' || target.type === 'trio2') {
    for (const r of ranks) {
      if (g.get(r).length < 3 || power({ r }) <= target.rank) continue;
      const trio = g.get(r).slice(0, 3);
      if (target.type === 'trio') add(trio);
      else if (target.type === 'trio1') {
        const ex = new Set(trio.map((c) => c.id));
        const kick = pickLowest(hand, ex, 1);
        if (kick.length === 1) add([...trio, ...kick]);
      } else {
        const ex = new Set(trio.map((c) => c.id));
        const pair = ranks
          .filter((rr) => rr !== r && g.get(rr).length >= 2)
          .sort((a, b) => power({ r: a }) - power({ r: b }))
          .map((rr) => g.get(rr).slice(0, 2).filter((c) => !ex.has(c.id)))
          .find((p) => p.length === 2);
        if (pair) add([...trio, ...pair]);
      }
    }
  }
  if (target.type === 'straight' || target.type === 'pairseq' || target.type === 'plane') {
    const need = target.type === 'straight' ? 1 : target.type === 'pairseq' ? 2 : 3;
    for (const w of runWindows(new Map([...g].map(([r, cs]) => [r, cs.length])), target.len, need)) {
      if (w.end <= target.rank) continue;
      const cards = [];
      for (let r = w.start; r <= w.end; r++) cards.push(...g.get(r).slice(0, need));
      add(cards);
    }
  }
  if (target.type === 'plane1' || target.type === 'plane2') {
    const k = target.len;
    const needPair = target.type === 'plane2';
    for (const w of runWindows(new Map([...g].map(([r, cs]) => [r, cs.length])), k, 3)) {
      if (w.end <= target.rank) continue;
      const used = new Set();
      const body = [];
      for (let r = w.start; r <= w.end; r++) {
        for (const c of g.get(r).slice(0, 3)) { body.push(c); used.add(c.id); }
      }
      if (!needPair) {
        const wings = pickLowest(hand, used, k);
        if (wings.length === k) add([...body, ...wings]);
      } else {
        const opts = [...g.entries()]
          .filter(([r, cs]) => !(r >= w.start && r <= w.end) && cs.length >= 2)
          .map(([r, cs]) => cs.slice(0, 2))
          .sort((a, b) => power(a[0]) - power(b[0]));
        if (opts.length >= k) add([...body, ...opts.slice(0, k).flat()]);
      }
    }
  }
  if (target.type === 'four2' || target.type === 'four2p') {
    for (const r of ranks) {
      if (g.get(r).length < 4 || power({ r }) <= target.rank) continue;
      const quad = g.get(r).slice(0, 4);
      const ex = new Set(quad.map((c) => c.id));
      if (target.type === 'four2') {
        const kick = pickLowest(hand, ex, 2);
        if (kick.length === 2) add([...quad, ...kick]);
      } else {
        const opts = ranks
          .filter((rr) => rr !== r && g.get(rr).length >= 2)
          .sort((a, b) => power({ r: a }) - power({ r: b }))
          .map((rr) => g.get(rr).slice(0, 2).filter((c) => !ex.has(c.id)))
          .filter((p) => p.length === 2);
        if (opts.length >= 2) add([...quad, ...opts.slice(0, 2).flat()]);
      }
    }
  }

  // 炸弹与火箭
  if (target.type !== 'rocket') {
    for (const r of ranks) {
      if (g.get(r).length >= 4) {
        if (target.type === 'bomb' && power({ r }) <= target.rank) continue;
        add(g.get(r).slice(0, 4));
      }
    }
    const sj = hand.find((c) => c.r === 15);
    const bj = hand.find((c) => c.r === 16);
    if (sj && bj) add([sj, bj]);
  }

  out.sort((a, b) => {
    const ab = a.pattern.type === 'bomb' || a.pattern.type === 'rocket';
    const bb = b.pattern.type === 'bomb' || b.pattern.type === 'rocket';
    if (ab !== bb) return ab ? 1 : -1;
    if (a.pattern.rank !== b.pattern.rank) return a.pattern.rank - b.pattern.rank;
    return a.cards.length - b.cards.length;
  });
  return out;
}

// 领出时选一手（优先长顺子/连对，其次低单/低对）
export function chooseLead(hand) {
  const all = [];
  const g = groups(hand);
  const counts = new Map([...g].map(([r, cs]) => [r, cs.length]));
  // 全部出完
  const whole = parsePlay(hand);
  if (whole) return { cards: hand, pattern: whole };

  // 顺子 / 连对 / 飞机
  for (const len of [5, 6, 7, 8, 9, 10, 11, 12]) {
    for (const w of runWindows(counts, len, 1)) {
      const cards = [];
      for (let r = w.start; r <= w.end; r++) cards.push(g.get(r)[0]);
      if (cards.length === hand.length) return { cards, pattern: parsePlay(cards) };
      all.push(cards);
    }
  }
  for (const len of [3, 4, 5, 6]) {
    for (const w of runWindows(counts, len, 2)) {
      const cards = [];
      for (let r = w.start; r <= w.end; r++) cards.push(...g.get(r).slice(0, 2));
      if (cards.length === hand.length) return { cards, pattern: parsePlay(cards) };
      all.push(cards);
    }
  }
  if (all.length) {
    const p = all.map((cards) => ({ cards, pattern: parsePlay(cards) })).filter((x) => x.pattern);
    p.sort((a, b) => a.pattern.rank - b.pattern.rank || b.cards.length - a.cards.length);
    return p[0];
  }

  // 三带一 / 三带二 / 三张
  const trios = [...g.entries()].filter(([, cs]) => cs.length >= 3).sort((a, b) => power({ r: a[0] }) - power({ r: b[0] }));
  if (trios.length) {
    const [r, cs] = trios[0];
    const trio = cs.slice(0, 3);
    const singles = hand.filter((c) => !trio.includes(c)).sort((a, b) => power(a) - power(b));
    const pair = [...g.entries()].filter(([rr, cc]) => rr !== r && cc.length >= 2).sort((a, b) => power({ r: a[0] }) - power({ r: b[0] }));
    if (pair.length && hand.length > 5) return { cards: [...trio, ...pair[0][1].slice(0, 2)], pattern: parsePlay([...trio, ...pair[0][1].slice(0, 2)]) };
    if (singles.length) return { cards: [...trio, singles[0]], pattern: parsePlay([...trio, singles[0]]) };
    return { cards: trio, pattern: parsePlay(trio) };
  }

  // 最低单张 / 对子（避开王炸）
  const sorted = hand.slice().sort((a, b) => power(a) - power(b) || a.s - b.s);
  const avoidJoker = sorted.filter((c) => !isJoker(c));
  const pick = (avoidJoker.length ? avoidJoker : sorted)[0];
  if (!pick) return null;
  const sameRank = g.get(pick.r);
  const cards = sameRank.length >= 2 && hand.length > 2 ? sameRank.slice(0, 2) : [pick];
  return { cards, pattern: parsePlay(cards) };
}

export class DouDizhu {
  static id = 'doudizhu';
  static name = '斗地主';
  static minPlayers = 3;
  static maxPlayers = 3;
  static desc = '三人经典玩法：叫分抢地主，炸弹翻倍，春天加倍';

  constructor(players, options = {}) {
    this.game = 'doudizhu';
    this.players = players.map((p, seat) => ({ ...p, seat }));
    this.options = options;
    this.logs = [];
    this.roundNo = options.roundNo || 1;
    this.scores = this.players.map(() => 0);
    this.phase = 'bid';
    this.turn = 0;
    this.result = null;
    this.hands = [[], [], []];
    this.bidTurn = 0;
    this.bids = [];
    this.highestBid = 0;
    this.highestSeat = null;
    this.landlord = null;
    this.bottom = [];
    this.multiplier = 1;
    this.base = 1;
    this.lastPlay = null;
    this.passes = 0;
    this.playCounts = [0, 0, 0];
    this.bombs = 0;
    this.history = [];
    // 当前一轮：本轮已发生的出牌/不出，用于牌桌展示；trickOver 表示两家不出、等待新一轮先手
    this.trick = [];
    this.trickOver = false;
    this.deal();
  }

  pushLog(text) {
    this.logs.push({ t: Date.now(), text });
    if (this.logs.length > 100) this.logs.splice(0, this.logs.length - 100);
  }

  drainLogs() {
    const l = this.logs;
    this.logs = [];
    return l;
  }

  deal() {
    const deck = shuffle(makeDeck({ jokers: true }));
    this.hands = [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)];
    this.bottom = deck.slice(51);
    this.hands = this.hands.map(sortCards);
    this.phase = 'bid';
    this.bidTurn = (this.roundNo - 1) % 3;
    this.turn = this.bidTurn;
    this.bids = [];
    this.highestBid = 0;
    this.highestSeat = null;
    this.landlord = null;
    this.lastPlay = null;
    this.passes = 0;
    this.multiplier = 1;
    this.base = 1;
    this.playCounts = [0, 0, 0];
    this.bombs = 0;
    this.trick = [];
    this.trickOver = false;
    this.history = [];
    this.pushLog(`${this.players[this.bidTurn].name} 开始叫地主`);
  }

  handOf(seat) {
    return this.hands[seat];
  }

  act(seat, action) {
    if (this.phase === 'over') return { ok: false, error: '本局已结束' };

    if (this.phase === 'bid') {
      if (seat !== this.bidTurn) return { ok: false, error: '还没轮到你叫分' };
      const value = Number(action.value);
      if (![0, 1, 2, 3].includes(value)) return { ok: false, error: '叫分不合法' };
      if (value !== 0 && value <= this.highestBid) return { ok: false, error: '叫分必须高于当前最高分' };
      this.bids.push({ seat, value });
      if (value > 0) {
        this.highestBid = value;
        this.highestSeat = seat;
        this.pushLog(`${this.players[seat].name} 叫 ${value} 分`);
      } else {
        this.pushLog(`${this.players[seat].name} 不叫`);
      }
      if (value === 3 || this.bids.length === 3) {
        this.settleBid();
      } else {
        this.bidTurn = (this.bidTurn + 1) % 3;
        this.turn = this.bidTurn;
      }
      return { ok: true };
    }

    if (this.phase !== 'play') return { ok: false, error: '当前不能操作' };
    if (seat !== this.turn) return { ok: false, error: '还没轮到你' };
    if (action.type === 'hint') {
      const target = this.lastPlay ? this.lastPlay.pattern : null;
      const suggestion = target ? findBeats(this.hands[seat], target)[0] : chooseLead(this.hands[seat]);
      return { ok: true, hint: suggestion ? suggestion.cards.map((c) => c.id) : [] };
    }

    if (action.type === 'pass') {
      if (!this.lastPlay) return { ok: false, error: '你是先手，必须出牌' };
      this.passes++;
      this.history.push({ seat, type: 'pass' });
      this.trick.push({ seat, type: 'pass' });
      this.pushLog(`${this.players[seat].name} 不出`);
      if (this.passes >= 2) {
        const leader = this.lastPlay.seat;
        this.lastPlay = null;
        this.passes = 0;
        this.turn = leader;
        this.trickOver = true;
        this.history.push({ type: 'newTrick', seat: leader });
        this.pushLog(`新一轮，${this.players[leader].name} 先出`);
      } else {
        this.turn = (this.turn + 1) % 3;
      }
      return { ok: true };
    }

    if (action.type === 'play') {
      const ids = Array.isArray(action.cards) ? action.cards : [];
      const hand = this.hands[seat];
      const byId = new Map(hand.map((c) => [c.id, c]));
      const cards = [];
      for (const id of ids) {
        const c = byId.get(Number(id));
        if (!c) return { ok: false, error: '你手里没有这张牌' };
        if (cards.includes(c)) return { ok: false, error: '不能重复选牌' };
        cards.push(c);
      }
      const pattern = parsePlay(cards);
      if (!pattern) return { ok: false, error: '牌型不合法' };
      if (this.lastPlay && !canBeat(pattern, this.lastPlay.pattern)) {
        return { ok: false, error: '这手牌压不过上家' };
      }
      this.hands[seat] = remove(hand, cards);
      this.playCounts[seat]++;
      const isBomb = pattern.type === 'bomb' || pattern.type === 'rocket';
      if (isBomb) {
        this.bombs++;
        this.multiplier *= 2;
        this.pushLog(`${this.players[seat].name} ${pattern.type === 'rocket' ? '王炸' : '炸弹'}！倍数 ×2`);
      }
      this.lastPlay = { seat, cards, pattern };
      this.passes = 0;
      // 上一轮结束后，先手的第一手牌开启新一轮
      if (this.trickOver) {
        this.trick = [];
        this.trickOver = false;
      }
      this.trick.push({ seat, type: 'play', cards, pattern: pattern.type, size: pattern.size });
      this.history.push({ seat, type: 'play', cards, pattern: pattern.type });
      this.pushLog(`${this.players[seat].name} 出 ${cards.map((c) => this.cardText(c)).join(' ')}`);

      if (this.hands[seat].length === 0) {
        this.finish(seat);
        return { ok: true };
      }
      this.turn = (this.turn + 1) % 3;
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  }

  cardText(c) {
    if (c.r === 15) return '小王';
    if (c.r === 16) return '大王';
    return '♠♥♣♦'[c.s] + ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || c.r);
  }

  settleBid() {
    if (!this.highestSeat && this.highestSeat !== 0) {
      this.pushLog('三家都不叫，重新发牌');
      this.deal();
      return;
    }
    this.landlord = this.highestSeat;
    this.base = this.highestBid;
    this.hands[this.landlord] = sortCards([...this.hands[this.landlord], ...this.bottom]);
    this.phase = 'play';
    this.turn = this.landlord;
    this.lastPlay = null;
    this.passes = 0;
    this.trick = [];
    this.trickOver = false;
    this.pushLog(`${this.players[this.landlord].name} 成为地主，底牌：${this.bottom.map((c) => this.cardText(c)).join(' ')}`);
  }

  finish(winner) {
    const landlordWin = winner === this.landlord;
    let spring = '';
    let springMult = 1;
    if (landlordWin && this.playCounts.filter((_, i) => i !== this.landlord).every((n) => n === 0)) {
      spring = '春天';
      springMult = 2;
    }
    if (!landlordWin && this.playCounts[this.landlord] === 1) {
      spring = '反春天';
      springMult = 2;
    }
    const unit = this.base * this.multiplier * springMult;
    const deltas = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      if (i === this.landlord) deltas[i] = landlordWin ? 2 * unit : -2 * unit;
      else deltas[i] = landlordWin ? -unit : unit;
      this.scores[i] += deltas[i];
    }
    this.phase = 'over';
    this.result = {
      winner,
      landlord: this.landlord,
      landlordWin,
      deltas,
      unit,
      base: this.base,
      multiplier: this.multiplier,
      spring,
      bombs: this.bombs,
      hands: this.hands.map((h) => h.slice())
    };
    this.pushLog(
      `${landlordWin ? '地主' : '农民'}获胜！${spring ? spring + '，' : ''}底分 ${this.base} × 倍数 ${this.multiplier}${springMult > 1 ? ' ×' + springMult : ''}`
    );
  }

  autoAction(seat) {
    if (this.phase === 'bid') return { type: 'bid', value: 0 };
    if (this.phase === 'play') {
      if (this.lastPlay) return { type: 'pass' };
      const lead = chooseLead(this.hands[seat]);
      return lead ? { type: 'play', cards: lead.cards.map((c) => c.id) } : { type: 'pass' };
    }
    return null;
  }

  botAction(seat) {
    if (this.phase === 'bid') {
      const hand = this.hands[seat];
      let strength = 0;
      for (const c of hand) {
        if (c.r === 16) strength += 5;
        else if (c.r === 15) strength += 4;
        else if (c.r === 2) strength += 2;
        else if (c.r === 14) strength += 1;
        else if (c.r === 13) strength += 0.5;
      }
      for (const [, cs] of groups(hand)) if (cs.length === 4) strength += 5;
      let want = strength >= 10 ? 3 : strength >= 7 ? 2 : strength >= 4 ? 1 : 0;
      if (want <= this.highestBid) want = 0;
      if (this.highestBid === 0 && want === 0 && Math.random() < 0.25) want = 1;
      return { type: 'bid', value: want };
    }
    if (this.phase !== 'play') return null;
    const hand = this.hands[seat];
    if (this.lastPlay) {
      const beats = findBeats(hand, this.lastPlay.pattern);
      if (!beats.length) return { type: 'pass' };
      const nonBomb = beats.filter((b) => b.pattern.type !== 'bomb' && b.pattern.type !== 'rocket');
      const oppMin = Math.min(...this.players.map((p, i) => (i === seat ? 99 : this.hands[i].length)));
      if (nonBomb.length) {
        // 队友剩一张时，尽量压
        return { type: 'play', cards: nonBomb[0].cards.map((c) => c.id) };
      }
      // 只剩炸弹：对手快走完才炸
      if (oppMin <= 2 || hand.length <= 5) {
        return { type: 'play', cards: beats[0].cards.map((c) => c.id) };
      }
      return { type: 'pass' };
    }
    const lead = chooseLead(hand);
    return lead ? { type: 'play', cards: lead.cards.map((c) => c.id) } : { type: 'pass' };
  }

  view(seat) {
    const over = this.phase === 'over';
    return {
      game: this.game,
      phase: this.phase,
      mySeat: seat,
      turn: this.turn,
      bidTurn: this.bidTurn,
      hand: this.hands[seat],
      counts: this.hands.map((h) => h.length),
      bottom: this.landlord !== null || over ? this.bottom : null,
      bids: this.bids,
      highestBid: this.highestBid,
      highestSeat: this.highestSeat,
      landlord: this.landlord,
      lastPlay: this.lastPlay
        ? { seat: this.lastPlay.seat, cards: this.lastPlay.cards, type: this.lastPlay.pattern.type, size: this.lastPlay.pattern.size }
        : null,
      // 本轮所有动作（含不出），让每个玩家都能在牌桌上看到本轮其他人出了什么
      trick: this.trick.map((a) =>
        a.type === 'pass'
          ? { seat: a.seat, type: 'pass' }
          : { seat: a.seat, type: 'play', cards: a.cards, pattern: a.pattern, size: a.size }
      ),
      trickOver: this.trickOver,
      passes: this.passes,
      multiplier: this.multiplier,
      base: this.base,
      scores: this.scores,
      playCounts: this.playCounts,
      result: this.result,
      players: this.players.map((p, i) => ({
        seat: i,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        count: this.hands[i].length,
        role: this.landlord === null ? null : i === this.landlord ? 'landlord' : 'farmer',
        revealed: over ? this.hands[i] : null
      }))
    };
  }

  get isOver() {
    return this.phase === 'over';
  }
}
