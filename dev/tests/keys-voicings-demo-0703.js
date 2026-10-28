#!/usr/bin/env node
// 0.703 · «Обращения»: как панель «Клавиатура» предлагает позиции аккорда.
// Сценарий владельца: Am F C G / Em C D A. Играем песню, на каждом аккорде
// прокручиваем ‹ › до возврата на первый вариант и снимаем панель.
// Дополнительно проверяем, что выбранная позиция живёт за АККОРДОМ, а не за тактом:
// C стоит в двух местах (3-й такт A и 2-й такт B) — оставляем на нём 3/3 и ждём второй C.
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

// ── разбор картинки: какие клавиши подсвечены ───────────────────────────────
function layoutKeys(low, high, whiteW) {
  const keys = []; let whites = 0;
  for (let m = low; m <= high; m++) {
    const white = WHITE.indexOf(((m % 12) + 12) % 12) >= 0;
    keys.push({ midi: m, white, x: whites * whiteW });
    if (white) whites++;
  }
  return keys;
}
function notesFromSvg(svg, low, high) {
  const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="0" width="([\d.]+)" height="(\d+)"[^>]*fill="([^"]+)"/g)]
    .map((m) => ({ x: +m[1], w: +m[2], h: +m[3], fill: m[4] }));
  if (!rects.length) return { notes: [], rects: 0, keys: 0 };
  const whiteW = rects[0].w, blackW = Math.round(whiteW * 0.62);
  const keys = layoutKeys(low, high, whiteW);
  const map = new Map();
  keys.forEach((k) => map.set(k.white ? 'w' + k.x : 'b' + (k.x - blackW / 2), k.midi));
  const notes = [];
  rects.forEach((r) => {
    if (!/2f855a|accent/.test(r.fill)) return;
    const midi = map.get((r.h > 60 ? 'w' : 'b') + r.x);
    if (midi !== undefined) notes.push(midi);
  });
  return { notes: notes.sort((a, b) => a - b), rects: rects.length, keys: keys.length };
}
const toMidi = (s) => {
  const m = /^([A-G][#b]?)(-?\d+)$/.exec(s);
  const flat = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 }[m[1]];
  const pc = flat !== undefined ? flat : NAMES.indexOf(m[1]);
  return pc + (Number(m[2]) + 1) * 12;
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  });
  const page = await browser.newPage();
  const errors = [];
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
    addSection('B');
    const b = sections[sections.length - 1];
    for (let i = 0; i < 3; i++) addSquare(b.id);
    ['Em', 'C', 'D', 'A'].forEach((c, i) => { b.squares[i].events.forEach((ev) => { ev.chord = ''; }); b.squares[i].events[0].chord = c; });
    renderSectionsGrid();
  });
  await wait(900);
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
    const r = pn.getBoundingClientRect();
    return {
      title: (pn.querySelector('.b39-keys-title') || {}).textContent || '',
      count: (pn.querySelector('.b39-keys-count') || {}).textContent || '',
      foot: (pn.querySelector('.b39-keys-foot') || {}).textContent || '',
      svg: svg ? svg.outerHTML : '',
      hidden: pn.hidden,
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      scrollY: window.scrollY,
    };
  });
  const data = { version: '0.703', song: 'A: Am F C G · B: Em C D A', chords: [], notes: [] };
  // вырезка панели: clip считается от НАЧАЛА страницы, окно position:fixed — прибавляем прокрутку
  const shotPanel = async (name) => {
    const s = await read();
    const clip = {
      x: Math.max(0, s.box.x - 6),
      y: Math.max(0, s.box.y + s.scrollY - 6),
      width: Math.min(1440, s.box.w + 12),
      height: Math.min(900, s.box.h + 12),
    };
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
    data.notes.push(name + '.png');
    return s;
  };
  const step = async (dir) => {
    await page.evaluate((d) => {
      const btns = document.querySelectorAll('#b39KeysPanel .b39-keys-nav button');
      btns[d < 0 ? 0 : btns.length - 1].click();
    }, dir);
    await wait(400);
  };
  const parseRange = (foot) => {
    const m = /Размер (\d+) клавиш \(([A-G][#b]?-?\d+)–([A-G][#b]?-?\d+)\)/.exec(foot);
    return m ? { size: +m[1], low: toMidi(m[2]), high: toMidi(m[3]) } : null;
  };

  const start = await read();
  data.range = parseRange(start.foot);
  data.startPanel = { title: start.title, count: start.count, foot: start.foot, hidden: start.hidden };
  // полный экран: что видно, когда панель открыта в начале песни
  await page.screenshot({ path: path.join(OUT, '00-screen-full.png') });
  data.notes.push('00-screen-full.png');

  const wanted = ['Am', 'F', 'C', 'G', 'Em', 'C', 'D', 'A'];
  let idx = 0, guardC = null;
  await page.evaluate(() => playAll());
  const t0 = Date.now();
  while (Date.now() - t0 < 120000 && idx < wanted.length) {
    const s = await read();
    if (s.hidden) { await wait(150); continue; }
    if (s.title !== wanted[idx]) { await wait(150); continue; }
    // второй C: проверяем «позиция живёт за аккордом»
    if (s.title === 'C' && idx === 5) {
      guardC = { count: s.count, notes: notesFromSvg(s.svg, data.range.low, data.range.high).notes.map(noteName) };
      await shotPanel('chord-6-C-remembers');
      // вернуть C на 1/3, чтобы не путать дальнейшие кадры
      let g = 0;
      while (g++ < 5 && !(await read()).count.startsWith('1/')) await step(1);
      idx++;
      continue;
    }
    const rec = [];
    let g = 0;
    while (g++ < 8) {
      const cur = await read();
      const n = notesFromSvg(cur.svg, data.range.low, data.range.high);
      const shot = await shotPanel('chord-' + (idx + 1) + '-' + s.title + '-v' + rec.length);
      rec.push({ count: cur.count, notes: n.notes.map(noteName), midi: n.notes, foot: cur.foot, rects: n.rects, keys: n.keys, shot });
      const [i, total] = cur.count.split('/').map(Number);
      if (i >= total) break;
      await step(1);
    }
    data.chords.push({ n: idx + 1, chord: s.title, total: rec.length, variants: rec.map((r) => ({ count: r.count, notes: r.notes })) });
    // оставить C на 3/3, остальные вернуть на 1/3
    if (s.title === 'C' && idx === 2) { idx++; continue; }
    let g2 = 0;
    while (g2++ < 5 && !(await read()).count.startsWith('1/')) await step(1);
    idx++;
  }
  data.playSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  data.memoryOfChordC = guardC;
  await page.evaluate(() => { try { if (playbackState.isPlaying) playAll(); } catch (e) {} });
  await wait(400);
  // экран после остановки: панель на месте, песня стоит
  await page.screenshot({ path: path.join(OUT, '99-screen-stopped.png') });
  data.notes.push('99-screen-stopped.png');
  data.errors = errors.slice(0, 5);
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify({
    range: data.range,
    chords: data.chords.map((c) => ({ chord: c.chord, total: c.total, v: c.variants.map((v) => v.count + ': ' + v.notes.join(' ')) })),
    memoryOfC: data.memoryOfChordC,
    playSeconds: data.playSeconds,
    errors: data.errors,
    shots: data.notes.length,
  }, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
