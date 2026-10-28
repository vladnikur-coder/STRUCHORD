#!/usr/bin/env node
/**
 * 0.696 Acceptance & Screenshot Test — B-12.12, «таб встаёт между ячейками,
 * а взятая карточка сворачивается».
 *
 * Замечание владельца дословно: «не вставить между ячейками, и пусть когда
 * вставка взята, она попадает либо сворачивается, а то сейчас выглядит
 * странно, я вроде бы таскаю вставку, но при этом она все еще стоит на
 * своем месте».
 *
 * Подтверждённый контракт (R8, 2026-10-27):
 * 1) внутри ряда аккордов между ячейками показывается тонкая вертикальная
 *    линия, а бросок делает таб УЗКОЙ ЯЧЕЙКОЙ этого ряда — с открытием
 *    редактора по нажатию;
 * 2) ряд от этого становится длиннее на длину таба;
 * 3) у самого края ряда и вне рядов по-прежнему предлагается пустое место во
 *    всю ширину — таб встаёт отдельной строкой;
 * 4) взятая карточка (и строка, и ячейка) СВОРАЧИВАЕТСЯ: место закрывается,
 *    соседи смыкаются, страница под курсором не прыгает;
 * 5) таб-ячейку можно вытащить обратно в строку и переставить в другую
 *    ячейку — с одной отменой на шаг;
 * 6) остальное из 0.695 без изменений: удержание ~0.5 с, Esc отменяет,
 *    короткое нажатие открывает редактор, ярлык TAB · N нот · M тактов.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.696');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  results.push({ name, ok, actual, expected });
  if (!ok) console.error(`FAIL: ${name}\n  expected: ${b}\n  actual:   ${a}`);
  else console.log(`PASS: ${name}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Песня: «Куплет» из четырёх аккордовых квадратов (по четыре ячейки) и
// таб-вставка отдельной строкой в конце.
async function setup(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    startNewSongFromHome();
    addSection('Verse');
    const first = sections[0];
    first.type = 'Verse';
    first.squares = [];
    ['Am', 'F', 'C', 'G'].forEach((chord) => {
      first.squares.push({
        id: nextId++,
        repeat: 1,
        customBeats: 16,
        events: [
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
        ],
      });
    });
    first.squares.push({
      id: nextId++,
      type: 'tab',
      repeat: 1,
      beats: 4,
      notes: Array.from({ length: 4 }, (_, i) => ({ start: i, dur: 1, string: i % 6, fret: 3 + i })),
      events: [],
      customBeats: null,
    });
    renderSectionsGrid();
  });
  await wait(1400);
  await page.evaluate(() => {
    const card = document.querySelector('.section-card');
    if (card) card.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -40);
  });
  await wait(600);
}

const model = (page) => page.evaluate(() => sections[0].squares.map((q) => {
  if (q.type === 'tab') return 'T';
  return q.events.map((e) => (e.isTab ? `[TAB ${e.span}]` : `${e.chord || '_'}:${e.span}`)).join(',');
}).join(' | '));

const beats = (page) => page.evaluate(() => sections[0].squares.map((q) => (q.type === 'tab' ? null : q.customBeats)));
const historyLen = (page) => page.evaluate(() => (window.historyDebugState ? historyDebugState().length : -1));

// Точка «взять строку» — верх карточки таба.
const tabPoint = (page) => page.evaluate(() => {
  const el = document.querySelector('.square--tab .tab-insert');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.top + Math.min(24, r.height / 2) };
});

// Границы ячеек ряда: левый/правый край и вертикаль ряда.
const cellGeom = (page, rowIdx, cellIdx) => page.evaluate(({ rowIdx, cellIdx }) => {
  const row = document.querySelectorAll('.squares-list > .square:not(.square--tab)')[rowIdx];
  const wraps = [...row.querySelectorAll('.square-inner > .chord-wrapper')];
  const w = wraps[cellIdx];
  const r = w.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return {
    left: r.left, right: r.right, width: r.width,
    y: r.top + r.height / 2, top: r.top, bottom: r.bottom,
    rowTop: rowRect.top, rowBottom: rowRect.bottom, rowLeft: rowRect.left, rowRight: rowRect.right,
    count: wraps.length,
    widths: wraps.map((el) => Math.round(el.getBoundingClientRect().width)),
  };
}, { rowIdx, cellIdx });

const outline = (page) => page.evaluate(() => {
  const line = document.getElementById('tabCellGap');
  const gap = document.querySelector('.tab-drop-gap');
  return {
    line: !!line && getComputedStyle(line).display !== 'none',
    lineLeft: line ? Math.round(line.getBoundingClientRect().left) : -1,
    lineH: line ? Math.round(line.getBoundingClientRect().height) : 0,
    gaps: document.querySelectorAll('.tab-drop-gap').length,
    gapH: gap ? Math.round(gap.getBoundingClientRect().height) : 0,
    cellRow: !!document.querySelector('.square.is-tab-cell-drop-target'),
  };
});

async function hold(page, point, ms = 700) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await wait(ms);
  // Ждём, пока страница «устоится» после схлопывания источника.
  await wait(260);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  });
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.setViewport({ width: 1280, height: 1200 });
    await page.goto(URL, { waitUntil: 'load' });
    await setup(page);

    // ── 1. Строка → ячейка: линия между ячейками ───────────────────────────
    const g0 = await tabPoint(page);
    const cells0 = await cellGeom(page, 0, 1);
    await hold(page, g0);
    await page.mouse.move(cells0.left + 6, cells0.y, { steps: 12 });
    await wait(300);
    const lineState = await outline(page);
    check('Внутри ряда показана вертикальная линия, а не пустое место', [lineState.line, lineState.gaps], [true, 0]);
    check('Линия стоит на границе ячеек', Math.abs(lineState.lineLeft - Math.round(cells0.left)) <= 2, true);
    check('Линия по высоте равна ряду', Math.abs(lineState.lineH - Math.round(cells0.bottom - cells0.top)) <= 3, true);
    check('Ряд-приёмник подсвечен', lineState.cellRow, true);
    await page.screenshot({ path: path.join(OUT_DIR, '01-cell-line.png') });
    const histInline = await historyLen(page);
    await page.mouse.up();
    await wait(900);

    // ── 2. Таб стал узкой ячейкой, ряд вырос на его длину ──────────────────
    check('Таб встал ячейкой между аккордами', await model(page), 'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4');
    check('Строка таба на прежнем месте исчезла', await page.evaluate(() => document.querySelectorAll('.square--tab').length), 0);
    check('Ряд стал длиннее ровно на длину таба', (await beats(page))[0], 20);
    check('Ряд занимает больше места на экране, чем раньше',
      await page.evaluate((w0) => Math.round(document.querySelector('.squares-list > .square .square-inner').getBoundingClientRect().width) > w0,
        Math.round(cells0.rowRight - cells0.rowLeft - 8)), true);
    check('Одна правка истории на перенос', (await historyLen(page)) - histInline, 1);
    check('Подтверждение видно', await page.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => /ячейкой/.test(t.textContent))), true);
    await page.screenshot({ path: path.join(OUT_DIR, '02-inline-cell.png') });

    // ── 3. Одно Ctrl+Z возвращает прежний вид ──────────────────────────────
    await page.evaluate(() => undoEdit());
    await wait(700);
    check('Ctrl+Z возвращает строку таба и прежние размеры', [await model(page), (await beats(page))[0]], ['Am:4,Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4 | T', 16]);

    // Ставим ячейку тем же жестом ещё раз — для следующих проверок.
    const g1 = await tabPoint(page);
    const cells1 = await cellGeom(page, 0, 1);
    await hold(page, g1);
    await page.mouse.move(cells1.left + 6, cells1.y, { steps: 12 });
    await wait(260);
    await page.mouse.up();
    await wait(900);
    check('Повторный жест снова даёт узкую ячейку', await model(page), 'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4');

    // ── 4. Короткое нажатие по ячейке открывает редактор ───────────────────
    const cellTab = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab .tab-insert--cell') || document.querySelector('.chord-wrapper--tab');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.top + 18 };
    });
    await page.mouse.click(cellTab.x, cellTab.y);
    await wait(600);
    check('Нажатие по таб-ячейке открывает редактор', await page.evaluate(() => !!document.querySelector('.tab-insert-editor')), true);
    await page.evaluate(() => document.querySelector('[data-tab-cancel]')?.click());
    await wait(400);
    await page.evaluate(() => document.querySelector('[data-tab-confirm-leave]')?.click());
    await wait(600);
    check('Редактор закрылся без правок', [await page.evaluate(() => !document.querySelector('.tab-insert-editor')), await model(page)],
      [true, 'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4']);

    // ── 5. Взятая ЯЧЕЙКА сворачивается: остальные растягиваются ────────────
    const cellNow = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.top + r.height / 2, width: Math.round(r.width) };
    });
    const beforeRowTop = await page.evaluate(() => Math.round(document.querySelector('.squares-list > .square').getBoundingClientRect().top));
    const beforeRowH = await page.evaluate(() => Math.round(document.querySelector('.squares-list > .square').getBoundingClientRect().height));
    const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
    await hold(page, cellNow);
    const cellTaken = await page.evaluate(() => {
      const cell = document.querySelector('.chord-wrapper--tab');
      const row = cell ? cell.closest('.square') : null;
      const widths = row ? [...row.querySelectorAll('.square-inner > .chord-wrapper')].map((el) => Math.round(el.getBoundingClientRect().width)) : [];
      return {
        hidden: cell ? getComputedStyle(cell).display : 'missing',
        rowMark: !!document.querySelector('.square.is-tab-cell-source-taken'),
        widths: widths.filter((w) => w > 0),
        tpl: row ? row.querySelector('.square-inner').style.gridTemplateColumns : '',
        docHasSpacer: !!document.querySelector('.tab-drag-page-spacer'),
      };
    });
    check('Снятая ячейка исчезает из ряда (не «гаснет» на месте)', cellTaken.hidden, 'none');
    check('Соседние аккорды растянулись на освободившееся место',
      cellTaken.widths.length === 4 && Math.min(...cellTaken.widths) > cellNow.width, true);
    check('Число дорожек ряда уменьшено на ширину ячейки', /repeat\(16,/.test(cellTaken.tpl), true);
    const afterRow = await page.evaluate(() => {
      const el = document.querySelector('.squares-list > .square');
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), h: Math.round(r.height) };
    });
    check('Сам ряд остался на месте под курсором', afterRow.top, beforeRowTop);
    check('Ряд с ушедшей ячейкой стал обычной высоты (место закрылось)', afterRow.h < beforeRowH - 40, true);
    check('Прокрутка страницы не изменилась', await page.evaluate(() => Math.round(window.scrollY)), scrollBefore);
    await page.screenshot({ path: path.join(OUT_DIR, '03-cell-taken.png') });

    // ── 6. Esc возвращает ячейку на место ──────────────────────────────────
    await page.keyboard.press('Escape');
    await wait(250);
    await page.mouse.up();
    await wait(500);
    const cellBack = await page.evaluate(() => {
      const cell = document.querySelector('.chord-wrapper--tab');
      const row = cell ? cell.closest('.square') : null;
      return {
        display: cell ? getComputedStyle(cell).display : 'missing',
        width: cell ? Math.round(cell.getBoundingClientRect().width) : -1,
        tpl: row ? row.querySelector('.square-inner').style.gridTemplateColumns : '',
        marks: document.querySelectorAll('.is-tab-drag-taken, .is-tab-cell-source-taken').length,
      };
    });
    check('Esc возвращает ячейку: она снова видна и прежней ширины',
      [cellBack.display, cellBack.width === cellNow.width, /repeat\(20,/.test(cellBack.tpl), cellBack.marks], ['flex', true, true, 0]);
    check('Esc не меняет порядок', await model(page), 'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4');

    // ── 7. Ячейку можно снова вытащить строкой ─────────────────────────────
    const cellNow2 = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.top + r.height / 2 };
    });
    await hold(page, cellNow2);
    const belowList = await page.evaluate(() => {
      const list = document.querySelector('.squares-list').getBoundingClientRect();
      return { x: list.x + list.width / 2, y: Math.min(window.innerHeight - 30, list.bottom + 16) };
    });
    await page.mouse.move(belowList.x, belowList.y, { steps: 12 });
    await wait(300);
    const rowAgain = await outline(page);
    check('Под рядами снова пустое место во всю ширину (без линии)', [rowAgain.gaps, rowAgain.line], [1, false]);
    await page.screenshot({ path: path.join(OUT_DIR, '04-cell-to-row.png') });
    const histRow = await historyLen(page);
    await page.mouse.up();
    await wait(900);
    const backToRow = await page.evaluate(() => {
      const sec = sections[0];
      const tab = sec.squares.find((q) => q.type === 'tab');
      const first = sec.squares[0];
      return {
        hasRow: !!tab,
        beats: tab ? tab.beats : 0,
        notes: tab ? tab.notes.filter((n) => !n.pause).map((n) => `${n.start}:${n.fret}`) : [],
        firstBeats: first ? first.customBeats : 0,
        inline: first ? first.events.some((e) => e.isTab) : true,
      };
    });
    check('Ячейка снова стала отдельной строкой', [backToRow.hasRow, backToRow.beats, backToRow.inline], [true, 4, false]);
    check('Ноты ячейки перенеслись в строку без потерь', backToRow.notes, ['0:3', '1:4', '2:5', '3:6']);
    check('Ряд вернулся к прежней длине (время ячейки ушло соседу)', backToRow.firstBeats, 20);
    check('Одна правка истории на обратный перенос', (await historyLen(page)) - histRow, 1);

    // ── 8. У самого края ряда — снова пустое место ─────────────────────────
    await page.evaluate(() => undoEdit());
    await wait(700);
    const g3 = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab').getBoundingClientRect();
      return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    });
    await hold(page, g3);
    // Точку берём после «взятия»: ряд без таб-ячейки становится ниже, и
    // соседи успевают съехать вверх.
    const edgeTarget = await page.evaluate(() => {
      const row = document.querySelectorAll('.squares-list > .square:not(.square--tab)')[1];
      const r = row.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.top + 6 };
    });
    await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 12 });
    await wait(300);
    const edgeState = await outline(page);
    check('У верхнего края ряда предлагается строка, а не ячейка', [edgeState.gaps, edgeState.line], [1, false]);
    await page.keyboard.press('Escape');
    await wait(200);
    await page.mouse.up();
    await wait(400);

    // ── 9. Ячейка → другая ячейка того же ряда ─────────────────────────────
    const src = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await hold(page, src);
    const dst = await page.evaluate(() => {
      const row = document.querySelectorAll('.squares-list > .square:not(.square--tab)')[0];
      const wraps = [...row.querySelectorAll('.square-inner > .chord-wrapper:not(.chord-wrapper--tab)')];
      const r = wraps[wraps.length - 1].getBoundingClientRect();
      return { x: r.right - 6, y: r.top + r.height / 2 };
    });
    await page.mouse.move(dst.x, dst.y, { steps: 12 });
    await wait(300);
    const cellToCell = await outline(page);
    check('При переносе ячейки внутри ряда тоже видна линия', [cellToCell.line, cellToCell.gaps], [true, 0]);
    const histMove = await historyLen(page);
    await page.mouse.up();
    await wait(900);
    const movedModel = await model(page);
    check('Ячейка встала в конец ряда', /^Am:4,Am:4,Am:4,Am:4,\[TAB 4\] \| /.test(movedModel), true);
    check('Одна правка истории на перестановку ячейки', (await historyLen(page)) - histMove, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '05-cell-moved.png') });
    await page.evaluate(() => undoEdit());
    await wait(700);
    check('Ctrl+Z возвращает ячейку на прежнее место', await model(page), 'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4');

    // ── 10. Во время переноса ряд кнопок не выезжает ни у одной секции ─────
    const gRows = await page.evaluate(() => {
      const el = document.querySelector('.chord-wrapper--tab');
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await hold(page, gRows);
    const stable = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.square-actions-row')];
      const cards = [...document.querySelectorAll('.section-card')].map((c) => Math.round(c.getBoundingClientRect().top));
      return {
        heights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
        cards,
        spacer: document.querySelectorAll('.tab-drag-page-spacer').length,
      };
    });
    await page.keyboard.press('Escape');
    await wait(200);
    await page.mouse.up();
    await wait(300);
    check('Пока тащим, ряд «+ квадрат / Таб» не выезжает ни у одной секции', stable.heights, [0]);
    check('Страница не «прыгает»: высота удерживается распоркой', stable.spacer <= 1, true);

    // ── 11. Телефон: так же встаёт ячейкой ─────────────────────────────────
    const touchPage = await browser.newPage();
    touchPage.on('pageerror', (e) => pageErrors.push(e.message));
    await touchPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await touchPage.goto(URL, { waitUntil: 'load' });
    await setup(touchPage);
    const tg = await touchPage.evaluate(() => {
      const tab = document.querySelector('.square--tab .tab-insert').getBoundingClientRect();
      const row = document.querySelectorAll('.squares-list > .square:not(.square--tab)')[0];
      const wraps = [...row.querySelectorAll('.square-inner > .chord-wrapper')];
      const w = wraps[1].getBoundingClientRect();
      return {
        tab: { x: tab.x + tab.width / 2, y: tab.top + Math.min(24, tab.height / 2) },
        cell: { x: w.left + w.width / 2, y: w.top + w.height / 2 },
        vw: window.innerWidth,
      };
    });
    const clampX = (x) => Math.max(18, Math.min(tg.vw - 18, x));
    await touchPage.touchscreen.touchStart(clampX(tg.tab.x), tg.tab.y);
    await wait(760);
    const touchLifted = await touchPage.evaluate(() => !!document.querySelector('.square--tab.is-tab-drag-taken'));
    for (let i = 1; i <= 12; i++) {
      await touchPage.touchscreen.touchMove(
        clampX(tg.tab.x) + (clampX(tg.cell.x) - clampX(tg.tab.x)) * (i / 12),
        tg.tab.y + (tg.cell.y - tg.tab.y) * (i / 12),
      );
      await wait(35);
    }
    await wait(300);
    const touchLine = await touchPage.evaluate(() => {
      const line = document.getElementById('tabCellGap');
      return {
        line: !!line && getComputedStyle(line).display !== 'none',
        gaps: document.querySelectorAll('.tab-drop-gap').length,
      };
    });
    await touchPage.screenshot({ path: path.join(OUT_DIR, '06-touch-cell-line-390.png') });
    await touchPage.touchscreen.touchEnd();
    await wait(900);
    const touchModel = await touchPage.evaluate(() => {
      const sec = sections[0];
      return sec.squares.map((q) => (q.type === 'tab' ? 'T'
        : q.events.map((e) => (e.isTab ? '[TAB ' + e.span + ']' : (e.chord || '_') + ':' + e.span)).join(','))).join(' | ');
    });
    await touchPage.screenshot({ path: path.join(OUT_DIR, '07-touch-inline-cell-390.png') });
    await touchPage.close();
    check('Касание с удержанием «берёт» карточку', touchLifted, true);
    check('На телефоне внутри ряда тоже показывается линия', touchLine, { line: true, gaps: 0 });
    check('На телефоне таб встаёт узкой ячейкой', touchModel,
      'Am:4,[TAB 4],Am:4,Am:4,Am:4 | F:4,F:4,F:4,F:4 | C:4,C:4,C:4,C:4 | G:4,G:4,G:4,G:4');

    check('На страницах не было ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ version: '0.696', results, passed, total: results.length }, null, 2));
    console.log(`\n${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
