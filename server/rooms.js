// 房间、玩家、大厅、断线重连、机器人托管
import { randomBytes, randomUUID } from 'node:crypto';
import { DouDizhu } from './games/doudizhu.js';
import { ZhaJinHua } from './games/zhajinhua.js';
import { TexasHoldem } from './games/texas.js';
import { ShengJi } from './games/shengji.js';

export const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐰', '🐨', '🦁', '🐮', '🐷', '🐙', '🦉', '🐳', '🦄', '🐲', '🃏'];

export const GAMES = {
  doudizhu: {
    id: 'doudizhu',
    name: '斗地主',
    desc: '三人经典 · 叫分抢地主 · 炸弹翻倍',
    min: 3,
    max: 3,
    cls: DouDizhu,
    tag: '三人',
    color: '#e9b949'
  },
  zhajinhua: {
    id: 'zhajinhua',
    name: '炸金花',
    desc: '三张牌 · 闷牌看牌 · 比牌定胜负',
    min: 3,
    max: 6,
    cls: ZhaJinHua,
    tag: '3–6 人',
    color: '#e0644a'
  },
  texas: {
    id: 'texas',
    name: '德州扑克',
    desc: '无限注 · 四轮下注 · 边池摊牌',
    min: 2,
    max: 8,
    cls: TexasHoldem,
    tag: '2–8 人',
    color: '#5fa8d3'
  },
  shengji: {
    id: 'shengji',
    name: '升级',
    desc: '四人两队 · 亮主扣底 · 打级过 A',
    min: 4,
    max: 4,
    cls: ShengJi,
    tag: '四人',
    color: '#8dbf72'
  }
};

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['小智', '阿福', '花花', '老K', '阿呆', '豆豆', '飞飞', '六月'];
const BOT_AVATARS = ['🤖', '🦊', '🐼', '🐯', '🐸', '🐵', '🐨', '🐷'];
const MAX_SPECTATORS = 20;

function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const clamp = (n, min, max, dflt) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(min, Math.min(max, Math.round(v)));
};

function cleanName(name, fallback) {
  if (typeof name !== 'string') return fallback;
  const s = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return s || fallback;
}

function normalizeOptions(game, raw = {}) {
  const o = {};
  if (game === 'zhajinhua') {
    o.ante = clamp(raw.ante, 1, 500, 10);
    o.cap = clamp(raw.cap, o.ante * 2, o.ante * 50, o.ante * 20);
    o.startChips = clamp(raw.startChips, 100, 100000, 1000);
  } else if (game === 'texas') {
    const bb = clamp(raw.bigBlind, 2, 5000, 20);
    o.bigBlind = bb;
    o.smallBlind = Math.max(1, Math.floor(bb / 2));
    o.startChips = clamp(raw.startChips, bb * 10, 500000, Math.max(2000, bb * 100));
  } else if (game === 'doudizhu') {
    o.base = 1;
  } else if (game === 'shengji') {
    o.startLevel = 2;
  }
  return o;
}

function initialScore(game, options) {
  if (game === 'zhajinhua') return options.startChips || 1000;
  if (game === 'texas') return options.startChips || 2000;
  if (game === 'shengji') return 2;
  return 0;
}

function optionLabel(game, o) {
  if (game === 'zhajinhua') return `底注 ${o.ante} · 封顶 ${o.cap}`;
  if (game === 'texas') return `盲注 ${o.smallBlind}/${o.bigBlind}`;
  if (game === 'shengji') return '从 2 打起 · 过 A 获胜';
  return '叫分 1/2/3 · 炸弹翻倍';
}

// 观战者看到的是公共视图：没有自己的手牌，也不包含任何玩家未公开的底牌。
function spectatorView(engine, game) {
  if (!engine) return null;
  const v = engine.view(0);
  const over = engine.isOver;
  v.mySeat = null;
  v.spectator = true;
  if (game === 'doudizhu') {
    v.hand = [];
  } else if (game === 'zhajinhua') {
    v.myCards = null;
    v.myLooked = false;
    v.callCost = null;
    v.compareCost = null;
    v.canCompare = false;
  } else if (game === 'texas') {
    v.myHole = [];
    v.toCall = null;
    for (const p of v.players) {
      // 进行中不公开任何底牌；摊牌时只公开未弃牌玩家，且不能把“view(0)”自己的弃牌带出来
      if (!over || p.folded) p.hole = null;
    }
  } else if (game === 'shengji') {
    v.hand = [];
    v.myLevelSuits = [];
    v.myLevelPairs = [];
    v.canNT = false;
    v.canCounter = false;
    v.canDeclare = false;
    if (!over) v.bottom = null;
  }
  return v;
}

export class Room {
  constructor(manager, def, hostId, options) {
    this.manager = manager;
    this.def = def;
    this.game = def.id;
    this.hostId = hostId;
    this.options = normalizeOptions(def.id, options);
    this.players = [];
    this.spectators = [];
    this.phase = 'waiting';
    this.roundNo = 0;
    this.engine = null;
    this.result = null;
    this.feed = [];
    this.feedId = 0;
    this.matchNote = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.turnDeadline = null;
    this.botTimer = null;
    this.turnTimer = null;
    this.startTimer = null;
    this.sjState = { banker: 0, teamLevels: [2, 2] };
  }

  get id() {
    return this._id;
  }

  set id(v) {
    this._id = v;
  }

  get max() {
    return this.def.max;
  }

  get min() {
    return this.def.min;
  }

  humanCount() {
    return this.players.filter((p) => !p.bot).length;
  }

  spectatorCount() {
    return this.spectators.length;
  }

  hasHuman() {
    return this.players.some((p) => !p.bot) || this.spectators.length > 0;
  }

  canSeat() {
    return this.phase !== 'playing' && this.players.length < this.max;
  }

  addFeed(type, text, name = '', by = '') {
    this.feed.push({ id: ++this.feedId, type, text, name, by, t: Date.now() });
    if (this.feed.length > 90) this.feed.splice(0, this.feed.length - 90);
    this.lastActivity = Date.now();
  }

  addPlayer(playerId, name, avatar, isBot = false) {
    if (this.phase === 'over') this.resetToWaiting();
    this.spectators = this.spectators.filter((s) => s.id !== playerId);
    if (this.players.length >= this.max) return { ok: false, error: '房间已满' };
    if (this.players.some((p) => p.id === playerId)) return { ok: true };
    const seat = this.players.length;
    this.players.push({
      id: playerId,
      name,
      avatar,
      seat,
      ready: isBot,
      connected: !isBot,
      bot: isBot,
      score: initialScore(this.game, this.options),
      disconnectedAt: null
    });
    // 房主离开后若只剩机器人，新加入的真人接管房主
    if (!isBot && !this.players.some((p) => p.id === this.hostId && !p.bot && p.connected)) {
      this.hostId = playerId;
    }
    this.addFeed('system', `${name} 加入了房间`);
    this.broadcast();
    return { ok: true, seat };
  }

  addSpectator(playerId, name, avatar) {
    if (this.players.some((p) => p.id === playerId)) return { ok: false, error: '你已经在牌桌上了' };
    if (this.spectators.some((s) => s.id === playerId)) return { ok: true };
    if (this.spectators.length >= MAX_SPECTATORS) return { ok: false, error: '观战席已满' };
    this.spectators.push({
      id: playerId,
      name,
      avatar,
      connected: true,
      joinedAt: Date.now(),
      disconnectedAt: null
    });
    this.addFeed('system', `${name} 进入观战`);
    this.broadcast();
    return { ok: true };
  }

  removeSpectator(playerId) {
    const s = this.spectators.find((x) => x.id === playerId);
    if (!s) return;
    this.spectators = this.spectators.filter((x) => x.id !== playerId);
    this.addFeed('system', `${s.name} 退出观战`);
    if (!this.players.length && !this.spectators.length) {
      this.manager.destroyRoom(this);
      return;
    }
    this.broadcast();
  }

  promoteSpectator(playerId) {
    const s = this.spectators.find((x) => x.id === playerId);
    if (!s) return { ok: false, error: '你不在观战席' };
    if (this.phase === 'playing') return { ok: false, error: '牌局进行中，本局结束后才能入座' };
    if (this.players.length >= this.max) return { ok: false, error: '牌桌已满' };
    this.spectators = this.spectators.filter((x) => x.id !== playerId);
    const r = this.addPlayer(playerId, s.name, s.avatar);
    if (!r.ok) {
      this.spectators.push(s);
      return r;
    }
    this.addFeed('system', `${s.name} 从观战席入座`);
    return r;
  }

  removePlayer(playerId, explicit = true) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    if (this.phase === 'over') this.resetToWaiting();
    if (this.phase === 'playing') {
      p.bot = true;
      p.connected = false;
      p.ready = true;
      this.addFeed('system', `${p.name} 离开，由机器人托管`);
      if (this.hostId === playerId) {
        const nextHost =
          this.players.find((x) => !x.bot && x.connected && x.id !== playerId) ||
          this.players.find((x) => !x.bot && x.id !== playerId);
        if (nextHost) this.hostId = nextHost.id;
      }
      this.schedule();
      this.broadcast();
      return;
    }
    this.players = this.players.filter((x) => x.id !== playerId);
    this.reindex();
    this.addFeed('system', `${p.name} 离开了房间`);
    if (this.hostId === playerId) {
      this.hostId =
        this.players.find((x) => !x.bot && x.connected)?.id ||
        this.players.find((x) => !x.bot)?.id ||
        this.players[0]?.id ||
        null;
    }
    if (!this.players.length) {
      this.matchNote = null;
      this.clearTimers();
      this.phase = 'waiting';
      this.engine = null;
      this.result = null;
      this.hostId = null;
      if (this.spectators.length) {
        this.addFeed('system', '牌桌上暂时没有玩家，观战席可以入座');
        this.broadcast();
        return;
      }
      this.manager.destroyRoom(this);
      return;
    }
    this.broadcast();
  }

  transferHost(playerId) {
    if (this.hostId !== playerId) return;
    const next = this.players.find((x) => x.id !== playerId && !x.bot && x.connected);
    if (next) {
      this.hostId = next.id;
      this.addFeed('system', `房主转给 ${next.name}`);
    }
  }

  reindex() {
    this.players.forEach((p, i) => {
      p.seat = i;
    });
  }

  resetToWaiting() {
    this.phase = 'waiting';
    this.engine = null;
    this.result = null;
    this.matchNote = null;
    this.turnDeadline = null;
    this.clearTimers();
    // 上一局可能有人出局，回到等待态时把座位号压缩成连续的
    this.reindex();
  }

  addBot(name, avatar) {
    if (this.players.length >= this.max) return { ok: false, error: '房间已满' };
    const id = `bot-${randomBytes(4).toString('hex')}`;
    const used = new Set(this.players.map((p) => p.name));
    let botName = name || BOT_NAMES.find((n) => !used.has(n));
    if (!botName) {
      let i = 2;
      while (used.has(`机器人${i}`)) i++;
      botName = `机器人${i}`;
    }
    const botAvatar = avatar || BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
    this.addPlayer(id, botName, botAvatar, true);
    return { ok: true };
  }

  removeBot() {
    const bot = [...this.players].reverse().find((p) => p.bot);
    if (!bot) return { ok: false, error: '没有机器人' };
    if (this.phase === 'playing') return { ok: false, error: '游戏进行中不能移除机器人' };
    if (this.phase === 'over') this.resetToWaiting();
    this.players = this.players.filter((p) => p.id !== bot.id);
    this.reindex();
    this.addFeed('system', `${bot.name} 被移出房间`);
    if (!this.players.length) {
      this.clearTimers();
      this.phase = 'waiting';
      this.engine = null;
      this.result = null;
      this.hostId = null;
      if (this.spectators.length) {
        this.addFeed('system', '牌桌上暂时没有玩家，观战席可以入座');
        this.broadcast();
        return { ok: true };
      }
      this.manager.destroyRoom(this);
      return { ok: true };
    }
    this.broadcast();
    return { ok: true };
  }

  setReady(playerId, value) {
    if (this.phase === 'playing') return;
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.ready = typeof value === 'boolean' ? value : !p.ready;
    this.lastActivity = Date.now();
    clearTimeout(this.startTimer);
    this.startTimer = null;
    this.broadcast();
    if (this.phase === 'over') {
      const humans = this.players.filter((x) => !x.bot);
      if (
        humans.length &&
        humans.every((x) => x.id === this.hostId || !x.connected || x.ready) &&
        this.players.length >= this.min
      ) {
        this.startTimer = setTimeout(() => {
          if (this.phase === 'over' && this.canStart()) this.startRound();
        }, 800);
      }
    }
  }

  canStart() {
    if (this.phase === 'playing') return false;
    if (this.players.length < this.min || this.players.length > this.max) return false;
    const humans = this.players.filter((p) => !p.bot);
    if (!humans.length) return false;
    if (this.phase === 'over') return true; // 房主可直接开下一局
    return humans.every((p) => p.id === this.hostId || !p.connected || p.ready);
  }

  startRound() {
    clearTimeout(this.startTimer);
    this.startTimer = null;
    if (this.phase === 'playing') return { ok: false, error: '游戏进行中' };
    if (this.game === 'zhajinhua' || this.game === 'texas') this.settleBusted();
    if (this.players.length < this.min) {
      if (this.matchNote) this.broadcast();
      return { ok: false, error: `至少需要 ${this.min} 人` };
    }
    if (this.players.length > this.max) return { ok: false, error: `最多 ${this.max} 人` };
    const humans = this.players.filter((p) => !p.bot);
    if (!humans.length) return { ok: false, error: '房间里没有真人玩家' };
    if (this.phase !== 'over' && !humans.every((p) => p.id === this.hostId || !p.connected || p.ready)) {
      return { ok: false, error: '还有玩家没有准备' };
    }
    this.matchNote = null;
    this.roundNo++;
    this.phase = 'playing';
    this.result = null;
    for (const p of this.players) {
      p.ready = p.bot;
    }
    // 上一局出局的玩家会让座位号出现空洞，新一局必须从 0 开始连续编号
    this.reindex();
    const opts = { roundNo: this.roundNo };
    if (this.game === 'zhajinhua') {
      opts.ante = this.options.ante;
      opts.cap = this.options.cap;
      opts.chips = this.players.map((p) => p.score);
    } else if (this.game === 'texas') {
      opts.smallBlind = this.options.smallBlind;
      opts.bigBlind = this.options.bigBlind;
      opts.chips = this.players.map((p) => p.score);
    } else if (this.game === 'shengji') {
      opts.banker = this.sjState.banker;
      opts.teamLevels = this.sjState.teamLevels;
      this.players.forEach((p) => {
        p.score = this.sjState.teamLevels[p.seat % 2];
      });
    }
    try {
      this.engine = new this.def.cls(
        this.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
        opts
      );
    } catch (e) {
      this.phase = 'waiting';
      this.engine = null;
      console.error('start engine failed', e);
      return { ok: false, error: '开局失败：' + e.message };
    }
    this.addFeed('system', `第 ${this.roundNo} 局开始`);
    this.drainLogs();
    // 短码全下等情况可能开局即结束（例如全员只够底注），仍需正常结算/转观战
    if (this.engine.isOver) {
      this.checkOver();
      this.broadcast();
      return { ok: true };
    }
    this.schedule();
    this.broadcast();
    return { ok: true };
  }

  actorSeat() {
    const e = this.engine;
    if (!e || this.phase !== 'playing') return null;
    if (e.phase === 'declare') return e.declareTurn;
    if (e.phase === 'bury') return e.banker;
    if (e.phase === 'over') return null;
    return e.turn ?? null;
  }

  schedule() {
    clearTimeout(this.botTimer);
    clearTimeout(this.turnTimer);
    this.botTimer = null;
    this.turnTimer = null;
    this.turnDeadline = null;
    if (this.phase !== 'playing' || !this.engine) return;
    const seat = this.actorSeat();
    if (seat === null || seat === undefined) return;
    const p = this.players.find((x) => x.seat === seat);
    if (!p) return;
    const botLike = p.bot || !p.connected;
    const delay = botLike ? 900 : 45000;
    this.turnDeadline = Date.now() + delay;
    if (botLike) {
      this.botTimer = setTimeout(() => this.runBot(seat), delay);
    } else {
      this.turnTimer = setTimeout(() => this.runTimeout(seat), delay);
    }
  }

  runBot(seat) {
    if (this.phase !== 'playing' || !this.engine) return;
    if (this.actorSeat() !== seat) return;
    let action = null;
    try {
      action = this.engine.botAction(seat);
      if (!action) action = this.engine.autoAction(seat);
      if (!action) return;
      let r = this.engine.act(seat, action);
      if (!r.ok) {
        this.addFeed('system', `机器人操作失败：${r.error}，自动处理`);
        const fallback = this.engine.autoAction(seat);
        if (fallback) this.engine.act(seat, fallback);
      }
    } catch (e) {
      console.error('bot action error', this.game, e);
      try {
        const fallback = this.engine.autoAction(seat);
        if (fallback) this.engine.act(seat, fallback);
      } catch {
        /* ignore */
      }
    }
    this.afterAction();
  }

  runTimeout(seat) {
    if (this.phase !== 'playing' || !this.engine) return;
    if (this.actorSeat() !== seat) return;
    const p = this.players.find((x) => x.seat === seat);
    try {
      const action = this.engine.autoAction(seat);
      if (action) {
        const r = this.engine.act(seat, action);
        if (!r.ok) this.addFeed('system', `超时自动操作失败：${r.error}`);
      }
      if (p) this.addFeed('system', `${p.name} 超时，系统自动操作`);
    } catch (e) {
      console.error('timeout action error', e);
    }
    this.afterAction();
  }

  afterAction() {
    this.drainLogs();
    this.checkOver();
    this.schedule();
    this.broadcast();
  }

  action(playerId, action) {
    if (this.phase !== 'playing' || !this.engine) return { ok: false, error: '游戏未开始' };
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return { ok: false, error: '你不在这个房间' };
    if (p.bot && !p.connected) return { ok: false, error: '你已离开，由机器人托管' };
    let r;
    try {
      r = this.engine.act(p.seat, action);
    } catch (e) {
      console.error('action error', this.game, e);
      return { ok: false, error: '操作异常' };
    }
    if (action?.type === 'hint') {
      if (r.ok) return { ok: true, hint: r.hint };
      return r;
    }
    if (!r.ok) return r;
    this.afterAction();
    return { ok: true };
  }

  drainLogs() {
    if (!this.engine || !this.engine.drainLogs) return;
    const logs = this.engine.drainLogs();
    for (const l of logs) this.addFeed('log', l.text);
  }

  checkOver() {
    if (!this.engine || !this.engine.isOver || this.phase !== 'playing') return false;
    this.phase = 'over';
    const result = this.engine.result;
    this.result = result;
    this.clearTimers();
    if (this.game === 'doudizhu') {
      const deltas = result.deltas || [];
      this.players.forEach((p, i) => {
        p.score += deltas[i] || 0;
      });
      this.addFeed(
        'system',
        `${result.landlordWin ? '地主' : '农民'}获胜 · 底分 ${result.base} × 倍数 ${result.multiplier}${result.spring ? ' · ' + result.spring : ''}`
      );
    } else if (this.game === 'zhajinhua' || this.game === 'texas') {
      const chips = result.chips || [];
      this.players.forEach((p, i) => {
        p.score = chips[i] ?? p.score;
      });
      const winners = (result.winners || []).map((w) => `${this.players[w.seat]?.name || '?'} +${w.amount}`).join('，');
      this.addFeed('system', `本局结束 · ${winners || '无人获胜'}`);
      this.settleBusted();
    } else if (this.game === 'shengji') {
      const levels = result.levels || [2, 2];
      this.players.forEach((p) => {
        p.score = levels[p.seat % 2];
      });
      if (result.matchOver) {
        this.addFeed('system', `过 A！${result.winnerTeam === 0 ? '南北' : '东西'}队获胜，下一局从 2 重新开始`);
        this.sjState = { banker: 0, teamLevels: [2, 2] };
        this.players.forEach((p) => {
          p.score = 2;
        });
      } else {
        this.sjState = {
          banker: result.next.banker,
          teamLevels: result.next.teamLevels.slice()
        };
        this.addFeed(
          'system',
          `${result.winnerTeam === result.bankerTeam ? '庄家' : '闲家'}方升 ${result.levelGain} 级 · 下一局 ${['南北', '东西'][result.next.banker % 2]} 坐庄打 ${this.rankName(result.next.level)}`
        );
      }
    }
    for (const p of this.players) if (!p.bot) p.ready = false;
    return true;
  }

  // 筹码类游戏（德州/炸金花）：一局结束后，筹码耗尽的真人自动转入观战席，
  // 机器人直接离开牌桌。这里故意不重排 seat：本局 engine.view(seat) 仍按旧座位号读取，
  // 下一次开局前再由 startRound/resetToWaiting 统一 reindex。
  settleBusted() {
    if (this.game !== 'zhajinhua' && this.game !== 'texas') return;
    const busted = this.players.filter((p) => p.score <= 0);
    if (!busted.length) return;
    for (const p of busted) {
      this.players = this.players.filter((x) => x.id !== p.id);
      if (p.id.startsWith('bot-')) {
        this.addFeed('system', `${p.name} 筹码耗尽，离开牌桌`);
        continue;
      }
      // 主动离开（会话已不在本房间）的玩家不再占观战席；掉线玩家保留观战席以便重连
      const session = this.manager.sessionByPlayer?.(p.id);
      if (session && session.roomId !== this.id) {
        this.addFeed('system', `${p.name} 筹码耗尽，离开牌桌`);
        continue;
      }
      this.spectators.push({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        connected: p.connected,
        joinedAt: Date.now(),
        disconnectedAt: p.connected ? null : p.disconnectedAt || Date.now()
      });
      this.addFeed('system', `${p.name} 筹码耗尽，自动转入观战席`);
      this.manager.conns.get(p.id)?.send({
        t: 'notice',
        message: '筹码耗尽，已自动转入观战席；下一局可重新入座（重新买入）'
      });
      if (this.hostId === p.id) {
        const next =
          this.players.find((x) => !x.bot && x.connected) ||
          this.players.find((x) => !x.bot);
        this.hostId = next?.id || this.players[0]?.id || null;
        if (next) this.addFeed('system', `房主转给 ${next.name}`);
        else if (this.hostId) this.addFeed('system', '房主暂由机器人代管');
      }
    }
    if (this.players.length && this.players.length < this.min) {
      const names = this.players.map((p) => p.name).join('、');
      const one = this.players.length === 1;
      this.matchNote = one
        ? `只剩 ${names} 还有筹码，本场结束；等待其他玩家从观战席重新入座，或房主添加机器人。`
        : `只剩 ${names} 还有筹码（不足 ${this.min} 人），本场结束；等待重新入座或添加机器人。`;
      this.addFeed('system', this.matchNote);
      for (const p of this.players) {
        if (p.bot) continue;
        this.manager.conns.get(p.id)?.send({ t: 'notice', message: this.matchNote });
      }
    } else if (this.players.length) {
      this.matchNote = null;
    }
    if (!this.players.length) {
      this.matchNote = null;
      this.clearTimers();
      this.phase = 'waiting';
      this.engine = null;
      this.result = null;
      this.turnDeadline = null;
      if (this.spectators.length) {
        this.addFeed('system', '牌桌上暂时没有玩家，观战席可以入座');
      } else {
        this.manager.destroyRoom(this);
      }
    }
  }

  rankName(r) {
    return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  }

  clearTimers() {
    clearTimeout(this.botTimer);
    clearTimeout(this.turnTimer);
    clearTimeout(this.startTimer);
    this.botTimer = null;
    this.turnTimer = null;
    this.startTimer = null;
    this.turnDeadline = null;
  }

  chat(playerId, text) {
    const p = this.players.find((x) => x.id === playerId) || this.spectators.find((x) => x.id === playerId);
    if (!p) return;
    const msg = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
    if (!msg) return;
    this.addFeed('chat', msg, p.name, p.id);
    this.broadcast();
  }

  publicFor(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    const spectator = this.spectators.find((x) => x.id === playerId);
    if (!player && !spectator) return null;
    const isSpectator = !player;
    const state = this.engine
      ? isSpectator
        ? spectatorView(this.engine, this.game)
        : this.engine.view(player.seat)
      : null;
    return {
      id: this.id,
      game: this.game,
      gameName: this.def.name,
      gameDesc: this.def.desc,
      hostId: this.hostId,
      phase: this.phase,
      roundNo: this.roundNo,
      options: this.options,
      optionLabel: optionLabel(this.game, this.options),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seat: p.seat,
        ready: p.ready,
        connected: p.connected,
        bot: p.bot,
        score: p.score,
        isHost: p.id === this.hostId,
        isMe: !!player && p.id === player.id
      })),
      spectators: this.spectators.map((x) => ({
        id: x.id,
        name: x.name,
        avatar: x.avatar,
        connected: x.connected,
        isMe: x.id === playerId
      })),
      spectatorCount: this.spectators.length,
      mySeat: player ? player.seat : null,
      isSpectator,
      isHost: !!player && player.id === this.hostId,
      canSeat: isSpectator ? this.canSeat() : false,
      canStart: !!player && this.canStart(),
      deadline: this.turnDeadline,
      serverNow: Date.now(),
      min: this.min,
      max: this.max,
      state,
      result: this.result,
      matchNote: this.matchNote,
      feed: this.feed.slice(-70),
      sjState: this.game === 'shengji' ? this.sjState : null
    };
  }

  broadcast() {
    for (const p of this.players) {
      if (p.bot) continue;
      const conn = this.manager.conns.get(p.id);
      if (!conn) continue;
      const room = this.publicFor(p.id);
      if (room) conn.send({ t: 'room', room });
    }
    for (const s of this.spectators) {
      const conn = this.manager.conns.get(s.id);
      if (!conn) continue;
      const room = this.publicFor(s.id);
      if (room) conn.send({ t: 'room', room });
    }
    this.manager.scheduleLobby();
  }
}

export class RoomManager {
  constructor(urls = []) {
    this.urls = urls;
    this.rooms = new Map();
    this.sessions = new Map();
    this.conns = new Map();
    this.lobbyTimer = null;
    this.lobbyDirty = false;
    this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
    this.cleanupTimer.unref?.();
  }

  attach(ws) {
    ws.onMessage = (msg) => {
      try {
        this.handle(ws, msg);
      } catch (e) {
        console.error('ws message error', e);
        ws.send({ t: 'error', message: '服务器处理出错' });
      }
    };
    const prevClose = ws.onClose;
    ws.onClose = () => {
      try { prevClose?.(); } catch { /* ignore */ }
      this.onClose(ws);
    };
    ws.send({ t: 'hello' });
  }

  handle(ws, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') return this.hello(ws, msg);
    const data = ws.data;
    if (!data) return ws.send({ t: 'error', message: '请先发送 hello' });
    const playerId = data.playerId;
    const session = this.sessions.get(data.token);
    if (!session) return ws.send({ t: 'error', message: '会话失效，请刷新页面' });
    session.lastSeen = Date.now();

    switch (msg.t) {
      case 'lobby':
        return this.sendLobby(ws);
      case 'create': {
        const def = GAMES[msg.game];
        if (!def) return ws.send({ t: 'error', message: '未知游戏' });
        this.leaveRoom(playerId, session, false);
        const room = new Room(this, def, playerId, msg.options || {});
        let code = makeCode();
        while (this.rooms.has(code)) code = makeCode();
        room.id = code;
        this.rooms.set(code, room);
        room.addPlayer(playerId, session.name, session.avatar);
        session.roomId = code;
        this.sendLobby(ws);
        return;
      }
      case 'join': {
        const code = String(msg.roomId || '').trim().toUpperCase();
        const room = this.rooms.get(code);
        if (!room) return ws.send({ t: 'error', message: '房间不存在' });
        const p = room.players.find((x) => x.id === playerId);
        if (p) {
          session.roomId = code;
          room.broadcast();
          return;
        }
        const sp = room.spectators.find((x) => x.id === playerId);
        if (sp) {
          if (room.canSeat()) {
            const r = room.promoteSpectator(playerId);
            if (!r.ok) return ws.send({ t: 'error', message: r.error });
            session.roomId = code;
            this.sendLobby(ws);
            return;
          }
          session.roomId = code;
          ws.send({
            t: 'notice',
            message: room.phase === 'playing' ? '牌局进行中，已为你保留观战席' : '房间已满，已为你保留观战席'
          });
          room.broadcast();
          return;
        }
        // 牌局进行中或座位已满：自动进入观战，不再拒绝
        if (room.phase === 'playing' || room.players.length >= room.max) {
          if (room.spectators.length >= MAX_SPECTATORS) return ws.send({ t: 'error', message: '观战席已满' });
          this.leaveRoom(playerId, session, false);
          const r = room.addSpectator(playerId, session.name, session.avatar);
          if (!r.ok) return ws.send({ t: 'error', message: r.error });
          session.roomId = code;
          ws.send({
            t: 'notice',
            message: room.phase === 'playing' ? '牌局进行中，已进入观战' : '房间已满，已进入观战'
          });
          this.sendLobby(ws);
          return;
        }
        this.leaveRoom(playerId, session, false);
        room.addPlayer(playerId, session.name, session.avatar);
        session.roomId = code;
        this.sendLobby(ws);
        return;
      }
      case 'spectate': {
        const code = String(msg.roomId || '').trim().toUpperCase();
        const room = this.rooms.get(code);
        if (!room) return ws.send({ t: 'error', message: '房间不存在' });
        if (room.players.some((x) => x.id === playerId) || room.spectators.some((x) => x.id === playerId)) {
          session.roomId = code;
          room.broadcast();
          return;
        }
        if (room.spectators.length >= MAX_SPECTATORS) return ws.send({ t: 'error', message: '观战席已满' });
        this.leaveRoom(playerId, session, false);
        const r = room.addSpectator(playerId, session.name, session.avatar);
        if (!r.ok) return ws.send({ t: 'error', message: r.error });
        session.roomId = code;
        this.sendLobby(ws);
        return;
      }
      case 'seat': {
        const room = this.roomOf(playerId);
        if (!room) return ws.send({ t: 'error', message: '你不在房间中' });
        if (room.players.some((x) => x.id === playerId)) return;
        if (!room.spectators.some((x) => x.id === playerId)) return;
        const r = room.promoteSpectator(playerId);
        if (!r.ok) return ws.send({ t: 'error', message: r.error });
        session.roomId = room.id;
        this.sendLobby(ws);
        return;
      }
      case 'leave': {
        this.leaveRoom(playerId, session, true);
        return;
      }
      case 'ready': {
        const room = this.roomOf(playerId);
        if (!room) return;
        room.setReady(playerId, msg.value);
        return;
      }
      case 'start': {
        const room = this.roomOf(playerId);
        if (!room) return;
        if (room.hostId !== playerId) return ws.send({ t: 'error', message: '只有房主可以开始' });
        const r = room.startRound();
        if (!r.ok) ws.send({ t: 'error', message: r.error });
        return;
      }
      case 'action': {
        const room = this.roomOf(playerId);
        if (!room) return;
        const r = room.action(playerId, msg.action || {});
        if (!r.ok) ws.send({ t: 'error', message: r.error });
        else if (r.hint) ws.send({ t: 'hint', cards: r.hint });
        return;
      }
      case 'chat': {
        const room = this.roomOf(playerId);
        if (room) room.chat(playerId, msg.text);
        return;
      }
      case 'addBot': {
        const room = this.roomOf(playerId);
        if (!room) return;
        if (room.hostId !== playerId) return ws.send({ t: 'error', message: '只有房主可以添加机器人' });
        if (room.phase === 'playing') return ws.send({ t: 'error', message: '游戏进行中' });
        const r = room.addBot();
        if (!r.ok) ws.send({ t: 'error', message: r.error });
        return;
      }
      case 'removeBot': {
        const room = this.roomOf(playerId);
        if (!room) return;
        if (room.hostId !== playerId) return ws.send({ t: 'error', message: '只有房主可以移除机器人' });
        const r = room.removeBot();
        if (!r.ok) ws.send({ t: 'error', message: r.error });
        return;
      }
      case 'updateProfile': {
        const name = cleanName(msg.name, session.name);
        const avatar = AVATARS.includes(msg.avatar) ? msg.avatar : session.avatar;
        session.name = name;
        session.avatar = avatar;
        const room = this.roomOf(playerId);
        if (room) {
          const p = room.players.find((x) => x.id === playerId);
          const sp = room.spectators.find((x) => x.id === playerId);
          if (p) {
            p.name = name;
            p.avatar = avatar;
            room.broadcast();
          } else if (sp) {
            sp.name = name;
            sp.avatar = avatar;
            room.broadcast();
          }
        }
        ws.send({ t: 'profile', name, avatar });
        return;
      }
      case 'ping':
        ws.send({ t: 'pong', t0: msg.t0 || null });
        return;
      default:
        return;
    }
  }

  hello(ws, msg) {
    if (ws.data) return;
    let token = typeof msg.token === 'string' && /^[a-f0-9]{16,64}$/.test(msg.token) ? msg.token : null;
    let session = token ? this.sessions.get(token) : null;
    const playerId = session?.playerId || randomUUID().slice(0, 12);
    const fallbackName = '牌友' + playerId.slice(0, 2).toUpperCase();
    const name = cleanName(msg.name, session?.name || fallbackName);
    const avatar = AVATARS.includes(msg.avatar) ? msg.avatar : session?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];
    if (!session) {
      token = randomBytes(16).toString('hex');
      session = { playerId, name, avatar, roomId: null, lastSeen: Date.now() };
      this.sessions.set(token, session);
    } else {
      session.name = name;
      session.avatar = avatar;
    }
    const old = this.conns.get(playerId);
    if (old && old !== ws) {
      try {
        old.send({ t: 'error', message: '账号已在另一个窗口连接' });
        old.close(4001);
      } catch {
        /* ignore */
      }
    }
    this.conns.set(playerId, ws);
    ws.data = { playerId, token };
    ws.token = token;
    ws.send({
      t: 'welcome',
      playerId,
      token,
      name,
      avatar,
      urls: this.urls,
      features: { spectator: true },
      games: Object.values(GAMES).map((g) => ({
        id: g.id, name: g.name, desc: g.desc, min: g.min, max: g.max, tag: g.tag, color: g.color
      }))
    });
    const room = this.roomOf(playerId);
    if (room) {
      const p = room.players.find((x) => x.id === playerId);
      const sp = room.spectators.find((x) => x.id === playerId);
      if (p) {
        p.connected = true;
        p.bot = false;
        p.name = name;
        p.avatar = avatar;
        session.roomId = room.id;
        room.addFeed('system', `${name} 回到房间`);
        room.schedule();
        const payload = room.publicFor(playerId);
        ws.send({ t: 'room', room: payload });
        room.broadcast();
      } else if (sp) {
        sp.connected = true;
        sp.name = name;
        sp.avatar = avatar;
        session.roomId = room.id;
        room.addFeed('system', `${name} 回到观战`);
        const payload = room.publicFor(playerId);
        ws.send({ t: 'room', room: payload });
        room.broadcast();
      }
    } else {
      session.roomId = null;
    }
    this.sendLobby(ws);
  }

  roomOf(playerId) {
    // 以会话当前房间为准；离开后旧房间里可能还留着机器人托管，不应再路由到那里
    const session = this.sessionByPlayer(playerId);
    if (session?.roomId) {
      const room = this.rooms.get(session.roomId);
      if (
        room &&
        (room.players.some((p) => p.id === playerId) || room.spectators.some((s) => s.id === playerId))
      ) {
        return room;
      }
    }
    for (const room of this.rooms.values()) {
      const p = room.players.find((x) => x.id === playerId);
      if (p && !p.bot) return room;
      if (room.spectators.some((s) => s.id === playerId)) return room;
    }
    return null;
  }

  sessionByPlayer(playerId) {
    for (const s of this.sessions.values()) if (s.playerId === playerId) return s;
    return null;
  }

  leaveRoom(playerId, session, notify) {
    const room = this.roomOf(playerId);
    if (room) {
      if (room.players.some((p) => p.id === playerId)) room.removePlayer(playerId, true);
      else if (room.spectators.some((s) => s.id === playerId)) room.removeSpectator(playerId);
    }
    if (session) session.roomId = null;
    if (notify && room) this.sendLobby(this.conns.get(playerId));
  }

  onClose(ws) {
    const data = ws.data;
    if (!data) return;
    const current = this.conns.get(data.playerId);
    if (current && current !== ws) return; // 已有新连接接管，忽略旧连接关闭
    if (current === ws) this.conns.delete(data.playerId);
    const session = this.sessions.get(data.token);
    if (session) session.lastSeen = Date.now();
    const room = this.roomOf(data.playerId);
    if (!room) return;
    const p = room.players.find((x) => x.id === data.playerId);
    if (p) {
      p.connected = false;
      p.disconnectedAt = Date.now();
      room.addFeed('system', `${p.name} 掉线了`);
      room.transferHost(p.id);
      room.broadcast();
      return;
    }
    const sp = room.spectators.find((x) => x.id === data.playerId);
    if (sp) {
      sp.connected = false;
      sp.disconnectedAt = Date.now();
      room.addFeed('system', `${sp.name} 观战掉线`);
      room.broadcast();
    }
  }

  destroyRoom(room) {
    this.rooms.delete(room.id);
    room.clearTimers();
    for (const s of this.sessions.values()) if (s.roomId === room.id) s.roomId = null;
    this.scheduleLobby();
  }

  createRoomByPlayer(playerId, game, options) {
    const def = GAMES[game];
    if (!def) throw new Error('未知游戏');
    const session = this.sessionOf(playerId);
    if (!session) throw new Error('会话不存在');
    const room = new Room(this, def, playerId, options || {});
    room.id = makeCode();
    while (this.rooms.has(room.id)) room.id = makeCode();
    this.rooms.set(room.id, room);
    room.addPlayer(playerId, session.name, session.avatar);
    session.roomId = room.id;
    return room;
  }

  sessionOf(playerId) {
    for (const [token, s] of this.sessions) if (s.playerId === playerId) return { ...s, token };
    return null;
  }

  lobbyPayload() {
    const rooms = [...this.rooms.values()]
      .filter((r) => r.hasHuman())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r.id,
        game: r.game,
        gameName: r.def.name,
        host: r.players.find((p) => p.id === r.hostId)?.name || '—',
        humans: r.humanCount(),
        spectators: r.spectatorCount(),
        total: r.players.length,
        max: r.max,
        min: r.min,
        phase: r.phase,
        roundNo: r.roundNo,
        optionLabel: optionLabel(r.game, r.options)
      }));
    return { t: 'lobby', rooms, online: this.conns.size, urls: this.urls };
  }

  sendLobby(ws) {
    if (!ws || ws.didClose) return;
    ws.send(this.lobbyPayload());
  }

  scheduleLobby() {
    if (this.lobbyTimer) return;
    this.lobbyTimer = setTimeout(() => {
      this.lobbyTimer = null;
      const payload = this.lobbyPayload();
      for (const ws of this.conns.values()) {
        if (!ws.didClose) ws.send(payload);
      }
    }, 150);
  }

  cleanup() {
    const now = Date.now();
    for (const [token, s] of this.sessions) {
      if (!this.conns.has(s.playerId) && now - s.lastSeen > 12 * 3600 * 1000) this.sessions.delete(token);
    }
    for (const room of [...this.rooms.values()]) {
      // 观战者掉线 5 分钟后释放观战席
      const staleSpectators = room.spectators.filter(
        (s) => !s.connected && s.disconnectedAt && now - s.disconnectedAt > 5 * 60 * 1000
      );
      if (staleSpectators.length) {
        room.spectators = room.spectators.filter((s) => !staleSpectators.includes(s));
        room.addFeed('system', `${staleSpectators.map((s) => s.name).join('、')} 的观战席已释放`);
        if (!room.players.length && !room.spectators.length) {
          this.destroyRoom(room);
          continue;
        }
        room.broadcast();
      }
      // 掉线 60 秒自动托管
      if (room.phase === 'playing') {
        for (const p of room.players) {
          if (!p.bot && !p.connected && p.disconnectedAt && now - p.disconnectedAt > 60000) {
            p.bot = true;
            p.ready = true;
            room.addFeed('system', `${p.name} 掉线超过 60 秒，自动托管`);
            room.transferHost(p.id);
            room.schedule();
            room.broadcast();
          }
        }
      }
      const anyOnline =
        room.players.some((p) => !p.bot && p.connected) || room.spectators.some((s) => s.connected);
      if (!anyOnline && now - room.lastActivity > 20 * 60 * 1000) {
        this.destroyRoom(room);
      }
    }
  }
}
