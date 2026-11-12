// 牌、洗牌、牌力评估、边池工具
import { randomInt } from 'node:crypto';

export const SUITS = ['♠', '♥', '♣', '♦'];
export const SUIT_NAMES = ['黑桃', '红桃', '梅花', '方块'];
export const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '小王', 16: '大王'
};

export function makeDeck({ jokers = false, decks = 1 } = {}) {
  const cards = [];
  let id = 0;
  for (let d = 0; d < decks; d++) {
    for (let s = 0; s < 4; s++) {
      for (let r = 2; r <= 14; r++) {
        cards.push({ r, s, id: id++ });
      }
    }
    if (jokers) {
      cards.push({ r: 15, s: -1, id: id++ });
      cards.push({ r: 16, s: -1, id: id++ });
    }
  }
  return cards;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardName(c) {
  if (c.s < 0) return RANK_NAMES[c.r];
  return SUITS[c.s] + RANK_NAMES[c.r];
}

export function sortDesc(cards) {
  return cards.slice().sort((a, b) => b.r - a.r || b.s - a.s);
}

// ---------- 德州扑克 5 张牌评估 ----------
export function eval5(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const counts = new Map();
  for (const r of rs) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }
  if (flush && straightHigh) return { cat: 8, tie: [straightHigh], name: '同花顺' };
  if (groups[0][1] === 4) return { cat: 7, tie: [groups[0][0], groups[1][0]], name: '四条' };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { cat: 6, tie: [groups[0][0], groups[1][0]], name: '葫芦' };
  if (flush) return { cat: 5, tie: rs, name: '同花' };
  if (straightHigh) return { cat: 4, tie: [straightHigh], name: '顺子' };
  if (groups[0][1] === 3) {
    const kick = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: 3, tie: [groups[0][0], ...kick], name: '三条' };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return { cat: 2, tie: [groups[0][0], groups[1][0], groups[2][0]], name: '两对' };
  }
  if (groups[0][1] === 2) {
    const kick = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: 1, tie: [groups[0][0], ...kick], name: '一对' };
  }
  return { cat: 0, tie: rs, name: '高牌' };
}

export function compareEval(a, b) {
  if (!a || !b) return 0;
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < n; i++) {
    const d = (a.tie[i] || 0) - (b.tie[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function bestHand(cards) {
  if (cards.length <= 5) return eval5(cards);
  let best = null;
  const n = cards.length;
  // 7 张时枚举 C(7,5)=21；多于 7 张时退化为整体取前 7（本项目不会出现）
  if (n === 6) {
    for (let skip = 0; skip < n; skip++) {
      const five = cards.filter((_, i) => i !== skip);
      const ev = eval5(five);
      if (!best || compareEval(ev, best) > 0) best = ev;
    }
    return best;
  }
  for (let a = 0; a < n - 1; a++) {
    for (let b = a + 1; b < n; b++) {
      const five = [];
      for (let i = 0; i < n; i++) if (i !== a && i !== b) five.push(cards[i]);
      const ev = eval5(five);
      if (!best || compareEval(ev, best) > 0) best = ev;
    }
  }
  return best;
}

// ---------- 炸金花 3 张牌评估 ----------
export function eval3(cards) {
  const rs = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0].s);
  const triple = rs[0] === rs[1] && rs[1] === rs[2];
  const pair = rs[0] === rs[1] || rs[1] === rs[2];
  let straight = 0;
  if (new Set(rs).size === 3 && rs[0] - rs[2] === 2) straight = rs[0];
  else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) straight = 3; // A23 最小顺子

  if (triple) return { cat: 6, tie: [rs[0]], name: '豹子' };
  if (flush && straight) return { cat: 5, tie: [straight], name: '顺金' };
  if (flush) return { cat: 4, tie: rs, name: '金花' };
  if (straight) return { cat: 3, tie: [straight], name: '顺子' };
  if (pair) {
    const p = rs[0] === rs[1] ? rs[0] : rs[1];
    const k = rs[0] === rs[1] ? rs[2] : rs[0];
    return { cat: 2, tie: [p, k], name: '对子' };
  }
  return { cat: 1, tie: rs, name: '单张' };
}

export function compare3(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < n; i++) {
    const d = (a.tie[i] || 0) - (b.tie[i] || 0);
    if (d) return d;
  }
  return 0;
}

// ---------- 边池 ----------
// players: [{ seat, contrib, folded }]
export function buildPots(players) {
  const levels = [...new Set(players.filter((p) => p.contrib > 0).map((p) => p.contrib))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.contrib, level) - prev);
    if (amount > 0) {
      const eligible = players.filter((p) => !p.folded && p.contrib >= level).map((p) => p.seat);
      pots.push({ amount, eligible });
    }
    prev = level;
  }
  // 合并可参赛者相同的相邻池
  const merged = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.length === pot.eligible.length && last.eligible.every((s, i) => s === pot.eligible[i])) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot, eligible: pot.eligible.slice() });
    }
  }
  return merged.filter((p) => p.amount > 0);
}

// 已弃牌玩家的投入超过所有未弃牌玩家时，超出部分是“无人跟注”的筹码，退回本人。
// 避免边池出现没有任何可获胜者的空池，保证筹码守恒。
export function capFoldedContribs(players) {
  const active = players.filter((p) => !p.folded);
  if (!active.length) return;
  const max = Math.max(...active.map((p) => p.contrib));
  for (const p of players) {
    if (p.folded && p.contrib > max) {
      const refund = p.contrib - max;
      p.contrib = max;
      if (typeof p.chips === 'number') p.chips += refund;
    }
  }
}
