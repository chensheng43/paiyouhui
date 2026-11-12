// 炸金花：3~6 人，闷牌/看牌、跟注、加注、比牌、豹子/顺金/金花/顺子/对子/单张
import { makeDeck, shuffle, eval3, compare3, buildPots, capFoldedContribs } from './cards.js';

const HAND_NAMES = { 6: '豹子', 5: '顺金', 4: '金花', 3: '顺子', 2: '对子', 1: '单张' };

export class ZhaJinHua {
  static id = 'zhajinhua';
  static name = '炸金花';
  static minPlayers = 3;
  static maxPlayers = 6;
  static desc = '三张牌比大小，闷牌半价、看牌翻倍，敢不敢跟？';

  constructor(players, options = {}) {
    this.game = 'zhajinhua';
    this.players = players.map((p, seat) => ({
      ...p,
      seat,
      chips: Number(options.chips?.[seat] ?? options.chips ?? 1000),
      cards: [],
      folded: false,
      looked: false,
      allin: false,
      contrib: 0
    }));
    this.ante = Math.max(1, Number(options.ante) || 10);
    this.cap = Math.max(this.ante * 2, Number(options.cap) || this.ante * 20);
    this.handNo = options.roundNo || 1;
    this.dealer = (this.handNo - 1) % this.players.length;
    this.stake = this.ante;
    this.turn = (this.dealer + 1) % this.players.length;
    this.phase = 'bet';
    this.result = null;
    this.actions = 0;
    this.maxActions = 80;
    this.logs = [];
    this.startHand();
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

  startHand() {
    const deck = shuffle(makeDeck());
    for (const p of this.players) {
      p.cards = deck.splice(0, 3);
      p.folded = false;
      p.looked = false;
      p.allin = false;
      p.contrib = 0;
    }
    // 底注
    for (const p of this.players) {
      const pay = Math.min(p.chips, this.ante);
      p.chips -= pay;
      p.contrib += pay;
      if (p.chips <= 0) p.allin = true;
    }
    this.turn = this.nextActable(this.dealer);
    if (this.turn === null) {
      this.finish('全员无法下注');
      return;
    }
    this.pushLog(`第 ${this.handNo} 局开始，底注 ${this.ante}，${this.players[this.turn].name} 先行动`);
  }

  get pot() {
    return this.players.reduce((s, p) => s + p.contrib, 0);
  }

  active() {
    return this.players.filter((p) => !p.folded);
  }

  nextActable(from) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const seat = (from + i) % n;
      const p = this.players[seat];
      if (p && !p.folded && !p.allin && p.chips > 0) return seat;
    }
    return null;
  }

  mult(p) {
    return p.looked ? 2 : 1;
  }

  callCost(seat) {
    const p = this.players[seat];
    return Math.min(this.stake * this.mult(p), p.chips);
  }

  compareCost(seat) {
    const p = this.players[seat];
    return Math.min(this.stake * 2 * this.mult(p), p.chips);
  }

  pay(seat, amount) {
    const p = this.players[seat];
    const pay = Math.min(p.chips, Math.max(0, Math.floor(amount)));
    p.chips -= pay;
    p.contrib += pay;
    if (p.chips <= 0) p.allin = true;
    return pay;
  }

  checkShowdown() {
    const alive = this.active();
    if (alive.length <= 1) {
      this.finish('只剩一人');
      return true;
    }
    const canBet = alive.filter((p) => !p.allin && p.chips > 0);
    if (canBet.length <= 1) {
      this.finish('无人可继续下注');
      return true;
    }
    if (this.actions >= this.maxActions) {
      this.finish('达到最大行动数，开牌');
      return true;
    }
    return false;
  }

  advance() {
    if (this.checkShowdown()) return;
    const next = this.nextActable(this.turn);
    if (next === null) {
      this.finish('无人可行动');
      return;
    }
    this.turn = next;
  }

  act(seat, action) {
    if (this.phase === 'over') return { ok: false, error: '本局已结束' };
    const p = this.players[seat];
    if (!p) return { ok: false, error: '座位不存在' };
    if (p.folded) return { ok: false, error: '你已弃牌' };

    if (action.type === 'look') {
      if (p.looked) return { ok: false, error: '已经看过牌了' };
      p.looked = true;
      this.pushLog(`${p.name} 看牌`);
      return { ok: true };
    }

    if (seat !== this.turn) return { ok: false, error: '还没轮到你' };
    if (p.allin) return { ok: false, error: '你已全下' };

    this.actions++;
    switch (action.type) {
      case 'fold': {
        p.folded = true;
        this.pushLog(`${p.name} 弃牌`);
        this.advance();
        return { ok: true };
      }
      case 'call': {
        const cost = this.stake * this.mult(p);
        const paid = this.pay(seat, cost);
        this.pushLog(`${p.name} ${p.looked ? '看牌' : '闷牌'}跟注 ${paid}`);
        this.advance();
        return { ok: true };
      }
      case 'raise': {
        const amount = Math.floor(Number(action.amount));
        if (!Number.isFinite(amount)) return { ok: false, error: '加注金额不合法' };
        if (amount <= this.stake) return { ok: false, error: '加注必须高于当前注' };
        if (amount > this.cap) return { ok: false, error: `封顶 ${this.cap}` };
        const cost = amount * this.mult(p);
        if (cost > p.chips) return { ok: false, error: '筹码不足，只能跟注或弃牌' };
        this.pay(seat, cost);
        this.stake = amount;
        this.pushLog(`${p.name} 加注到 ${amount}（投入 ${cost}）`);
        this.advance();
        return { ok: true };
      }
      case 'compare': {
        const target = this.players[Number(action.target)];
        if (!target || target.seat === seat) return { ok: false, error: '比牌对象不合法' };
        if (target.folded) return { ok: false, error: '对方已弃牌' };
        const cost = this.stake * 2 * this.mult(p);
        if (cost > p.chips) return { ok: false, error: '筹码不足，无法比牌' };
        this.pay(seat, cost);
        const a = eval3(p.cards);
        const b = eval3(target.cards);
        const cmp = compare3(a, b);
        const challengerWins = cmp > 0; // 相同则主动比牌者输
        const loser = challengerWins ? target : p;
        const winner = challengerWins ? p : target;
        loser.folded = true;
        this.pushLog(
          `${p.name} 花 ${cost} 与 ${target.name} 比牌：${winner.name} 胜（${HAND_NAMES[challengerWins ? a.cat : b.cat]}）`
        );
        this.advance();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  finish(reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    capFoldedContribs(this.players);
    const alive = this.active();
    const totalPot = this.pot;
    const deltas = this.players.map((p) => -p.contrib);
    let winners = [];
    let showdown = false;
    let hands = null;

    if (alive.length === 1) {
      const w = alive[0];
      w.chips += totalPot;
      deltas[w.seat] += totalPot;
      winners = [{ seat: w.seat, amount: totalPot, name: '不战而胜' }];
      this.pushLog(`${w.name} 赢得全部底池 ${totalPot}`);
    } else {
      showdown = true;
      const evals = new Map(alive.map((p) => [p.seat, eval3(p.cards)]));
      const pots = buildPots(this.players.map((p) => ({ seat: p.seat, contrib: p.contrib, folded: p.folded })));
      for (const pot of pots) {
        let best = null;
        for (const s of pot.eligible) {
          const ev = evals.get(s);
          if (!best || compare3(ev, best.ev) > 0) best = { seat: s, ev };
        }
        if (!best) continue;
        const tied = pot.eligible.filter((s) => compare3(evals.get(s), best.ev) === 0);
        const share = Math.floor(pot.amount / tied.length);
        let rem = pot.amount - share * tied.length;
        for (const s of tied) {
          const amount = share + (rem-- > 0 ? 1 : 0);
          this.players[s].chips += amount;
          deltas[s] += amount;
          const cur = winners.find((w) => w.seat === s);
          if (cur) cur.amount += amount;
          else winners.push({ seat: s, amount, name: HAND_NAMES[best.ev.cat] });
        }
      }
      hands = alive.map((p) => ({ seat: p.seat, cards: p.cards, eval: evals.get(p.seat) }));
      this.pushLog(`开牌：${alive.map((p) => `${p.name} ${HAND_NAMES[evals.get(p.seat).cat]}`).join('，')}`);
    }

    this.result = {
      reason,
      pot: totalPot,
      winners,
      showdown,
      hands,
      deltas,
      chips: this.players.map((p) => p.chips),
      stake: this.stake
    };
    this.turn = null;
  }

  autoAction(seat) {
    if (this.phase !== 'bet') return null;
    if (this.turn === seat) return { type: 'fold' };
    return null;
  }

  botAction(seat) {
    if (this.phase !== 'bet') return null;
    const p = this.players[seat];
    if (!p.looked && Math.random() < 0.75) return { type: 'look' };
    if (this.turn !== seat) return null;

    const ev = eval3(p.cards);
    const call = this.stake * this.mult(p);
    const ratio = call / Math.max(1, p.chips);
    const strength = ev.cat + ev.tie[0] / 30;
    const opponents = this.active().filter((x) => x.seat !== seat).length;

    // 强牌：比牌或加注
    if (strength >= 5.4) {
      const targets = this.active().filter((x) => x.seat !== seat);
      if (targets.length && p.chips >= this.stake * 2 * this.mult(p) && (opponents <= 2 || Math.random() < 0.5)) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        return { type: 'compare', target: target.seat };
      }
      if (this.stake < this.cap && p.chips >= Math.min(this.cap, this.stake + this.ante) * this.mult(p)) {
        return { type: 'raise', amount: Math.min(this.cap, this.stake + this.ante) };
      }
    }
    if (strength >= 3.2) {
      if (strength >= 4.2 && this.stake < this.cap && Math.random() < 0.35) {
        const amount = Math.min(this.cap, this.stake + this.ante);
        if (p.chips >= amount * this.mult(p)) return { type: 'raise', amount };
      }
      return { type: 'call' };
    }
    if (strength >= 2.2 && ratio < 0.15) return { type: 'call' };
    if (ratio > 0.2) return { type: 'fold' };
    return Math.random() < 0.5 ? { type: 'call' } : { type: 'fold' };
  }

  view(seat) {
    const over = this.phase === 'over';
    const showAll = over;
    return {
      game: this.game,
      phase: this.phase,
      mySeat: seat,
      turn: this.turn,
      dealer: this.dealer,
      ante: this.ante,
      cap: this.cap,
      stake: this.stake,
      pot: this.pot,
      actionCount: this.actions,
      myCards: this.players[seat].looked || over ? this.players[seat].cards : null,
      myLooked: this.players[seat].looked,
      callCost: this.callCost(seat),
      compareCost: this.compareCost(seat),
      canCompare: this.players.filter((p) => !p.folded && p.seat !== seat).length > 0,
      players: this.players.map((p) => ({
        seat: p.seat,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        chips: p.chips,
        contrib: p.contrib,
        folded: p.folded,
        looked: p.looked,
        allin: p.allin,
        cards: showAll && !p.folded ? p.cards : null
      })),
      result: this.result,
      scores: this.players.map((p) => p.chips)
    };
  }

  get isOver() {
    return this.phase === 'over';
  }
}
