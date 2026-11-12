// 炸金花前端
import { cardHtml, backHtml, sortByRank } from '../cards.js';

const HAND_NAMES = { 6: '豹子', 5: '顺金', 4: '金花', 3: '顺子', 2: '对子', 1: '单张' };

export function renderCenter(ctx) {
  const s = ctx.s;
  const parts = [];
  parts.push(`<div class="stage-label">底池</div><div class="pot"><span class="chips">🪙</span><b>${s.pot}</b><span>筹码</span></div>`);
  parts.push(`<div class="level-row"><span class="level-pill">当前注 ${s.stake}</span><span class="level-pill">封顶 ${s.cap}</span><span class="level-pill">底注 ${s.ante}</span></div>`);
  if (s.phase === 'bet') {
    parts.push(`<div class="stage-title">${s.turn === ctx.mySeat ? '轮到你下注' : `等待 ${ctx.esc(ctx.nameOf(s.turn))} 行动`}</div>`);
  }
  return parts.join('');
}

export function renderHand(ctx) {
  const s = ctx.s;
  if (s.phase === 'over') {
    if (s.myCards) return `<div class="hand">${sortByRank(s.myCards).map((c) => cardHtml(c, { lg: true })).join('')}</div>`;
    return `<div class="hand">${backHtml({ lg: true })}${backHtml({ lg: true })}${backHtml({ lg: true })}</div>`;
  }
  if (s.myCards) {
    return `<div class="hand">${sortByRank(s.myCards).map((c) => cardHtml(c, { lg: true })).join('')}</div>`;
  }
  return `<div class="hand">${backHtml({ lg: true })}${backHtml({ lg: true })}${backHtml({ lg: true })}</div>`;
}

export function renderActions(ctx) {
  const s = ctx.s;
  const me = s.players.find((p) => p.seat === ctx.mySeat);
  if (!me) return '';
  if (s.phase === 'over') return `<div class="status">本局结束</div>`;
  if (me.folded) return `<div class="status">你已弃牌，等待本局结束</div>`;

  const lookBtn = !me.looked ? `<button class="btn gold-outline" data-act="look">看牌</button>` : `<span class="tag gold">已看牌</span>`;

  if (s.turn !== ctx.mySeat) {
    return `${lookBtn}<div class="divider"></div><div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 行动…</div>`;
  }

  if (ctx.ui.zjhCompare) {
    const targets = s.players.filter((p) => p.seat !== ctx.mySeat && !p.folded);
    return `<div class="status">选择比牌对象（比牌费用 ${s.compareCost}）</div>
      <div class="compare-list">${targets
        .map((p) => `<button data-act="compare-target" data-target="${p.seat}">${ctx.esc(p.name)} · ${p.looked ? '已看' : '闷牌'}</button>`)
        .join('')}</div>
      <button class="btn ghost sm" data-act="zjh-cancel">取消</button>`;
  }

  if (ctx.ui.zjhRaise) {
    const min = Math.min(s.cap, s.stake + s.ante);
    const max = s.cap;
    const val = Math.min(max, Math.max(min, Number(ctx.ui.raiseValue) || min));
    return `<div class="raise-box">
      <span class="status">加注到</span>
      <input type="range" id="raise-range" min="${min}" max="${max}" step="${s.ante}" value="${val}">
      <span class="val" id="raise-val">${val}</span>
      <button class="btn primary sm" data-act="raise-confirm">确认</button>
      <button class="btn ghost sm" data-act="zjh-cancel">取消</button>
    </div>
    <div class="raise-presets">
      <button data-act="raise-preset" data-value="${Math.min(max, s.stake * 2)}">×2</button>
      <button data-act="raise-preset" data-value="${Math.min(max, s.stake * 3)}">×3</button>
      <button data-act="raise-preset" data-value="${max}">封顶</button>
    </div>`;
  }

  return `
    ${lookBtn}
    <div class="divider"></div>
    <button class="btn call" data-act="call">跟注 ${s.callCost}</button>
    <button class="btn ghost" data-act="zjh-raise-open" ${s.stake >= s.cap ? 'disabled' : ''}>加注</button>
    <button class="btn ghost" data-act="zjh-compare-open" ${s.canCompare ? '' : 'disabled'}>比牌 · ${s.compareCost}</button>
    <button class="btn fold" data-act="fold">弃牌</button>`;
}

export function seatInfo(seat, ctx) {
  const s = ctx.s;
  const p = s.players.find((x) => x.seat === seat);
  if (!p) return {};
  const tags = [];
  if (p.folded) tags.push('已弃牌');
  else if (p.looked) tags.push('已看牌');
  else tags.push('闷牌');
  if (p.allin) tags.push('全下');
  return {
    tag: tags.join(' · '),
    tagClass: p.folded ? 'red' : p.looked ? 'green' : '',
    sub: `${p.chips} 筹码 · 已投 ${p.contrib}`,
    count: null,
    cards: p.folded ? 0 : 3
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
      <span class="rh-cards">${sortByRank(h.cards).map((c) => cardHtml(c, { xs: true })).join('')}</span>
      <span class="rh-eval" style="color:${isWinner ? 'var(--gold-2)' : 'var(--muted)'}">${HAND_NAMES[h.eval.cat] || ''}</span></div>`;
  }).join('');
  return {
    title: spectator ? '本局结束' : myWin ? '你赢了' : '本局结束',
    subtitle: r.winners.map((w) => `${ctx.esc(ctx.nameOf(w.seat))} 赢得 ${w.amount}`).join(' · ') || r.reason,
    tone: spectator ? 'spectate' : myWin ? 'win' : 'lose',
    stats: spectator
      ? [
          { label: '底池', value: r.pot },
          { label: '最终注', value: r.stake || s.stake },
          { label: '赢家', value: r.winners.length }
        ]
      : [
          { label: '底池', value: r.pot },
          { label: '我的筹码', value: s.players[ctx.mySeat]?.chips ?? '—' },
          { label: '最终注', value: r.stake || s.stake }
        ],
    body: hands ? `<div class="res-hands">${hands}</div>` : ''
  };
}
