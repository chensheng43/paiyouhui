// 观战功能端到端测试：需在目标端口启动服务
// 用法：WS_URL=ws://127.0.0.1:3100/ws node tools/test-spectator.js
const URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(name, avatar) {
    this.name = name;
    this.avatar = avatar;
    this.inbox = [];
    this.room = null;
    this.token = null;
    this.ws = new WebSocket(URL);
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'hello') {
        this.ws.send(JSON.stringify({ t: 'hello', name: this.name, avatar: this.avatar, token: this.token }));
        return;
      }
      if (msg.t === 'welcome') this.token = msg.token;
      if (msg.t === 'room') this.room = msg.room;
      this.inbox.push(msg);
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  async wait(pred, ms = 8000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      await sleep(25);
    }
    throw new Error(`${this.name} timeout; inbox=${JSON.stringify(this.inbox.slice(-3))}`);
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.error('  ✗', msg);
  }
};

const A = new Client('房主', '🦊');
const B = new Client('玩家B', '🐼');
const C = new Client('观战者', '👁️');
await Promise.all([A.wait((m) => m.t === 'welcome'), B.wait((m) => m.t === 'welcome'), C.wait((m) => m.t === 'welcome')]);

A.send({ t: 'create', game: 'zhajinhua', options: { ante: 10, cap: 200, startChips: 1000 } });
const r1 = (await A.wait((m) => m.t === 'room')).room;
const code = r1.id;
B.send({ t: 'join', roomId: code });
await B.wait((m) => m.t === 'room' && m.room.players.length === 2);
A.send({ t: 'addBot' });
await A.wait((m) => m.t === 'room' && m.room.players.length === 3);
B.send({ t: 'ready', value: true });
await sleep(100);
A.send({ t: 'start' });
await A.wait((m) => m.t === 'room' && m.room.phase === 'playing');

C.send({ t: 'spectate', roomId: code });
const cr = (await C.wait((m) => m.t === 'room' && m.room.id === code)).room;
ok(cr.isSpectator === true, '观战者标记');
ok(cr.mySeat === null, '观战者没有座位');
ok(cr.spectatorCount >= 1, '观战人数');
ok(cr.canStart === false, '观战者不能开始游戏');
ok(cr.state && cr.state.myCards === null, '观战视图不包含自己的手牌');
ok(cr.state.players.every((p) => !p.cards), '进行中不泄露任何玩家手牌');
ok(Array.isArray(cr.spectators) && cr.spectators.some((s) => s.name === '观战者'), '观战者列表');

// 观战聊天
C.send({ t: 'chat', text: '观战测试：这手牌有意思' });
const chatMsg = await A.wait((m) => m.t === 'room' && m.room.feed.some((f) => f.type === 'chat' && f.text === '观战测试：这手牌有意思'), 5000);
ok(!!chatMsg.room.feed.find((f) => f.type === 'chat' && f.name === '观战者'), '观战者可以聊天');

// 观战者不能操作牌局
C.send({ t: 'action', action: { type: 'call' } });
const err = await C.wait((m) => m.t === 'error', 3000);
ok(/不在这个房间|观战/.test(err.message), '观战者操作被拒绝');

// 断线重连恢复观战席
const token = C.token;
C.close();
await sleep(300);
const C2 = new Client('观战者', '👁️');
C2.token = token;
await C2.wait((m) => m.t === 'welcome');
const cr2 = (await C2.wait((m) => m.t === 'room' && m.room.id === code, 5000)).room;
ok(cr2.isSpectator === true, '重连后仍为观战者');
ok(cr2.spectatorCount >= 1, '重连后观战人数');

// 观战者退出
C2.send({ t: 'leave' });
await sleep(300);
A.send({ t: 'leave' });
B.send({ t: 'leave' });
C2.close();
A.close();
B.close();
await sleep(200);
console.log(fail === 0 ? `PASS · ${pass} 项观战断言` : `FAIL · ${fail} 失败 / ${pass} 通过`);
if (fail) process.exit(1);
