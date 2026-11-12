// WebSocket 连接与自动重连
export class Net {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.retry = 0;
    this.manual = false;
    this.queue = [];
    this.connected = false;
    this.token = localStorage.getItem('pyh.token') || '';
    this.name = localStorage.getItem('pyh.name') || '';
    this.avatar = localStorage.getItem('pyh.avatar') || '';
    this.hasWelcomed = false;
  }

  connect() {
    this.manual = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      setTimeout(() => this.connect(), 1000);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.onStatus?.('online');
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        this.hasWelcomed = true;
        this.sendHello();
        return;
      }
      if (msg.t === 'welcome') {
        this.token = msg.token;
        localStorage.setItem('pyh.token', msg.token);
      }
      this.onMessage?.(msg);
    };
    ws.onclose = () => {
      this.connected = false;
      this.onStatus?.('offline');
      if (this.manual) return;
      const delay = Math.min(6000, 400 * Math.pow(1.5, Math.min(8, this.retry++)));
      setTimeout(() => {
        if (!this.manual) this.connect();
      }, delay);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  sendHello() {
    this.send({
      t: 'hello',
      token: this.token,
      name: this.name,
      avatar: this.avatar
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  updateProfile(name, avatar) {
    this.name = name;
    this.avatar = avatar;
    localStorage.setItem('pyh.name', name);
    localStorage.setItem('pyh.avatar', avatar);
  }
}
