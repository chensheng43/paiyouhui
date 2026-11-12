// 斗地主牌型解析（前端预判用）
// 必须与 server/games/doudizhu.js 的 parsePlay / canBeat 保持同一口径，
// tools/test-engines.js 会用随机牌组对比两边结果。

export const DDZ_TYPE_NAMES = {
  single: '单张',
  pair: '对子',
  trio: '三张',
  trio1: '三带一',
  trio2: '三带二',
  straight: '顺子',
  pairseq: '连对',
  plane: '飞机',
  plane1: '飞机带单',
  plane2: '飞机带对',
  four2: '四带二',
  four2p: '四带两对',
  bomb: '炸弹',
  rocket: '王炸'
};

const power = (c) => (c.r === 2 ? 15 : c.r >= 15 ? c.r + 1 : c.r);

const counts = (cards) => {
  const m = new Map();
  for (const c of cards) m.set(c.r, (m.get(c.r) || 0) + 1);
  return m;
};

const powersOf = (cards) => cards.map(power).sort((a, b) => b - a);

/** 解析一手斗地主牌，合法返回 { type, len, rank, size }，否则 null */
export function parseDdz(cards) {
  const n = cards.length;
  if (!n) return null;
  const cs = counts(cards);
  const entries = [...cs.entries()];
  const pw = powersOf(cards);
  const same = (k) => entries.length === 1 && entries[0][1] === k;

  if (n === 2 && pw[0] === 17 && pw[1] === 16) return { type: 'rocket', len: 1, rank: 100, size: 2 };
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
    const two = entries.find((e) => e[1] === 2)?.[0];
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

  const c = new Map(entries.map(([r, cnt]) => [r, cnt]));

  // 飞机带单
  if (n >= 8 && n % 4 === 0) {
    const k = n / 4;
    for (let start = 3; start + k - 1 <= 14; start++) {
      let ok = true;
      for (let r = start; r < start + k; r++) if ((c.get(r) || 0) < 3) { ok = false; break; }
      if (!ok) continue;
      const used = new Set();
      for (let r = start; r < start + k; r++) used.add(r);
      let remain = 0;
      for (const [r, cnt] of c) if (!used.has(r)) remain += cnt;
      if (remain !== k) continue;
      return { type: 'plane1', len: k, rank: start + k - 1, size: n };
    }
  }
  // 飞机带对
  if (n >= 10 && n % 5 === 0) {
    const k = n / 5;
    for (let start = 3; start + k - 1 <= 14; start++) {
      let ok = true;
      for (let r = start; r < start + k; r++) if ((c.get(r) || 0) < 3) { ok = false; break; }
      if (!ok) continue;
      const used = new Set();
      for (let r = start; r < start + k; r++) used.add(r);
      let remain = 0;
      let pairs = 0;
      let bad = false;
      for (const [r, cnt] of c) {
        if (used.has(r)) continue;
        remain += cnt;
        if (cnt % 2 !== 0) bad = true;
        pairs += cnt / 2;
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

/** 与服务器 canBeat 相同的比较口径 */
export function ddzCanBeat(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === 'rocket') return b.type !== 'rocket';
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb' && b.type !== 'bomb') return true;
  if (b.type === 'bomb' && a.type !== 'bomb') return false;
  if (a.type !== b.type || a.len !== b.len) return false;
  return a.rank > b.rank;
}
