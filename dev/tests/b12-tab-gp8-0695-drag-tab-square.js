#!/usr/bin/env node
/**
 * 0.695 Acceptance & Screenshot Test — B-12.12, «таб-вставку можно перетаскивать».
 *
 * Подтверждённый владельцем контракт (R8, 2026-10-27):
 * 1) тянется пока только таб-вставка (аккордовые квадраты — позже);
 * 2) бросать можно в любую секцию, в любое место — в начало, между
 *    квадратами, в конец;
 * 3) жест начинается с удержания ~0.5 с и видимого отклика: карточка
 *    «берётся» (приподнимается ярлык, источник гаснет), затем едет;
 * 4) короткое нажатие без удержания по-прежнему открывает редактор;
 * 5) кнопки ‹ › у карточки убраны;
 * 6) во время перетаскивания видно пустое место под бросок, соседи
 *    раздвигаются;
 * 7) бросок на то же место ничего не записывает; Esc и бросок мимо
 *    отменяют жест;
 * 8) одно Ctrl+Z возвращает прежний порядок;
 * 9) перенос в секцию с другим размером пересчитывает длину (ритм
 *    сохраняется, ноты не теряются).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.695');
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

// Песня: «Куплет» из четырёх аккордовых квадратов и таб-вставки в конце;
// по желанию — вторая секция «Припев» (можно с другим размером).
async function setup(page, { second = false, secondTs = null, tabAt = 'end', notes = 4 } = {}) {
  await page.evaluate(({ second, secondTs, tabAt, notes }) => {
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
        events: [
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
          { chord, span: 4, timeSig: null },
        ],
        customBeats: 16,
      });
    });
    const tabSq = {
      id: nextId++,
      type: 'tab',
      repeat: 1,
      beats: 4,
      notes: Array.from({ length: notes }, (_, i) => ({ start: i, dur: 1, string: i % 6, fret: 3 + i })),
      events: [],
      customBeats: null,
    };
    if (tabAt === 'end') first.squares.push(tabSq);
    else first.squares.splice(0, 0, tabSq);
    if (second) {
      addSection('Chorus');
      const second = sections[sections.length - 1];
      second.type = 'Chorus';
      second.timeSig = secondTs;
      second.squares = [0, 1, 2].map((i) => ({
        id: nextId++,
        repeat: 1,
        events: [
          { chord: ['Dm', 'Bb', 'F'][i], span: 3, timeSig: null },
          { chord: ['Dm', 'Bb', 'F'][i], span: 3, timeSig: null },
          { chord: ['Dm', 'Bb', 'F'][i], span: 3, timeSig: null },
        ],
        customBeats: 9,
      }));
    }
    renderSectionsGrid();
  }, { second, secondTs, tabAt, notes });
  await wait(1400);
  await page.evaluate(() => {
    const firstCard = document.querySelector('.section-card');
    if (firstCard) firstCard.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -40);
  });
  await wait(600);
}

const order = (page, secIndex = 0) =>
  page.evaluate((i) => sections[i].squares.map((q) => (q.type === 'tab' ? 'T' : q.events[0].chord || '_')).join(' '), secIndex);

const historyLen = (page) => page.evaluate(() => (window.historyDebugState ? historyDebugState().length : -1));

const geom = (page) =>
  page.evaluate(() => {
    const tab = document.querySelector('.square--tab .tab-insert') || document.querySelector('.square--tab');
    if (!tab) return null;
    const r = tab.getBoundingClientRect();
    const secs = [...document.querySelectorAll('.section-card')].map((card) => ({
      id: parseInt(card.dataset.id, 10),
      squares: [...card.querySelectorAll('.squares-list > .square')].map((el) => {
        const b = el.getBoundingClientRect();
        return { id: el.dataset.square, top: b.top, mid: b.top + b.height / 2, h: b.height, x: b.x + b.width / 2 };
      }),
    }));
    return {
      tab: { x: r.x + r.width / 2, y: r.top + Math.min(24, r.height / 2), top: r.top, h: r.height },
      secs,
    };
  });

// Зажать карточку и подождать «взятия».
async function hold(page, point, ms = 700) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await wait(ms);
}
async function dragTo(page, point) {
  await page.mouse.move(point.x, point.y, { steps: 14 });
  await wait(220);
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
    await page.setViewport({ width: 1280, height: 1100 });
    await page.goto(URL, { waitUntil: 'load' });
    await setup(page, { tabAt: 'end' });

    // ── 1. Исходный порядок и отсутствие кнопок ‹ › ────────────────────────
    check('Исходный порядок: четыре аккорда и таб в конце', await order(page), 'Am F C G T');
    check(
      'Кнопки ‹ › у карточки таба убраны',
      await page.evaluate(() => ({
        prev: document.querySelectorAll('.tab-btn[title="Поставить таб раньше"]').length,
        next: document.querySelectorAll('.tab-btn[title="Поставить таб позже"]').length,
        copy: document.querySelectorAll('.tab-btn[title="Копировать таб-вставку"]').length,
      })),
      { prev: 0, next: 0, copy: 1 },
    );

    // ── 2. Короткое нажатие открывает редактор ─────────────────────────────
    const g0 = await geom(page);
    await page.mouse.click(g0.tab.x, g0.tab.y);
    await wait(500);
    check('Короткое нажатие открывает редактор таб-вставки', await page.evaluate(() => !!document.querySelector('.tab-insert-editor')), true);
    await page.evaluate(() => document.querySelector('[data-tab-cancel]')?.click());
    await wait(400);
    await page.evaluate(() => document.querySelector('[data-tab-confirm-leave]')?.click());
    await wait(500);
    check('Редактор закрылся, порядок прежний', [await page.evaluate(() => !document.querySelector('.tab-insert-editor')), await order(page)], [true, 'Am F C G T']);

    // ── 3. Удержание «берёт» карточку, но само по себе ничего не меняет ─────
    const histBeforeHold = await historyLen(page);
    await hold(page, g0.tab, 700);
    const lifted = await page.evaluate(() => ({
      source: !!document.querySelector('.square--tab.is-tab-drag-source'),
      chip: (getComputedStyle(document.getElementById('tabDragChip') || document.body).display),
      chipText: (document.getElementById('tabDragChip')?.textContent || '').trim(),
      bodyClass: document.body.classList.contains('is-tab-dragging'),
    }));
    check('Удержание «берёт» карточку: источник гаснет, ярлык виден', [lifted.source, lifted.chip, lifted.bodyClass], [true, 'flex', true]);
    check('Ярлык подписан: TAB, число нот и тактов', /TAB.*4 ноты.*1 такт/.test(lifted.chipText), true);
    await page.mouse.up();
    await wait(500);
    check('Отпускание без движения: порядок и история не менены', [await order(page), await historyLen(page)], ['Am F C G T', histBeforeHold]);
    check('После жеста клик по карточке не открывает редактор', await page.evaluate(() => !document.querySelector('.tab-insert-editor')), true);

    // ── 4. Перетаскивание внутри секции: пустое место и порядок ─────────────
    const g1 = await geom(page);
    const beforeFirst = { x: g1.secs[0].squares[0].x, y: g1.secs[0].squares[0].top + 6 };
    await hold(page, g1.tab, 700);
    await dragTo(page, beforeFirst);
    const gapState = await page.evaluate(() => {
      const gap = document.querySelector('.tab-drop-gap');
      return {
        count: document.querySelectorAll('.tab-drop-gap').length,
        height: gap ? Math.round(gap.getBoundingClientRect().height) : 0,
        target: !!document.querySelector('.section-card.is-tab-drop-target'),
        before: gap?.nextElementSibling?.dataset.square || null,
      };
    });
    check('Во время переноса видно пустое место под бросок', [gapState.count, gapState.target], [1, true]);
    check('Пустое место по высоте равно карточке', Math.abs(gapState.height - Math.round(g1.tab.h)) <= 8, true);
    await page.screenshot({ path: path.join(OUT_DIR, '01-lifted-with-gap.png') });
    await page.mouse.up();
    await wait(700);
    check('Бросок над первым квадратом ставит таб в начало', await order(page), 'T Am F C G');
    check('Пустое место убрано после броска', await page.evaluate(() => document.querySelectorAll('.tab-drop-gap').length), 0);

    // ── 5. Одно Ctrl+Z возвращает прежний порядок ──────────────────────────
    await page.evaluate(() => undoEdit());
    await wait(600);
    check('Ctrl+Z возвращает прежний порядок', await order(page), 'Am F C G T');
    await page.evaluate(() => redoEdit());
    await wait(600);
    check('Повтор возвращает перенос', await order(page), 'T Am F C G');
    await page.evaluate(() => undoEdit());
    await wait(600);

    // ── 6. Бросок на то же место ничего не записывает ──────────────────────
    const histBeforeNoop = await historyLen(page);
    const g2 = await geom(page);
    await hold(page, g2.tab, 700);
    await dragTo(page, { x: g2.tab.x, y: g2.tab.top + 12 });
    await page.mouse.up();
    await wait(600);
    check('Бросок на то же место: ни правки, ни новой истории', [await order(page), await historyLen(page)], ['Am F C G T', histBeforeNoop]);

    // ── 7. Esc отменяет жест ───────────────────────────────────────────────
    const g3 = await geom(page);
    await hold(page, g3.tab, 700);
    await dragTo(page, { x: g3.secs[0].squares[1].x, y: g3.secs[0].squares[1].top + 6 });
    await page.keyboard.press('Escape');
    await wait(500);
    const afterEsc = await page.evaluate(() => ({
      gap: document.querySelectorAll('.tab-drop-gap').length,
      source: document.querySelectorAll('.square--tab.is-tab-drag-source').length,
      dragging: document.body.classList.contains('is-tab-dragging'),
      chip: getComputedStyle(document.getElementById('tabDragChip') || document.body).opacity,
    }));
    await page.mouse.up();
    await wait(400);
    check('Esc снимает жест: пустое место и подсветка убраны', [afterEsc.gap, afterEsc.source, afterEsc.dragging], [0, 0, false]);
    check('Esc не меняет порядок', await order(page), 'Am F C G T');

    // ── 8. Перенос в другую секцию ─────────────────────────────────────────
    await setup(page, { second: true });
    const g4 = await geom(page);
    const secondSec = g4.secs[1];
    const dropSecond = { x: secondSec.squares[1].x, y: secondSec.squares[1].top + 6 };
    await hold(page, g4.tab, 700);
    await dragTo(page, dropSecond);
    const crossGap = await page.evaluate(() => ({
      target: parseInt(document.querySelector('.section-card.is-tab-drop-target')?.dataset.id || '0', 10),
      secs: [...document.querySelectorAll('.section-card')].map((c) => c.querySelectorAll('.tab-drop-gap').length),
    }));
    check('Подсветилась та секция, куда тащим', [crossGap.target > 0, crossGap.secs[1]], [true, 1]);
    await page.mouse.up();
    await wait(800);
    check(
      'Таб переехал в другую секцию на указанное место',
      [await order(page, 0), await order(page, 1)],
      ['Am F C G', 'Dm T Bb F'],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '02-moved-to-other-section.png') });

    // ── 9. Другой размер секции: длина пересчитывается ─────────────────────
    await setup(page, { second: true, secondTs: '3/4' });
    const g5 = await geom(page);
    const second3_4 = g5.secs[1];
    await hold(page, g5.tab, 700);
    await dragTo(page, { x: second3_4.squares[2].x, y: second3_4.squares[2].top + 6 });
    await page.mouse.up();
    await wait(800);
    const meterMoved = await page.evaluate(() => {
      const sec = sections[1];
      const sq = sec.squares.find((q) => q.type === 'tab');
      return {
        order: sec.squares.map((q) => (q.type === 'tab' ? 'T' : q.events[0].chord)).join(' '),
        beats: sq ? sq.beats : 0,
        notes: sq ? sq.notes.filter((n) => !n.pause).map((n) => `${n.start}:${n.fret}`) : [],
      };
    });
    check('Перенос в 3/4: таб встал на место третьего квадрата', meterMoved.order, 'Dm Bb T F');
    check('Перенос в 3/4: длина стала целыми тактами нового размера', [meterMoved.beats, meterMoved.notes.length], [6, 4]);
    check('Перенос в 3/4: ноты не потеряны и не сдвинуты по ритму', meterMoved.notes, ['0:3', '1:4', '2:5', '3:6']);

    // ── 10. Касание: удержание пальцем тоже перетаскивает ──────────────────
    const touchPage = await browser.newPage();
    touchPage.on('pageerror', (e) => pageErrors.push(e.message));
    await touchPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await touchPage.goto(URL, { waitUntil: 'load' });
    await setup(touchPage, { tabAt: 'end' });
    const gt = await geom(touchPage);
    const vw = await touchPage.evaluate(() => window.innerWidth);
    const clampX = (x) => Math.max(20, Math.min(vw - 20, x));
    const touchDrop = { x: clampX(gt.secs[0].squares[0].x), y: gt.secs[0].squares[0].top + 6 };
    await touchPage.touchscreen.touchStart(clampX(gt.tab.x), gt.tab.y);
    await wait(700);
    const touchLifted = await touchPage.evaluate(() => !!document.querySelector('.square--tab.is-tab-drag-source'));
    for (let i = 1; i <= 10; i++) {
      await touchPage.touchscreen.touchMove(
        clampX(gt.tab.x) + (touchDrop.x - clampX(gt.tab.x)) * (i / 10),
        gt.tab.y + (touchDrop.y - gt.tab.y) * (i / 10),
      );
      await wait(30);
    }
    await wait(250);
    await touchPage.screenshot({ path: path.join(OUT_DIR, '03-touch-lifted-390.png') });
    await touchPage.touchscreen.touchEnd();
    await wait(800);
    check('Касание с удержанием «берёт» карточку', touchLifted, true);
    check('Касанием таб переставляется в начало секции', await order(touchPage), 'T Am F C G');
    await touchPage.close();

    // ── 11. Обычный клик после всего не сломался ───────────────────────────
    await page.evaluate(() => document.querySelector('[data-tab-cancel]')?.click());
    await wait(300);
    const g6 = await geom(page);
    await page.mouse.click(g6.tab.x, g6.tab.y);
    await wait(600);
    check('Короткое нажатие снова открывает редактор', await page.evaluate(() => !!document.querySelector('.tab-insert-editor')), true);

    check('На страницах не было ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ version: '0.695', results, passed, total: results.length }, null, 2));
    console.log(`\n${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
