#!/usr/bin/env node
// 0.704 · Версия на главном экране.
//
// Владелец: «Пусть версия пишется и на главной странице, не только в открытой песне».
// Проверяем:
//   1) при запуске открыт главный экран и версия на нём видна;
//   2) текст совпадает с шапкой редактора (номер живёт в одном месте, а не в двух);
//   3) в исходнике ровно одна запись «· ver X.YYY» — дубль не заведётся;
//   4) значок не ломает вёрстку на 320, 390, 834 и 1440 px — горизонтальной прокрутки нет;
//   5) после ухода в редактор и возврата на главную версия на месте;
//   6) ошибок JavaScript нет.
//
// Запуск: PUPPETEER_EXECUTABLE_PATH=/tmp/chromium node dev/tests/home-version-0704.js
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const HTML = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const OUT = path.join(__dirname, '..', 'bench', 'results', 'home-version-0.704');
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, total = 0;
const check = (name, got, want) => {
  total++;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { passed++; console.log('PASS  ' + name); }
  else console.log('FAIL  ' + name + '\n      было: ' + a + '\n      ждали: ' + b);
};

const readBadge = () => ({
  visible: (() => { const el = document.getElementById('homeVersion'); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })(),
  text: (document.getElementById('homeVersion') || {}).textContent || '',
  header: ((document.querySelector('.app-title span') || {}).textContent || '').replace(/^·\s*/, '').trim(),
  home: document.documentElement.classList.contains('is-home-screen'),
});

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'load' });
  await wait(1200);

  const first = await page.evaluate(readBadge);
  check('Запуск открывает главный экран, версия на нём видна', [first.home, first.visible], [true, true]);
  check('Текст версии совпадает с шапкой редактора', [first.text, first.header], [first.header, first.header]);
  check('Формат «ver X.XXX»', /^ver 0\.\d{3}$/.test(first.text), true);

  const source = fs.readFileSync(HTML, 'utf8');
  const literals = (source.match(/· ver \d+\.\d{3}/g) || []);
  check('В исходнике одна запись версии (номер не продублирован)', literals.length, 1);

  await page.screenshot({ path: path.join(OUT, '01-home-1440.png') });
  // тёмная тема
  await page.evaluate(() => document.getElementById('homeThemeBtn').click());
  await wait(700);
  await page.screenshot({ path: path.join(OUT, '03-home-dark-1440.png') });
  await page.evaluate(() => document.getElementById('homeThemeBtn').click());
  await wait(500);

  // ушли в редактор и вернулись
  await page.evaluate(() => document.getElementById('homeNewSongBtn').click());
  await wait(1400);
  const inEditor = await page.evaluate(readBadge);
  await page.evaluate(() => document.getElementById('editorHomeBtn').click());
  await wait(900);
  const back = await page.evaluate(readBadge);
  check('В редакторе главного значка нет, текст тот же', [inEditor.home, inEditor.text], [false, first.text]);
  check('После возврата на главную версия на месте', [back.home, back.visible, back.text], [true, true, first.text]);
  await page.screenshot({ path: path.join(OUT, '04-home-after-editor.png') });

  // ширины: прокрутки быть не должно ни с версией, ни без неё
  const widths = {};
  for (const w of [320, 390, 834, 1440]) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: w <= 390 ? 844 : 900, isMobile: w <= 390, hasTouch: w <= 390 });
    await p.goto(URL, { waitUntil: 'load' });
    await wait(1100);
    widths[w] = await p.evaluate(() => ({
      sx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      badge: (() => { const el = document.getElementById('homeVersion'); const r = el.getBoundingClientRect(); return { text: el.textContent, w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    if (w === 390) await p.screenshot({ path: path.join(OUT, '02-home-390.png') });
    if (w === 320) await p.screenshot({ path: path.join(OUT, '05-home-320.png') });
    await p.close();
  }
  check('Нет горизонтальной прокрутки на 320 / 390 / 834 / 1440', [widths[320].sx, widths[390].sx, widths[834].sx, widths[1440].sx], [0, 0, 0, 0]);
  check('На 390 px версия видна, а не обрезана', [widths[390].badge.text, widths[390].badge.w > 0, widths[390].badge.h > 0], [first.text, true, true]);

  // контраст текста версии: обычный текст 13,6 px требует не ниже 4,5:1 (WCAG AA)
  const contrast = await page.evaluate(() => {
    const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const parse = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const v = document.getElementById('homeVersion');
    const shell = v.closest('.home-shell');
    const bg = getComputedStyle(shell).backgroundColor;
    const bgc = parse(bg === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : bg);
    const fg = parse(getComputedStyle(v).color);
    const L1 = lum(fg), L2 = lum(bgc);
    return +(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2));
  });
  check('Контраст текста версии не ниже 4,5:1 (светлая тема)', contrast >= 4.5, true);

  check('Ошибок JavaScript нет', errors.slice(0, 3), []);
  console.log(`\n${passed}/${total} PASS`);
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify({
    version: '0.704', passed, total,
    badge: first.text, widths: Object.fromEntries(Object.entries(widths).map(([k, v]) => [k, v.sx])),
    frames: ['01-home-1440.png', '02-home-390.png', '03-home-dark-1440.png', '04-home-after-editor.png', '05-home-320.png'],
    errors: errors.slice(0, 5),
  }, null, 2));
  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
