// 牌友汇 · 前端主程序
import { Net } from './net.js';
import { cardHtml, backHtml, backsHtml, SUITS } from './cards.js';
import { chipStackHtml } from './chips.js';
import { installHandSelection } from './selection.js';
import { sfx } from './sound.js';
import * as doudizhu from './games/doudizhu.js';
import * as zhajinhua from './games/zhajinhua.js';
import * as texas from './games/texas.js';
import * as shengji from './games/shengji.js';

const GAME_UI = { doudizhu, zhajinhua, texas, shengji };

const FALLBACK_GAMES = [
  { id: 'doudizhu', name: '斗地主', desc: '三人经典 · 叫分抢地主 · 炸弹翻倍', min: 3, max: 3, tag: '三人', color: '#e9b949' },
  { id: 'zhajinhua', name: '炸金花', desc: '三张牌 · 闷牌看牌 · 比牌定胜负', min: 3, max: 6, tag: '3–6 人', color: '#e0644a' },
  { id: 'texas', name: '德州扑克', desc: '无限注 · 四轮下注 · 边池摊牌', min: 2, max: 8, tag: '2–8 人', color: '#5fa8d3' },
  { id: 'shengji', name: '升级', desc: '四人两队 · 亮主扣底 · 打级过 A', min: 4, max: 4, tag: '四人', color: '#8dbf72' }
];

const GAME_ICONS = { doudizhu: '🃏', zhajinhua: '🔥', texas: '♠️', shengji: '🚜' };
const GAME_ART = {
  doudizhu: [{ r: 16, s: -1 }, { r: 2, s: 0 }, { r: 14, s: 1 }],
  zhajinhua: [{ r: 14, s: 1 }, { r: 13, s: 1 }, { r: 12, s: 1 }],
  texas: [{ r: 14, s: 0 }, { r: 13, s: 0 }, { r: 13, s: 1 }],
  shengji: [{ r: 2, s: 0 }, { r: 2, s: 1 }, { r: 16, s: -1 }]
};
const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐰', '🐨', '🦁', '🐮', '🐷', '🐙', '🦉', '🐳', '🦄', '🐲', '🃏'];

const POSITIONS = {
  1: [[50, 14]],
  2: [[25, 20], [75, 20]],
  3: [[12, 40], [50, 12], [88, 40]],
  4: [[9, 44], [30, 17], [70, 17], [91, 44]],
  5: [[11.5, 38], [26.5, 21], [50, 13], [73.5, 21], [88.5, 38]],
  6: [[11, 39], [22, 23], [38, 14], [62, 14], [78, 23], [89, 39]],
  7: [[11, 40], [19, 28], [33, 17], [50, 13], [67, 17], [81, 28], [89, 40]]
};

// 观战视角：所有玩家围成一圈，不预留自己的手牌位
function spectatorPositions(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    out.push([50 + 41 * Math.cos(a), 50 + 32 * Math.sin(a)]);
  }
  return out;
}

const RULES = {
  doudizhu: `
    <h4>目标</h4><p>三人一副牌（54 张），地主先出完牌获胜；任意一名农民先出完，农民方获胜。</p>
    <h4>流程</h4><ul>
      <li>每人 17 张，留 3 张底牌；叫分 1/2/3，最高分者当地主并拿走底牌。</li>
      <li>三家都不叫则自动重新发牌；地主先出，之后按座位轮转。</li>
      <li>可以“不出”，但新一轮先手必须出牌。</li>
    </ul>
    <h4>牌型</h4><p>单张、对子、三张、三带一/二、顺子（至少 5 张）、连对（至少 3 对）、飞机（可带单/带对）、四带二、炸弹、王炸。</p>
    <h4>计分</h4><p>底分 = 叫分；每个炸弹/王炸倍数 ×2；春天/反春天再 ×2。地主赢拿 2 份，农民各输 1 份，反之亦然。</p>
    <div class="note">本实现：严格按常见三人斗地主牌型与压牌规则；叫分最高 3 分；连续不叫自动重发。</div>`,
  zhajinhua: `
    <h4>目标</h4><p>3–6 人，每人 3 张牌，通过下注与比牌决出最后赢家。52 张牌，无王。</p>
    <h4>行动</h4><ul>
      <li><b>看牌</b>：随时可看，看牌后跟注金额翻倍；不看牌称“闷牌”。</li>
      <li><b>跟注</b>：闷牌跟当前注，看牌跟 2 倍当前注。</li>
      <li><b>加注</b>：提高当前注，封顶后不能再加。</li>
      <li><b>比牌</b>：支付比牌费（闷牌 2 倍、看牌 4 倍当前注），输者弃牌；牌型相同主动比牌者输。</li>
      <li><b>弃牌</b>：放弃本局已投入的筹码。</li>
    </ul>
    <h4>牌型大小</h4><p>豹子 &gt; 顺金 &gt; 金花 &gt; 顺子 &gt; 对子 &gt; 单张。A23 视为最小顺子；同型比点数。</p>
    <div class="note">本实现：支持全下与边池；达到 80 次行动或只剩一人时开牌；不自动补码，筹码耗尽自动转观战席；不足 3 人时停在结算页提示。</div>`,
  texas: `
    <h4>目标</h4><p>2–8 人，用 2 张底牌 + 5 张公共牌组成最佳 5 张牌，通过四轮下注争夺底池。</p>
    <h4>流程</h4><ul>
      <li>庄家按钮每局轮转，庄家左侧小盲、再左侧大盲。</li>
      <li>翻牌前 → 翻牌 3 张 → 转牌 1 张 → 河牌 1 张，每轮从庄家左侧开始行动。</li>
      <li>可过牌、跟注、加注、全下、弃牌；最小加注为大盲或上一次加注额。</li>
      <li>全下后按投入分层建立边池；摊牌时 7 选 5 比较牌型。</li>
    </ul>
    <h4>牌型大小</h4><p>同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌。</p>
    <div class="note">本实现：无限注；不自动补码，筹码耗尽自动转观战席；不足 2 人时停在结算页提示；多人全下时自动发完公共牌。</div>`,
  shengji: `
    <h4>目标</h4><p>四人两副牌（108 张），南北与东西两队，从 2 打起，先过 A 的队伍获胜。</p>
    <h4>亮主</h4><ul>
      <li>持有级牌可亮对应花色为主；对子级牌可反主；两张王可亮“无主”。</li>
      <li>级牌、王、主花色都算将牌，级牌高于 A、低于王。</li>
    </ul>
    <h4>扣底与出牌</h4><ul>
      <li>庄家收 8 张底牌，再扣 8 张；闲家赢最后一墩时，底牌分数 ×2 计入闲家。</li>
      <li>牌型：单张、对子、拖拉机（连续对子）；有该花色必须跟，有同型必须跟同型。</li>
      <li>5 计 5 分，10 和 K 各计 10 分，共 200 分。</li>
    </ul>
    <h4>升级</h4><p>闲家 ≥80 分则下庄并升级（80 起每 40 分 +1 级）；不足 80 分庄家升级（0 分 +3、&lt;40 +2、&lt;80 +1）。过 A 获胜。</p>
    <div class="note">简化口径：不支持甩牌；拖拉机不含级牌与王；庄家由上一局结果决定，亮主只决定主牌花色。</div>`
};

const state = {
  view: 'lobby',
  welcome: null,
  lobby: null,
  room: null,
  roomBuiltFor: null,
  clockOffset: 0,
  joinFromUrl: (new URLSearchParams(location.search).get('room') || '').toUpperCase(),
  joinAttempted: false,
  ignoreRoomUntil: 0,
  leavingRoomId: null,
  ui: {
    selected: new Set(),
    round: null,
    zjhCompare: false,
    zjhRaise: false,
    texasRaise: false,
    raiseValue: null,
    dismissedResult: null,
    sideOpen: false,
    chatBubbles: [],
    chatSeenId: -1,
    chatTimers: [],
    // 德州筹码动效：上一次看到的每家本轮注额 / 底池，用来判断谁刚推了筹码
    chipPrev: {},
    chipPot: 0,
    chipRound: null,
    chipPulses: new Set(),
    chipPotPulse: false,
    modal: null,
    modalGame: 'doudizhu',
    profileAvatar: '🦊',
    joinCode: ''
  }
};

const lobbyEl = document.querySelector('#lobby');
const roomEl = document.querySelector('#room');
const modalRoot = document.querySelector('#modal-root');
const toastsEl = document.querySelector('#toasts');
const connBanner = document.querySelector('#conn-banner');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const fmtTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const byId = (sel) => document.querySelector(sel);

function toast(text, type = '') {
  if (!toastsEl) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = text;
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

function copyText(text) {
  const done = () => toast('已复制到剪贴板', 'gold');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    toast('复制失败，请手动选择链接', 'error');
  }
  ta.remove();
}

function gamesList() {
  return state.welcome?.games?.length ? state.welcome.games : FALLBACK_GAMES;
}
function spectatorSupported() {
  return !!state.welcome?.features?.spectator;
}
function gameDef(id) {
  return gamesList().find((g) => g.id === id) || FALLBACK_GAMES.find((g) => g.id === id) || FALLBACK_GAMES[0];
}
function myPlayer() {
  return state.room?.players.find((p) => p.seat === state.room.mySeat) || null;
}
function nameOf(seat) {
  return state.room?.players.find((p) => p.seat === seat)?.name || '—';
}
function computeActor(room) {
  const s = room?.state;
  if (!s || room.phase !== 'playing') return null;
  if (s.phase === 'declare') return s.declareTurn;
  if (s.phase === 'bury') return s.banker;
  if (s.phase === 'over') return null;
  return s.turn ?? null;
}
function phaseText(room) {
  if (room.phase === 'waiting') return '等待开局';
  if (room.phase === 'playing') return `第 ${room.roundNo} 局`;
  return `第 ${room.roundNo} 局结束`;
}
function scoreLabel(room, p) {
  if (!p) return '';
  if (room.game === 'zhajinhua' || room.game === 'texas') return `${p.score} 筹码`;
  if (room.game === 'shengji') return `打 ${p.score}`;
  return `${p.score} 分`;
}

const net = new Net({
  onMessage: onMessage,
  onStatus: (status) => {
    if (status === 'offline') {
      connBanner?.classList.remove('hidden');
    } else {
      connBanner?.classList.add('hidden');
    }
  }
});

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome': {
      state.welcome = msg;
      net.name = msg.name;
      net.avatar = msg.avatar;
      localStorage.setItem('pyh.name', msg.name);
      localStorage.setItem('pyh.avatar', msg.avatar);
      state.ui.profileAvatar = msg.avatar;
      if (state.view === 'lobby') renderLobby();
      if (state.joinFromUrl && !state.joinAttempted && !state.room) {
        state.joinAttempted = true;
        setTimeout(() => {
          if (!state.room && net.connected) net.send({ t: 'join', roomId: state.joinFromUrl });
        }, 260);
      }
      break;
    }
    case 'lobby': {
      state.lobby = msg;
      // 服务端会随 DHCP / VPN 变化推送新的局域网地址
      if (Array.isArray(msg.urls) && state.welcome) state.welcome.urls = msg.urls;
      if (state.view === 'lobby') renderLobby();
      break;
    }
    case 'room': {
      if (Date.now() < state.ignoreRoomUntil && msg.room?.id === state.leavingRoomId) return;
      if (msg.room?.id !== state.leavingRoomId) state.leavingRoomId = null;
      handleRoom(msg.room);
      break;
    }
    case 'error': {
      toast(msg.message || '操作失败', 'error');
      sfx.play('warn');
      break;
    }
    case 'notice': {
      toast(msg.message || '', 'gold');
      break;
    }
    case 'hint': {
      state.ui.selected = new Set((msg.cards || []).map(Number));
      renderGame();
      if (!msg.cards?.length) toast('没有找到能出的牌', '');
      break;
    }
    case 'profile': {
      if (state.welcome) {
        state.welcome.name = msg.name;
        state.welcome.avatar = msg.avatar;
      }
      net.updateProfile(msg.name, msg.avatar);
      state.ui.profileAvatar = msg.avatar;
      if (state.view === 'lobby') renderLobby();
      toast('资料已更新', 'gold');
      break;
    }
    case 'pong':
      break;
    default:
      break;
  }
}

/* ====================== 大厅 ====================== */
function renderLobby() {
  const w = state.welcome;
  const rooms = state.lobby?.rooms || [];
  const online = state.lobby?.online ?? 0;
  const name = w?.name || '连接中…';
  const avatar = w?.avatar || '🦊';
  const games = gamesList();
  const urls = [...new Set([...(w?.urls || []), location.origin])].filter(Boolean);

  const gameCards = games
    .map((g) => {
      const art = (GAME_ART[g.id] || []).map((c) => cardHtml(c, { xs: true })).join('');
      return `<button class="game-card" data-act="create-game" data-game="${g.id}" style="--gc:${g.color}">
        <span class="gc-top"><span class="gc-icon">${GAME_ICONS[g.id] || '🃏'}</span><span class="gc-tag">${esc(g.tag || '')}</span></span>
        <h4>${esc(g.name)}</h4><p>${esc(g.desc)}</p>
        <span class="gc-art">${art}</span>
        <span class="gc-cta">开一桌 →</span>
      </button>`;
    })
    .join('');

  const roomRows = rooms.length
    ? rooms
        .map((r) => {
          const canJoin = r.phase !== 'playing' && r.total < r.max;
          const phase = r.phase === 'waiting' ? '等待中' : r.phase === 'playing' ? '进行中' : '本局结束';
          const canWatch = spectatorSupported();
          return `<div class="room-row">
            <div class="rr-icon">${GAME_ICONS[r.game] || '🃏'}</div>
            <div class="rr-main"><b>${esc(r.gameName)} · ${r.total}/${r.max} 人</b>
              <span>房主 ${esc(r.host)} · ${r.humans} 真人${r.spectators ? ` · ${r.spectators} 观战` : ''} · ${phase} · ${esc(r.optionLabel)}</span></div>
            <div class="rr-meta"><b>${esc(r.id)}</b><br>${r.spectators ? `${r.spectators} 人观战` : r.phase === 'playing' ? '可观战' : '可加入'}</div>
            <div class="rr-actions">
              ${canJoin ? `<button class="btn sm gold-outline" data-act="room-join" data-room="${r.id}">加入</button>` : ''}
              ${canWatch ? `<button class="btn sm ghost" data-act="room-spectate" data-room="${r.id}">观战</button>` : ''}
            </div>
          </div>`;
        })
        .join('')
    : `<div class="empty"><b>还没有牌桌</b>开一桌，把房号发给朋友；也可以先加两个机器人练练手。</div>`;

  const lanUrls = urls
    .slice(0, 4)
    .map((u) => `<button class="lan-url" data-act="copy" data-copy="${esc(u)}">${esc(u)}</button>`)
    .join('');

  lobbyEl.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <img src="/assets/logo.svg" alt="牌友汇">
        <div><h1>牌友汇</h1><span>PAI YOU HUI · LAN CLUB</span></div>
      </div>
      <div class="top-actions">
        <span class="online-pill"><span class="dot"></span>${online} 人在线</span>
        <button class="user-chip" data-act="profile" title="修改昵称与头像">
          <span class="ava">${esc(avatar)}</span><b>${esc(name)}</b>
        </button>
        <button class="icon-btn" data-act="sound" title="音效">${sfx.enabled ? '🔊' : '🔇'}</button>
        <button class="btn primary" data-act="create">＋ 创建牌局</button>
      </div>
    </header>
    <main class="lobby-main">
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">局域网 · 零安装 · 即开即玩</span>
          <h2>今晚，<br><em>牌桌见。</em></h2>
          <p>同一 Wi-Fi，打开网页就能开桌。斗地主、炸金花、德州扑克、升级，和身边的朋友来一局。无需注册，无需下载。</p>
          <div class="hero-actions">
            <button class="btn primary lg" data-act="create">开一桌</button>
            <form class="join-mini" id="join-form">
              <input id="join-code" maxlength="4" placeholder="房号" value="${esc(state.ui.joinCode)}" autocomplete="off" spellcheck="false">
              <button type="submit">加入</button>
            </form>
            <button class="btn ghost" data-act="quick-join">快速加入</button>
          </div>
        </div>
        <div class="hero-art">
          <div class="hero-badge">EST. 2026 · 今夜不打烊</div>
          <div class="fan">${[ { r: 14, s: 0 }, { r: 13, s: 1 }, { r: 12, s: 2 }, { r: 11, s: 3 }, { r: 15, s: -1 } ]
            .map((c) => cardHtml(c, { lg: true }))
            .join('')}</div>
          <div class="fan-shadow"></div>
          <div class="hero-seal">牌<br>友</div>
        </div>
      </section>

      <div class="section-head"><h3>四张桌子</h3><span class="line"></span><p>选一种玩法，开桌或加入</p></div>
      <section class="game-grid">${gameCards}</section>

      <div class="section-head"><h3>正在等人</h3><span class="line"></span><p>${rooms.length} 个房间</p></div>
      <section class="room-list">${roomRows}</section>

      <section class="lan-panel">
        <div>
          <h4>📶 局域网联机</h4>
          <p>手机和电脑连同一个 Wi-Fi，在浏览器打开下面的地址。游戏数据只在这台电脑上流转，不经过外网。</p>
        </div>
        <div class="lan-urls">${lanUrls}</div>
      </section>
    </main>
    <footer class="foot">
      <span>牌友汇 · 本地娱乐，不涉及真钱</span>
      <span>${urls[0] || location.origin}</span>
    </footer>`;
  lobbyEl.classList.remove('hidden');
}

function showLobby() {
  state.view = 'lobby';
  clearChatBubbles();
  state.ui.chatSeenId = -1;
  roomEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  renderLobby();
}

/* ====================== 房间 ====================== */
function handleRoom(room) {
  if (!room) return;
  const prev = state.room;
  if (room.serverNow) state.clockOffset = room.serverNow - Date.now();
  const prevActor = prev ? computeActor(prev) : null;
  const prevPhase = prev?.phase;
  const wasSameRoom = prev && prev.id === room.id;
  state.room = room;

  if (!wasSameRoom) {
    state.ui.selected = new Set();
    state.ui.round = room.roundNo;
    state.ui.zjhCompare = false;
    state.ui.zjhRaise = false;
    state.ui.texasRaise = false;
    state.ui.raiseValue = null;
    state.ui.dismissedResult = null;
    state.ui.sideOpen = false;
    state.ui.chatSeenId = -1;
    state.ui.chipPrev = {};
    state.ui.chipRound = null;
    state.ui.chipPot = 0;
    state.ui.chipPulses = new Set();
    state.ui.chipPotPulse = false;
    clearChatBubbles();
    state.roomBuiltFor = null;
    state.view = 'room';
    lobbyEl.classList.add('hidden');
    roomEl.classList.remove('hidden');
    sfx.play('deal');
  }

  if (state.ui.round !== room.roundNo) {
    state.ui.round = room.roundNo;
    state.ui.selected = new Set();
    state.ui.zjhCompare = false;
    state.ui.zjhRaise = false;
    state.ui.texasRaise = false;
    state.ui.raiseValue = null;
    state.ui.dismissedResult = null;
  }

  const actor = computeActor(room);
  const prevGamePhase = prev?.state?.phase;
  const gamePhaseChanged = wasSameRoom && prevGamePhase && room.state?.phase && prevGamePhase !== room.state.phase;
  if (wasSameRoom && (actor !== prevActor || gamePhaseChanged)) {
    state.ui.selected = new Set();
    state.ui.zjhCompare = false;
    state.ui.zjhRaise = false;
    state.ui.texasRaise = false;
    state.ui.raiseValue = null;
  }
  if (room.phase === 'playing' && actor === room.mySeat && prevActor !== room.mySeat) {
    sfx.play('turn');
  }
  if (room.phase === 'over' && prevPhase !== 'over') {
    state.ui.dismissedResult = null;
    try {
      const res = GAME_UI[room.game]?.result(makeCtx());
      sfx.play(res?.tone === 'win' ? 'win' : res?.tone === 'lose' ? 'lose' : 'click');
    } catch {
      sfx.play('click');
    }
  }
  renderRoom();
}

function buildRoomSkeleton() {
  roomEl.innerHTML = `
    <header class="room-top">
      <button class="icon-btn back" data-act="leave" title="返回大厅">←</button>
      <div class="room-title">
        <h2 id="room-game-name">牌局</h2>
        <span class="room-code" id="room-code" data-act="invite" title="点击邀请"></span>
      </div>
      <div class="room-meta" id="room-meta"></div>
      <div class="room-actions">
        <button class="icon-btn" data-act="rules" title="玩法">?</button>
        <button class="icon-btn" data-act="invite" title="邀请好友">⇗</button>
        <button class="icon-btn" data-act="toggle-side" title="动态与聊天">☰</button>
        <button class="icon-btn" id="room-sound" data-act="sound" title="音效">${sfx.enabled ? '🔊' : '🔇'}</button>
      </div>
    </header>
    <div class="room-body">
      <div class="table-col">
        <div class="felt-wrap">
          <div class="table-felt" id="table-felt">
            <div class="felt-watermark">牌友汇</div>
            <div class="seat-layer" id="seats"></div>
            <div class="center-stage" id="center"></div>
            <div class="bottom-layer" id="bottom-layer"></div>
            <div class="trick-layer" id="trick-layer"></div>
            <div class="chip-layer" id="chip-layer"></div>
            <div id="waiting-layer"></div>
            <div id="result-layer"></div>
          </div>
          <div class="chat-layer" id="chat-layer"></div>
        </div>
        <div class="my-strip">
          <div id="my-head"></div>
          <div class="hand-area" id="hand-area"></div>
        </div>
        <div class="action-bar" id="action-bar"></div>
      </div>
      <aside class="side-panel" id="side-panel">
        <div class="side-head">
          <span class="dot"></span><b>牌桌动态</b>
          <span id="side-round" style="margin-left:auto;font-size:10px;letter-spacing:.08em"></span>
          <button class="icon-btn" data-act="toggle-side" title="收起">×</button>
        </div>
        <div class="feed" id="feed"></div>
        <div class="quick-chat">
          <button data-act="chat-quick" data-text="快点快点～">快点快点</button>
          <button data-act="chat-quick" data-text="这把我稳了">这把我稳了</button>
          <button data-act="chat-quick" data-text="好牌！">好牌！</button>
          <button data-act="chat-quick" data-text="再来一局">再来一局</button>
        </div>
        <form class="chat-form" id="chat-form">
          <input id="chat-input" maxlength="200" placeholder="说点什么…" autocomplete="off">
          <button type="submit" title="发送">➤</button>
        </form>
      </aside>
    </div>`;
}

function renderRoom() {
  const room = state.room;
  if (!room) return showLobby();
  if (state.roomBuiltFor !== room.id) {
    clearChatBubbles();
    buildRoomSkeleton();
    state.roomBuiltFor = room.id;
  }
  const q = (sel) => roomEl.querySelector(sel);
  q('#room-game-name').textContent = room.gameName;
  q('#room-code').textContent = '房间 ' + room.id;
  q('#room-meta').textContent = `${phaseText(room)} · ${room.optionLabel}${room.isSpectator ? ' · 观战' : ''}`;
  roomEl.classList.toggle('spectating', !!room.isSpectator);
  const snd = q('#room-sound');
  if (snd) snd.textContent = sfx.enabled ? '🔊' : '🔇';
  q('#side-round').textContent = `${room.phase === 'waiting' ? '等待开局' : `第 ${room.roundNo} 局`}${room.spectatorCount ? ` · ${room.spectatorCount} 观战` : ''}`;
  q('#side-panel')?.classList.toggle('open', state.ui.sideOpen);
  // 5 人以上手机屏幕放不下每个座位的筹码牌，改用中央下注列表
  q('#table-felt')?.classList.toggle('crowded', (room.players?.length || 0) >= 5);

  if (room.phase === 'waiting') renderWaiting(room);
  else renderGame(room);

  renderFeed(room);
  syncChatBubbles(room);
}

function renderWaiting(room) {
  const seats = roomEl.querySelector('#seats');
  const center = roomEl.querySelector('#center');
  const waiting = roomEl.querySelector('#waiting-layer');
  const result = roomEl.querySelector('#result-layer');
  const hand = roomEl.querySelector('#hand-area');
  const head = roomEl.querySelector('#my-head');
  const actions = roomEl.querySelector('#action-bar');
  if (seats) seats.innerHTML = '';
  if (center) center.innerHTML = '';
  const trick = roomEl.querySelector('#trick-layer');
  if (trick) trick.innerHTML = '';
  const bottom = roomEl.querySelector('#bottom-layer');
  if (bottom) bottom.innerHTML = '';
  if (result) result.innerHTML = '';
  if (hand) hand.innerHTML = '';
  if (head) {
    head.innerHTML = room.isSpectator
      ? `<div class="my-head"><div class="my-chip"><span class="ava">👁️</span><b>观战中</b><span class="score">${room.spectatorCount} 人</span></div><span class="turn-hint">等待开局</span></div>`
      : `<div class="my-head"><span class="turn-hint">等待开局</span></div>`;
  }
  if (actions) actions.innerHTML = '';
  const me = myPlayer();
  const missing = Math.max(0, room.min - room.players.length);
  const readyCount = room.players.filter((p) => p.ready).length;
  const players = room.players.length
    ? room.players
        .map((p) => `<span class="wp" data-pid="${esc(p.id)}"><span class="ava">${esc(p.avatar)}</span>${esc(p.name)}${p.isHost ? ' · 房主' : ''}
          <span class="${p.ready || p.isHost ? 'ready' : 'notready'}">${p.bot ? '机器人' : p.isHost ? '房主' : p.ready ? '已准备' : '未准备'}</span></span>`)
        .join('')
    : `<span class="wp"><span class="ava">🪑</span>暂无玩家，观战席可入座</span>`;
  const spectatorNames = (room.spectators || []).map((x) => esc(x.name)).join('、');
  const controls = room.isSpectator
    ? `<button class="btn ghost" data-act="invite">邀请好友</button>
       <button class="btn ghost" data-act="leave">退出观战</button>
       ${room.canSeat ? `<button class="btn primary" data-act="seat">参与游戏</button>` : ''}`
    : room.isHost
      ? `<button class="btn primary" data-act="start" ${room.canStart ? '' : 'disabled'}>开始游戏</button>
         <button class="btn ghost" data-act="invite">邀请好友</button>
         ${room.players.length < room.max ? `<button class="btn ghost sm" data-act="add-bot">＋ 添加机器人</button>` : ''}
         ${room.players.some((p) => p.bot) ? `<button class="btn ghost sm" data-act="remove-bot">移除机器人</button>` : ''}`
      : `<button class="btn ${me?.ready ? 'ghost' : 'primary'}" data-act="ready">${me?.ready ? '取消准备' : '我已准备'}</button>
         <button class="btn ghost" data-act="invite">邀请好友</button>`;
  if (waiting) {
    waiting.innerHTML = `<div class="waiting-panel">
      <div class="eyebrow">ROOM ${esc(room.id)}</div>
      <h3>${esc(room.gameName)}</h3>
      <p>${esc(room.gameDesc)}<br>${
        room.isSpectator
          ? `你正在观战，可以聊天。${room.canSeat ? '牌桌有空位，可直接参与游戏。' : '本局进行中，结束后可入座。'}`
          : missing > 0
            ? `还差 ${missing} 人开局，可邀请好友或添加机器人`
            : `已 ${readyCount} 人准备，房主可开始`
      }</p>
      <div class="waiting-players">${players}</div>
      ${spectatorNames ? `<p style="margin:0 0 12px;font-size:10px;color:var(--muted)">👁️ 正在观战：${spectatorNames}</p>` : ''}
      <div class="waiting-actions">${controls}</div>
      <p style="margin-top:12px;font-size:10px">房号 <b class="gold">${esc(room.id)}</b> · 同一 Wi-Fi 输入房号即可加入/观战</p>
    </div>`;
  }
}

function makeCtx() {
  const room = state.room;
  return {
    room,
    s: room?.state || {},
    mySeat: room?.mySeat,
    isSpectator: !!room?.isSpectator,
    ui: state.ui,
    selected: state.ui.selected,
    esc,
    nameOf,
    actor: computeActor(room),
    card: (c, opts = {}) => cardHtml(c, { selected: state.ui.selected.has(c.id), ...opts })
  };
}

function spectatorBar(room) {
  return `<div class="status">👁️ 你正在观战 · ${room.spectatorCount || 0} 人观战</div>
    ${room.matchNote ? `<span class="status match-note">${esc(room.matchNote)}</span>` : ''}
    <span class="timer-ring" id="turn-timer"></span>
    ${room.phase === 'over' ? `<button class="btn ghost sm" data-act="show-result">查看结果</button>` : ''}
    ${room.canSeat ? `<button class="btn primary sm" data-act="seat">参与游戏</button>` : ''}
    <button class="btn ghost sm" data-act="invite">邀请好友</button>
    <button class="btn ghost sm" data-act="leave">退出观战</button>`;
}

function actionsMarkup(room) {
  if (!room) return '';
  const UI = GAME_UI[room.game];
  if (!UI) return '';
  if (room.phase === 'over') {
    if (state.ui.dismissedResult === room.roundNo) {
      return room.isSpectator ? spectatorBar(room) : nextRoundBar(room);
    }
    if (room.matchNote) return `<div class="status match-note">${esc(room.matchNote)}</div>`;
    return `<div class="status">本局结束 · ${room.isSpectator ? '观战中' : room.isHost ? '你可以开始下一局' : '等待房主开始下一局'}</div>`;
  }
  return room.isSpectator ? spectatorBar(room) : UI.renderActions(makeCtx());
}

function renderActionBar() {
  const room = state.room;
  if (!room) return;
  const el = roomEl.querySelector('#action-bar');
  if (el) el.innerHTML = actionsMarkup(room);
}

// 手牌铺开：按可用宽度收紧牌距，尽量让整手牌在一屏内看全，方便滑选
function fitHand(hand) {
  if (!hand) return;
  const cards = hand.querySelectorAll('.pcard');
  if (!cards.length) return;
  const cw = cards[0].getBoundingClientRect().width;
  if (!cw) return;
  const rows = hand.classList.contains('two-rows') ? [...hand.querySelectorAll('.hand-row')] : [];
  const perRow = rows.length ? Math.max(...rows.map((r) => r.querySelectorAll('.pcard').length)) : cards.length;
  const avail = Math.max(120, hand.clientWidth - 12);
  const preferred = cw * 0.5;
  const tight = perRow > 1 ? (avail - cw) / (perRow - 1) : preferred;
  const stride = Math.max(9, Math.min(preferred, tight));
  hand.style.setProperty('--stride', `${stride.toFixed(2)}px`);
  hand.classList.toggle('packed', stride < 13);
}

function fitCurrentHand() {
  const hand = roomEl.querySelector('#hand-area .hand');
  if (hand) fitHand(hand);
}

// 对比上一次牌桌状态，找出刚增加注额的玩家和底池增量（只在德州使用）
function trackChipFx(room) {
  const empty = { flights: [], potGain: 0 };
  const s = room.state;
  if (room.game !== 'texas' || room.phase !== 'playing' || !s) {
    state.ui.chipPrev = {};
    state.ui.chipRound = room.roundNo;
    state.ui.chipPot = Number(s?.pot) || 0;
    state.ui.chipPulses = new Set();
    state.ui.chipPotPulse = false;
    return empty;
  }
  if (state.ui.chipRound !== room.roundNo) {
    // 新一局：盲注已在桌上，先建立基线，不做整桌飞筹码
    state.ui.chipRound = room.roundNo;
    state.ui.chipPrev = {};
    for (const p of s.players || []) state.ui.chipPrev[p.seat] = Number(p.bet) || 0;
    state.ui.chipPot = Number(s.pot) || 0;
    state.ui.chipPulses = new Set();
    state.ui.chipPotPulse = false;
    return empty;
  }
  const prevPot = state.ui.chipPot || 0;
  const pot = Number(s.pot) || 0;
  const pulses = new Set();
  const flights = [];
  for (const p of s.players || []) {
    const before = state.ui.chipPrev[p.seat] ?? 0;
    const bet = Number(p.bet) || 0;
    if (bet > before) {
      pulses.add(p.seat);
      flights.push({ seat: p.seat, delta: bet - before });
    }
    state.ui.chipPrev[p.seat] = bet;
  }
  state.ui.chipPulses = pulses;
  state.ui.chipPotPulse = pot > prevPot;
  state.ui.chipPot = pot;
  return { flights, potGain: Math.max(0, pot - prevPot) };
}

// 把新增筹码从玩家头像抛向底池，并在底池上方飘一个 +N
function spawnChipFx(room, fx) {
  if (!fx || (!fx.flights.length && !fx.potGain)) return;
  let reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduceMotion = false;
  }
  if (reduceMotion) return;
  const felt = roomEl.querySelector('#table-felt');
  const layer = roomEl.querySelector('#chip-layer');
  const potEl = roomEl.querySelector('#center .pot');
  if (!felt || !layer || !potEl) return;
  const fRect = felt.getBoundingClientRect();
  const potRect = potEl.getBoundingClientRect();
  const endX = potRect.left - fRect.left + potRect.width / 2;
  const endY = potRect.top - fRect.top + potRect.height / 2;
  const seats = [...felt.querySelectorAll('.seat')];
  const anchorOf = (seat) => {
    if (room.mySeat === seat) return roomEl.querySelector('#my-head .my-chip .ava') || roomEl.querySelector('#my-head');
    const p = (room.state?.players || []).find((x) => x.seat === seat);
    if (!p) return null;
    return seats.find((el) => el.dataset.pid === String(p.id))?.querySelector('.avatar') || null;
  };

  fx.flights.forEach((f, i) => {
    const anchor = anchorOf(f.seat);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const sx = r.left - fRect.left + r.width / 2;
    const sy = r.top - fRect.top + r.height / 2;
    const dx = endX - sx;
    const dy = endY - sy;
    const arc = Math.min(46, Math.abs(dx) * 0.16 + 16);
    const el = document.createElement('span');
    el.className = 'chip-fly';
    el.innerHTML = chipStackHtml(f.delta, { max: 1 });
    layer.appendChild(el);
    if (typeof el.animate !== 'function') {
      el.remove();
      return;
    }
    const anim = el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(.7)`, opacity: 0 },
        { transform: `translate(${sx + dx * 0.45}px, ${sy + dy * 0.35 - arc}px) scale(1.15)`, opacity: 1, offset: 0.38 },
        { transform: `translate(${endX}px, ${endY}px) scale(.55)`, opacity: 0.85 }
      ],
      { duration: 520, delay: i * 45, easing: 'cubic-bezier(.22,.68,.3,1)', fill: 'backwards' }
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  });

  if (fx.potGain > 0) {
    const gain = document.createElement('span');
    gain.className = 'pot-gain';
    gain.textContent = `+${fx.potGain}`;
    potEl.appendChild(gain);
    gain.addEventListener('animationend', () => gain.remove(), { once: true });
  }
  if (fx.flights.length) sfx.play('chip');
}

function renderGame() {
  const room = state.room;
  if (!room) return;
  const ctx = makeCtx();
  const UI = GAME_UI[room.game];
  if (!UI) return;
  const chipFx = trackChipFx(room);
  // 服务端刷新后手牌可能变化，清掉已不存在的选中项
  if (state.ui.selected.size) {
    const ids = new Set((room.state?.hand || []).map((c) => c.id));
    for (const id of [...state.ui.selected]) if (!ids.has(id)) state.ui.selected.delete(id);
  }
  const q = (sel) => roomEl.querySelector(sel);
  const seatsEl = q('#seats');
  const centerEl = q('#center');
  const waitingEl = q('#waiting-layer');
  const resultEl = q('#result-layer');
  const headEl = q('#my-head');
  const handEl = q('#hand-area');
  const actionsEl = q('#action-bar');
  if (waitingEl) waitingEl.innerHTML = '';
  if (seatsEl) seatsEl.innerHTML = buildSeats(ctx);
  if (centerEl) centerEl.innerHTML = UI.renderCenter(ctx);
  const bottomEl = q('#bottom-layer');
  if (bottomEl) {
    if (room.game === 'doudizhu' && room.state?.bottom?.length) {
      bottomEl.innerHTML = `<div class="top-bottom${room.isSpectator ? ' at-bottom' : ''}"><span class="stage-sub">底牌</span><div class="card-row">${room.state.bottom
        .map((c) => cardHtml(c, { small: true }))
        .join('')}</div></div>`;
    } else {
      bottomEl.innerHTML = '';
    }
  }
  const trickEl = q('#trick-layer');
  if (trickEl) {
    const plays = UI.trickPlays?.(ctx) || [];
    if (plays.length) {
      const positions = seatPositions(room);
      const over = !!room.state?.trickOver;
      trickEl.innerHTML = plays
        .map((p) => {
          const [x, y] = playSpotPos(room, p.seat, positions);
          const cls = ['trick-play', p.pass ? 'pass' : '', p.current ? 'current' : '', p.me ? 'me' : '', over ? 'over' : '']
            .filter(Boolean)
            .join(' ');
          return `<div class="${cls}" style="left:${x}%;top:${y}%">${p.html}</div>`;
        })
        .join('');
    } else {
      trickEl.innerHTML = '';
    }
  }
  if (headEl) headEl.innerHTML = room.isSpectator ? '' : buildMyHead(ctx);
  if (handEl) {
    if (room.isSpectator) {
      handEl.innerHTML = `<div class="spectator-note">👁️ 观战模式 · 你可以看到公共牌局并使用右侧聊天区${room.canSeat ? ' · 牌桌有空位，可参与游戏' : ''}</div>`;
    } else {
      handEl.innerHTML = UI.renderHand(ctx);
      fitHand(handEl.querySelector('.hand'));
    }
  }
  if (actionsEl) actionsEl.innerHTML = actionsMarkup(room);
  if (resultEl) {
    if (room.phase === 'over' && state.ui.dismissedResult !== room.roundNo) {
      resultEl.innerHTML = buildResult(ctx, UI);
    } else {
      resultEl.innerHTML = '';
    }
  }
  if (chipFx.flights.length || chipFx.potGain) {
    requestAnimationFrame(() => spawnChipFx(room, chipFx));
  }
}

function seatMarkup(p, x, y, ctx) {
  const room = ctx.room;
  let info = {};
  try {
    info = GAME_UI[room.game]?.seatInfo?.(p.seat, ctx) || {};
  } catch {
    info = {};
  }
  const sp = room.state?.players?.find((x2) => x2.seat === p.seat);
  const folded = !!sp?.folded;
  const isTurn = ctx.actor === p.seat;
  const bet = Number(info.bet) || 0;
  const chipPulse = bet > 0 && state.ui.chipPulses?.has(p.seat) ? ' pulse' : '';
  const cls = ['seat', isTurn ? 'turn' : '', !p.connected && !p.bot ? 'offline' : '', folded ? 'folded' : ''].join(' ');
  const hostBadge = p.isHost ? '<span class="mini">房主</span>' : '';
  const countBadge = info.count !== undefined && info.count !== null ? `<span class="count-badge">${info.count}</span>` : '';
  return `<div class="${cls}" data-pid="${esc(p.id)}" style="left:${x}%;top:${y}%">
    <div class="ava-wrap">
      <div class="avatar">${esc(p.avatar)}${hostBadge}${countBadge}</div>
      ${folded ? '<span class="fold-stamp">弃牌</span>' : ''}
    </div>
    <div class="name">${esc(p.name)}${p.bot ? ' · 托管' : !p.connected ? ' · 离线' : ''}</div>
    <div class="sub">${esc(info.sub || scoreLabel(room, p))}</div>
    ${info.tag ? `<span class="tag ${esc(info.tagClass || '')}">${esc(info.tag)}</span>` : ''}
    ${
      bet > 0
        ? `<div class="seat-bet${chipPulse}${info.allin ? ' allin' : ''}${folded ? ' folded' : ''}" title="本轮下注 ${bet}${info.contrib ? ` · 本局已投 ${info.contrib}` : ''}">
            <span class="chip-stack">${chipStackHtml(bet, { max: 4 })}</span><b>${bet}</b>
          </div>`
        : ''
    }
    ${info.cards ? `<div class="seat-cards">${backsHtml(info.cards, { xs: true })}</div>` : ''}
  </div>`;
}

// 座位坐标：玩家视角按自己的下家顺序排，观战视角围成一圈
function seatPositions(room) {
  const map = new Map();
  if (room.isSpectator) {
    const players = room.players.slice().sort((a, b) => a.seat - b.seat);
    const pos = spectatorPositions(players.length);
    players.forEach((p, i) => map.set(p.seat, pos[i] || [50, 50]));
    return map;
  }
  const n = room.players.length;
  const my = room.mySeat;
  const opponents = room.players
    .filter((p) => p.seat !== my)
    .sort((a, b) => ((a.seat - my + n) % n) - ((b.seat - my + n) % n));
  const pos = POSITIONS[opponents.length] || [];
  opponents.forEach((p, i) => map.set(p.seat, pos[i] || [10 + i * 12, 20]));
  return map;
}

// 出牌位置：正对出牌人前方（上家在下、下家在上，侧面座位朝桌心）
function playSpotPos(room, seat, positions) {
  if (!room.isSpectator && seat === room.mySeat) return [50, 80];
  const [x, y] = positions.get(seat) || [50, 50];
  let dx = 0;
  if (y >= 35 && y <= 65) {
    if (x < 40) dx = 16;
    else if (x > 60) dx = -16;
  }
  const dy = y < 50 ? 22 : -22;
  return [Math.max(10, Math.min(90, x + dx)), Math.max(10, Math.min(90, y + dy))];
}

function buildSeats(ctx) {
  const room = ctx.room;
  const positions = seatPositions(room);
  const out = [];
  for (const [seat, [x, y]] of positions) {
    const p = room.players.find((pp) => pp.seat === seat);
    if (p) out.push(seatMarkup(p, x, y, ctx));
  }
  return out.join('');
}

function buildMyHead(ctx) {
  const room = ctx.room;
  const me = myPlayer();
  if (!me && room.isSpectator) {
    const actor = ctx.actor;
    const turnText =
      room.phase === 'over'
        ? '本局结束'
        : actor !== null && actor !== undefined
          ? `等待 ${nameOf(actor)}`
          : '等待开局';
    return `<div class="my-head">
      <div class="my-chip"><span class="ava">👁️</span><b>观战中</b>
        <span class="score">${room.spectatorCount || 0} 人</span>
        <span class="tag gold">观战</span>
      </div>
      <span class="turn-hint">${esc(turnText)}</span>
      <span class="timer-ring" id="turn-timer"></span>
    </div>`;
  }
  if (!me) return '';
  let info = {};
  try {
    info = GAME_UI[room.game]?.seatInfo?.(room.mySeat, ctx) || {};
  } catch {
    info = {};
  }
  const actor = ctx.actor;
  const s = room.state;
  const engineMe = s?.players?.find((x) => x.seat === room.mySeat);
  const myBet =
    room.game === 'texas' && engineMe?.bet > 0
      ? `<span class="my-bet${state.ui.chipPulses?.has(room.mySeat) ? ' pulse' : ''}" title="本轮下注 ${engineMe.bet}${engineMe.contrib ? ` · 本局已投 ${engineMe.contrib}` : ''}">
          <span class="chip-stack">${chipStackHtml(engineMe.bet, { max: 3 })}</span><b>${engineMe.bet}</b></span>`
      : '';
  let turnText = '';
  if (room.phase === 'over') turnText = '本局结束';
  else if (room.phase === 'waiting') turnText = '等待开局';
  else if (actor === room.mySeat) {
    turnText = s?.phase === 'declare' ? '轮到你亮主' : s?.phase === 'bury' ? '轮到你扣底' : '轮到你行动';
  } else if (actor !== null && actor !== undefined) {
    turnText = `等待 ${nameOf(actor)}`;
  }
  return `<div class="my-head">
    <div class="my-chip"><span class="ava">${esc(me.avatar)}</span><b>${esc(me.name)}</b>
      <span class="score">${scoreLabel(room, me)}</span>
      ${myBet}
      ${info.tag ? `<span class="tag ${esc(info.tagClass || '')}">${esc(info.tag)}</span>` : ''}
    </div>
    <span class="turn-hint ${actor === room.mySeat ? 'active' : ''}">${esc(turnText)}</span>
    <span class="timer-ring" id="turn-timer"></span>
  </div>`;
}

function nextRoundBar(room) {
  const me = myPlayer();
  if (room.isHost) {
    return `<button class="btn primary" data-act="start" ${room.canStart ? '' : 'disabled'}>开始下一局</button>
      <button class="btn ghost" data-act="show-result">查看结果</button>
      ${room.players.length < room.max ? `<button class="btn ghost sm" data-act="add-bot">＋ 机器人</button>` : ''}
      ${room.matchNote ? `<span class="status match-note">${esc(room.matchNote)}</span>` : `<span class="status">房主可直接开下一局</span>`}`;
  }
  return `<button class="btn ${me?.ready ? 'ghost' : 'primary'}" data-act="ready">${me?.ready ? '取消准备' : '准备下一局'}</button>
    <button class="btn ghost" data-act="show-result">查看结果</button>
    ${room.matchNote ? `<span class="status match-note">${esc(room.matchNote)}</span>` : `<span class="status">${me?.ready ? '已准备，等待房主开局' : '全员准备后自动开局'}</span>`}`;
}

function buildResult(ctx, UI) {
  let res;
  try {
    res = UI.result(ctx);
  } catch {
    res = { title: '本局结束', subtitle: '', stats: [], body: '' };
  }
  const room = ctx.room;
  const me = myPlayer();
  const stats = (res.stats || [])
    .map((st) => `<div class="res-stat"><span>${esc(st.label)}</span><b>${st.value}</b></div>`)
    .join('');
  return `<div class="result-layer">
    <div class="result-card">
      <button class="icon-btn result-dismiss" data-act="dismiss-result" title="查看牌桌">×</button>
      <div class="eyebrow">ROUND ${room.roundNo}</div>
      <h3>${res.title || '本局结束'}</h3>
      <div class="res-sub">${res.subtitle || ''}</div>
      ${room.matchNote ? `<div class="res-note">${esc(room.matchNote)}</div>` : ''}
      ${stats ? `<div class="res-stats">${stats}</div>` : ''}
      ${res.body || ''}
      <div class="res-actions">
        ${room.isSpectator
          ? `${room.canSeat ? `<button class="btn primary" data-act="seat">参与游戏</button>` : ''}
             <button class="btn ghost" data-act="dismiss-result">查看牌桌</button>
             <button class="btn ghost" data-act="leave">退出观战</button>`
          : `${room.isHost
              ? `<button class="btn primary" data-act="start" ${room.canStart ? '' : 'disabled'}>开始下一局</button>`
              : `<button class="btn ${me?.ready ? 'ghost' : 'primary'}" data-act="ready">${me?.ready ? '取消准备' : '准备下一局'}</button>`}
             ${room.isHost && room.players.length < room.max ? `<button class="btn ghost" data-act="add-bot">＋ 机器人</button>` : ''}
             <button class="btn ghost" data-act="dismiss-result">查看牌桌</button>`}
      </div>
    </div>
  </div>`;
}

function renderFeed(room) {
  const feed = roomEl.querySelector('#feed');
  if (!feed) return;
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  const items = room.feed || [];
  if (!items.length) {
    feed.innerHTML = `<div class="feed-item system">牌局动态会显示在这里。输入房号邀请朋友，或添加机器人先练手。</div>`;
    return;
  }
  feed.innerHTML = items
    .map((it) => {
      if (it.type === 'chat') {
        return `<div class="feed-item chat"><span class="who">${esc(it.name || '')}</span>${esc(it.text)}<span class="time">${fmtTime(it.t)}</span></div>`;
      }
      if (it.type === 'system') return `<div class="feed-item system">${esc(it.text)}</div>`;
      return `<div class="feed-item log">${esc(it.text)}</div>`;
    })
    .join('');
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
}

/* ====================== 牌桌上的聊天气泡 ====================== */
const CHAT_BUBBLE_MS = 3000;

function clearChatBubbles() {
  for (const b of state.ui.chatBubbles) clearTimeout(b.timer);
  state.ui.chatBubbles = [];
  const layer = roomEl.querySelector('#chat-layer');
  if (layer) layer.innerHTML = '';
}

function removeChatBubble(el) {
  const i = state.ui.chatBubbles.findIndex((b) => b.el === el);
  if (i >= 0) {
    clearTimeout(state.ui.chatBubbles[i].timer);
    state.ui.chatBubbles.splice(i, 1);
  }
  el.remove();
}

// 只把新收到的聊天显示成气泡；刚进房间时把历史记录标记为已读，重连时只补最近 10 秒的消息，避免刷屏。
function syncChatBubbles(room) {
  const layer = roomEl.querySelector('#chat-layer');
  if (!layer) return;
  const feed = room.feed || [];
  const maxId = feed.reduce((m, it) => Math.max(m, it.id || 0), 0);
  if (state.ui.chatSeenId < 0) {
    state.ui.chatSeenId = maxId;
    return;
  }
  const fresh = feed.filter((it) => it.type === 'chat' && (it.id || 0) > state.ui.chatSeenId);
  state.ui.chatSeenId = Math.max(state.ui.chatSeenId, maxId);
  if (!fresh.length) return;
  const now = Date.now() + (state.clockOffset || 0);
  for (const it of fresh) {
    if (now - it.t > 10000) continue;
    showChatBubble(room, it);
  }
}

function showChatBubble(room, it) {
  const layer = roomEl.querySelector('#chat-layer');
  if (!layer) return;
  const by = String(it.by || '');
  for (const b of [...state.ui.chatBubbles]) {
    if (b.by === by) removeChatBubble(b.el);
  }
  const sender = (room.players || []).find((p) => String(p.id) === by);
  const isSpectator = !sender && (room.spectators || []).some((x) => String(x.id) === by);
  const isSelf = !!sender?.isMe || (isSpectator && (room.spectators || []).some((x) => x.isMe && String(x.id) === by));
  const el = document.createElement('div');
  el.className = `chat-bubble${isSelf ? ' mine' : ''}${isSpectator ? ' spectator' : ''}`;
  el.dataset.by = by;
  el.innerHTML =
    `<b class="cb-who">${esc(isSelf ? '我' : it.name || '玩家')}${isSpectator ? ' · 观战' : ''}</b>` +
    `<span class="cb-text">${esc(it.text || '')}</span>`;
  layer.appendChild(el);
  positionChatBubble(el, room, { sender: sender || null, isSpectator, isSelf });
  const timer = setTimeout(() => removeChatBubble(el), CHAT_BUBBLE_MS);
  state.ui.chatBubbles.push({ by, el, timer });
}

function positionChatBubble(el, room, { sender, isSpectator, isSelf }) {
  const felt = roomEl.querySelector('#table-felt');
  const feltRect = felt.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const gap = 8;
  let left = feltRect.width / 2;
  let top = feltRect.height - gap;
  let above = true;

  // 等待阶段牌桌中心是等待面板，气泡不按座位定位，避免挡住邀请/开始按钮。
  let anchor = null;
  if (room.phase !== 'waiting') {
    if (isSelf) {
      anchor = roomEl.querySelector('#my-head .my-chip');
    } else if (sender) {
      anchor = [...felt.querySelectorAll('.seat')].find((n) => n.dataset.pid === String(sender.id)) || null;
    }
  }

  if (anchor) {
    const r = anchor.getBoundingClientRect();
    const av = anchor.querySelector('.avatar, .ava');
    const ar = av ? av.getBoundingClientRect() : r;
    left = r.left - feltRect.left + r.width / 2;
    top = ar.top - feltRect.top - gap;
    if (top - box.height < 4) {
      // 上方放不下时，落到整个座位块下方，避免盖住玩家昵称和筹码。
      top = r.bottom - feltRect.top + gap;
      above = false;
    }
  } else if (isSpectator && !isSelf && room.phase !== 'waiting') {
    const stack = state.ui.chatBubbles.filter((b) => b.el.classList.contains('spectator')).length;
    left = 14 + box.width / 2;
    top = feltRect.height - gap - stack * (box.height + 6);
  } else if (room.phase === 'waiting') {
    // 等待面板占据牌桌中央：桌面端把气泡放在上方居中，窄屏放到左上角，避免遮住标题和按钮。
    const stack = state.ui.chatBubbles.length;
    left = feltRect.width >= 600 ? feltRect.width / 2 : 8 + box.width / 2;
    top = 64 + stack * (box.height + 6);
  } else {
    const stack = state.ui.chatBubbles.filter((b) => !b.el.classList.contains('spectator')).length;
    top = feltRect.height - gap - stack * (box.height + 6);
  }

  const half = box.width / 2;
  left = Math.max(half + 6, Math.min(feltRect.width - half - 6, left));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.classList.toggle('below', !above);
}

/* ====================== 弹窗 ====================== */
function closeModal() {
  modalRoot.innerHTML = '';
  state.ui.modal = null;
}

function openModal(html, kind = '') {
  state.ui.modal = kind;
  modalRoot.innerHTML = `<div class="modal-backdrop">${html}</div>`;
}

function openCreateModal(game = 'doudizhu') {
  state.ui.modalGame = game;
  const g = gameDef(game);
  const picker = gamesList()
    .map((x) => `<button type="button" class="game-pick ${x.id === game ? 'active' : ''}" data-act="modal-game" data-game="${x.id}">
      <span class="gp-icon">${GAME_ICONS[x.id] || '🃏'}</span><b>${esc(x.name)}</b><small>${esc(x.tag || '')}</small></button>`)
    .join('');
  const fields = optionFields(game);
  openModal(`<div class="modal">
    <button class="icon-btn modal-close" data-act="modal-close">×</button>
    <h3>开一桌</h3>
    <p class="modal-sub">${esc(g.desc)} · ${g.min === g.max ? `${g.min} 人` : `${g.min}–${g.max} 人`}。创建后把房号发给朋友，或添加机器人。</p>
    <form id="create-form">
      <div class="game-picker">${picker}</div>
      ${fields}
      <div class="form-hint">同一 Wi-Fi 下，手机/电脑打开局域网地址，输入房号即可加入。</div>
      <button class="btn primary block lg" type="submit" style="margin-top:16px">创建房间</button>
    </form>
  </div>`, 'create');
}

function optionFields(game) {
  if (game === 'zhajinhua') {
    return `<div class="form-row">
      <div><label>底注</label><select name="ante"><option value="5">5</option><option value="10" selected>10</option><option value="20">20</option><option value="50">50</option></select></div>
      <div><label>封顶倍数</label><select name="capMult"><option value="10">10 倍（稳健）</option><option value="20" selected>20 倍（标准）</option><option value="30">30 倍（刺激）</option></select></div>
    </div>
    <div class="form-field"><label>初始筹码</label><select name="startChips"><option value="500">500</option><option value="1000" selected>1000</option><option value="2000">2000</option><option value="5000">5000</option></select></div>`;
  }
  if (game === 'texas') {
    return `<div class="form-row">
      <div><label>盲注</label><select name="bigBlind"><option value="10">5 / 10</option><option value="20" selected>10 / 20</option><option value="50">25 / 50</option><option value="100">50 / 100</option></select></div>
      <div><label>初始筹码</label><select name="startChips"><option value="1000">1000</option><option value="2000" selected>2000</option><option value="5000">5000</option><option value="10000">10000</option></select></div>
    </div>`;
  }
  if (game === 'shengji') {
    return `<div class="form-field"><label>赛制</label><input type="text" value="四人两队 · 从 2 打起 · 过 A 获胜" readonly></div>
      <div class="form-hint">南北一队、东西一队。亮主决定主牌花色，庄家收底后扣 8 张；闲家抢 80 分。</div>`;
  }
  return `<div class="form-field"><label>玩法</label><input type="text" value="三人经典 · 叫分 1/2/3 · 炸弹翻倍" readonly></div>
    <div class="form-hint">需要正好 3 人。房主可以先加两个机器人开局。</div>`;
}

function openProfileModal() {
  const w = state.welcome;
  state.ui.profileAvatar = w?.avatar || '🦊';
  openModal(`<div class="modal">
    <button class="icon-btn modal-close" data-act="modal-close">×</button>
    <h3>你的牌桌名片</h3>
    <p class="modal-sub">昵称与头像只保存在这台设备上，随时可改。</p>
    <form id="profile-form">
      <div class="form-field"><label>昵称</label><input id="profile-name" name="name" type="text" maxlength="12" value="${esc(w?.name || '')}" autocomplete="off"></div>
      <label>头像</label>
      <div class="avatar-grid">${AVATARS.map((a) => `<button type="button" class="avatar-pick ${a === state.ui.profileAvatar ? 'active' : ''}" data-act="avatar-pick" data-avatar="${a}">${a}</button>`).join('')}</div>
      <button class="btn primary block" type="submit">保存</button>
    </form>
  </div>`, 'profile');
}

function openInviteModal() {
  const room = state.room;
  const bases = [...new Set([...(state.welcome?.urls || []), location.origin])].filter(Boolean);
  const links = bases.map((u) => `${u.replace(/\/$/, '')}/?room=${room?.id || ''}`);
  const code = room?.id || '——';
  openModal(`<div class="modal">
    <button class="icon-btn modal-close" data-act="modal-close">×</button>
    <h3>叫人来打牌</h3>
    <p class="modal-sub">房间号 <b class="gold" style="font-family:ui-monospace,monospace;letter-spacing:.2em">${esc(code)}</b>。同一 Wi-Fi 下，用手机浏览器打开下面任意链接，或在新页面输入房号。</p>
    <div class="form-field"><label>邀请链接</label>
      ${links.map((u) => `<div class="row" style="margin-bottom:8px"><input type="text" readonly value="${esc(u)}" style="flex:1"><button type="button" class="btn sm gold-outline" data-act="copy" data-copy="${esc(u)}">复制</button></div>`).join('')}
    </div>
    <div class="form-hint">如果手机打不开，请确认手机与电脑在同一局域网，并允许系统防火墙放行 Node 进程。也可以让朋友输入房间号 ${esc(code)}。</div>
  </div>`, 'invite');
}

function openRulesModal(game) {
  const g = gameDef(game);
  openModal(`<div class="modal wide">
    <button class="icon-btn modal-close" data-act="modal-close">×</button>
    <div class="eyebrow">RULES</div>
    <h3>${esc(g.name)} · 玩法</h3>
    <div class="rules-body">${RULES[game] || ''}</div>
  </div>`, 'rules');
}

/* ====================== 操作 ====================== */
function sendAction(action) {
  if (!net.connected) {
    toast('连接已断开，正在重连…', 'error');
    return false;
  }
  sfx.play('click');
  net.send({ t: 'action', action });
  return true;
}

function selectionLimit() {
  const room = state.room;
  const s = room?.state;
  if (room?.game === 'shengji' && s?.phase === 'bury' && s.banker === room.mySeat) return 8;
  return Infinity;
}

// 只更新选中态与操作栏，不重绘整手牌：滑选时不闪、不丢滚动位置
function paintSelection() {
  const area = roomEl.querySelector('#hand-area');
  if (area) {
    for (const el of area.querySelectorAll('.pcard[data-cid]')) {
      el.classList.toggle('selected', state.ui.selected.has(Number(el.dataset.cid)));
    }
  }
  renderActionBar();
}

function applySelection(next, { sound = false } = {}) {
  const hand = state.room?.state?.hand || [];
  const valid = new Set(hand.map((c) => c.id));
  const clean = new Set([...next].map(Number).filter((id) => valid.has(id)));
  const same = clean.size === state.ui.selected.size && [...clean].every((id) => state.ui.selected.has(id));
  state.ui.selected = clean;
  if (same) return false;
  paintSelection();
  if (sound) sfx.play('click');
  return true;
}

function clearSelection(opts = {}) {
  if (!state.ui.selected.size) return;
  applySelection(new Set(), opts);
}

function handleAct(act, el) {
  const ds = el?.dataset || {};
  const spectatorBlocked = new Set([
    'ready', 'start', 'add-bot', 'remove-bot', 'bid', 'play', 'pass', 'hint', 'look',
    'call', 'fold', 'check', 'allin', 'zjh-raise-open', 'zjh-compare-open', 'zjh-cancel',
    'compare-target', 'texas-raise-open', 'texas-cancel', 'raise-preset', 'raise-confirm',
    'declare', 'nt', 'declare-pass', 'bury', 'clear-select'
  ]);
  if (state.room?.isSpectator && spectatorBlocked.has(act)) {
    toast('观战中不能操作牌局，可以聊天或参与游戏', 'error');
    return;
  }
  switch (act) {
    case 'modal-close':
      closeModal();
      return;
    case 'create':
      openCreateModal(state.ui.modalGame || 'doudizhu');
      return;
    case 'create-game':
      openCreateModal(ds.game || 'doudizhu');
      return;
    case 'modal-game':
      openCreateModal(ds.game || 'doudizhu');
      return;
    case 'profile':
      openProfileModal();
      return;
    case 'avatar-pick': {
      state.ui.profileAvatar = ds.avatar || '🦊';
      modalRoot.querySelectorAll('.avatar-pick').forEach((b) => b.classList.toggle('active', b.dataset.avatar === state.ui.profileAvatar));
      return;
    }
    case 'rules':
      openRulesModal(ds.game || state.room?.game || 'doudizhu');
      return;
    case 'invite':
      openInviteModal();
      return;
    case 'copy':
      copyText(el.getAttribute('data-copy') || '');
      return;
    case 'sound':
      sfx.toggle();
      renderIfPossible();
      return;
    case 'toggle-side':
      state.ui.sideOpen = !state.ui.sideOpen;
      roomEl.querySelector('#side-panel')?.classList.toggle('open', state.ui.sideOpen);
      return;
    case 'leave': {
      if (state.room?.phase === 'playing' && !state.room.isSpectator && !confirm('离开后本局将由机器人托管，确定离开？')) return;
      state.leavingRoomId = state.room?.id || null;
      state.ignoreRoomUntil = Date.now() + 900;
      net.send({ t: 'leave' });
      state.room = null;
      state.roomBuiltFor = null;
      state.ui.selected = new Set();
      showLobby();
      return;
    }
    case 'room-join': {
      if (ds.room) net.send({ t: 'join', roomId: ds.room });
      return;
    }
    case 'room-spectate': {
      if (!spectatorSupported()) {
        toast('观战功能需要重启服务后启用', 'gold');
        return;
      }
      if (ds.room) net.send({ t: 'spectate', roomId: ds.room });
      return;
    }
    case 'seat': {
      net.send({ t: 'seat' });
      return;
    }
    case 'quick-join': {
      const rooms = state.lobby?.rooms || [];
      const room = rooms.find((r) => r.phase !== 'playing' && r.total < r.max);
      if (room) net.send({ t: 'join', roomId: room.id });
      else if (rooms.length && spectatorSupported()) net.send({ t: 'spectate', roomId: rooms[0].id });
      else toast('暂时没有可加入的房间，先开一桌吧');
      return;
    }
    case 'ready': {
      const me = myPlayer();
      if (!me) return;
      net.send({ t: 'ready', value: !me.ready });
      return;
    }
    case 'start':
      net.send({ t: 'start' });
      return;
    case 'add-bot':
      net.send({ t: 'addBot' });
      return;
    case 'remove-bot':
      net.send({ t: 'removeBot' });
      return;
    case 'chat-quick':
      net.send({ t: 'chat', text: ds.text || '' });
      return;
    case 'dismiss-result':
      state.ui.dismissedResult = state.room?.roundNo;
      renderRoom();
      return;
    case 'show-result':
      state.ui.dismissedResult = null;
      renderRoom();
      return;
    case 'clear-select':
      clearSelection({ sound: true });
      return;
    case 'bid':
      sendAction({ type: 'bid', value: Number(ds.value) });
      return;
    case 'play':
      if (!state.ui.selected.size) return toast('先选牌');
      sendAction({ type: 'play', cards: [...state.ui.selected].map(Number) });
      return;
    case 'pass':
      sendAction({ type: 'pass' });
      return;
    case 'hint':
      sendAction({ type: 'hint' });
      return;
    case 'look':
      sendAction({ type: 'look' });
      return;
    case 'call':
      sendAction({ type: 'call' });
      return;
    case 'fold':
      sendAction({ type: 'fold' });
      return;
    case 'check':
      sendAction({ type: 'check' });
      return;
    case 'allin':
      if (state.room?.game === 'texas' && !confirm('确定全下？')) return;
      sendAction({ type: 'allin' });
      return;
    case 'zjh-raise-open':
      state.ui.zjhRaise = true;
      state.ui.zjhCompare = false;
      state.ui.raiseValue = null;
      renderGame();
      return;
    case 'zjh-compare-open':
      state.ui.zjhCompare = true;
      state.ui.zjhRaise = false;
      renderGame();
      return;
    case 'zjh-cancel':
      state.ui.zjhRaise = false;
      state.ui.zjhCompare = false;
      renderGame();
      return;
    case 'compare-target':
      state.ui.zjhCompare = false;
      sendAction({ type: 'compare', target: Number(ds.target) });
      renderGame();
      return;
    case 'texas-raise-open':
      state.ui.texasRaise = true;
      state.ui.raiseValue = null;
      renderGame();
      return;
    case 'texas-cancel':
      state.ui.texasRaise = false;
      renderGame();
      return;
    case 'raise-preset':
      state.ui.raiseValue = Number(ds.value);
      renderGame();
      return;
    case 'raise-confirm': {
      const input = byId('#raise-range');
      const amount = Number(input?.value ?? state.ui.raiseValue);
      if (!amount) return;
      state.ui.zjhRaise = false;
      state.ui.texasRaise = false;
      state.ui.raiseValue = null;
      sendAction({ type: 'raise', amount });
      renderGame();
      return;
    }
    case 'declare':
      sendAction({ type: 'declare', suit: Number(ds.suit) });
      return;
    case 'nt':
      sendAction({ type: 'nt' });
      return;
    case 'declare-pass':
      sendAction({ type: 'pass' });
      return;
    case 'bury':
      if (state.ui.selected.size !== 8) return toast('请选择 8 张牌扣底');
      sendAction({ type: 'bury', cards: [...state.ui.selected].map(Number) });
      return;
    default:
      return;
  }
}

function renderIfPossible() {
  if (state.view === 'room' && state.room) renderRoom();
  else renderLobby();
}

/* ====================== 事件 ====================== */
document.addEventListener('click', (e) => {
  const actEl = e.target.closest('[data-act]');
  if (actEl) {
    e.preventDefault();
    handleAct(actEl.dataset.act, actEl);
    return;
  }
  if (e.target.classList?.contains('modal-backdrop')) closeModal();
});

let limitToastAt = 0;
installHandSelection({
  getRoot: () => roomEl.querySelector('#hand-area'),
  getSelected: () => state.ui.selected,
  applySelection: (next, meta) =>
    applySelection(next, { sound: meta?.source === 'tap' || meta?.source === 'shift' }),
  getMaxSelect: selectionLimit,
  onLimit: () => {
    if (Date.now() - limitToastAt < 1200) return;
    limitToastAt = Date.now();
    toast('扣底只能选 8 张');
  },
  onBlank: () => clearSelection({ sound: true })
});

let fitTimer = 0;
const narrowQuery = window.matchMedia('(max-width: 620px)');
let narrowView = narrowQuery.matches;
window.addEventListener('resize', () => {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    const narrow = narrowQuery.matches;
    if (narrow !== narrowView && state.view === 'room' && state.room) {
      narrowView = narrow;
      renderGame();
    } else {
      fitCurrentHand();
    }
  }, 120);
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'raise-range') {
    state.ui.raiseValue = Number(e.target.value);
    const label = byId('#raise-val');
    if (label) label.textContent = e.target.value;
  }
  if (e.target.id === 'join-code') state.ui.joinCode = e.target.value;
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.id === 'chat-form') {
    e.preventDefault();
    const input = byId('#chat-input');
    const text = input?.value.trim();
    if (text) {
      net.send({ t: 'chat', text });
      input.value = '';
    }
    return;
  }
  if (form.id === 'join-form') {
    e.preventDefault();
    const code = byId('#join-code')?.value.trim().toUpperCase();
    if (!code) return toast('请输入 4 位房号');
    net.send({ t: 'join', roomId: code });
    return;
  }
  if (form.id === 'create-form') {
    e.preventDefault();
    const game = state.ui.modalGame;
    const fd = new FormData(form);
    const options = {};
    if (game === 'zhajinhua') {
      const ante = Number(fd.get('ante'));
      options.ante = ante;
      options.cap = ante * Number(fd.get('capMult'));
      options.startChips = Number(fd.get('startChips'));
    } else if (game === 'texas') {
      options.bigBlind = Number(fd.get('bigBlind'));
      options.startChips = Number(fd.get('startChips'));
    }
    net.send({ t: 'create', game, options });
    closeModal();
    return;
  }
  if (form.id === 'profile-form') {
    e.preventDefault();
    const name = byId('#profile-name')?.value.trim() || '';
    if (!name) return toast('昵称不能为空');
    net.updateProfile(name, state.ui.profileAvatar);
    net.send({ t: 'updateProfile', name, avatar: state.ui.profileAvatar });
    closeModal();
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (modalRoot.firstElementChild) {
    closeModal();
    return;
  }
  if (state.ui.zjhCompare || state.ui.zjhRaise || state.ui.texasRaise) {
    state.ui.zjhCompare = false;
    state.ui.zjhRaise = false;
    state.ui.texasRaise = false;
    renderGame();
    return;
  }
  if (state.ui.selected.size) clearSelection({ sound: true });
});

setInterval(() => {
  const el = byId('#turn-timer');
  if (!el) return;
  const room = state.room;
  if (!room || room.phase !== 'playing' || !room.deadline) {
    el.textContent = '';
    return;
  }
  const sec = Math.max(0, Math.ceil((room.deadline - (Date.now() + state.clockOffset)) / 1000));
  el.textContent = sec > 0 ? sec + 's' : '…';
  el.style.color = sec <= 10 ? 'var(--red)' : '';
}, 500);

renderLobby();
net.connect();
