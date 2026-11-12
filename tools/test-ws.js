// 端到端联机测试：3 个 WebSocket 客户端开房、准备、开局、自动出牌到结束
const URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';

class Client {
  constructor(name, avatar) {
    this.name = name;
    this.avatar = avatar;
    this.inbox = [];
    this.room = null;
    this.pending = false;
    this.ws = new WebSocket(URL);
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'hello') {
        this.ws.send(JSON.stringify({ t: 'hello', name, avatar }));
        return;
      }
      if (msg.t === 'room') this.room = msg.room;
      if (msg.t === 'hint') this.onHint(msg);
      if (msg.t === 'error') console.log(`[${name}] error:`, msg.message);
      this.inbox.push(msg);
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  async wait(pred, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`${this.name} wait timeout`);
  }
  async welcome() {
    return this.wait((m) => m.t === 'welcome');
  }
  tick() {
    const room = this.room;
    if (!room || room.phase !== 'playing' || this.pending) return;
    const s = room.state;
    if (!s) return;
    const mine = room.mySeat;
    if (s.phase === 'bid') {
      if (s.turn !== mine) return;
      const value = this.name === 'A' ? (s.highestBid < 3 ? 3 : 0) : 0;
      if (this.name === 'A' && value <= s.highestBid) return;
      this.send({ t: 'action', action: { type: 'bid', value } });
      return;
    }
    if (s.phase === 'play') {
      if (s.turn !== mine) return;
      this.pending = true;
      this.send({ t: 'action', action: { type: 'hint' } });
    }
  }
  onHint(msg) {
    const room = this.room;
    if (!room || room.phase !== 'playing' || this.pending !== true) return;
    this.pending = false;
    const s = room.state;
    if (!s || s.turn !== room.mySeat) return;
    if (msg.cards && msg.cards.length) {
      this.send({ t: 'action', action: { type: 'play', cards: msg.cards } });
    } else {
      this.send({ t: 'action', action: { type: 'pass' } });
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = new Client('A', '🦊');
const B = new Client('B', '🐼');
const C = new Client('C', '🐯');
const [wa] = await Promise.all([A.welcome(), B.welcome(), C.welcome()]);
console.log('welcome ok, games:', wa.games.map((g) => g.name).join('/'));
A.send({ t: 'create', game: 'doudizhu', options: {} });
await A.wait((m) => m.t === 'room');
const code = A.room.id;
console.log('room', code);
B.send({ t: 'join', roomId: code });
C.send({ t: 'join', roomId: code });
while (!A.room || A.room.players.length < 3) await sleep(20);
B.send({ t: 'chat', text: '端到端聊天测试' });
const chatRoom = await C.wait((m) => m.t === 'room' && m.room.feed?.some((f) => f.type === 'chat' && f.text === '端到端聊天测试'));
const chatItem = chatRoom.room.feed.find((f) => f.type === 'chat' && f.text === '端到端聊天测试');
if (typeof chatItem.id !== 'number' || !chatItem.by || chatItem.name !== 'B') {
  console.log('FAILED: chat feed item', chatItem);
  process.exit(1);
}
console.log('chat ok: id', chatItem.id, 'by', chatItem.by, 'name', chatItem.name);
B.send({ t: 'ready', value: true });
C.send({ t: 'ready', value: true });
await sleep(80);
A.send({ t: 'start' });
const t0 = Date.now();
let lastPhase = '';
while (Date.now() - t0 < 45000) {
  A.tick(); B.tick(); C.tick();
  if (A.room?.phase === 'over') break;
  if (A.room?.phase !== lastPhase) {
    lastPhase = A.room?.phase;
    console.log('phase ->', lastPhase, 'round', A.room?.roundNo);
  }
  await sleep(30);
}
if (A.room?.phase !== 'over') {
  console.log('FAILED: not finished', A.room?.state?.phase, A.room?.state?.counts);
  process.exit(1);
}
const result = A.room.state.result;
console.log('game over:', result.landlordWin ? '地主胜' : '农民胜', 'base', result.base, 'mult', result.multiplier, 'deltas', result.deltas);
const sum = result.deltas.reduce((a, b) => a + b, 0);
console.log('score sum', sum, 'scores', A.room.players.map((p) => p.name + ':' + p.score).join(' '));
A.send({ t: 'leave' });
B.send({ t: 'leave' });
C.send({ t: 'leave' });
await sleep(200);
A.ws.close();
B.ws.close();
C.ws.close();
if (sum !== 0) process.exit(1);
console.log('PASS');
