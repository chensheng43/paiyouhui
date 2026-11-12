// 牌友汇 · 局域网牌局服务
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WSServer } from './ws.js';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function lanUrls() {
  const list = [];
  const seen = new Set();
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      list.push(`http://${info.address}:${PORT}`);
    }
  }
  return list;
}

// 原地更新，保证 RoomManager / HTTP 接口持有的还是同一个数组
function refreshLanUrls(urls) {
  const next = lanUrls();
  const same = next.length === urls.length && next.every((u, i) => u === urls[i]);
  if (same) return false;
  urls.splice(0, urls.length, ...next);
  return true;
}

const urls = lanUrls();
const manager = new RoomManager(urls);
const wss = new WSServer();
wss.onConnection = (client) => {
  // 每次新连接都重读网卡，DHCP 换 IP / 开关 VPN 后重连即可看到最新地址
  refreshLanUrls(urls);
  manager.attach(client);
};

// 运行中定时检查 DHCP / VPN 导致的变化，更新大厅里的地址
const urlTimer = setInterval(() => {
  if (!refreshLanUrls(urls)) return;
  console.log(`  局域网地址已更新：${urls.join('  ') || '（暂无）'}`);
  manager.scheduleLobby();
}, 10_000);
urlTimer.unref();

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (reqUrl.pathname === '/api/info') {
    refreshLanUrls(urls);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        name: '牌友汇',
        urls,
        port: PORT,
        online: manager.conns.size,
        rooms: manager.rooms.size,
        time: Date.now()
      })
    );
    return;
  }
  if (reqUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.normalize(path.join(PUBLIC, pathname));
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== PUBLIC) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('not file');
  } catch {
    // 单页应用回退
    if (!path.extname(pathname)) {
      filePath = path.join(PUBLIC, 'index.html');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 not found');
      return;
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'"
  });
  fs.createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('error');
    })
    .pipe(res);
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head);
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const c of wss.clients) {
    if (now - c.lastSeen > 75000) {
      c.close(4000);
    } else {
      c.ping();
    }
  }
}, 30000);
heartbeat.unref?.();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n端口 ${PORT} 已被占用。换一个端口启动：PORT=3100 npm start\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ♠ ♥  牌友汇 · 局域网牌局  ♣ ♦');
  console.log('  ─────────────────────────────');
  console.log(`  本机：   http://localhost:${PORT}`);
  for (const u of urls) console.log(`  局域网： ${u}`);
  console.log('');
  console.log('  同一个 Wi-Fi 下的手机/电脑打开上面的局域网地址');
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});

function shutdown() {
  console.log('\n正在关闭...');
  clearInterval(heartbeat);
  wss.closeAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
