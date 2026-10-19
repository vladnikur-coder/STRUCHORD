#!/usr/bin/env node
/* B-12.11 ворота alphaTab — скорость окном тактов (одноразовый замер, НЕ тест приёмки).
 * Открывает dev/bench/b12-11-gate-speed.html: .gp5 149 тактов, окно 16 тактов,
 * правка ноты + перерисовка; затем то же при 4x троттлинге ЦП (эмуляция планшета).
 * Нужны /tmp/atx/package (npm pack @coderline/alphatab@1.8.4) и Chromium из
 * dev/tools/setup-acceptance.sh. Запуск: node dev/bench/b12-11-gate-speed.js */
const fs = require('fs');
const http = require('http');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const FONT = '/tmp/atx/package/dist/font/Bravura.woff2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.startsWith('/__bravura__/')) {
    res.writeHead(200, { 'Content-Type': 'font/woff2' });
    fs.createReadStream(FONT).pipe(res);
    return;
  }
  const file = path.join(ROOT, url.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  if (!fs.existsSync(FONT)) { console.log('НЕТ ' + FONT + ' — npm pack @coderline/alphatab@1.8.4 в /tmp/atx'); process.exit(2); }
  await new Promise((r) => server.listen(8902, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 1100 },
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://127.0.0.1:8902/dev/bench/b12-11-gate-speed.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__report && window.__report.done', { timeout: 180000 });
  console.log(await page.evaluate(() => document.getElementById('log').textContent));

  // Эмуляция планшета: 4x троттлинг ЦП (это НЕ живой iPad — честная оговорка).
  const client = await page.createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const throttled = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      window.__note.fret = (window.__note.fret + 1) % 20;
      const p = window.__waitRender(window.__api);
      window.__api.render();
      out.push(Math.round(await p));
    }
    return out;
  });
  console.log('[окно, ЦП 4x медленнее — эмуляция планшета] перерисовка после правки, мс: ' + throttled.join(', '));
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await sleep(200);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
