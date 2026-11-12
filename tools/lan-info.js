// 打印本机可用的局域网地址
import os from 'node:os';
const port = Number(process.env.PORT) || 3000;
const urls = [];
const seen = new Set();
for (const infos of Object.values(os.networkInterfaces())) {
  for (const info of infos || []) {
    if (info.family !== 'IPv4' || info.internal) continue;
    if (seen.has(info.address)) continue;
    seen.add(info.address);
    urls.push(`http://${info.address}:${port}`);
  }
}
console.log('牌友汇 · 局域网地址');
console.log(`本机：   http://localhost:${port}`);
for (const u of urls) console.log(`局域网： ${u}`);
console.log('');
console.log('手机与电脑连接同一个 Wi-Fi，在浏览器打开上面的局域网地址。');
