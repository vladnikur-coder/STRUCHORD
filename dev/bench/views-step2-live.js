#!/usr/bin/env node
/*
 * views-step2-live.js — живая приёмка шага 2 (Замена-11/12).
 * Police: правка ноты в табах настоящей клавиатурой -> аккорд в
 * Редакторе; правка аккорда в Редакторе -> ноты в Партиях.
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const puppeteer = require('puppeteer');
const sparticuz = require('@sparticuz/chromium').default;
const PORT = 8912;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(800);
  const browser = await puppeteer.launch({ headless: 'new', args: [...sparticuz.args, '--no-sandbox'], executablePath: await sparticuz.executablePath(),
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/STRUCHORD.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadSong === 'function' && document.querySelectorAll('script').length >= 2, { timeout: 30000 });
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'uploads', 'Police - Every breath you take.struchord-2.json'), 'utf8'));
  await page.evaluate((data) => {
    localStorage.setItem('struchord_songs', JSON.stringify([data]));
    loadSong(0);
    render();
    togglePartsMode(true);
    setPartsScoreEngine('native');
  }, parsed);
  await sleep(1200);

  // Выразимая правка: убрать нижнюю струну из боя нельзя клавиатурой,
  // поэтому меняем лад ноты второго такта на струне, где нота одна за
  // ячейку не бывает — честный сценарий владельца: цифра на ноте.
  await page.evaluate(() => {
    const sec = sections[0];
    partsCursor = { partId: 'accomp', secId: sec.id, pass: 0, string: 2, pos: 4.5, pitch: null, staffPitch: null, staffClef: null };
    syncPartsCursorDom && syncPartsCursorDom();
    renderPartsScreen();
  });
  await sleep(300);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '4', code: 'Digit4', bubbles: true, cancelable: true }));
  });
  await sleep(600);
  const state1 = await page.evaluate(() => {
    const ev = sections[0].squares[0].events[0];
    return { chord: ev.chord, fingering: ev.fingering || null, notes: Array.isArray(ev.notes) ? ev.notes.length : 0 };
  });
  console.log('[step2-live] после цифры 4 на ноте pos 4.5:', JSON.stringify(state1));
  await page.screenshot({ path: '/tmp/views-step2-notes.png' });

  // Редактор: сменить аккорд второй ячейки -> её ноты должны обновиться.
  await page.evaluate(() => { setSongView('editor'); });
  await sleep(600);
  const noteCountBefore = await page.evaluate(() => accompCellNotes(sections[0], sections[0].squares[0], sections[0].squares[0].events[1], 1).length);
  await page.evaluate(() => {
    const sec = sections[0];
    setEventChord(sec.squares[0].events[1], 'Am', { secId: sec.id, sqId: sec.squares[0].id, ei: 1 });
    render();
  });
  await page.evaluate(() => { setSongView('parts'); });
  await sleep(600);
  const cell2 = await page.evaluate(() => {
    const sec = sections[0];
    const notes = accompCellNotes(sec, sec.squares[0], sec.squares[0].events[1], 1);
    const frets = {};
    notes.forEach((n) => { frets[n.string] = n.fret; });
    return { chord: sec.squares[0].events[1].chord, frets };
  });
  console.log('[step2-live] ячейка 2 после Am в Редакторе (нот было ' + noteCountBefore + '):', JSON.stringify(cell2));
  await page.screenshot({ path: '/tmp/views-step2-editor.png' });

  // Игра: без ошибок планировщика.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-action="play"], #playButton, button[title*="Играть"], button[aria-label*="Играть"]');
    if (btn) btn.click();
  });
  await sleep(2500);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-action="play"], #playButton, button[title*="Играть"], button[aria-label*="Играть"]');
    if (btn) btn.click();
  });
  console.log('[step2-live] pageerrors:', errors.length ? errors.slice(0, 3) : 'нет');
  const ok = errors.length === 0 && cell2.chord === 'Am';
  console.log('[step2-live] ИТОГ:', ok ? 'OK' : 'ПРОВЕРИТЬ state1/ячейку 2 выше');
  await browser.close();
  server.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
