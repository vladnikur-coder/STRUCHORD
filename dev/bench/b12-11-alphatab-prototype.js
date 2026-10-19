#!/usr/bin/env node
/* B-12.11 этап 1 — одноразовый прототип (НЕ часть приложения и не тест приёмки).
 * Открывает dev/bench/b12-11-alphatab-prototype.html в настоящем Chromium тремя отдельными
 * запусками (A — без нотного шрифта, B — шрифт data-URL + наша партия, C — импортированный .gp5)
 * и печатает отчёт: отрисовалось ли, сколько занимает перерисовка на «каждое нажатие»,
 * приходят ли события клика по доле/ноте, работает ли выделение тактов.
 * Запуск: node dev/bench/b12-11-alphatab-prototype.js (нужны /tmp/chromium и /tmp/al2023,
 * см. dev/tools/setup-acceptance.sh; шрифт — /tmp/atfont/package/dist/font/Bravura.woff2). */
const fs = require('fs');
const http = require('http');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const FONT = '/tmp/atfont/package/dist/font/Bravura.woff2';
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

async function runMode(browser, mode) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  let netRequests = 0;
  page.on('request', () => { netRequests++; });
  await page.goto('http://127.0.0.1:8901/dev/bench/b12-11-alphatab-prototype.html?only=' + mode,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__report && window.__report.done', { timeout: 180000 });
  await sleep(400);
  const report = await page.evaluate(() => window.__report);
  const logs = await page.evaluate(() => document.getElementById('log').textContent);
  let clickEvents = null;
  if (mode === 'B') {
    const box = await page.evaluate(() => {
      const svg = document.querySelector('#atDataFont svg');
      if (!svg) return null;
      const texts = Array.from(svg.querySelectorAll('text')).filter((t) => /^[0-9]+$/.test(t.textContent.trim()));
      if (!texts.length) return null;
      const r = (texts[2] || texts[0]).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (box) {
      await page.mouse.click(box.x, box.y);
      await sleep(600);
      clickEvents = await page.evaluate(() => window.__report.events);
    }
    // Офлайн: сеть выключена — рендер на data-URL шрифте обязан жить без запросов.
    await page.setOfflineMode(true);
    const before = netRequests;
    await sleep(900);
    clickEvents = { mouse: clickEvents, offlineNewRequests: netRequests - before };
    await page.screenshot({ path: '/tmp/b12-11-prototype-B.png' });
  }
  console.log('===== режим ' + mode + ' =====');
  console.log(logs);
  console.log('флаги:', JSON.stringify({
    noFont: report.noFont, dataFont: report.dataFont, editMs: report.editMs,
    hasBounds: report.hasBounds, highlightOk: report.highlightOk,
    gp5All: report.gp5All, gp5One: report.gp5One, pitches: report.pitches,
    fatal: report.fatal || null, clickEvents,
  }));
  console.log('ошибок страницы:', errors.length ? errors.slice(0, 4) : 'нет');
  await page.close();
}

(async () => {
  if (!fs.existsSync(FONT)) {
    console.log('НЕТ шрифта ' + FONT + ' — сначала в /tmp: npm pack @coderline/alphatab@1.8.4 и распаковать пакет');
    process.exit(2);
  }
  await new Promise((r) => server.listen(8901, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 1100 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
  });
  for (const mode of ['A', 'B', 'C']) await runMode(browser, mode);
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
