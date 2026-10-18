#!/usr/bin/env node
/* B-12.11 — одноразовая проверка GP-вида в настоящем Chromium (не тест приёмки).
 * Открывает приложение, грузит демо-партию, включает GP-вид и смотрит:
 * отрисовался ли alphaTab офлайн (шрифт из файла), сколько нот, где курсор,
 * приходит ли наш курсор после клика. Запуск: node dev/bench/b12-11-gp-view-check.js */
const fs = require('fs');
const http = require('http');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(ROOT, url.replace(/^\/+/, '') || 'STRUCHORD.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(8903, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 1000 },
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto('http://127.0.0.1:8903/STRUCHORD.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  const fixture = fs.readFileSync(path.join(ROOT, 'dev/fixtures/b12-parts-demo.struchord'), 'utf8');
  await page.evaluate((json) => {
    localStorage.setItem('struchord_songs', JSON.stringify([JSON.parse(json)]));
    loadSong(0);
    render();
    togglePartsMode(true);
    setPartsScoreEngine('alphatab');
  }, fixture);
  await sleep(3500);
  const state = await page.evaluate(() => ({
    engine: partsScoreEngine,
    status: document.getElementById('ptAtStatus') && document.getElementById('ptAtStatus').textContent,
    svgs: document.querySelectorAll('#ptAtHost svg').length,
    texts: document.querySelectorAll('#ptAtHost svg text').length,
    cursorHidden: document.getElementById('ptAtCursor').hidden,
    cursorBox: (() => { const b = document.getElementById('ptAtCursor'); return b ? { l: b.style.left, t: b.style.top, w: b.style.width } : null; })(),
    fonts: Array.from(document.fonts).map((f) => f.family + ':' + f.status).join(','),
    cursor: partsCursor && { sec: partsCursor.secId, pos: partsCursor.pos, str: partsCursor.string },
  }));
  console.log(JSON.stringify(state, null, 1));
  // Клик по партитуре alphaTab: ищем текстовый глиф лада и кликаем.
  const pt = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('#ptAtHost svg text')).filter((t) => /^[0-9]+$/.test(t.textContent.trim()));
    if (!texts.length) return null;
    const r = texts[1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (pt) {
    await page.mouse.click(pt.x, pt.y);
    await sleep(800);
    console.log('после клика курсор:', JSON.stringify(await page.evaluate(() => partsCursor && { pos: partsCursor.pos, str: partsCursor.string })));
  } else console.log('клик: глифы ладов не найдены');
  // Ввод цифры в GP-виде: модель меняется и перерисовка догоняет.
  const before = await page.evaluate(() => (songParts[0].rolls[String(sections[0].id)] || []).length);
  await page.keyboard.press('7');
  await sleep(700);
  const after = await page.evaluate(() => (songParts[0].rolls[String(sections[0].id)] || []).length);
  console.log('ноты до/после цифры 7:', before, '/', after);
  await page.screenshot({ path: '/tmp/b12-11-gp-view.png' });
  console.log('скриншот /tmp/b12-11-gp-view.png; ошибок страницы:', errors.length ? errors.slice(0, 3) : 'нет');
  await browser.close();
  await new Promise((r) => server.close(r));
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
