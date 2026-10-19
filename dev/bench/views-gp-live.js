#!/usr/bin/env node
/*
 * views-gp-live.js — живая приёмка GP-вида аккомпанемента.
 * Police -> «Партии» -> GP-вид: первая дорожка «Песня (аккорды)»,
 * подписи аккордов над табом, страница без ошибок.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const sparticuz = require('@sparticuz/chromium').default;

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8915;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(800);
  const browser = await puppeteer.launch({
    headless: 'new', args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/STRUCHORD.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadSong === 'function', { timeout: 30000 });
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'uploads', 'Police - Every breath you take.struchord-2.json'), 'utf8'));
  await page.evaluate((data) => {
    localStorage.setItem('struchord_songs', JSON.stringify([data]));
    loadSong(0);
    render();
    togglePartsMode(true);
    setPartsScoreEngine('alphatab');
  }, parsed);
  // Диалог разбора старой песни (наследие формата) — подтверждаем.
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const ok = btns.find((b) => b.textContent.trim() === 'Продолжить');
    if (ok) ok.click();
  });
  await sleep(600);
  // alphaTab рендерит асинхронно; ждём SVG и тексты подписей.
  let svgInfo = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    svgInfo = await page.evaluate(() => {
      const host = document.getElementById('ptAtHost');
      if (!host) return null;
      const texts = Array.from(host.querySelectorAll('text')).map((t) => t.textContent.trim());
      const status = (document.getElementById('ptAtStatus') || {}).textContent || '';
      return {
        svgCount: host.querySelectorAll('svg').length,
        hasAadd9: texts.some((t) => t === 'Aadd9'),
        hasFsharp: texts.some((t) => t.indexOf('F#m') === 0),
        sample: texts.filter((t) => /add9|sus2|^[A-G]#?m?$/.test(t)).slice(0, 8),
        status,
      };
    });
    if (svgInfo && svgInfo.svgCount > 0) break;
  }
  console.log('[gp-live] svg:', JSON.stringify(svgInfo));
  await page.evaluate(() => { const h = document.getElementById('ptAtHost'); if (h) h.scrollTop = 0; });
  await sleep(500);
  await page.screenshot({ path: '/tmp/views-gp.png' });
  console.log('[gp-live] pageerrors:', errors.length ? errors.slice(0, 3) : 'нет');
  const ok = !!svgInfo && svgInfo.svgCount > 0 && svgInfo.hasAadd9 && errors.length === 0;
  console.log('[gp-live] ИТОГ:', ok ? 'OK' : 'ПРОВЕРИТЬ');
  await browser.close();
  server.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
