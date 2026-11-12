// 升级 / 拖拉机（四人两队，双副牌）
// 规则口径（简化版，README 有说明）：
// - 固定庄家；亮主决定主牌花色，单张级牌可亮，对子级牌可反主，双王可亮无主。
// - 庄家收 8 张底牌后扣 8 张；闲家赢最后一墩时底分 ×2。
// - 牌型支持单张、对子、拖拉机（连续对子）；不支持甩牌。
// - 跟牌：有花色必须跟花色；有同型牌必须出同型；无该花色可用主牌/其他牌垫。
import { makeDeck, shuffle } from './cards.js';

const isPoint = (r) => r === 5 || r === 10 || r === 13;
const pointOf = (r) => (r === 5 ? 5 : r === 10 || r === 13 ? 10 : 0);

export class ShengJi {
  static id = 'shengji';
  static name = '升级';
  static minPlayers = 4;
  static maxPlayers = 4;
  static desc = '四人两副牌，亮主、扣底、拖拉机，闲家抢 80 分';

  constructor(players, options = {}) {
    this.game = 'shengji';
    this.players = players.map((p, seat) => ({ ...p, seat }));
    this.teamLevels = Array.isArray(options.teamLevels) ? options.teamLevels.slice(0, 2) : [2, 2];
    this.banker = Number.isInteger(options.banker) ? options.banker % 4 : 0;
    this.level = this.teamLevels[this.banker % 2];
    this.handNo = options.roundNo || 1;
    this.logs = [];
    this.attempts = 0;
    this.phase = 'declare';
    this.trumpSuit = null; // 0..3 或 'NT'
    this.declaredBy = null;
    this.declareStrength = 0;
    this.declareTurn = this.banker;
    this.declareCount = 0;
    this.declarations = [];
    this.trick = [];
    this.lead = null;
    this.lastTrick = null;
    this.defPoints = 0;
    this.bottom = [];
    this.bottomPoints = 0;
    this.result = null;
    this.turn = this.banker;
    this.hands = [[], [], [], []];
    this.deal();
  }

  pushLog(text) {
    this.logs.push({ t: Date.now(), text });
    if (this.logs.length > 120) this.logs.splice(0, this.logs.length - 120);
  }

  drainLogs() {
    const l = this.logs;
    this.logs = [];
    return l;
  }

  deal() {
    const deck = shuffle(makeDeck({ jokers: true, decks: 2 }));
    this.hands = [deck.slice(0, 25), deck.slice(25, 50), deck.slice(50, 75), deck.slice(75, 100)];
    this.bottom = deck.slice(100, 108);
    this.phase = 'declare';
    this.trumpSuit = null;
    this.declaredBy = null;
    this.declareStrength = 0;
    this.declareTurn = this.banker;
    this.declareCount = 0;
    this.declarations = [];
    this.defPoints = 0;
    this.bottomPoints = 0;
    this.trick = [];
    this.lead = null;
    this.lastTrick = null;
    this.result = null;
    this.turn = this.banker;
    this.level = this.teamLevels[this.banker % 2];
    this.pushLog(`第 ${this.handNo} 局：打 ${this.rankName(this.level)}，庄家 ${this.players[this.banker].name}`);
  }

  rankName(r) {
    return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  }

  cardName(c) {
    if (c.r === 16) return '大王';
    if (c.r === 15) return '小王';
    return '♠♥♣♦'[c.s] + this.rankName(c.r);
  }

  isTrump(c) {
    if (c.r >= 15) return true;
    if (c.r === this.level) return true;
    if (this.trumpSuit === 'NT') return false;
    return c.s === this.trumpSuit;
  }

  trumpOrder(c) {
    if (c.r === 16) return 100;
    if (c.r === 15) return 99;
    if (c.r === this.level) return 90 + (this.trumpSuit === 'NT' ? 0 : c.s === this.trumpSuit ? 1 : 0);
    return c.r;
  }

  rankValue(c) {
    return this.isTrump(c) ? this.trumpOrder(c) : c.r;
  }

  seqRanks() {
    return Array.from({ length: 13 }, (_, i) => i + 2).filter((r) => r !== this.level);
  }

  pairKey(c) {
    return `${c.r}:${c.s}`;
  }

  /** 解析一手牌 */
  comboOf(cards) {
    const n = cards.length;
    if (!n) return null;
    const allTrump = cards.every((c) => this.isTrump(c));
    const anyTrump = cards.some((c) => this.isTrump(c));
    if (anyTrump && !allTrump) return null;
    const suit = allTrump ? 'T' : cards[0].s;
    if (n === 1) return { type: 'single', len: 1, suit, top: this.rankValue(cards[0]), cards, isTrump: allTrump };
    if (n === 2) {
      if (cards[0].r === cards[1].r && cards[0].s === cards[1].s) {
        return { type: 'pair', len: 1, suit, top: this.rankValue(cards[0]), cards, isTrump: allTrump };
      }
      return null;
    }
    if (n < 4 || n % 2 !== 0) return null;
    // 拖拉机：全部为对子且同花色，rank 在移除级牌后的序列中连续
    const groups = new Map();
    for (const c of cards) {
      const k = this.pairKey(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    if (groups.size !== n / 2) return null;
    for (const arr of groups.values()) if (arr.length !== 2) return null;
    const first = cards[0];
    if (!cards.every((c) => c.s === first.s)) return null;
    // 王和级牌不能组成拖拉机
    if (cards.some((c) => c.r >= 15 || c.r === this.level)) return null;
    if (allTrump && this.trumpSuit === 'NT') return null;
    const ranks = [...new Set(cards.map((c) => c.r))].sort((a, b) => a - b);
    const seq = this.seqRanks();
    for (let i = 1; i < ranks.length; i++) {
      if (seq.indexOf(ranks[i]) !== seq.indexOf(ranks[i - 1]) + 1) return null;
    }
    return { type: 'tractor', len: ranks.length, suit, top: this.rankValue(cards[0]), cards, isTrump: allTrump };
  }

  /** 手牌中跟 lead 同花色、同类型 len 的组合是否存在 */
  hasSameCombo(suitCards, type, len) {
    if (type === 'single') return suitCards.length >= 1;
    if (type === 'pair') {
      const m = new Map();
      for (const c of suitCards) m.set(this.pairKey(c), (m.get(this.pairKey(c)) || 0) + 1);
      return [...m.values()].some((v) => v >= 2);
    }
    if (type === 'tractor') {
      for (const c of suitCards) if (c.r >= 15 || c.r === this.level) continue;
      const bySuit = new Map();
      for (const c of suitCards) {
        if (c.r >= 15 || c.r === this.level) continue;
        if (!bySuit.has(c.s)) bySuit.set(c.s, new Map());
        const mm = bySuit.get(c.s);
        mm.set(c.r, (mm.get(c.r) || 0) + 1);
      }
      const seq = this.seqRanks();
      for (const mm of bySuit.values()) {
        let run = 0;
        for (const r of seq) {
          if ((mm.get(r) || 0) >= 2) {
            run++;
            if (run >= len) return true;
          } else run = 0;
        }
      }
      return false;
    }
    return false;
  }

  /** 找同花色的同型组合（给机器人/提示用，返回一手） */
  findSameCombos(suitCards, type, len) {
    if (type === 'single') return suitCards.slice(0, 1).map((c) => [c]);
    if (type === 'pair') {
      const m = new Map();
      for (const c of suitCards) {
        const k = this.pairKey(c);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(c);
      }
      return [...m.values()].filter((a) => a.length >= 2).map((a) => a.slice(0, 2)).sort((a, b) => this.rankValue(a[0]) - this.rankValue(b[0]));
    }
    const out = [];
    const bySuit = new Map();
    for (const c of suitCards) {
      if (c.r >= 15 || c.r === this.level) continue;
      if (!bySuit.has(c.s)) bySuit.set(c.s, new Map());
      const mm = bySuit.get(c.s);
      if (!mm.has(c.r)) mm.set(c.r, []);
      mm.get(c.r).push(c);
    }
    const seq = this.seqRanks();
    for (const [s, mm] of bySuit) {
      for (let i = 0; i + len <= seq.length; i++) {
        let ok = true;
        for (let j = 0; j < len; j++) {
          if ((mm.get(seq[i + j]) || []).length < 2) { ok = false; break; }
        }
        if (ok) {
          const cards = [];
          for (let j = 0; j < len; j++) cards.push(...mm.get(seq[i + j]).slice(0, 2));
          out.push(cards);
        }
      }
    }
    out.sort((a, b) => this.rankValue(a[0]) - this.rankValue(b[0]));
    return out;
  }

  /** 跟牌合法性检查 */
  validateFollow(hand, cards, lead) {
    const need = lead.cards.length;
    if (cards.length !== need) return '出牌数量不对';
    const handIds = new Set(hand.map((c) => c.id));
    if (new Set(cards.map((c) => c.id)).size !== cards.length) return '不能重复出牌';
    for (const c of cards) if (!handIds.has(c.id)) return '你手里没有这张牌';

    const inSuit = hand.filter((c) => (lead.suit === 'T' ? this.isTrump(c) : !this.isTrump(c) && c.s === lead.suit));
    const chosenInSuit = cards.filter((c) => (lead.suit === 'T' ? this.isTrump(c) : !this.isTrump(c) && c.s === lead.suit));
    if (inSuit.length >= need) {
      if (chosenInSuit.length !== need) return lead.suit === 'T' ? '必须先跟主牌' : '必须先跟同花色';
      if (lead.type !== 'single' && this.hasSameCombo(inSuit, lead.type, lead.len)) {
        const combo = this.comboOf(cards);
        if (!combo || combo.type !== lead.type || combo.len !== lead.len) {
          return lead.type === 'pair' ? '你有该花色的对子，必须出对子' : '你有该花色的拖拉机，必须出拖拉机';
        }
      }
      return null;
    }
    if (chosenInSuit.length !== inSuit.length) {
      return lead.suit === 'T' ? '主牌不够时必须全部跟出' : '该花色不够时必须全部跟出';
    }
    return null;
  }

  act(seat, action) {
    if (this.phase === 'over') return { ok: false, error: '本局已结束' };
    const hand = this.hands[seat];

    if (this.phase === 'declare') {
      if (seat !== this.declareTurn) return { ok: false, error: '还没轮到你亮主' };
      if (action.type === 'declare') {
        const suit = action.suit;
        if (![0, 1, 2, 3].includes(suit)) return { ok: false, error: '花色不合法' };
        const levelCards = hand.filter((c) => c.r === this.level && c.s === suit);
        let strength = 0;
        if (this.trumpSuit === null) {
          if (levelCards.length < 1) return { ok: false, error: '你没有这门花色的级牌，不能亮主' };
          strength = 1;
        } else {
          if (this.trumpSuit === 'NT') return { ok: false, error: '无主不可再反' };
          if (this.trumpSuit === suit) return { ok: false, error: '已经是这门主了' };
          if (this.declareStrength >= 2) return { ok: false, error: '已被对子级牌定主，不能再反' };
          if (levelCards.length < 2) return { ok: false, error: '反主需要一对该花色的级牌' };
          strength = 2;
        }
        this.trumpSuit = suit;
        this.declaredBy = seat;
        this.declareStrength = strength;
        this.declarations.push({ seat, suit, type: 'suit' });
        this.pushLog(`${this.players[seat].name} 亮主 ${'♠♥♣♦'[suit]}${strength === 2 ? '（对子反主）' : ''}`);
      } else if (action.type === 'nt') {
        const jokers = hand.filter((c) => c.r >= 15).length;
        if (jokers < 2) return { ok: false, error: '亮无主需要至少两张王' };
        if (this.trumpSuit === 'NT') return { ok: false, error: '已经是无主了' };
        if (this.declareStrength >= 2) return { ok: false, error: '已被对子级牌定主，不能再反' };
        this.trumpSuit = 'NT';
        this.declaredBy = seat;
        this.declareStrength = 3;
        this.declarations.push({ seat, suit: 'NT', type: 'nt' });
        this.pushLog(`${this.players[seat].name} 亮无主`);
      } else if (action.type === 'pass') {
        this.declarations.push({ seat, suit: null, type: 'pass' });
        this.pushLog(`${this.players[seat].name} 不亮`);
      } else {
        return { ok: false, error: '未知操作' };
      }
      this.declareCount++;
      if (this.declareCount >= 4) {
        if (this.trumpSuit === null) {
          this.attempts++;
          if (this.attempts >= 6) {
            // 极端情况兜底：任选一门有级牌的花色
            let found = null;
            for (const h of this.hands) for (const c of h) if (c.r === this.level) found = found ?? c.s;
            this.trumpSuit = found ?? 0;
            this.pushLog(`无人亮主，默认 ${'♠♥♣♦'[this.trumpSuit]} 为主`);
            this.startBury();
          } else {
            this.pushLog('四人都不亮，重新发牌');
            this.deal();
          }
        } else {
          this.startBury();
        }
      } else {
        this.declareTurn = (this.declareTurn + 1) % 4;
        this.turn = this.declareTurn;
      }
      return { ok: true };
    }

    if (this.phase === 'bury') {
      if (seat !== this.banker) return { ok: false, error: '只有庄家可以扣底' };
      const ids = new Set((action.cards || []).map(Number));
      const cards = hand.filter((c) => ids.has(c.id));
      if (cards.length !== 8 || ids.size !== 8) return { ok: false, error: '必须扣 8 张牌' };
      this.hands[seat] = hand.filter((c) => !ids.has(c.id));
      this.bottom = cards;
      this.bottomPoints = cards.reduce((s, c) => s + pointOf(c.r), 0);
      this.phase = 'play';
      this.turn = this.banker;
      this.lead = null;
      this.trick = [];
      this.pushLog(`${this.players[seat].name} 扣底完成，${this.players[seat].name} 先出`);
      return { ok: true };
    }

    if (this.phase !== 'play') return { ok: false, error: '当前不能操作' };
    if (seat !== this.turn) return { ok: false, error: '还没轮到你' };

    if (action.type === 'hint') {
      const play = this.botPlay(seat);
      return { ok: true, hint: play ? play.map((c) => c.id) : [] };
    }
    if (action.type !== 'play') return { ok: false, error: '请出牌' };
    const ids = (action.cards || []).map(Number);
    const byId = new Map(hand.map((c) => [c.id, c]));
    const cards = [];
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) return { ok: false, error: '你手里没有这张牌' };
      if (cards.includes(c)) return { ok: false, error: '不能重复选牌' };
      cards.push(c);
    }
    if (!cards.length) return { ok: false, error: '请选择要出的牌' };

    const combo = this.comboOf(cards);
    if (!this.lead && !combo) return { ok: false, error: '先手必须出合法牌型（单张/对子/拖拉机）' };
    if (this.lead) {
      const err = this.validateFollow(hand, cards, this.lead);
      if (err) return { ok: false, error: err };
      // 跟牌时如果凑不出同型牌，允许垫牌（combo 为 null，不能赢墩）
    }

    this.hands[seat] = hand.filter((c) => !ids.includes(c.id));
    this.trick.push({ seat, cards, combo });
    if (!this.lead) {
      this.lead = { seat, cards, combo };
    }
    if (this.trick.length < 4) {
      this.turn = (this.turn + 1) % 4;
      return { ok: true };
    }
    this.resolveTrick();
    return { ok: true };
  }

  resolveTrick() {
    const lead = this.lead;
    let winner = lead.seat;
    let bestCombo = lead.combo;
    for (let i = 1; i < this.trick.length; i++) {
      const t = this.trick[i];
      if (!t.combo) continue;
      if (t.combo.type !== lead.combo.type || t.combo.len !== lead.combo.len) continue;
      if (this.beats(t.combo, bestCombo, lead.combo)) {
        winner = t.seat;
        bestCombo = t.combo;
      }
    }
    const pts = this.trick.reduce((s, t) => s + t.cards.reduce((x, c) => x + pointOf(c.r), 0), 0);
    const bankerTeam = this.banker % 2;
    const winnerTeam = winner % 2;
    if (pts > 0 && winnerTeam !== bankerTeam) this.defPoints += pts;
    this.lastTrick = {
      winner,
      points: pts,
      cards: this.trick.map((t) => ({ seat: t.seat, cards: t.cards })),
      type: lead.combo.type,
      len: lead.combo.len
    };
    this.pushLog(
      `${this.players[winner].name} 赢得一墩${pts ? `（${pts} 分）` : ''}${pts && winnerTeam !== bankerTeam ? '，闲家得分' : ''}`
    );
    this.trick = [];
    this.lead = null;
    this.turn = winner;
    if (this.hands.every((h) => h.length === 0)) this.finish(winner);
  }

  beats(a, b, leadCombo) {
    if (!a || !b) return false;
    if (a.isTrump && !b.isTrump) return true;
    if (!a.isTrump && b.isTrump) return false;
    if (a.isTrump && b.isTrump) {
      if (a.top !== b.top) return a.top > b.top;
      return false;
    }
    if (a.suit !== leadCombo.suit || b.suit !== leadCombo.suit) return false;
    return a.top > b.top;
  }

  startBury() {
    this.phase = 'bury';
    this.turn = this.banker;
    this.hands[this.banker] = [...this.hands[this.banker], ...this.bottom];
    this.pushLog(
      `${this.players[this.banker].name} 收底牌，主牌：${this.trumpSuit === 'NT' ? '无主' : '♠♥♣♦'[this.trumpSuit]}`
    );
  }

  finish(lastWinner) {
    const bankerTeam = this.banker % 2;
    const defTeam = 1 - bankerTeam;
    let bottomBonus = 0;
    if (lastWinner % 2 === defTeam) {
      bottomBonus = this.bottomPoints * 2;
      this.defPoints += bottomBonus;
    }
    let winnerTeam;
    let levelGain;
    let nextBanker;
    if (this.defPoints >= 80) {
      winnerTeam = defTeam;
      levelGain = Math.max(1, Math.min(4, Math.floor(this.defPoints / 40) - 1));
      nextBanker = (this.banker + 1) % 4;
    } else {
      winnerTeam = bankerTeam;
      levelGain = this.defPoints === 0 ? 3 : this.defPoints < 40 ? 2 : 1;
      nextBanker = this.banker;
    }
    const levels = this.teamLevels.slice();
    levels[winnerTeam] += levelGain;
    const matchOver = levels[winnerTeam] > 14;
    const next = matchOver
      ? { banker: 0, teamLevels: [2, 2], level: 2 }
      : {
          banker: nextBanker,
          teamLevels: levels.map((l) => Math.min(l, 15)),
          level: Math.min(levels[nextBanker % 2], 15)
        };
    this.phase = 'over';
    this.turn = null;
    this.result = {
      lastWinner,
      banker: this.banker,
      bankerTeam,
      defPoints: this.defPoints,
      bottomPoints: this.bottomPoints,
      bottomBonus,
      winnerTeam,
      levelGain,
      levels,
      matchOver,
      next,
      trumpSuit: this.trumpSuit,
      level: this.level,
      bottom: this.bottom,
      hands: this.hands.map((h) => h.slice()),
      teamNames: ['南北', '东西']
    };
    this.pushLog(
      `本局结束：闲家 ${this.defPoints} 分，${winnerTeam === bankerTeam ? '庄家' : '闲家'}方升 ${levelGain} 级`
    );
  }

  botAction(seat) {
    if (this.phase === 'declare') {
      const hand = this.hands[seat];
      const levelCards = hand.filter((c) => c.r === this.level);
      const jokers = hand.filter((c) => c.r >= 15).length;
      if (this.trumpSuit === null) {
        if (levelCards.length) {
          let bestSuit = levelCards[0].s;
          let bestCount = -1;
          for (const s of new Set(levelCards.map((c) => c.s))) {
            const count = hand.filter((c) => c.s === s).length;
            if (count > bestCount) { bestCount = count; bestSuit = s; }
          }
          return { type: 'declare', suit: bestSuit };
        }
        if (jokers >= 2) return { type: 'nt' };
      } else if (this.trumpSuit !== 'NT' && this.declareStrength < 2) {
        for (let s = 0; s < 4; s++) {
          if (s !== this.trumpSuit && levelCards.filter((c) => c.s === s).length >= 2) {
            return { type: 'declare', suit: s };
          }
        }
        if (jokers >= 2) return { type: 'nt' };
      }
      return { type: 'pass' };
    }
    if (this.phase === 'bury') {
      const hand = this.hands[seat];
      const sorted = hand.slice().sort((a, b) => this.rankValue(a) - this.rankValue(b));
      return { type: 'bury', cards: sorted.slice(0, 8).map((c) => c.id) };
    }
    if (this.phase !== 'play') return null;
    const cards = this.botPlay(seat);
    return cards ? { type: 'play', cards: cards.map((c) => c.id) } : null;
  }

  autoAction(seat) {
    if (this.phase === 'declare') return { type: 'pass' };
    if (this.phase === 'bury') {
      const hand = this.hands[seat];
      const sorted = hand.slice().sort((a, b) => this.rankValue(a) - this.rankValue(b));
      return { type: 'bury', cards: sorted.slice(0, 8).map((c) => c.id) };
    }
    if (this.phase === 'play') {
      const cards = this.botPlay(seat);
      return cards ? { type: 'play', cards: cards.map((c) => c.id) } : null;
    }
    return null;
  }

  botPlay(seat) {
    const hand = this.hands[seat];
    if (!hand.length) return null;
    const sorted = hand.slice().sort((a, b) => this.rankValue(a) - this.rankValue(b));
    const lowNonTrump = sorted.filter((c) => !this.isTrump(c));
    const lowest = (arr, n) => arr.slice(0, n);

    if (!this.lead) {
      // 先出：优先低副牌单张，其次低对子，最后主牌
      const nonPoint = lowNonTrump.filter((c) => !isPoint(c.r));
      const pool = nonPoint.length ? nonPoint : lowNonTrump.length ? lowNonTrump : sorted;
      // 有低对子且不是分牌时出对子
      const pairMap = new Map();
      for (const c of pool) {
        const k = this.pairKey(c);
        if (!pairMap.has(k)) pairMap.set(k, []);
        pairMap.get(k).push(c);
      }
      const pairs = [...pairMap.values()].filter((a) => a.length >= 2).sort((a, b) => this.rankValue(a[0]) - this.rankValue(b[0]));
      if (pairs.length && this.rankValue(pairs[0][0]) <= 10) {
        const p = pairs[0].slice(0, 2);
        const combo = this.comboOf(p);
        if (combo) return p;
      }
      return [pool[0]];
    }

    const lead = this.lead;
    const need = lead.cards.length;
    const inSuit = hand.filter((c) => (lead.suit === 'T' ? this.isTrump(c) : !this.isTrump(c) && c.s === lead.suit));
    if (inSuit.length >= need) {
      if (lead.type !== 'single') {
        const combos = this.findSameCombos(inSuit, lead.type, lead.len);
        if (combos.length) {
          // 如果能压过当前最大牌且这墩有分，就出能赢的最小组合；否则出最小的
          for (const combo of combos) {
            if (this.comboBeatsCurrent(combo, lead)) return combo;
          }
          return combos[0];
        }
      }
      return lowest(inSuit, need);
    }
    // 该花色不够：先出光该花色，再垫副牌低分
    const fillCount = need - inSuit.length;
    const used = new Set(inSuit.map((c) => c.id));
    const fillPool = hand
      .filter((c) => !used.has(c.id) && !isPoint(c.r))
      .sort((a, b) => this.rankValue(a) - this.rankValue(b));
    const fill = fillPool.slice(0, fillCount);
    let result = [...inSuit, ...fill];
    if (result.length < need) {
      const rest = hand.filter((c) => !result.some((x) => x.id === c.id)).sort((a, b) => this.rankValue(a) - this.rankValue(b));
      result = result.concat(rest.slice(0, need - result.length));
    }
    return result;
  }

  comboBeatsCurrent(cards, lead) {
    const combo = this.comboOf(cards);
    if (!combo || !this.trick.length) return false;
    let best = lead.combo;
    for (const t of this.trick) {
      if (t.combo && t.combo.type === lead.combo.type && this.beats(t.combo, best, lead.combo)) best = t.combo;
    }
    return this.beats(combo, best, lead.combo);
  }

  view(seat) {
    const over = this.phase === 'over';
    const hand = this.hands[seat];
    const myTurn = this.turn === seat && this.phase !== 'over';
    const levelCards = hand.filter((c) => c.r === this.level);
    const suits = [];
    const pairs = [];
    if (this.phase === 'declare') {
      for (let s = 0; s < 4; s++) {
        const count = levelCards.filter((c) => c.s === s).length;
        if (count >= 1) suits.push(s);
        if (count >= 2) pairs.push(s);
      }
    }
    const canNT = hand.filter((c) => c.r >= 15).length >= 2;
    const canDeclare = this.trumpSuit === null && (suits.length > 0 || canNT);
    const canCounter =
      this.trumpSuit !== null &&
      this.trumpSuit !== 'NT' &&
      this.declareStrength < 2 &&
      (pairs.length > 0 || canNT);
    return {
      game: this.game,
      phase: this.phase,
      mySeat: seat,
      turn: this.turn,
      myTurn,
      hand,
      counts: this.hands.map((h) => h.length),
      banker: this.banker,
      level: this.level,
      teamLevels: this.teamLevels,
      trumpSuit: this.trumpSuit,
      declaredBy: this.declaredBy,
      declareStrength: this.declareStrength,
      declareTurn: this.declareTurn,
      declarations: this.declarations,
      myLevelSuits: suits,
      myLevelPairs: pairs,
      canDeclare,
      canCounter,
      canNT,
      bottomCount: this.bottom.length,
      bottom: over || (this.phase === 'bury' && seat === this.banker) ? this.bottom : null,
      trick: this.trick.map((t) => ({ seat: t.seat, cards: t.cards, type: t.combo?.type || null })),
      lead: this.lead ? { seat: this.lead.seat, cards: this.lead.cards, type: this.lead.combo.type, len: this.lead.combo.len } : null,
      lastTrick: this.lastTrick,
      defPoints: this.defPoints,
      bottomPoints: over ? this.bottomPoints : null,
      result: this.result,
      players: this.players.map((p, i) => ({
        seat: i,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        count: this.hands[i].length,
        team: i % 2,
        isBanker: i === this.banker,
        revealed: over ? this.hands[i] : null
      }))
    };
  }

  get isOver() {
    return this.phase === 'over';
  }
}
