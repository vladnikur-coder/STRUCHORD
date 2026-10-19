#!/usr/bin/env node
/* «Виды», шаг 1+4 — живая проверка в Chromium: Police без партий ->
 * «Партии» сразу показывают аккомпанемент табами; ввод нот запрещён;
 * переключатель видов туда-обратно. Запуск: node dev/bench/views-step1-check.js */
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
  await new Promise((r) => server.listen(8911, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message)));
  await page.goto('http://127.0.0.1:8911/STRUCHORD.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(2500);
  const song = fs.readFileSync(path.join(ROOT, 'uploads', 'Police - Every breath you take.struchord-2.json'), 'utf8');
  await page.evaluate((raw) => {
    localStorage.setItem('struchord_songs', JSON.stringify([JSON.parse(raw)]));
    loadSong(0); render();
  }, song);
  await sleep(600);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const ok = btns.find((b) => b.textContent.trim() === 'Продолжить');
    if (ok) ok.click();
  });
  await sleep(500);
  const r1 = await page.evaluate(() => {
    togglePartsMode(true);
    setPartsScoreEngine('native');
    renderPartsScreen();
    return {
      active: partActivePart() && partActivePart().id,
      chip: !!document.querySelector('.pt-track-chip.is-derived'),
      notes: document.querySelectorAll('#partsTrack .pt-note').length,
      rows: document.querySelectorAll('#partsTrack .pt-row').length,
      parts: songParts.length,
    };
  });
  await sleep(400);
  await page.screenshot({ path: '/tmp/views-step1.png' });
  const r2 = await page.evaluate(() => {
    const before = JSON.stringify(accompDerivedPart().rolls);
    partsCursor = { partId: 'accomp', secId: sections[0].id, pass: 0, string: 5, pos: 0, pitch: null, staffPitch: null, staffClef: null };
    inputPartFret(3);
    const unchanged = JSON.stringify(accompDerivedPart().rolls) === before;
    setSongView('editor');
    const editor = !partsMode;
    setSongView('parts');
    return { unchanged, editor, back: partsMode === true, viewBtn: !!document.querySelector('[data-song-view="parts"].is-active') };
  });
  console.log('ПОКАЗ:', JSON.stringify(r1));
  console.log('ЗАПРЕТ+ВИДЫ:', JSON.stringify(r2));
  console.log('pageerrors:', errors.length ? errors.join(' | ') : 'нет');
  await browser.close();
  server.close();
  const ok = r1.active === 'accomp' && r1.notes > 50 && r1.parts === 0 && r2.unchanged && r2.editor && r2.back && !errors.length;
  console.log(ok ? 'КРИТЕРИЙ OK' : 'КРИТЕРИЙ НЕ ВЫПОЛНЕН');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
