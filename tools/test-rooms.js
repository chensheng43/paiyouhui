// 房间筹码规则回归：不自动补码；德州/炸金花筹码耗尽转观战席；下一局座位重排
import assert from 'node:assert/strict';
import { Room, GAMES } from '../server/rooms.js';

const rooms = [];
function makeManager() {
  return {
    conns: new Map(),
    destroyed: null,
    destroyRoom(r) { this.destroyed = r.id; },
    scheduleLobby() {},
    sessionByPlayer() { return null; }
  };
}
function mkRoom(game, opts) {
  const manager = makeManager();
  const room = new Room(manager, GAMES[game], 'h', opts);
  rooms.push(room);
  return room;
}

console.log('· 炸金花：筹码耗尽转观战席，房主移交');
{
  const room = mkRoom('zhajinhua', { ante: 10, cap: 200, startChips: 1000 });
  room.addPlayer('h', 'Host', '🦊');
  room.addPlayer('p2', 'P2', '🐼');
  room.addPlayer('p3', 'P3', '🐯');
  room.phase = 'playing';
  room.engine = { isOver: true, result: { chips: [0, 0, 3000], winners: [{ seat: 2, amount: 3000 }] } };
  room.checkOver();
  assert.equal(room.phase, 'over');
  assert.equal(room.players.length, 1);
  assert.ok(room.spectators.some((p) => p.id === 'h'));
  assert.ok(room.spectators.some((p) => p.id === 'p2'));
  assert.equal(room.hostId, 'p3');
  assert.deepEqual(room.players.map((p) => p.seat), [2]);
  assert.ok(room.feed.some((f) => f.text.includes('自动转入观战席')));
  assert.ok(room.matchNote && room.matchNote.includes('只剩 P3 还有筹码'), 'zhajinhua single player should end match');
  assert.ok(room.result, 'result should stay for the result screen');
}

console.log('· 德州：筹码耗尽转观战席');
{
  const room = mkRoom('texas', { bigBlind: 20, startChips: 1000 });
  room.addPlayer('h', 'Host', '🦊');
  room.addPlayer('p2', 'P2', '🐼');
  room.addPlayer('p3', 'P3', '🐯');
  room.phase = 'playing';
  room.engine = { isOver: true, result: { chips: [1000, 0, 2000], winners: [{ seat: 2, amount: 900 }] } };
  room.checkOver();
  assert.equal(room.phase, 'over');
  assert.equal(room.players.length, 2);
  assert.ok(room.spectators.some((p) => p.id === 'p2'));
  assert.equal(room.spectators.find((p) => p.id === 'p2')?.connected, true);
  assert.equal(room.matchNote, null, '2 players is still enough for texas');
}

console.log('· 开局不自动补码，短码保持原样');
{
  const room = mkRoom('zhajinhua', { ante: 10, cap: 200, startChips: 1000 });
  room.addPlayer('a', 'A', '🦊');
  room.addPlayer('b', 'B', '🐼');
  room.addPlayer('c', 'C', '🐯');
  room.phase = 'over';
  room.players[0].score = 5;
  assert.equal(room.startRound().ok, true);
  assert.equal(room.players[0].score, 5);
  assert.equal(room.engine.players[0].chips, 0);
  assert.equal(room.engine.players[0].allin, true);
  assert.ok(!room.feed.some((f) => f.text.includes('自动补码')));
}

console.log('· 机器人筹码耗尽离桌，不占观战席');
{
  const room = mkRoom('texas', { bigBlind: 20, startChips: 1000 });
  room.addPlayer('h', 'Host', '🦊');
  room.addBot('Bot');
  room.addBot('Bot2');
  room.addPlayer('p4', 'P4', '🐯');
  room.phase = 'playing';
  const bot = room.players.find((p) => p.id.startsWith('bot-'));
  bot.score = 0;
  room.engine = { isOver: true, result: { chips: [1000, 0, 1000, 1000], winners: [{ seat: 0, amount: 100 }] } };
  room.checkOver();
  assert.equal(room.players.some((p) => p.id === bot.id), false);
  assert.equal(room.spectators.some((p) => p.id === bot.id), false);
  assert.ok(room.feed.some((f) => f.text.includes('离开牌桌')));
}

console.log('· 出局后下一局座位连续');
{
  const room = mkRoom('texas', { bigBlind: 20, startChips: 1000 });
  room.addPlayer('h', 'Host', '🦊');
  room.addPlayer('p2', 'P2', '🐼');
  room.addPlayer('p3', 'P3', '🐯');
  room.phase = 'playing';
  room.engine = { isOver: true, result: { chips: [0, 900, 2100], winners: [{ seat: 2, amount: 300 }] } };
  room.checkOver();
  assert.deepEqual(room.players.map((p) => p.seat), [1, 2]);
  room.phase = 'over';
  assert.equal(room.startRound().ok, true);
  assert.deepEqual(room.players.map((p) => p.seat), [0, 1]);
  assert.equal(room.engine.players.length, 2);
}

console.log('· 有人 0 筹码时开局：先转观战席，人数不足则拒绝');
{
  const room = mkRoom('zhajinhua', { ante: 10, cap: 200, startChips: 1000 });
  room.addPlayer('a', 'A', '🦊');
  room.addPlayer('b', 'B', '🐼');
  room.addPlayer('c', 'C', '🐯');
  room.phase = 'over';
  room.players[0].score = 0;
  const res = room.startRound();
  assert.equal(res.ok, false);
  assert.ok(room.spectators.some((p) => p.id === 'a'));
  assert.equal(room.players.length, 2);
  assert.equal(room.players[0].score, 1000);
  assert.ok(room.matchNote && room.matchNote.includes('只剩'), 'start fallback should set match note');
}

console.log('· 德州只剩一人：停在结算页提示，重新入座后清除提示');
{
  const room = mkRoom('texas', { bigBlind: 20, startChips: 1000 });
  room.addPlayer('h', 'Host', '🦊');
  room.addPlayer('p2', 'P2', '🐼');
  room.phase = 'playing';
  room.engine = { isOver: true, result: { chips: [0, 2000], winners: [{ seat: 1, amount: 2000 }] } };
  room.checkOver();
  assert.equal(room.phase, 'over');
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].score, 2000, 'winner keeps chips');
  assert.ok(room.matchNote && room.matchNote.includes('只剩 P2 还有筹码'));
  assert.equal(room.hostId, 'p2');
  // 破产者重新入座：回到准备阶段，提示清除，按初始筹码重新买入
  room.addPlayer('h', 'Host', '🦊');
  assert.equal(room.phase, 'waiting');
  assert.equal(room.matchNote, null);
  assert.equal(room.players.length, 2);
  assert.equal(room.players.find((p) => p.id === 'h')?.score, 1000);
}

for (const room of rooms) room.clearTimers();
console.log('PASS · 房间筹码规则 7 组断言');
process.exit(0);
