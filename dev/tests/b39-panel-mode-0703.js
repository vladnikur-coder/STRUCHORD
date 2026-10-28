#!/usr/bin/env node
// B-39 «Чистота режима»: ожидания обновлены для редактора аккомпанемента 0.708.
//
// Проверяем ровно то, что владелец назвал проблемой:
//   1) на гитарной дорожке нет кнопок «Клавиатура» и «Аккомпанемент»;
//   2) в песне без дорожек — гитарный набор, как до волны;
//   3) на клавишной дорожке кнопка ритма открывает аккомпанемент, а «Таб» остаётся;
//   4) окна волны не открываются друг поверх друга;
//   5) при уходе на гитару клавишные окна закрываются сами;
//   6) полоса воспроизведения не переполняется на 1440, 1024 и 390 px.
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'mode-0.703');
fs.mkdirSync(OUT, { recursive: true });

let passed = 0, total = 0;
const check = (name, got, want) => {
  total++;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { passed++; console.log('PASS  ' + name); }
  else console.log('FAIL  ' + name + '\n      было: ' + a + '\n      ждали: ' + b);
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'guitar'));
  await page.goto(URL, { waitUntil: 'load' });
  await wait(1200);
  await page.evaluate(() => startNewSongFromHome());
  await wait(1100);
  await page.evaluate(() => {
    addSection('A');
    const sec = sections[sections.length - 1];
    (sec.squares || []).forEach(sq => (sq.events || []).forEach((ev, i) => { if (ev && i === 0) ev.chord = 'Am'; }));
    renderSectionsGrid();
  });
  await wait(700);

  const state = () => page.evaluate(() => {
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.width > 0; };
    const open = (sel) => { const el = document.querySelector(sel); return el ? !el.hidden : null; };
    return {
      mode: document.documentElement.classList.contains('b39-keys-mode'),
      keysBtn: vis('#b39KeysBtn'), accBtn: vis('#b39AccBtn'),
      strum: Array.from(document.querySelectorAll('.chord-btn-strum')).filter(e => e.getBoundingClientRect().width > 0).length,
      tab: Array.from(document.querySelectorAll('.add-tab-btn')).filter(e => e.getBoundingClientRect().width > 0).length,
      keysPanel: open('#b39KeysPanel'), accPanel: open('#b39AccPanel'), mixer: open('.b39-panel'),
    };
  });

  // ── 1. Песня без дорожек
  const s1 = await state();
  check('Без дорожек: режим гитарный', [s1.mode, s1.keysBtn, s1.accBtn, s1.strum > 0], [false, false, null, true]);
  await page.screenshot({ path: path.join(OUT, '01-guitar-no-tracks.png') });

  // ── 2. Клавишная дорожка
  await page.evaluate(() => document.querySelector('.b39-btn').click());
  await wait(400);
  await page.evaluate(() => document.querySelector('.b39-panel .b39-add').click());
  await wait(350);
  await page.evaluate(() => { const el = Array.from(document.querySelectorAll('.b39-choice')).find(x => /клавиш|пиани/i.test(x.textContent)); if (el) el.click(); });
  await wait(800);
  const s2 = await state();
  check('Клавишная: режим включился, кнопки видны', [s2.mode, s2.keysBtn, s2.accBtn], [true, true, null]);
  check('Клавишная: кнопки аккомпанемента и «Таб» видны', [s2.strum > 0, s2.tab], [true, 1]);
  await page.evaluate(() => { const c = document.querySelector('.b39-close'); if (c) c.click(); });
  await wait(300);
  await page.screenshot({ path: path.join(OUT, '02-keys-track.png') });

  // ── 3. Одно окно за раз
  await page.evaluate(() => document.querySelector('#b39KeysBtn').click());
  await wait(500);
  const a = await state();
  await page.evaluate(() => openStrumPatternEditor('section', sections[0].id));
  await wait(500);
  const b = await state();
  await page.evaluate(() => document.querySelector('.b39-btn').click());
  await wait(500);
  const c = await state();
  check('Окна: открыто всегда ровно одно', [a.keysPanel, b.keysPanel, b.accPanel, c.accPanel, c.mixer],
        [true, false, true, false, true]);
  await page.screenshot({ path: path.join(OUT, '03-mixer-only.png') });

  // ── 4. Возврат на гитару
  await page.evaluate(() => document.querySelector('.b39-panel .b39-add').click());
  await wait(350);
  await page.evaluate(() => { const el = Array.from(document.querySelectorAll('.b39-choice')).find(x => /гитар/i.test(x.textContent)); if (el) el.click(); });
  await wait(800);
  const d = await state();
  check('Гитара: режим снят, бой вернулся, клавишные кнопки ушли',
        [d.mode, d.keysBtn, d.accBtn, d.strum > 0], [false, false, null, true]);
  await page.evaluate(() => { const el = document.querySelector('.b39-close'); if (el) el.click(); });
  await wait(300);
  await page.screenshot({ path: path.join(OUT, '04-back-to-guitar.png') });

  // ── 5. Полоса воспроизведения на трёх ширинах
  for (const [w, tag] of [[1440, '1440'], [1024, '1024'], [390, '390']]) {
    const p2 = await browser.newPage();
    await p2.setViewport({ width: w, height: 900 });
    await p2.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'guitar'));
    await p2.goto(URL, { waitUntil: 'load' });
    await wait(1100);
    await p2.evaluate(() => startNewSongFromHome());
    await wait(1100);
    await p2.evaluate(() => document.querySelector('.b39-btn').click());
    await wait(350);
    await p2.evaluate(() => document.querySelector('.b39-panel .b39-add').click());
    await wait(300);
    await p2.evaluate(() => { const el = Array.from(document.querySelectorAll('.b39-choice')).find(x => /клавиш|пиани/i.test(x.textContent)); if (el) el.click(); });
    await wait(700);
    await p2.evaluate(() => { const el = document.querySelector('.b39-close'); if (el) el.click(); });
    await wait(350);
    const m = await p2.evaluate(() => { const bar = document.querySelector('.transport-bar'); return bar.scrollWidth - bar.clientWidth; });
    check('Полоса воспроизведения ' + tag + ' px не переполняется', m <= 0, true);
    await p2.screenshot({ path: path.join(OUT, '05-bar-' + tag + '.png') });
    await p2.close();
  }

  check('Ошибок JavaScript нет', errors.slice(0, 3), []);
  console.log(`\n${passed}/${total} PASS`);
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify({ version: '0.703', passed, total }, null, 2));
  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
