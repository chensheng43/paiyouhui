// 手牌选牌交互：单击、横向滑选、Shift 连选、点空白取消。
// 手感对齐主流斗地主手游：
//   · 按住一张牌横向拖动，划过多少选多少，拖回去可以撤销；
//   · 从已选中的牌起拖，则是整段取消；
//   · 单击切换一张牌；电脑上 Shift+单击可连选一段；
//   · 轻点手牌外空白处清空。

const MOVE_TOLERANCE = 5;
const EDGE = 22;

export function installHandSelection(options = {}) {
  const {
    getRoot = () => document.querySelector('#hand-area'),
    getSelected = () => new Set(),
    applySelection = () => {},
    getMaxSelect = () => Infinity,
    onLimit = () => {},
    onBlank = () => {}
  } = options;

  let gesture = null;
  let blank = null;
  let lastTap = null;

  function rootEl() {
    const el = getRoot();
    return el && el.isConnected ? el : null;
  }

  function cardsOf(hand) {
    return [...hand.querySelectorAll('.pcard.selectable')].filter((el) => el.dataset.cid !== undefined);
  }

  // 拖动时只看横向落点落在哪张牌露出的窄条上。
  // 不用 elementFromPoint：选中的牌会抬起，靠下拖动时命中会跳到相邻牌。
  // 双行手牌只在起始那一行内滑选。
  function indexAt(x, y, cards, hand, row) {
    const box = row || hand;
    const r = box.getBoundingClientRect();
    if (y < r.top - 60 || y > r.bottom + 60) return null;
    let best = 0;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].getBoundingClientRect().left <= x + 1) best = i;
      else break;
    }
    return best;
  }

  function applyRange(anchor, focus, select) {
    if (anchor === null || focus === null || focus === undefined) return;
    const { cards, snapshot, max } = gesture;
    const next = new Set(snapshot);
    let limited = false;
    const lo = Math.min(anchor, focus);
    const hi = Math.max(anchor, focus);
    for (let i = lo; i <= hi; i++) {
      const id = Number(cards[i]?.dataset.cid);
      if (!Number.isFinite(id)) continue;
      if (select) {
        if (next.size >= max && !next.has(id)) {
          limited = true;
          continue;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    if (limited) onLimit();
    applySelection(next, { source: 'drag' });
  }

  function autoScroll(x) {
    const wrap = gesture?.hand?.closest('.hand-wrap');
    if (!wrap || wrap.scrollWidth <= wrap.clientWidth + 2) return;
    const r = wrap.getBoundingClientRect();
    if (x < r.left + EDGE) wrap.scrollLeft -= 14;
    else if (x > r.right - EDGE) wrap.scrollLeft += 14;
  }

  function cleanup() {
    const g = gesture;
    gesture = null;
    g?.hand?.classList.remove('dragging');
    if (g) {
      try {
        g.card.releasePointerCapture(g.pointerId);
      } catch {
        /* 牌已重绘或未捕获 */
      }
    }
  }

  function cancelGesture({ restore = true } = {}) {
    const g = gesture;
    if (!g) return;
    if (restore && g.dragging) applySelection(g.snapshot, { source: 'cancel' });
    cleanup();
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture) return;

    const area = rootEl();
    if (!area) return;
    const target = e.target instanceof Element ? e.target : null;
    const card = target?.closest?.('.pcard.selectable');
    const hand = card?.closest('.hand');

    if (card && hand && area.contains(card) && card.dataset.cid !== undefined) {
      const row = card.parentElement?.classList.contains('hand-row') ? card.parentElement : null;
      const cards = cardsOf(row || hand);
      const index = cards.indexOf(card);
      if (index < 0) return;
      const selected = new Set(getSelected());
      const id = Number(card.dataset.cid);
      const max = Number(getMaxSelect()) || Infinity;

      // Shift+单击：从上次点过的牌连选一段（桌面端常用）
      if (
        e.shiftKey &&
        lastTap &&
        lastTap.row === row &&
        lastTap.cards.length === cards.length &&
        lastTap.cards[0]?.isConnected
      ) {
        const next = new Set(selected);
        let limited = false;
        for (let i = Math.min(lastTap.index, index); i <= Math.max(lastTap.index, index); i++) {
          const cid = Number(cards[i].dataset.cid);
          if (next.size >= max && !next.has(cid)) {
            limited = true;
            continue;
          }
          next.add(cid);
        }
        if (limited) onLimit();
        applySelection(next, { source: 'shift' });
        lastTap = { cards, index, row };
        e.preventDefault();
        return;
      }

      gesture = {
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        card,
        hand,
        row,
        cards,
        anchor: index,
        focus: index,
        startX: e.clientX,
        startY: e.clientY,
        snapshot: selected,
        select: !selected.has(id),
        max,
        dragging: false
      };
      lastTap = { cards, index, row };
      try {
        card.setPointerCapture(e.pointerId);
      } catch {
        /* 个别浏览器/触点不支持捕获 */
      }
      if (e.pointerType === 'mouse') e.preventDefault();
      return;
    }

    if (target?.closest('button, a, input, select, textarea')) return;
    // 牌与牌、行与行之间的缝隙不算“空白”，避免手机上滑选时误清空
    if (target?.closest('.hand')) return;
    if (getSelected().size) blank = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e) {
    if (gesture && e.pointerId === gesture.pointerId) {
      const dx = e.clientX - gesture.startX;
      const dy = e.clientY - gesture.startY;

      if (!gesture.dragging) {
        if (Math.hypot(dx, dy) < MOVE_TOLERANCE) return;
        // 以竖向为主：大概率是滚动页面，交还给浏览器
        if (gesture.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx) * 1.15) {
          cancelGesture({ restore: false });
          return;
        }
        gesture.dragging = true;
        gesture.hand.classList.add('dragging');
        const startIndex = indexAt(e.clientX, e.clientY, gesture.cards, gesture.hand, gesture.row);
        if (startIndex !== null) {
          gesture.focus = startIndex;
          applyRange(gesture.anchor, startIndex, gesture.select);
        }
      } else {
        autoScroll(e.clientX);
        const index = indexAt(e.clientX, e.clientY, gesture.cards, gesture.hand, gesture.row);
        if (index !== null && index !== gesture.focus) {
          gesture.focus = index;
          applyRange(gesture.anchor, index, gesture.select);
        }
      }
      if (gesture?.dragging) e.preventDefault();
      return;
    }

    if (blank && e.pointerId === blank.pointerId) {
      if (Math.hypot(e.clientX - blank.x, e.clientY - blank.y) > MOVE_TOLERANCE) blank = null;
    }
  }

  function onPointerUp(e) {
    if (gesture && e.pointerId === gesture.pointerId) {
      const g = gesture;
      if (!g.dragging) {
        const next = new Set(g.snapshot);
        const id = Number(g.cards[g.anchor]?.dataset.cid);
        if (g.select) {
          if (next.size >= g.max && !next.has(id)) onLimit();
          else next.add(id);
        } else {
          next.delete(id);
        }
        applySelection(next, { source: 'tap' });
      }
      cleanup();
      return;
    }
    if (blank && e.pointerId === blank.pointerId) {
      blank = null;
      onBlank();
    }
  }

  function onPointerCancel(e) {
    if (gesture && e.pointerId === gesture.pointerId) {
      cancelGesture();
      return;
    }
    if (blank && e.pointerId === blank.pointerId) blank = null;
  }

  document.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  return {
    destroy() {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      gesture = null;
      blank = null;
      lastTap = null;
    },
    clearLastTap() {
      lastTap = null;
    }
  };
}
