#!/usr/bin/env node
/* B-12.11 этап 2 (план владельца) — замер GP-страницы целиком на 149 тактах:
 * время построения конвертера, первой отрисовки и перерисовки после правки
 * ноты в середине песни. Запуск: node dev/bench/b12-11-page-perf.js */
const fs = require('fs');
const http = require('http');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url.replace(/^\//, '') || 'STRUCHORD.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});

function bigSong() {
  // 149 тактов: 10 секций по 16 квадратов (последняя — 5), ноты адресуются
  // внутри своей секции, как в настоящих песнях.
  const sections = [];
  const rolls = {};
  let bar = 0;
  for (let s = 0; s < 10 && bar < 149; s++) {
    const squares = [];
    const notes = [];
    for (let q = 0; q < 16 && bar < 149; q++, bar++) {
      squares.push({ id: 100 + s * 16 + q, repeat: 1, customBeats: 4, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] });
      for (let b = 0; b < 4; b++) notes.push({ start: q * 4 + b, dur: 1, string: 5 - (b % 3), fret: (bar + b) % 12 });
    }
    sections.push({ id: s + 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null,
      repeat: 1, strumPattern: null, squares });
    rolls[String(s + 1)] = notes;
  }
  return {
    schemaVersion: 5, metadata: { artist: 'Bench', title: '149 bars' }, bpm: 120, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
    sections,
    parts: [{ id: 7, name: 'Гитара', instrument: 'guitar', tuning: null, visible: true, rolls }],
    nextId: 500, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
  };
}

(async () => {
  await new Promise((r) => server.listen(8905, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 1000 },
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 160)));
  await page.goto('http://127.0.0.1:8905/STRUCHORD.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  const t0 = Date.now();
  await page.evaluate((song) => {
    localStorage.setItem('struchord_songs', JSON.stringify([song]));
    loadSong(0);
    render();
    togglePartsMode(true);
    setPartsScoreEngine('alphatab');
  }, bigSong());
  let firstSvg = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const n = await page.evaluate(() => document.querySelectorAll('#ptAtHost svg').length);
    if (n > 0) { firstSvg = Date.now() - t0; break; }
  }
  const built = await page.evaluate(() => {
    const t = performance.now();
    const b = buildPartsAlphaScore(partsEnsureAlphaTab());
    return { buildMs: Math.round(performance.now() - t), bars: b.barCount };
  });
  console.log('тактов:', built.bars, '; построение конвертера:', built.buildMs, 'мс; первая картинка через', firstSvg, 'мс');
  // Правка в середине песни: добавляем ноту в такт 100 и перерисовываем.
  const edit = await page.evaluate(() => new Promise((resolve) => {
    const roll = songParts[0].rolls['6'];
    roll.push({ start: 20, dur: 1, string: 5, fret: 7 });
    const before = document.getElementById('ptAtHost').innerHTML.length;
    const t = performance.now();
    renderPartsAlphaTab();
    const timer = setInterval(() => {
      const now = document.getElementById('ptAtHost').innerHTML.length;
      if (now !== before) {
        clearInterval(timer);
        resolve({ editMs: Math.round(performance.now() - t), svgs: document.querySelectorAll('#ptAtHost svg').length });
      }
    }, 25);
    setTimeout(() => { clearInterval(timer); resolve({ editMs: -1, svgs: 0 }); }, 15000);
  }));
  console.log('правка ноты в середине песни: перерисовка', edit.editMs, 'мс; svg-систем на странице:', edit.svgs);
  await browser.close();
  await new Promise((r) => server.close(r));
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
