#!/usr/bin/env node
/* B-12.11 этап 5 — живая проверка Global View в настоящем Chromium.
 * Критерий этапа: такты 5–8 второй дорожки скопировать на первую не более
 * чем за три действия (протяжка, Ctrl+C, клик + Ctrl+V) — настоящим
 * указателем по настоящим ячейкам. Запуск: node dev/bench/b12-11-gv-check.js */
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
  await new Promise((r) => server.listen(8907, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1440, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.goto('http://127.0.0.1:8907/STRUCHORD.html', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  // Песня: секция 8 тактов, две дорожки; у баса ноты в тактах 5–8.
  await page.evaluate(() => {
    const square = (id) => ({ id, repeat: 1, customBeats: 4, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] });
    const song = {
      schemaVersion: 5, metadata: { artist: 'A', title: 'GV' }, bpm: 120, globalKey: 'C',
      keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
      sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares: [11, 12, 13, 14, 15, 16, 17, 18].map(square) }],
      parts: [
        { id: 1, name: 'Гитара', instrument: 'guitar', tuning: null, visible: true, rolls: { '1': [] } },
        { id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true, rolls: { '1': [
          { start: 16, dur: 1, string: 3, fret: 2 }, { start: 20, dur: 1, string: 3, fret: 4 },
          { start: 24, dur: 1, string: 2, fret: 1 }, { start: 28, dur: 1, string: 2, fret: 3 } ] } },
      ],
      nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
    };
    localStorage.setItem('struchord_songs', JSON.stringify([song]));
    loadSong(0);
    render();
    togglePartsMode(true);
  });
  await sleep(1200);
  const layout = await page.evaluate(() => {
    const gv = document.getElementById('partsMixer').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('#ptGv .pt-gv-lab[data-ch]')).map((el) => el.dataset.ch);
    const filled = document.querySelectorAll('#ptGv .pt-gv-cell.has-notes').length;
    return { gvTop: Math.round(gv.top), gvH: Math.round(gv.height), rows, filled };
  });
  console.log('LAYOUT', JSON.stringify(layout));
  await page.evaluate(() => document.getElementById('partsMixer').scrollIntoView({ block: 'end' }));
  await sleep(400);
  const center = async (sel) => {
    const el = await page.$(sel);
    const box = await el.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const ids = await page.evaluate(() => songParts.map((p) => p.id));
  // Действие 1: протяжка по тактам 5–8 баса настоящим указателем.
  const from = await center(`#ptGv .pt-gv-cell[data-ch="part:${ids[1]}"][data-bar="4"]`);
  const to = await center(`#ptGv .pt-gv-cell[data-ch="part:${ids[1]}"][data-bar="7"]`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await sleep(300);
  console.log('SEL', await page.evaluate(() => JSON.stringify(partsBarSel)));
  // Действие 2: Ctrl+C.
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Control');
  await sleep(200);
  console.log('CLIP', await page.evaluate(() => partsBarClipboard && partsBarClipboard.notes.length));
  // Действие 3: клик по такту 5 гитары + Ctrl+V.
  const target = await center(`#ptGv .pt-gv-cell[data-ch="part:${ids[0]}"][data-bar="4"]`);
  await page.mouse.click(target.x, target.y);
  await sleep(200);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyV');
  await page.keyboard.up('Control');
  await sleep(400);
  const result = await page.evaluate(() => ({
    guitar: (songParts[0].rolls['1'] || []).map((n) => n.start).sort((a, b) => a - b),
    bass: (songParts[1].rolls['1'] || []).length,
    active: partsActiveId,
  }));
  console.log('RESULT', JSON.stringify(result));
  const ok = JSON.stringify(result.guitar) === '[16,20,24,28]' && result.bass === 4;
  await page.screenshot({ path: '/tmp/b12-11-gv.png' });
  await page.evaluate(() => document.getElementById('partsMixer').scrollIntoView({ block: 'end' })); await sleep(500); await page.screenshot({ path: '/tmp/b12-11-gv2.png' });
  console.log(ok ? 'CRITERION OK: такты 5–8 дорожки 2 на дорожке 1 за 3 действия' : 'CRITERION FAIL');
  console.log('pageerrors:', errors.length ? errors.join(' | ') : 'нет');
  await browser.close();
  server.close();
  process.exit(ok && !errors.length ? 0 : 1);
})().catch((e) => { console.error('ERR', e); process.exit(2); });
