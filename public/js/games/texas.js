// 德州扑克前端
import { cardHtml } from '../cards.js';

const STREET_NAMES = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', over: '摊牌' };

export function renderCenter(ctx) {
  const s = ctx.s;
  const parts = [];
  parts.push(`<div class="stage-label">${STREET_NAMES[s.street] || '牌局'}</div>`);
  parts.push(`<div class="pot"><span class="chips">🪙</span><b>${s.pot}</b><span>底池</span></div>`);
  const slots = [];
  for (let i = 0; i < 5; i++) {
    slots.push(s.community[i] ? cardHtml(s.community[i], { small: true }) : '<span class="slot"></span>');
  }
  parts.push(`<div class="community">${slots.join('')}</div>`);
  if (s.phase === 'over') {
    parts.push(`<div class="stage-title">摊牌</div>`);
  } else {
    const call = s.toCall || 0;
    parts.push(`<div class="stage-title">${s.turn === ctx.mySeat ? (call ? `轮到你 · 需跟注 ${call}` : '轮到你 · 可过牌') : `等待 ${ctx.esc(ctx.nameOf(s.turn))}`}</div>`);
    parts.push(`<div class="level-row"><span class="level-pill">当前注 ${s.currentBet}</span><span class="level-pill">盲注 ${s.sb}/${s.bb}</span></div>`);
  }
  return parts.join('');
}

export function renderHand(ctx) {
  const s = ctx.s;
  const hole = s.myHole || [];
  if (!hole.length) return '<div class="hand"><span class="status">等待发牌…</span></div>';
  return `<div class="hand">${hole.map((c) => cardHtml(c, { lg: true })).join('')}</div>`;
}

export function renderActions(ctx) {
  const s = ctx.s;
  const me = s.players.find((p) => p.seat === ctx.mySeat);
  if (s.phase === 'over') return `<div class="status">本局结束</div>`;
  if (!me || me.folded) return `<div class="status">你已弃牌，等待本局结束</div>`;
  if (me.allin) return `<div class="status">你已全下，等待发牌与摊牌</div>`;

  if (s.turn !== ctx.mySeat) {
    return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 行动${s.toCall ? ` · 需跟 ${s.toCall}` : ''}</div>`;
  }

  const call = s.toCall || 0;
  const canRaise = s.maxTarget > s.currentBet && s.maxTarget >= s.minTarget;
  if (ctx.ui.texasRaise) {
    const min = Math.min(s.minTarget, s.maxTarget);
    const max = s.maxTarget;
    const val = Math.min(max, Math.max(min, Number(ctx.ui.raiseValue) || min));
    return `<div class="raise-box">
      <span class="status">加注到</span>
      <input type="range" id="raise-range" min="${min}" max="${max}" step="${Math.max(1, s.bb)}" value="${val}">
      <span class="val" id="raise-val">${val}</span>
      <button class="btn primary sm" data-act="raise-confirm">确认</button>
      <button class="btn ghost sm" data-act="texas-cancel">取消</button>
    </div>
    <div class="raise-presets">
      ${[0.5, 0.75, 1].map((m) => {
        const target = Math.round((s.pot + call) * m + s.currentBet);
        const v = Math.max(min, Math.min(max, target));
        return `<button data-act="raise-preset" data-value="${v}">${m === 1 ? '满池' : Math.round(m * 100) + '%池'}</button>`;
      }).join('')}
      <button data-act="raise-preset" data-value="${max}">全下</button>
    </div>`;
  }

  return `
    <button class="btn fold" data-act="fold">弃牌</button>
    ${call ? `<button class="btn call" data-act="call">跟注 ${Math.min(call, me.chips)}</button>` : `<button class="btn call" data-act="check">过牌</button>`}
    ${canRaise ? `<button class="btn ghost" data-act="texas-raise-open">${s.currentBet ? '加注' : '下注'}</button>` : ''}
    <button class="btn gold-outline" data-act="allin">全下 ${me.chips}</button>`;
}

export function seatInfo(seat, ctx) {
  const s = ctx.s;
  const p = s.players.find((x) => x.seat === seat);
  if (!p) return {};
  const tags = [];
  if (p.isDealer) tags.push('D');
  if (p.isSB) tags.push('SB');
  if (p.isBB) tags.push('BB');
  return {
    tag: tags.join(' · ') || p.lastAction || '',
    tagClass: p.lastAction === '弃牌' ? 'red' : p.lastAction ? 'green' : '',
    sub: `${p.chips} 筹码${p.bet ? ` · 注 ${p.bet}` : ''}${p.folded ? ' · 弃牌' : ''}${p.allin ? ' · 全下' : ''}`,
    count: null
  };
}

export function result(ctx) {
  const s = ctx.s;
  const r = s.result;
  if (!r) return { title: '本局结束', subtitle: '', stats: [], body: '' };
  const spectator = !!ctx.isSpectator;
  const myWin = spectator ? null : (r.winners || []).some((w) => w.seat === ctx.mySeat);
  const hands = (r.hands || []).map((h) => {
    const p = s.players.find((x) => x.seat === h.seat);
    const isWinner = r.winners.some((w) => w.seat === h.seat);
    return `<div class="res-hand"><span class="rh-name">${ctx.esc(p?.name || '')}${h.seat === ctx.mySeat ? '（你）' : ''}</span>
      <span class="rh-cards">${h.hole.map((c) => cardHtml(c, { xs: true })).join('')}</span>
      <span class="rh-eval" style="color:${isWinner ? 'var(--gold-2)' : 'var(--muted)'}">${h.eval.name}</span></div>`;
  }).join('');
  return {
    title: spectator ? '本局结束' : myWin ? '你赢了' : '本局结束',
    subtitle: r.winners.map((w) => `${ctx.esc(ctx.nameOf(w.seat))} 赢得 ${w.amount}`).join(' · ') || r.reason,
    tone: spectator ? 'spectate' : myWin ? 'win' : 'lose',
    stats: spectator
      ? [
          { label: '底池', value: r.pot },
          { label: '公共牌', value: r.board?.length || 0 },
          { label: '赢家', value: r.winners.length }
        ]
      : [
          { label: '底池', value: r.pot },
          { label: '我的筹码', value: s.players[ctx.mySeat]?.chips ?? '—' },
          { label: '公共牌', value: r.board?.length || 0 }
        ],
    body: hands ? `<div class="res-hands">${hands}</div>` : ''
  };
}
