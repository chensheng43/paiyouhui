// 极简 WebSocket 服务端（RFC 6455），零依赖。
// 只实现本项目需要的部分：文本消息、分片、ping/pong、close。
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1024 * 1024;

export class WSClient {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = null;
    this.fragOp = 0;
    this.closed = false;
    this.didClose = false;
    this.lastSeen = Date.now();
    this.onMessage = null;
    this.onClose = null;

    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
    socket.on('data', (d) => this._feed(d));
    socket.on('error', () => this.close());
    socket.on('close', () => this._closed());
    socket.on('end', () => this.close());
  }

  _feed(data) {
    if (this.closed) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, data]) : data;

    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;

      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big);
        off = 10;
      }
      if (len > MAX_MESSAGE) return this.close(1009);
      if (masked && this.buf.length < off + 4) return;

      const total = off + (masked ? 4 : 0) + len;
      if (this.buf.length < total) return;

      let payload;
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.allocUnsafe(len);
        const src = this.buf.subarray(off + 4, total);
        for (let i = 0; i < len; i++) payload[i] = src[i] ^ mask[i & 3];
      } else {
        payload = this.buf.subarray(off, total);
      }
      this.buf = this.buf.subarray(total);

      // 控制帧
      if (op === 0x8) return this.close(1000);
      if (op === 0x9) {
        this._sendFrame(0xa, payload);
        continue;
      }
      if (op === 0xa) continue;

      if (op === 0x0) {
        if (!this.frag) continue;
        this.frag.push(payload);
        if (fin) {
          const full = Buffer.concat(this.frag);
          const fop = this.fragOp;
          this.frag = null;
          this.fragOp = 0;
          this._message(fop, full);
        }
        continue;
      }
      if (op === 0x1 || op === 0x2) {
        if (!fin) {
          this.frag = [payload];
          this.fragOp = op;
        } else {
          this._message(op, payload);
        }
      }
    }
  }

  _message(op, buf) {
    this.lastSeen = Date.now();
    if (op !== 0x1) return;
    let msg;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    if (this.onMessage) this.onMessage(msg);
  }

  _sendFrame(op, payload) {
    if (this.didClose || this.socket.destroyed) return;
    const len = payload.length;
    let head;
    if (len < 126) {
      head = Buffer.from([0x80 | op, len]);
    } else if (len < 65536) {
      head = Buffer.allocUnsafe(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.allocUnsafe(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([head, payload]));
    } catch {
      this.close();
    }
  }

  send(obj) {
    const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
    this._sendFrame(0x1, Buffer.from(text, 'utf8'));
  }

  ping() {
    this._sendFrame(0x9, Buffer.alloc(0));
  }

  close(code = 1000) {
    if (this.closed) return;
    try {
      const b = Buffer.allocUnsafe(2);
      b.writeUInt16BE(code, 0);
      this._sendFrame(0x8, b);
    } catch {
      /* ignore */
    }
    this.closed = true;
    try {
      this.socket.end();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        this.socket.destroy();
      } catch {
        /* ignore */
      }
    }, 120).unref?.();
    this._closed();
  }

  _closed() {
    this.closed = true;
    if (this.didClose) return;
    this.didClose = true;
    const cb = this.onClose;
    this.onClose = null;
    this.onMessage = null;
    if (cb) cb();
  }
}

export class WSServer {
  constructor() {
    this.clients = new Set();
    this.onConnection = null;
  }

  handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const client = new WSClient(socket);
    this.clients.add(client);
    client.onClose = () => this.clients.delete(client);
    if (this.onConnection) this.onConnection(client, req);
    if (head && head.length) client._feed(head);
  }

  broadcast(obj) {
    for (const c of this.clients) c.send(obj);
  }

  closeAll() {
    for (const c of this.clients) c.close(1001);
  }
}
