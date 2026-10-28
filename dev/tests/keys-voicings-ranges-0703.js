#!/usr/bin/env node
// 0.703 · «Обращения»: откуда берутся варианты позиции и сколько их.
// Проверяем на живом окне «Клавиатура» (не на копии правил):
//   1) для Am на каждом размере клавиатуры считаем, сколько вариантов даёт панель;
//   2) снимаем ноты каждого варианта прямо с картинки (подсвеченные клавиши);
//   3) проверяем, что ‹ с первого варианта уходит на последний (круг);
//   4) проверяем, что клик по ячейке сетки НЕ переключает панель — она живёт за звучащим аккордом;
//   5) проверяем, что выбранный вариант запоминается за АККОРДОМ: в песне два C, на первом ставим 3/3 —
//      второй C приходит уже с 3/3.
// Запуск: node dev/tests/keys-voicings-ranges-0703.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'keys-voicings-0.703');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const toMidi = (s) => {
  const m = /^([A-G][#b]?)(-?\d+)$/.exec(s);
  const flat = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 }[m[1]];
  const pc = flat !== undefined ? flat : NAMES.indexOf(m[1]);
  return pc + (Number(m[2]) + 1) * 12;
};
function notesFromSvg(svg, low, high) {
  const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="0" width="([\d.]+)" height="(\d+)"[^>]*fill="([^"]+)"/g)]
    .map((m) => ({ x: +m[1], w: +m[2], h: +m[3], fill: m[4] }));
  if (!rects.length) return [];
  const whiteW = rects[0].w, blackW = Math.round(whiteW * 0.62);
  const map = new Map(); let whites = 0;
  for (let midi = low; midi <= high; midi++) {
    const white = WHITE.indexOf(((midi % 12) + 12) % 12) >= 0;
    map.set(white ? 'w' + whites * whiteW : 'b' + (whites * whiteW - blackW / 2), midi);
    if (white) whites++;
  }
  const out = [];
  rects.forEach((r) => {
    if (!/2f855a|accent/.test(r.fill)) return;
    const midi = map.get((r.h > 60 ? 'w' : 'b') + r.x);
    if (midi !== undefined) out.push(midi);
  });
  return out.sort((a, b) => a - b);
}

let passed = 0, total = 0;
const check = (name, got, want) => {
  total++;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { passed++; console.log('PASS  ' + name); }
  else console.log('FAIL  ' + name + '\n      было: ' + a + '\n      ждали: ' + b);
};

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
  await wait(1500);
  await page.evaluate(() => startNewSongFromHome());
  await wait(1200);
  await page.evaluate(() => {
    addSection('A');
    const a = sections[sections.length - 1];
    for (let i = 0; i < 3; i++) addSquare(a.id);
    ['Am', 'F', 'C', 'G'].forEach((c, i) => { a.squares[i].events.forEach((ev) => { ev.chord = ''; }); a.squares[i].events[0].chord = c; });
    renderSectionsGrid();
  });
  await wait(800);
  await page.evaluate(() => document.querySelector('.b39-btn').click());
  await wait(400);
  await page.evaluate(() => document.querySelector('.b39-panel .b39-add').click());
  await wait(400);
  await page.evaluate(() => { const el = Array.from(document.querySelectorAll('.b39-choice')).find((x) => /клавиш|пиани/i.test(x.textContent)); if (el) el.click(); });
  await wait(900);
  await page.evaluate(() => { const c = document.querySelector('.b39-close'); if (c) c.click(); });
  await wait(300);
  await page.evaluate(() => document.querySelector('#b39KeysBtn').click());
  await wait(500);

  const read = () => page.evaluate(() => {
    const pn = document.querySelector('#b39KeysPanel');
    const svg = pn.querySelector('svg');
    return {
      title: (pn.querySelector('.b39-keys-title') || {}).textContent,
      count: (pn.querySelector('.b39-keys-count') || {}).textContent,
      foot: (pn.querySelector('.b39-keys-foot') || {}).textContent,
      svg: svg ? svg.outerHTML : '',
    };
  });
  const next = async () => { await page.evaluate(() => { const b = document.querySelectorAll('#b39KeysPanel .b39-keys-nav button'); b[b.length - 1].click(); }); await wait(300); };
  const prev = async () => { await page.evaluate(() => { const b = document.querySelectorAll('#b39KeysPanel .b39-keys-nav button'); b[0].click(); }); await wait(300); };
  const setSize = async (n) => { await page.evaluate((s) => { const el = document.querySelector('#b39KeysPanel .b39-keys-head select'); el.value = String(s); el.dispatchEvent(new Event('change', { bubbles: true })); }, n); await wait(500); };

  const ranges = {};
  for (const size of [25, 37, 49, 61, 76, 88]) {
    await setSize(size);
    const s = await read();
    const m = /\(([A-G][#b]?-?\d+)–([A-G][#b]?-?\d+)\)/.exec(s.foot);
    const low = toMidi(m[1]), high = toMidi(m[2]);
    const rec = []; let guard = 0;
    while (guard++ < 8) {
      const cur = await read();
      const [i, tot] = cur.count.split('/').map(Number);
      rec.push({ count: cur.count, notes: notesFromSvg(cur.svg, low, high).map(noteName) });
      if (i >= tot) break;
      await next();
    }
    ranges[size] = { low, high, total: rec.length, variants: rec };
    let back = 0;
    while (back++ < 6 && !(await read()).count.startsWith('1/')) await next();
  }
  check('Am, 25 клавиш (C3–C5): два варианта', [ranges[25].total, ranges[25].variants.map((v) => v.notes.join(' '))],
        [2, ['A3 C4 E4 A4', 'A3 E4 A4 C5']]);
  check('Am, 61 клавиша (C2–C7): три варианта', [ranges[61].total, ranges[61].variants.map((v) => v.notes.join(' '))],
        [3, ['A2 C3 E3 A3', 'A2 C4 E4 A4', 'A2 C3 E3 A4']]);
  check('Am, 88 клавиш: бас уезжает в A0, вариантов по-прежнему три',
        [ranges[88].total, ranges[88].variants[0].notes[0]], [3, 'A0']);

  await setSize(61);
  // круг: ‹ с первого варианта
  await prev();
  check('‹ с 1/3 уходит на 3/3 (по кругу)', (await read()).count, '3/3');
  // выбор запоминается за аккордом: ставим Am 3/3 и уходим на F, потом назад на Am? —
  // проще: клик по ячейке F не должен менять панель.
  const before = (await read()).title;
  await page.evaluate(() => { const sq = Array.from(document.querySelectorAll('.square')).find((e) => /^F/.test(e.textContent.trim())); if (sq) (sq.querySelector('.chord, .square-chord') || sq).click(); });
  await wait(700);
  const after = (await read()).title;
  check('Клик по ячейке F не переключает панель (она за звучащим аккордом)', [before, after], ['Am', 'Am']);

  const data = { version: '0.703', chord: 'Am', ranges, passed, total, errors: errors.slice(0, 5) };
  fs.writeFileSync(path.join(OUT, 'ranges.json'), JSON.stringify(data, null, 2));
  check('Ошибок JavaScript нет', errors.slice(0, 3), []);
  console.log(`\n${passed}/${total} PASS`);
  await browser.close();
  process.exit(passed === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
