// 斗地主前端
import { cardHtml, sortDdz } from '../cards.js';
import { DDZ_TYPE_NAMES, parseDdz } from '../combos.js';

// 每位玩家在当前一轮的动作：出牌或不出，显示在出牌人座位旁
export function trickPlays(ctx) {
  const s = ctx.s;
  if (!s.trick || !s.trick.length) return [];
  const latest = new Map();
  for (const a of s.trick) latest.set(a.seat, a);
  let currentSeat = null;
  for (let i = s.trick.length - 1; i >= 0; i--) {
    if (s.trick[i].type === 'play') {
      currentSeat = s.trick[i].seat;
      break;
    }
  }
  let cap = 8;
  try {
    if (window.matchMedia('(max-width: 620px)').matches) cap = 6;
  } catch {
    cap = 8;
  }
  const out = [];
  for (const [seat, a] of latest) {
    const me = seat === ctx.mySeat;
    const who = me ? '你' : ctx.esc(ctx.nameOf(seat));
    if (a.type === 'pass') {
      out.push({
        seat,
        me,
        pass: true,
        current: false,
        html: `<span class="tp-head">${who}</span><span class="tp-pass">不出</span>`
      });
      continue;
    }
    const cards = sortDdz(a.cards || []);
    const shown = cards.slice(0, cap);
    const more = cards.length - shown.length;
    const label = `${DDZ_TYPE_NAMES[a.pattern] || ''}${more > 0 ? ` · ${cards.length} 张` : ''}`;
    const current = seat === currentSeat;
    out.push({
      seat,
      me,
      pass: false,
      current,
      html: `<span class="tp-head">${who}${label ? ` · ${label}` : ''}${current ? ' <em>最大</em>' : ''}</span>
        <span class="tp-cards">${shown.map((c) => cardHtml(c, { small: true })).join('')}${
          more > 0 ? `<i class="tp-more">+${more}</i>` : ''
        }</span>`
    });
  }
  return out;
}

export function renderCenter(ctx) {
  const s = ctx.s;
  const parts = [];
  if (s.multiplier > 1) {
    parts.push(`<div class="stage-label">倍数 ×${s.multiplier}${s.bombs ? ` · ${s.bombs} 炸` : ''}</div>`);
  }
  // 底牌统一放在牌桌边缘的独立层里，中央只保留轮次信息
  let note = '';
  if (s.trickOver) {
    const leader = s.turn === ctx.mySeat ? '你' : ctx.esc(ctx.nameOf(s.turn));
    note = `<div class="stage-sub new-trick">新一轮 · ${leader} 先出</div>`;
  } else if (s.trick?.length) {
    // 出牌已经显示在各自座位旁，中央只保留轮次信息
  } else if (s.lastPlay) {
    // 兼容旧服务端：没有 trick 字段时仍在中央显示最后一手
    parts.push(`<div class="play-spot"><div class="who">${ctx.esc(ctx.nameOf(s.lastPlay.seat))} · ${DDZ_TYPE_NAMES[s.lastPlay.type] || ''}</div>
      <div class="cards">${s.lastPlay.cards.map((c) => cardHtml(c, { small: true })).join('')}</div></div>`);
  } else if (s.phase === 'play') {
    parts.push(`<div class="stage-title">${s.turn === ctx.mySeat ? '轮到你出牌' : `等待 ${ctx.esc(ctx.nameOf(s.turn))} 出牌`}</div>`);
  } else if (s.phase === 'bid') {
    parts.push(`<div class="stage-title">叫地主</div><div class="stage-sub">当前最高 ${s.highestBid || 0} 分${s.highestSeat !== null ? ` · ${ctx.esc(ctx.nameOf(s.highestSeat))}` : ''}</div>`);
  }
  if (s.landlord !== null) {
    const role = s.landlord === ctx.mySeat ? '你是地主' : '你是农民';
    parts.push(`<div class="level-row"><span class="tag ${s.landlord === ctx.mySeat ? 'gold' : 'green'}">${role}</span><span class="stage-sub">底分 ${s.base || '—'}</span></div>`);
  }
  if (note) parts.push(note);
  return parts.join('');
}

export function renderHand(ctx) {
  const s = ctx.s;
  const hand = sortDdz(s.hand || []);
  const selectable = s.phase === 'play' && s.turn === ctx.mySeat;
  const many = hand.length > 17 ? ' many' : '';
  return `<div class="hand-wrap"><div class="hand${many}">${hand
    .map((c) => ctx.card(c, { selectable, lg: hand.length <= 5 }))
    .join('')}</div></div>`;
}

export function renderActions(ctx) {
  const s = ctx.s;
  if (s.phase === 'over') return `<div class="status">本局结束</div>`;
  if (s.phase === 'bid') {
    if (s.turn === ctx.mySeat) {
      const b = s.highestBid;
      return `
        <button class="btn ghost" data-act="bid" data-value="0">不叫</button>
        <button class="btn ${b < 1 ? 'primary' : ''}" data-act="bid" data-value="1" ${b >= 1 ? 'disabled' : ''}>1 分</button>
        <button class="btn ${b < 2 ? 'primary' : ''}" data-act="bid" data-value="2" ${b >= 2 ? 'disabled' : ''}>2 分</button>
        <button class="btn ${b < 3 ? 'primary' : ''}" data-act="bid" data-value="3" ${b >= 3 ? 'disabled' : ''}>3 分</button>
        <div class="divider"></div><span class="status">抢地主，3 分最高</span>`;
    }
    return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 叫分…</div>`;
  }
  if (s.phase === 'play') {
    if (s.turn !== ctx.mySeat) {
      return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 出牌${s.lastPlay ? ' · 可要不起' : ''}</div>`;
    }
    const n = ctx.selected.size;
    const picked = (s.hand || []).filter((c) => ctx.selected.has(c.id));
    const pattern = picked.length ? parseDdz(picked) : null;
    let summary = `<span class="status">${s.lastPlay ? '选牌压过上家' : '你先出牌'}</span>`;
    if (picked.length) {
      summary = pattern
        ? `<span class="status sel-line">${DDZ_TYPE_NAMES[pattern.type]} · ${picked.length} 张</span>`
        : `<span class="status bad">牌型不合法，重新选</span>`;
    }
    return `
      ${s.lastPlay ? `<button class="btn ghost" data-act="pass">不出</button>` : ''}
      <button class="btn ghost" data-act="hint">提示</button>
      <button class="btn primary play" data-act="play" ${n ? '' : 'disabled'}>出牌${n ? ` · ${n} 张` : ''}</button>
      ${n ? `<button class="btn ghost sm" data-act="clear-select">重选</button>` : ''}
      ${summary}`;
  }
  return `<div class="status">准备中…</div>`;
}

export function seatInfo(seat, ctx) {
  const s = ctx.s;
  const p = s.players.find((x) => x.seat === seat);
  if (!p) return {};
  const isLandlord = s.landlord === seat;
  return {
    tag: s.landlord === null ? '' : isLandlord ? '地主' : '农民',
    tagClass: isLandlord ? 'gold' : 'green',
    sub: `${p.count} 张 · ${ctx.room.players.find((x) => x.seat === seat)?.score ?? 0} 分`,
    count: p.count
  };
}

export function result(ctx) {
  const s = ctx.s;
  const r = s.result;
  if (!r) return { title: '本局结束', subtitle: '', stats: [], body: '' };
  const spectator = !!ctx.isSpectator;
  const myDelta = spectator ? null : r.deltas[ctx.mySeat] || 0;
  const win = spectator ? null : r.landlordWin ? ctx.mySeat === r.landlord : ctx.mySeat !== r.landlord;
  const body = `<div class="res-hands">${s.players
    .map((p) => {
      const delta = r.deltas[p.seat] || 0;
      return `<div class="res-hand"><span class="rh-name">${ctx.esc(p.name)}${p.seat === ctx.mySeat ? '（你）' : ''}</span>
        <span class="rh-cards">${(p.revealed || []).slice(0, 8).map((c) => cardHtml(c, { xs: true })).join('')}</span>
        <span class="rh-eval" style="color:${delta >= 0 ? 'var(--green)' : 'var(--red)'}">${delta > 0 ? '+' : ''}${delta}</span></div>`;
    })
    .join('')}</div>`;
  return {
    title: r.landlordWin ? '地主胜利' : '农民胜利',
    subtitle: spectator
      ? `${r.spring ? r.spring + ' · ' : ''}底分 ${r.base} × 倍数 ${r.multiplier}`
      : `${win ? '你赢了' : '你输了'} · ${r.spring ? r.spring + ' · ' : ''}底分 ${r.base} × 倍数 ${r.multiplier}`,
    tone: spectator ? 'spectate' : win ? 'win' : 'lose',
    stats: spectator
      ? [
          { label: '底分', value: r.base },
          { label: '倍数', value: '×' + r.multiplier },
          { label: '炸弹', value: r.bombs }
        ]
      : [
          { label: '我的得分', value: `${myDelta > 0 ? '+' : ''}${myDelta}` },
          { label: '底分', value: r.base },
          { label: '倍数', value: '×' + r.multiplier },
          { label: '炸弹', value: r.bombs }
        ],
    body
  };
}
