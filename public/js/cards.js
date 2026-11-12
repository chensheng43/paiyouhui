// 牌面渲染与手牌排序
export const SUITS = ['♠', '♥', '♣', '♦'];
export const SUIT_NAMES = ['黑桃', '红桃', '梅花', '方块'];

export function rankName(r) {
  if (r === 15) return '小王';
  if (r === 16) return '大王';
  return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
}

export function cardName(c) {
  if (c.r >= 15) return rankName(c.r);
  return SUITS[c.s] + rankName(c.r);
}

export function cardHtml(c, opts = {}) {
  if (!c) return '';
  const {
    selected = false,
    selectable = false,
    small = false,
    xs = false,
    lg = false,
    dim = false,
    badge = '',
    trump = false,
    extraClass = ''
  } = opts;
  const classes = ['pcard'];
  if (small) classes.push('sm');
  if (xs) classes.push('xs');
  if (lg) classes.push('lg');
  if (c.s === 1 || c.s === 3) classes.push('red');
  if (c.r >= 15) classes.push('joker');
  if (c.r === 16) classes.push('red');
  if (selected) classes.push('selected');
  if (selectable) classes.push('selectable');
  if (dim) classes.push('dim');
  if (extraClass) classes.push(extraClass);
  const label = cardName(c);
  const data = selectable ? ` data-cid="${c.id}"` : '';
  const badgeHtml = badge ? `<i class="pc-badge">${badge}</i>` : '';
  const trumpHtml = trump ? `<i class="pc-trump">主</i>` : '';
  if (c.r >= 15) {
    return `<div class="${classes.join(' ')}"${data} title="${label}" role="img" aria-label="${label}">${badgeHtml}
      <span class="pc-corner tl"><b>王</b><i>JOKER</i></span>
      <span class="pc-corner br"><b>王</b><i>JOKER</i></span>
      <span class="pc-center"><b>JOKER</b><em>${c.r === 16 ? '大王' : '小王'}</em></span>
    </div>`;
  }
  const suit = SUITS[c.s];
  return `<div class="${classes.join(' ')}"${data} title="${label}" role="img" aria-label="${label}">${badgeHtml}${trumpHtml}
    <span class="pc-corner tl"><b>${rankName(c.r)}</b><i>${suit}</i></span>
    <span class="pc-center">${suit}</span>
    <span class="pc-corner br"><b>${rankName(c.r)}</b><i>${suit}</i></span>
  </div>`;
}

export function backHtml(opts = {}) {
  const { small = false, xs = false, lg = false, extraClass = '' } = opts;
  const classes = ['pcard', 'back'];
  if (small) classes.push('sm');
  if (xs) classes.push('xs');
  if (lg) classes.push('lg');
  if (extraClass) classes.push(extraClass);
  return `<div class="${classes.join(' ')}" role="img" aria-label="牌背"></div>`;
}

export function cardsHtml(cards, opts = {}) {
  if (!cards || !cards.length) return '';
  return cards.map((c) => cardHtml(c, opts)).join('');
}

export function backsHtml(n, opts = {}) {
  return Array.from({ length: n }, () => backHtml(opts)).join('');
}

const ddzPower = (c) => (c.r === 2 ? 15 : c.r >= 15 ? c.r + 1 : c.r);

export function sortDdz(cards) {
  return cards.slice().sort((a, b) => ddzPower(b) - ddzPower(a) || b.s - a.s);
}

export function sortByRank(cards) {
  return cards.slice().sort((a, b) => b.r - a.r || b.s - a.s);
}

export function isTrumpShengji(c, level, trumpSuit) {
  if (c.r >= 15) return true;
  if (c.r === level) return true;
  if (trumpSuit === 'NT') return false;
  return c.s === trumpSuit;
}

export function sortShengji(cards, level, trumpSuit) {
  const order = (c) => {
    if (c.r === 16) return 100;
    if (c.r === 15) return 99;
    if (c.r === level) return 90 + (trumpSuit === 'NT' ? 0 : c.s === trumpSuit ? 1 : 0);
    return c.r;
  };
  return cards.slice().sort((a, b) => {
    const at = isTrumpShengji(a, level, trumpSuit);
    const bt = isTrumpShengji(b, level, trumpSuit);
    if (at !== bt) return at ? -1 : 1;
    if (at) return order(b) - order(a) || a.s - b.s;
    if (a.s !== b.s) return a.s - b.s;
    return b.r - a.r;
  });
}

export function shengjiBadge(c, level, trumpSuit) {
  if (c.r === level) return '级';
  if (isTrumpShengji(c, level, trumpSuit)) return '主';
  return '';
}
