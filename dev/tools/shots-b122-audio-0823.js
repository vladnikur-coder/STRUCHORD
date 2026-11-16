#!/usr/bin/env node
'use strict';

// B-122 / 0.823 · кадры панели фоновой записи (волна, сетка, Sync Points).
//
// Снимает светлую и тёмную тему, телефон 390 px, планшет 834 px и ландшафт
// iPhone 844×390, и попутно проверяет, что на телефоне нет горизонтальной
// прокрутки (R6). Сами проверки поведения звука — в
// dev/tests/b122-audio-sync-0823.js и dev/tests/b122-audio-sync-browser-0823.js.
//
//   STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html \
//   CHROMIUM_PATH=/path/to/chromium node dev/tools/shots-b122-audio-0823.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dev', 'bench', 'results', 'b122-audio-0.823');
const URL_UNDER_TEST = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeWav(seconds = 3, rate = 8000) {
  const frames = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(buf.length - 8, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const env = Math.sin((i / frames) * Math.PI);
    buf.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 220) / rate) * 8000 * env), 44 + i * 2);
  }
  return buf;
}

async function launchBrowser() {
  const puppeteer = require('puppeteer');
  const options = { headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] };
  // CHROMIUM_PATH — для ручного запуска, PUPPETEER_EXECUTABLE_PATH — тот же
  // путь, что ставят остальные браузерные наборы и dev/run-tests.sh.
  const explicit = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) options.executablePath = explicit;
  else {
    const chromium = require('@sparticuz/chromium');
    options.executablePath = await chromium.executablePath();
    options.args = [...chromium.args, ...options.args];
  }
  return puppeteer.launch(options);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const checks = [];
  const errors = [];
  let scroll = {};
  try {
    const fixture = fs.readFileSync(path.join(ROOT, 'dev', 'fixtures', 'wind-of-change.json'), 'utf8');
    const wavBase64 = makeWav().toString('base64');

    // Для каждого размера — своя страница: смена viewport на живой странице
    // с service worker перезагружает документ и обрывается по таймауту.
    async function preparePage(width, height, theme) {
      const page = await browser.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewport({ width, height });
      await page.goto(URL_UNDER_TEST, { waitUntil: 'load', timeout: 60000 });
      await wait(700);
      await page.evaluate(async (songText, base64, nextTheme) => {
        window.setTheme(nextTheme);
        const file = new File([songText], 'wind-of-change.json', { type: 'application/json' });
        window.importSong(file);
      }, fixture, wavBase64, theme);
      await wait(1400);
      // Импорт .json спрашивает исполнителя/название — подтверждаем, иначе
      // на кадрах будет диалог вместо редактора.
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const confirm = buttons.find((b) => (b.textContent || '').trim() === 'Продолжить');
        if (confirm) confirm.click();
      });
      await wait(900);
      // Долгую работу запускаем «выстрелил и забыл», а ждём флаг из Node:
      // длинный await внутри evaluate теряет промис при сборке мусора.
      await page.evaluate((base64) => {
        window.__shotsReady = false;
        const bt = window.StruChordBackingTrack;
        if (!bt) { window.__shotsReady = true; return; }
        const meta = {
          id: 'shots-0823', name: 'take.mp3', type: 'audio/wav', size: 48000,
          duration: 3, speed: 1, volume: 80, mute: false, solo: false,
          points: [{ bar: 0, time: 0 }, { bar: 2, time: 3 }],
        };
        bt.importEmbedded({ backingTrack: { ...meta, embedded: base64 } })
          .then(() => bt.loadSong({ backingTrack: meta }))
          .then(() => {
            bt.toggleDrawer(true);
            document.querySelectorAll('.modal-overlay,.dialog-overlay').forEach((el) => el.remove());
            window.__shotsReady = true;
          })
          .catch(() => { window.__shotsReady = true; });
      }, wavBase64);
      await page.waitForFunction('window.__shotsReady === true', { timeout: 30000 });
      await wait(500);
      return page;
    }

    async function shot(page, name) {
      await page.evaluate(() => {
        const drawer = document.getElementById('btDrawer');
        if (drawer && drawer.hidden) window.StruChordBackingTrack.toggleDrawer(true);
        const playhead = document.getElementById('btPlayhead');
        if (playhead) playhead.textContent = '0:01.250';
      });
      // Панель волны может быть ниже сгиба (особенно в ландшафте телефона) —
      // прокручиваем к ней, иначе на кадре её просто нет.
      await page.evaluate(() => {
        const drawer = document.getElementById('btDrawer');
        if (drawer) drawer.scrollIntoView({ block: 'center' });
      });
      await wait(350);
      await page.screenshot({ path: path.join(OUT, name) });
      console.log('   кадр ' + name);
    }

    let page = await preparePage(1440, 900, 'light');
    await shot(page, '01-wave-light-1440.png');
    await page.close();

    page = await preparePage(1440, 900, 'dark');
    await shot(page, '02-wave-dark-1440.png');
    await page.close();

    const sizes = [
      { w: 390, h: 844, name: '03-wave-phone-390.png', theme: 'light' },
      { w: 834, h: 1112, name: '04-wave-tablet-834.png', theme: 'light' },
      { w: 844, h: 390, name: '05-wave-iphone-landscape.png', theme: 'dark' },
    ];
    for (const item of sizes) {
      page = await preparePage(item.w, item.h, item.theme);
      await shot(page, item.name);
      scroll[String(item.w)] = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
      await page.close();
    }
    page = await preparePage(1440, 900, 'light');

    const noBacking = await page.evaluate(() => {
      const bt = window.StruChordBackingTrack;
      return bt ? bt.getPathInfo() : null;
    });
    checks.push({ name: 'панель волны открывается и запись загружена', pass: !!(noBacking && noBacking.hasBuffer) });
    checks.push({ name: '390 px: горизонтальной прокрутки нет', pass: (scroll['390'] || 0) <= 1, detail: scroll['390'] });
    checks.push({ name: '844 px (ландшафт iPhone): прокрутки нет', pass: (scroll['844'] || 0) <= 1, detail: scroll['844'] });
    checks.push({ name: '834 px (планшет): прокрутки нет', pass: (scroll['834'] || 0) <= 1, detail: scroll['834'] });
    checks.push({ name: 'ошибок JavaScript нет', pass: errors.length === 0, detail: errors.join(' | ') });

    fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify({
      version: '0.823',
      widths: scroll,
      checks,
      frames: fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort(),
      errors,
    }, null, 2) + '\n');
  } catch (error) {
    console.error(error && error.stack || error);
    errors.push(String(error && error.message || error));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
  for (const item of checks) console.log(`${item.pass ? 'ok  ' : 'FAIL'} ${item.name}${item.detail !== undefined && item.detail !== '' ? ' — ' + item.detail : ''}`);
  if (checks.some((item) => !item.pass)) process.exitCode = 1;
  console.log('\nкадры: ' + OUT);
})();
