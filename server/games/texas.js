// 德州扑克：2~8 人无限注，盲注、四轮下注、全下、边池、摊牌
import { makeDeck, shuffle, bestHand, compareEval, buildPots, capFoldedContribs } from './cards.js';

const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class TexasHoldem {
  static id = 'texas';
  static name = '德州扑克';
  static minPlayers = 2;
  static maxPlayers = 8;
  static desc = '无限注德州，翻牌前到河牌四轮博弈，支持全下与边池';

  constructor(players, options = {}) {
    this.game = 'texas';
    this.players = players.map((p, seat) => ({
      ...p,
      seat,
      chips: Number(options.chips?.[seat] ?? options.chips ?? 2000),
      hole: [],
      folded: false,
      allin: false,
      bet: 0,
      contrib: 0,
      lastAction: ''
    }));
    this.bb = Math.max(2, Number(options.bigBlind) || 20);
    this.sb = Math.max(1, Number(options.smallBlind) || Math.floor(this.bb / 2));
    this.handNo = options.roundNo || 1;
    this.dealer = (this.handNo - 1) % this.players.length;
    this.community = [];
    this.deck = [];
    this.street = 'preflop';
    this.phase = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.turn = null;
    this.needsAction = new Set();
    this.result = null;
    this.actions = 0;
    this.maxActions = 500;
    this.logs = [];
    this.handId = Math.random().toString(36).slice(2);
    this.startHand();
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

  get pot() {
    return this.players.reduce((s, p) => s + p.contrib, 0);
  }

  active() {
    return this.players.filter((p) => !p.folded);
  }

  startHand() {
    const n = this.players.length;
    this.sbSeat = n === 2 ? this.dealer : (this.dealer + 1) % n;
    this.bbSeat = (this.sbSeat + 1) % n;
    this.deck = shuffle(makeDeck());
    for (const p of this.players) {
      p.hole = this.deck.splice(0, 2);
      p.folded = false;
      p.allin = false;
      p.bet = 0;
      p.contrib = 0;
      p.lastAction = '';
    }
    this.postBlind(this.sbSeat, this.sb, '小盲');
    this.postBlind(this.bbSeat, this.bb, '大盲');
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    this.street = 'preflop';
    this.phase = 'preflop';
    this.community = [];
    this.actions = 0;

    this.needsAction = new Set(
      this.players.filter((p) => !p.folded && !p.allin).map((p) => p.seat)
    );
    let first = n === 2 ? this.dealer : (this.bbSeat + 1) % n;
    this.turn = this.findNextNeeding(first);
    this.pushLog(`第 ${this.handNo} 局开始，盲注 ${this.sb}/${this.bb}，庄家 ${this.players[this.dealer].name}`);
    if (this.active().length <= 1) return this.awardUncontested('其他玩家已出局');
    this.maybeRunout();
  }

  postBlind(seat, amount, label) {
    const p = this.players[seat];
    const pay = Math.min(p.chips, amount);
    p.chips -= pay;
    p.bet += pay;
    p.contrib += pay;
    p.lastAction = label;
    if (p.chips <= 0) p.allin = true;
  }

  findNextNeeding(from) {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const seat = (from + i) % n;
      if (this.needsAction.has(seat)) return seat;
    }
    return null;
  }

  firstAfterDealer() {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const seat = (this.dealer + i) % n;
      const p = this.players[seat];
      if (!p.folded && !p.allin && p.chips > 0) return seat;
    }
    return null;
  }

  toCall(seat) {
    return Math.max(0, this.currentBet - this.players[seat].bet);
  }

  maybeRunout() {
    const active = this.active();
    if (active.length <= 1) {
      this.awardUncontested('其他玩家弃牌');
      return true;
    }
    const actors = active.filter((p) => !p.allin && p.chips > 0);
    if (actors.length === 0) {
      this.runoutAndShowdown();
      return true;
    }
    // 只剩一名有筹码的玩家时，如果他还没跟平当前注，必须先让他跟注/弃牌，
    // 不能直接摊牌——否则他会“免费”争夺底池。
    if (actors.length === 1) {
      const only = actors[0];
      if (only.bet >= this.currentBet) {
        this.runoutAndShowdown();
        return true;
      }
      this.needsAction.add(only.seat);
      this.turn = only.seat;
      return false;
    }
    return false;
  }

  act(seat, action) {
    if (this.phase === 'over') return { ok: false, error: '本局已结束' };
    const p = this.players[seat];
    if (!p || p.folded) return { ok: false, error: '你已弃牌' };
    if (seat !== this.turn) return { ok: false, error: '还没轮到你' };
    if (p.allin) return { ok: false, error: '你已全下' };
    this.actions++;
    if (this.actions > this.maxActions) {
      this.runoutAndShowdown();
      return { ok: true };
    }

    const call = this.toCall(seat);
    switch (action.type) {
      case 'fold': {
        p.folded = true;
        p.lastAction = '弃牌';
        this.needsAction.delete(seat);
        this.pushLog(`${p.name} 弃牌`);
        break;
      }
      case 'check': {
        if (call > 0) return { ok: false, error: `需要先跟注 ${call}` };
        p.lastAction = '过牌';
        this.needsAction.delete(seat);
        this.pushLog(`${p.name} 过牌`);
        break;
      }
      case 'call': {
        if (call <= 0) return { ok: false, error: '当前无需跟注，可以过牌' };
        const pay = Math.min(p.chips, call);
        p.chips -= pay;
        p.bet += pay;
        p.contrib += pay;
        if (p.chips <= 0) p.allin = true;
        p.lastAction = p.allin ? '全下' : `跟注 ${pay}`;
        this.needsAction.delete(seat);
        this.pushLog(`${p.name} 跟注 ${pay}${p.allin ? '（全下）' : ''}`);
        break;
      }
      case 'raise':
      case 'allin': {
        const maxTarget = p.bet + p.chips;
        let amount = action.type === 'allin' ? maxTarget : Math.floor(Number(action.amount));
        if (!Number.isFinite(amount)) return { ok: false, error: '下注金额不合法' };
        if (amount <= p.bet) return { ok: false, error: '下注必须高于当前投入' };
        if (amount > maxTarget) return { ok: false, error: '筹码不足' };
        const minTarget = this.currentBet === 0 ? this.bb : this.currentBet + this.minRaise;
        const isAllin = amount === maxTarget;
        if (amount < minTarget && !isAllin) {
          return { ok: false, error: `最少加注到 ${minTarget}` };
        }
        if (amount <= this.currentBet) {
          if (!isAllin) return { ok: false, error: '加注必须高于当前注' };
          // 全下但不足跟注
          const pay = amount - p.bet;
          p.chips -= pay;
          p.bet = amount;
          p.contrib += pay;
          p.allin = true;
          p.lastAction = '全下';
          this.needsAction.delete(seat);
          this.pushLog(`${p.name} 全下 ${pay}`);
          break;
        }
        const pay = amount - p.bet;
        p.chips -= pay;
        p.bet = amount;
        p.contrib += pay;
        if (p.chips <= 0) p.allin = true;
        const raiseSize = amount - this.currentBet;
        const fullRaise = raiseSize >= this.minRaise;
        this.currentBet = amount;
        if (fullRaise) {
          this.minRaise = raiseSize;
          this.needsAction = new Set(
            this.players.filter((x) => !x.folded && !x.allin && x.seat !== seat).map((x) => x.seat)
          );
        } else {
          this.needsAction.delete(seat);
          for (const x of this.players) {
            if (!x.folded && !x.allin && x.seat !== seat && x.bet < this.currentBet) this.needsAction.add(x.seat);
          }
        }
        p.lastAction = p.allin ? '全下' : `加注到 ${amount}`;
        this.pushLog(`${p.name} ${p.allin ? '全下' : '加注到'} ${amount}`);
        break;
      }
      default:
        return { ok: false, error: '未知操作' };
    }

    if (this.maybeRunout()) return { ok: true };
    const next = this.findNextNeeding((seat + 1) % this.players.length);
    if (next === null) {
      this.endStreet();
    } else {
      this.turn = next;
    }
    return { ok: true };
  }

  endStreet() {
    if (this.maybeRunout()) return;
    if (this.street === 'river') {
      this.showdown();
      return;
    }
    const idx = STREETS.indexOf(this.street);
    this.street = STREETS[idx + 1];
    this.phase = this.street;
    // 发公共牌
    if (this.street === 'flop') this.community.push(...this.deck.splice(0, 3));
    else this.community.push(...this.deck.splice(0, 1));
    this.currentBet = 0;
    this.minRaise = this.bb;
    for (const p of this.players) {
      p.bet = 0;
      p.lastAction = '';
    }
    const actors = this.players.filter((p) => !p.folded && !p.allin);
    this.needsAction = new Set(actors.map((p) => p.seat));
    if (actors.length <= 1) {
      this.runoutAndShowdown();
      return;
    }
    this.turn = this.firstAfterDealer();
    if (this.turn === null) {
      this.runoutAndShowdown();
      return;
    }
    const names = { flop: '翻牌', turn: '转牌', river: '河牌' };
    this.pushLog(`${names[this.street]}：${this.community.map((c) => '♠♥♣♦'[c.s] + ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r] || c.r)).join(' ')}`);
  }

  runoutAndShowdown() {
    while (this.community.length < 5) {
      const add = this.community.length === 0 ? 3 : 1;
      this.community.push(...this.deck.splice(0, add));
    }
    this.showdown();
  }

  awardUncontested(reason) {
    if (this.phase === 'over') return;
    capFoldedContribs(this.players);
    const alive = this.active();
    const winner = alive[0] || this.players[0];
    const total = this.pot;
    const deltas = this.players.map((p) => -p.contrib);
    winner.chips += total;
    deltas[winner.seat] += total;
    this.phase = 'over';
    this.street = 'over';
    this.turn = null;
    this.result = {
      reason,
      pot: total,
      winners: [{ seat: winner.seat, amount: total, handName: '无人跟注' }],
      board: this.community.slice(),
      hands: [],
      deltas,
      chips: this.players.map((p) => p.chips),
      showdown: false
    };
    this.pushLog(`${winner.name} 赢得底池 ${total}`);
  }

  showdown() {
    if (this.phase === 'over') return;
    capFoldedContribs(this.players);
    const alive = this.active().filter((p) => p.chips >= 0);
    const evals = new Map();
    for (const p of alive) {
      evals.set(p.seat, bestHand([...p.hole, ...this.community]));
    }
    const potList = buildPots(this.players.map((p) => ({ seat: p.seat, contrib: p.contrib, folded: p.folded })));
    const deltas = this.players.map((p) => -p.contrib);
    const winners = [];
    for (const pot of potList) {
      let best = null;
      for (const s of pot.eligible) {
        const ev = evals.get(s);
        if (!best || compareEval(ev, best.ev) > 0) best = { seat: s, ev };
      }
      if (!best) continue;
      const tied = pot.eligible.filter((s) => compareEval(evals.get(s), best.ev) === 0);
      const share = Math.floor(pot.amount / tied.length);
      let rem = pot.amount - share * tied.length;
      const ordered = tied.slice().sort((a, b) => ((a - this.dealer + this.players.length) % this.players.length) - ((b - this.dealer + this.players.length) % this.players.length));
      for (const s of ordered) {
        const amount = share + (rem-- > 0 ? 1 : 0);
        this.players[s].chips += amount;
        deltas[s] += amount;
        const cur = winners.find((w) => w.seat === s);
        if (cur) cur.amount += amount;
        else winners.push({ seat: s, amount, handName: best.ev.name });
      }
    }
    this.phase = 'over';
    this.street = 'over';
    this.turn = null;
    const hands = alive.map((p) => ({ seat: p.seat, hole: p.hole, eval: evals.get(p.seat) }));
    this.result = {
      reason: '摊牌',
      pot: this.pot,
      winners,
      board: this.community.slice(),
      hands,
      deltas,
      chips: this.players.map((p) => p.chips),
      showdown: true
    };
    this.pushLog(
      `摊牌：${hands.map((h) => `${this.players[h.seat].name} ${h.eval.name}`).join('，')}；${winners
        .map((w) => `${this.players[w.seat].name} 赢 ${w.amount}`)
        .join('，')}`
    );
  }

  autoAction(seat) {
    if (this.phase === 'over' || seat !== this.turn) return null;
    const call = this.toCall(seat);
    return call > 0 ? { type: 'fold' } : { type: 'check' };
  }

  botAction(seat) {
    if (this.phase === 'over' || seat !== this.turn) return null;
    const p = this.players[seat];
    const call = this.toCall(seat);
    let strength;
    if (this.community.length === 0) {
      const [a, b] = p.hole.slice().sort((x, y) => y.r - x.r);
      strength = (a.r + b.r) / 34;
      if (a.r === b.r) strength = 0.6 + a.r / 40;
      if (a.s === b.s) strength += 0.06;
      if (Math.abs(a.r - b.r) === 1) strength += 0.04;
      if (a.r >= 11 && b.r >= 11) strength += 0.08;
      strength = Math.max(0.16, Math.min(0.96, strength));
    } else {
      const ev = bestHand([...p.hole, ...this.community]);
      strength = [0.2, 0.45, 0.6, 0.72, 0.83, 0.88, 0.94, 0.98, 1][ev.cat];
      strength += (ev.tie[0] || 0) / 300;
    }
    const potOdds = call / Math.max(1, this.pot + call);
    const canRaise = p.chips > call + this.minRaise;
    const maxTarget = p.bet + p.chips;

    if (call === 0) {
      if (strength > 0.62 && canRaise && Math.random() < 0.55) {
        const size = Math.max(this.bb, Math.floor(this.pot * (strength > 0.85 ? 0.8 : 0.5)));
        const minTarget = this.currentBet === 0 ? this.bb : this.currentBet + this.minRaise;
        let amount = Math.min(maxTarget, Math.max(minTarget, this.currentBet + size));
        if (amount > this.currentBet && amount > p.bet) return { type: 'raise', amount };
      }
      return { type: 'check' };
    }

    if (call >= p.chips) {
      return strength > 0.5 ? { type: 'call' } : { type: 'fold' };
    }
    if (strength > 0.82 && canRaise && Math.random() < 0.5) {
      const size = Math.floor((this.pot + call) * 0.7);
      const minTarget = this.currentBet + this.minRaise;
      const amount = Math.min(maxTarget, Math.max(minTarget, this.currentBet + size));
      if (amount > this.currentBet && amount > p.bet) return { type: 'raise', amount };
    }
    if (strength > potOdds + 0.12 || (call < this.bb * 2 && strength > 0.35)) {
      return { type: 'call' };
    }
    if (Math.random() < 0.12 && strength > 0.3) return { type: 'call' };
    return { type: 'fold' };
  }

  view(seat) {
    const over = this.phase === 'over';
    const p = this.players[seat];
    return {
      game: this.game,
      phase: this.phase,
      street: this.street,
      mySeat: seat,
      turn: this.turn,
      dealer: this.dealer,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      sb: this.sb,
      bb: this.bb,
      community: this.community,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      myHole: p.hole,
      toCall: this.toCall(seat),
      canCheck: this.toCall(seat) === 0,
      minTarget: this.currentBet === 0 ? this.bb : this.currentBet + this.minRaise,
      maxTarget: p.bet + p.chips,
      players: this.players.map((x) => ({
        seat: x.seat,
        id: x.id,
        name: x.name,
        avatar: x.avatar,
        chips: x.chips,
        bet: x.bet,
        contrib: x.contrib,
        folded: x.folded,
        allin: x.allin,
        lastAction: x.lastAction,
        isDealer: x.seat === this.dealer,
        isSB: x.seat === this.sbSeat,
        isBB: x.seat === this.bbSeat,
        hole: over && !x.folded ? x.hole : x.seat === seat ? x.hole : null
      })),
      result: this.result,
      scores: this.players.map((x) => x.chips)
    };
  }

  get isOver() {
    return this.phase === 'over';
  }
}
