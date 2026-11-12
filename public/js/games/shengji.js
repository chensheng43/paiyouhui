// 升级 / 拖拉机前端
import { cardHtml, sortShengji, shengjiBadge, isTrumpShengji, SUITS } from '../cards.js';

function trumpLabel(t) {
  return t === 'NT' ? '无主' : t === null || t === undefined ? '未定' : SUITS[t];
}

function rankName(r) {
  return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
}

export function renderCenter(ctx) {
  const s = ctx.s;
  const parts = [];
  if (s.phase === 'declare') {
    parts.push(`<div class="stage-label">亮主阶段</div>`);
    parts.push(`<div class="stage-title">打 ${rankName(s.level)} · 主牌 ${trumpLabel(s.trumpSuit)}</div>`);
    if (s.trumpSuit !== null) {
      parts.push(`<div class="stage-sub">${ctx.esc(ctx.nameOf(s.declaredBy))} 亮主${s.declareStrength === 2 ? '（对子反主）' : s.trumpSuit === 'NT' ? '（无主）' : ''}</div>`);
    }
    parts.push(`<div class="stage-sub">${s.turn === ctx.mySeat ? '轮到你亮主' : `等待 ${ctx.esc(ctx.nameOf(s.turn))} 亮主`}</div>`);
    const decl = s.declarations.slice(-4).map((d) => {
      const nm = ctx.esc(ctx.nameOf(d.seat));
      if (d.type === 'pass') return `${nm} 不亮`;
      return `${nm} 亮 ${trumpLabel(d.suit)}`;
    });
    if (decl.length) parts.push(`<div class="stage-sub" style="opacity:.75">${decl.join(' · ')}</div>`);
  } else if (s.phase === 'bury') {
    parts.push(`<div class="stage-label">扣底</div>`);
    parts.push(`<div class="stage-title">${ctx.esc(ctx.nameOf(s.banker))} 正在扣底</div>`);
    parts.push(`<div class="trump-line"><span class="trump-badge">主 ${trumpLabel(s.trumpSuit)} · 打 ${rankName(s.level)}</span></div>`);
    parts.push(`<div class="stage-sub">扣 8 张，底牌分数将影响最终得分</div>`);
  } else if (s.phase === 'play' || s.phase === 'over') {
    parts.push(`<div class="trump-line"><span class="trump-badge">主 ${trumpLabel(s.trumpSuit)} · 打 ${rankName(s.level)}</span>
      <span class="def-points">闲家 <b>${s.defPoints}</b> 分</span></div>`);
    if (s.trick && s.trick.length) {
      const items = s.trick.map((t) => `<div class="trick-item"><span class="who">${ctx.esc(ctx.nameOf(t.seat))}</span>
        <span class="cards">${t.cards.map((c) => cardHtml(c, { small: true })).join('')}</span></div>`).join('');
      parts.push(`<div class="trick-grid">${items}</div>`);
      if (s.lead) parts.push(`<div class="stage-sub">${s.lead.type === 'single' ? '单张' : s.lead.type === 'pair' ? '对子' : '拖拉机'} · 还需 ${4 - s.trick.length} 家</div>`);
    } else if (s.phase === 'play') {
      parts.push(`<div class="stage-title">${s.turn === ctx.mySeat ? '轮到你出牌' : `等待 ${ctx.esc(ctx.nameOf(s.turn))} 出牌`}</div>`);
      if (s.lastTrick) parts.push(`<div class="stage-sub">上一墩：${ctx.esc(ctx.nameOf(s.lastTrick.winner))} 赢得${s.lastTrick.points ? ` ${s.lastTrick.points} 分` : ''}</div>`);
    }
    parts.push(`<div class="level-row"><span class="level-pill">南北 打 ${rankName(s.teamLevels[0])}</span><span class="level-pill">东西 打 ${rankName(s.teamLevels[1])}</span></div>`);
  }
  return parts.join('');
}

export function renderHand(ctx) {
  const s = ctx.s;
  const hand = sortShengji(s.hand || [], s.level, s.trumpSuit);
  const canBury = s.phase === 'bury' && s.banker === ctx.mySeat;
  const selectable = (s.phase === 'play' && s.turn === ctx.mySeat) || canBury;
  const many = hand.length > 17 ? ' many' : '';
  const cardOf = (c) => {
    const badge = shengjiBadge(c, s.level, s.trumpSuit);
    const trump = isTrumpShengji(c, s.level, s.trumpSuit);
    return ctx.card(c, { selectable, badge, extraClass: trump ? 'trump-card' : '' });
  };
  // 手机上一手 25 张排成一行每张只露 10px 左右，点选和看花色都吃力；
  // 窄屏牌多时拆成两行，每张露出约 22px。
  const twoRows = hand.length > 18 && window.matchMedia('(max-width: 620px)').matches;
  if (twoRows) {
    const split = Math.ceil(hand.length / 2);
    const row = (list) => `<div class="hand-row">${list.map(cardOf).join('')}</div>`;
    return `<div class="hand-wrap"><div class="hand many two-rows">${row(hand.slice(0, split))}${row(hand.slice(split))}</div></div>`;
  }
  return `<div class="hand-wrap"><div class="hand${many}">${hand.map(cardOf).join('')}</div></div>`;
}

export function renderActions(ctx) {
  const s = ctx.s;
  if (s.phase === 'over') return `<div class="status">本局结束</div>`;
  if (s.phase === 'declare') {
    if (s.turn !== ctx.mySeat) return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 亮主…</div>`;
    const fresh = s.trumpSuit === null;
    const suits = fresh ? s.myLevelSuits : s.canCounter ? s.myLevelPairs : [];
    const buttons = suits
      .map((suit) => `<button class="btn ${fresh ? 'primary' : 'gold-outline'}" data-act="declare" data-suit="${suit}">
        ${fresh ? '亮' : '反'} ${SUITS[suit]}</button>`)
      .join('');
    const nt = s.canNT && s.trumpSuit !== 'NT' ? `<button class="btn gold-outline" data-act="nt">${fresh ? '亮' : '反'}无主</button>` : '';
    return `${buttons}${nt}
      <button class="btn ghost" data-act="declare-pass">不亮</button>
      <div class="divider"></div><span class="status">${fresh ? '单张级牌可亮主' : s.canCounter ? '对子级牌或双王可反主' : '当前主牌已定'}</span>`;
  }
  if (s.phase === 'bury') {
    if (s.banker !== ctx.mySeat) return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.banker))}</b> 扣底…</div>`;
    const n = ctx.selected.size;
    return `<span class="status">选择 <b>${n}</b> / 8 张扣底</span>
      <button class="btn primary" data-act="bury" ${n === 8 ? '' : 'disabled'}>确认扣底</button>
      <button class="btn ghost sm" data-act="clear-select">清空</button>`;
  }
  if (s.phase === 'play') {
    if (s.turn !== ctx.mySeat) return `<div class="status">等待 <b>${ctx.esc(ctx.nameOf(s.turn))}</b> 出牌${s.lead ? ' · 需跟牌' : ''}</div>`;
    const n = ctx.selected.size;
    const need = s.lead ? `${s.lead.type === 'single' ? '单张' : s.lead.type === 'pair' ? '对子' : '拖拉机'} · 需要同型跟牌` : '你先出牌';
    const status = n ? `已选 <b>${n}</b> 张 · ${need}` : need;
    return `<button class="btn ghost" data-act="hint">提示</button>
      <button class="btn primary" data-act="play" ${n ? '' : 'disabled'}>出牌${n ? ` · ${n} 张` : ''}</button>
      ${n ? `<button class="btn ghost sm" data-act="clear-select">重选</button>` : ''}
      <span class="status">${status}</span>`;
  }
  return '';
}

export function seatInfo(seat, ctx) {
  const s = ctx.s;
  const p = s.players.find((x) => x.seat === seat);
  if (!p) return {};
  const team = seat % 2 === 0 ? '南北' : '东西';
  const tags = [p.isBanker ? '庄家' : '闲家', team];
  return {
    tag: tags.join(' · '),
    tagClass: p.isBanker ? 'gold' : seat % 2 === 0 ? 'green' : '',
    sub: `${p.count} 张 · 打 ${rankName(s.teamLevels[team === '南北' ? 0 : 1])}`,
    count: p.count
  };
}

export function result(ctx) {
  const s = ctx.s;
  const r = s.result;
  if (!r) return { title: '本局结束', subtitle: '', stats: [], body: '' };
  const spectator = !!ctx.isSpectator;
  const myTeam = spectator ? null : ctx.mySeat % 2;
  const win = spectator ? null : r.winnerTeam === myTeam;
  const body = `<div class="res-hands">
    <div class="res-hand"><span class="rh-name">底牌</span><span class="rh-cards">${(r.bottom || []).map((c) => cardHtml(c, { xs: true })).join('')}</span><span class="rh-eval">${r.bottomPoints} 分</span></div>
    <div class="res-hand"><span class="rh-name">级别</span><span class="rh-cards" style="font-size:11px;color:var(--muted)">南北 打 ${rankName(r.levels[0])} · 东西 打 ${rankName(r.levels[1])}</span></div>
    ${r.matchOver ? `<div class="res-hand"><span class="rh-name">过 A</span><span class="rh-cards" style="font-size:11px;color:var(--gold-2)">${r.winnerTeam === 0 ? '南北' : '东西'}队赢得整场比赛</span></div>` : ''}
  </div>`;
  return {
    title: spectator ? `${r.winnerTeam === 0 ? '南北' : '东西'}方获胜` : win ? '你方获胜' : '你方失利',
    subtitle: `闲家 ${r.defPoints} 分${r.bottomBonus ? `（含扣底 +${r.bottomBonus}）` : ''} · ${r.winnerTeam === r.bankerTeam ? '庄家' : '闲家'}方升 ${r.levelGain} 级`,
    tone: spectator ? 'spectate' : win ? 'win' : 'lose',
    stats: [
      { label: '闲家得分', value: r.defPoints },
      { label: '升几级', value: '+' + r.levelGain },
      { label: '下局庄家', value: ctx.esc(ctx.nameOf(r.next.banker)) },
      { label: '下局打', value: rankName(r.next.level) }
    ],
    body
  };
}
