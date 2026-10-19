#!/usr/bin/env node
/*
 * views-step3-live.js — живая приёмка шага 3.
 * Плашка «♪ ноты» в Редакторе; диалог при смене аккорда поверх
 * ручных нот: отказ сохраняет всё, согласие заменяет.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const sparticuz = require('@sparticuz/chromium').default;

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8916;
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
  let dialogMode = 'dismiss';
  let dialogText = null;
  page.on('dialog', async (d) => {
    dialogText = d.message();
    if (dialogMode === 'accept') await d.accept(); else await d.dismiss();
  });
  await page.goto('http://127.0.0.1:' + PORT + '/STRUCHORD.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadSong === 'function', { timeout: 30000 });
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, 'uploads', 'Police - Every breath you take.struchord-2.json'), 'utf8'));
  await page.evaluate((data) => {
    localStorage.setItem('struchord_songs', JSON.stringify([data]));
    loadSong(0);
    render();
    const btns = Array.from(document.querySelectorAll('button'));
    const ok = btns.find((b) => b.textContent.trim() === 'Продолжить');
    if (ok) ok.click();
    const ev = sections[0].squares[0].events[0];
    ev.notes = [
      { start: 0, dur: 0.5, string: 2, fret: 9 },
      { start: 0.5, dur: 0.5, string: 2, fret: 4 },
    ];
    accompInvalidate();
    render();
  }, parsed);
  await sleep(700);
  const plateCount = await page.evaluate(() => document.querySelectorAll('.accomp-notes-plate').length);
  console.log('[step3-live] плашек «♪ ноты»:', plateCount);
  await page.screenshot({ path: '/tmp/views-step3-plate.png' });

  // Отказ: аккорд и ноты целы.
  dialogMode = 'dismiss'; dialogText = null;
  const declined = await page.evaluate(() => {
    const sec = sections[0]; const ev = sec.squares[0].events[0];
    const changed = setEventChord(ev, 'E', { secId: sec.id, sqId: sec.squares[0].id, ei: 0 });
    return { changed, chord: ev.chord, notes: (ev.notes || []).length };
  });
  console.log('[step3-live] отказ:', JSON.stringify(declined), '| диалог:', dialogText);
  // Согласие.
  dialogMode = 'accept'; dialogText = null;
  const accepted = await page.evaluate(() => {
    const sec = sections[0]; const ev = sec.squares[0].events[0];
    const changed = setEventChord(ev, 'E', { secId: sec.id, sqId: sec.squares[0].id, ei: 0 });
    return { changed, chord: ev.chord, notes: (ev.notes || []).length };
  });
  console.log('[step3-live] согласие:', JSON.stringify(accepted), '| диалог:', dialogText);
  console.log('[step3-live] pageerrors:', errors.length ? errors.slice(0, 3) : 'нет');
  const ok = plateCount >= 1 && declined.changed === false && declined.chord === 'Aadd9'
    && accepted.changed === true && accepted.chord === 'E' && accepted.notes === 0 && errors.length === 0;
  console.log('[step3-live] ИТОГ:', ok ? 'OK' : 'ПРОВЕРИТЬ');
  await browser.close();
  server.kill();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
