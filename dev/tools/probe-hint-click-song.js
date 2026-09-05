// Зонд 0.169: клик по границам ячеек с кастомным превью в реальной песне
// пользователя (uploads/*.json, аргумент — путь к файлу): превью
// до/во время/после и refs модели. Требования те же, что у
// probe-hint-click.js. Ручной зонд, в тесты не входит.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const songFile = process.argv[2] || 'uploads/Scorpions - Wind of Change.struchord-6.json';
(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') console.error('[console]', m.text()); });
  const song = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', songFile), 'utf8'));
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); }, song);
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof loadSong === "function"');
  await page.evaluate(() => loadSong(0));
  await sleep(600);
  // все ячейки с кастомным превью
  const custom = await page.evaluate(() => [...document.querySelectorAll('.event-strum-preview.has-pattern:not(.is-inherited-slice)')].map((b) => {
    const w = b.closest('.chord-wrapper');
    const hasHandle = !!w.querySelector('.resize-handle');
    return { sec: b.dataset.sec, sq: b.dataset.square, ei: b.dataset.ei, hasHandle, key: `${b.dataset.sec}:${b.dataset.square}:${b.dataset.ei}`, ref: songRhythmRolls.refs.has(`${b.dataset.sec}:${b.dataset.square}:${b.dataset.ei}`) };
  }));
  console.log('custom cells:', custom.length, JSON.stringify(custom.slice(0, 12)));
  const targets = custom.filter((c) => c.hasHandle).slice(0, 4);
  for (const t of targets) {
    const sel = `.chord-wrapper[data-sec="${t.sec}"][data-square="${t.sq}"][data-ei="${t.ei}"]`;
    await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
    await sleep(200);
    const handle = await page.$(sel + ' .resize-handle');
    const box = await handle.boundingBox();
    if (!box) { console.log('no box', t.key); continue; }
    const before = await page.evaluate((sel) => { const b = document.querySelector(sel + ' .event-strum-preview'); return `${b.className} n=${b.querySelectorAll('.strum-step').length}`; }, sel);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(80);
    await page.mouse.down();
    await sleep(400);
    const during = await page.evaluate((sel) => { const b = document.querySelector(sel + ' .event-strum-preview'); const ov = document.querySelector('.square-inner .rhythm-hints'); return `prev=${b.className} op=${getComputedStyle(b).opacity} overlay=${!!ov} hints=${ov ? [...ov.querySelectorAll('.rhythm-hint')].map(h => (h.classList.contains('is-in') ? 'in' : '--') + ':' + h.querySelectorAll('.rhythm-hint-hit').length).join(' ') : ''}`; }, sel);
    await page.mouse.up();
    await sleep(1500);
    const after = await page.evaluate((sel, key) => { const b = document.querySelector(sel + ' .event-strum-preview'); return `${b ? b.className + ' n=' + b.querySelectorAll('.strum-step').length + ' op=' + getComputedStyle(b).opacity : 'NO EL'} ref=${songRhythmRolls.refs.has(key)}`; }, sel, t.key);
    console.log(`\n[${t.key}]\n  before: ${before}\n  during: ${during}\n  after:  ${after}`);
  }
  await browser.close();
})();
