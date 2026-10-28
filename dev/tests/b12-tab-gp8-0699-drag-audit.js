'use strict';
// 0.699 · B-12.12 «Таб-вставка»: аудит всего жеста переноса.
// Проверяет пять находок ручной проверки 0.698 и то, что прежнее поведение
// не сломалось:
//   1) уход из окна и отпускание кнопки вне страницы отменяют перенос;
//   2) Esc до «взятия» по-прежнему ничего не отменяет (решение владельца);
//   3) предел «16 квадратов» снят для переносов, песня с 17+ открывается;
//   4) открытое место под бросок совпадает с настоящей высотой строки;
//   5) подпись после броска говорит, что получилось на самом деле.
// Запуск: node dev/tests/b12-tab-gp8-0699-drag-audit.js
// Нужен локальный сервер: python3 -m http.server 8000 (из корня репозитория).

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sparticuz = require('@sparticuz/chromium').default;

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-drag-0.699');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      было: ${JSON.stringify(actual)}\n      ждали: ${JSON.stringify(expected)}`}`);
}

const rect = (page, expr, arg) =>
  page.evaluate((e, a) => {
    // eslint-disable-next-line no-eval
    const el = typeof e === 'function' ? e(a) : eval(e);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  }, expr, arg);

const toastText = (page) => page.evaluate(() => {
  const t = document.querySelector('.toast') || document.getElementById('homeToast');
  return t ? t.textContent : '';
});
const clearToast = (page) => page.evaluate(() => {
  const t = document.querySelector('.toast');
  if (t) { t.textContent = ''; t.classList.remove('show'); }
});
const historyLen = (page) => page.evaluate(() => (window.historyDebugState ? historyDebugState().length : -1));
const kinds = (page, i = 0) =>
  page.evaluate((i) => sections[i].squares.map((q) => (q.type === 'tab' ? 'T' : (squareHasInlineTab(q) ? 'K' : 'A'))).join(''), i);

// Песня: n рядов по 4 доли, при желании в ряду `cellAt` — таб-ячейка.
// Таб-строка ставится в конец, если withTabRow.
function makeSong(page, { n = 4, cellAt = 0, withTabRow = true, wideRow = false } = {}) {
  return page.evaluate(({ n, cellAt, withTabRow, wideRow }) => {
    startNewSongFromHome();
    addSection('A');
    const row = (ch, tab, beats) => {
      const sq = {
        id: nextId++, repeat: 1, customBeats: beats || 16,
        events: Array.from({ length: (beats || 16) / 4 }, () => ({ chord: ch, span: 4, timeSig: null })),
      };
      if (tab) {
        sq.events.splice(1, 0, { chord: '', span: 4, timeSig: null, isTab: true, tabNotes: [{ start: 0, dur: 1, string: 0, fret: 3 }] });
        sq.customBeats = (beats || 16) + 4;
      }
      return sq;
    };
    sections[0].squares = Array.from({ length: n }, (_, i) => row(i % 2 ? 'Am' : 'F', i === cellAt, (wideRow && i === 0) ? 20 : 16));
    if (withTabRow) {
      sections[0].squares.push({
        id: nextId++, type: 'tab', repeat: 1, beats: 4,
        notes: [{ start: 0, dur: 1, string: 0, fret: 3 }, { start: 1, dur: 1, string: 1, fret: 1 }],
        events: [], customBeats: null,
      });
    }
    renderSectionsGrid();
  }, { n, cellAt, withTabRow, wideRow });
}

async function holdAt(page, pt, ms = 760) {
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await wait(ms);
}

async function glide(page, to, steps = 10) {
  const from = await page.evaluate(() => (tabSquareDrag ? { x: tabSquareDrag.lastX, y: tabSquareDrag.lastY } : { x: 0, y: 0 }));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await wait(24);
  }
  await wait(280);
}

const dragState = (page) => page.evaluate(() => ({
  phase: tabSquareDrag && tabSquareDrag.phase,
  taken: document.querySelectorAll('.is-tab-drag-taken').length,
  spacer: document.querySelectorAll('.tab-drag-page-spacer').length,
  draggingBody: document.body.classList.contains('is-tab-dragging'),
  gap: document.querySelectorAll('.tab-drop-gap').length,
}));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await sparticuz.executablePath(),
    args: [...sparticuz.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const pageErrors = [];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); document.documentElement.dataset.theme = 'light'; });

  try {
    // ── 1. Короткое нажатие по-прежнему открывает редактор ────────────────
    await makeSong(page, { n: 3 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    // Нажимаем по самой вставке (на компьютере таб занимает часть строки).
    const t0 = await rect(page, `document.querySelector('.square--tab .tab-insert')`);
    await page.mouse.move(t0.cx, t0.t + Math.min(24, t0.h / 2));
    await page.mouse.down();
    await wait(120);
    await page.mouse.up();
    await wait(600);
    check('Короткое нажатие по вставке открывает редактор', await page.evaluate(() => !!document.querySelector('.tab-insert-editor')), true);
    await page.keyboard.press('Escape');
    await wait(500);
    check('Esc закрывает редактор таб-вставки', await page.evaluate(() => !!document.querySelector('.tab-insert-editor')), false);

    // Находка аудита (не менялась в 0.699, решение за владельцем): на
    // компьютере строка таба шире самой вставки, и нажатие по пустому месту
    // строки справа от таба ничего не открывает. Фиксируем как есть, чтобы
    // изменение поведения было видно.
    const t0b = await rect(page, `document.querySelector('.square--tab')`);
    const emptyHit = await page.evaluate((x, y) => {
      const el = document.elementFromPoint(x, y);
      return { card: !!(el && el.closest('.square--tab')), insert: !!(el && el.closest('.tab-insert')) };
    }, t0b.r - 30, t0b.cy);
    await page.mouse.move(t0b.r - 30, t0b.cy);
    await page.mouse.down();
    await wait(120);
    await page.mouse.up();
    await wait(500);
    const emptyClick = await page.evaluate(() => !!document.querySelector('.tab-insert-editor'));
    check('Пустое место строки справа от таба: карточка есть, вставки нет', emptyHit, { card: true, insert: false });
    check('Клик по пустому месту строки редактор не открывает (как сейчас)', emptyClick, false);

    // ── 2. Уход из окна отменяет перенос ──────────────────────────────────
    for (const kind of ['row', 'cell']) {
      await makeSong(page, { n: 4 });
      await wait(900);
      const sel = kind === 'row' ? '.square--tab' : '.chord-wrapper--tab';
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
      await wait(300);
      const pt = await rect(page, `document.querySelector(${JSON.stringify(sel)})`);
      const before = await kinds(page);
      const histBefore = await historyLen(page);
      await holdAt(page, { x: pt.cx, y: kind === 'row' ? pt.t + 20 : pt.cy });
      await glide(page, { x: 520, y: 320 }, 6);
      const lifted = await dragState(page);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await wait(350);
      const afterBlur = await dragState(page);
      await page.mouse.up();
      await wait(350);
      check(`Уход из окна отменяет перенос (${kind === 'row' ? 'строки' : 'ячейки'}): карточка была взята`, lifted.phase, 'active');
      check(`Уход из окна снимает перенос (${kind === 'row' ? 'строка' : 'ячейка'})`, afterBlur, { phase: null, taken: 0, spacer: 0, draggingBody: false, gap: 0 });
      check(`Уход из окна не меняет порядок (${kind === 'row' ? 'строка' : 'ячейка'})`, [await kinds(page), await historyLen(page)], [before, histBefore]);
    }

    // ── 3. После отмены обычный клик не переносит таб ─────────────────────
    await makeSong(page, { n: 4 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const pt3 = await rect(page, `document.querySelector('.square--tab')`);
    const before3 = await kinds(page);
    await holdAt(page, { x: pt3.cx, y: pt3.t + 20 });
    await glide(page, { x: 500, y: 300 }, 6);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await wait(250);
    await page.mouse.up();
    await wait(500);
    // имитируем возврат: движение с отпущенной кнопкой и обычный клик по ряду
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: 600, clientY: 400, buttons: 0 })));
    const firstRow = await rect(page, `document.querySelector('.squares-list > .square')`);
    await page.evaluate((x, y) => {
      const el = document.elementFromPoint(x, y) || document.body;
      el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, button: 0 }));
      document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'mouse', bubbles: true, clientX: x, clientY: y, button: 0 }));
    }, firstRow.cx, firstRow.t + 8);
    await wait(500);
    check('После отмены обычный клик не переносит таб', await kinds(page), before3);

    // ── 4. Отпускание кнопки вне страницы (движение с buttons=0) ──────────
    await makeSong(page, { n: 4 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const pt4 = await rect(page, `document.querySelector('.square--tab')`);
    const before4 = await kinds(page);
    await holdAt(page, { x: pt4.cx, y: pt4.t + 20 });
    await glide(page, { x: 500, y: 320 }, 6);
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', bubbles: true, clientX: 560, clientY: 360, buttons: 0 })));
    await wait(350);
    const after4 = await dragState(page);
    await page.mouse.up();
    await wait(300);
    check('Движение с отпущенной кнопкой отменяет перенос', after4, { phase: null, taken: 0, spacer: 0, draggingBody: false, gap: 0 });
    check('Движение с отпущенной кнопкой не меняет порядок', await kinds(page), before4);

    // ── 5. Esc до «взятия» не отменяет нажатие (решение владельца) ────────
    await makeSong(page, { n: 4 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const pt5 = await rect(page, `document.querySelector('.square--tab')`);
    await page.mouse.move(pt5.cx, pt5.t + 20);
    await page.mouse.down();
    await wait(140);
    await page.keyboard.press('Escape');
    await wait(600);
    const escPending = await dragState(page);
    await page.mouse.up();
    await wait(300);
    check('Esc в первые полсекунды не мешает «взятию» (как решено)', escPending.phase, 'active');
    await page.evaluate(() => { const t = document.querySelector('.toast'); if (t) { t.textContent = ''; } });
    // Esc во время переноса по-прежнему отменяет
    await makeSong(page, { n: 4 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const pt5b = await rect(page, `document.querySelector('.square--tab')`);
    const before5 = await kinds(page);
    await holdAt(page, { x: pt5b.cx, y: pt5b.t + 20 });
    const firstRow5 = await rect(page, `document.querySelector('.squares-list > .square')`);
    await glide(page, { x: firstRow5.cx, y: firstRow5.t + 4 });
    await page.keyboard.press('Escape');
    await wait(350);
    const escActive = await dragState(page);
    await page.mouse.up();
    await wait(300);
    check('Esc во время переноса по-прежнему отменяет', [escActive, await kinds(page)], [{ phase: null, taken: 0, spacer: 0, draggingBody: false, gap: 0 }, before5]);

    // ── 6. Предел 16 снят для переносов: ячейка → строка в полной секции ──
    await makeSong(page, { n: 16, cellAt: 0, withTabRow: false });
    await wait(1000);
    await page.evaluate(() => document.querySelector('.chord-wrapper--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const cell6 = await rect(page, `document.querySelector('.chord-wrapper--tab')`);
    await clearToast(page);
    await holdAt(page, { x: cell6.cx, y: cell6.cy });
    const rows6 = await page.evaluate(() => [...document.querySelectorAll('.squares-list > .square')].map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, t: r.top, b: r.bottom, vis: r.top > 40 && r.bottom < window.innerHeight - 40 };
    }));
    const target6 = rows6.filter((r) => r.vis).pop();
    await glide(page, { x: 640, y: target6.t + 3 });
    const mode6 = await page.evaluate(() => (tabSquareDrag && tabSquareDrag.target ? tabSquareDrag.target.mode : null));
    const gap6 = await page.evaluate(() => {
      const g = document.querySelector('.tab-drop-gap');
      return g ? g.getBoundingClientRect().height : null;
    });
    await page.screenshot({ path: path.join(OUT_DIR, '01-gap-before-drop.png') });
    await page.mouse.up();
    await wait(700);
    const after6 = await page.evaluate(() => ({
      n: sections[0].squares.length,
      rowH: (() => { const c = document.querySelector('.square--tab'); return c ? c.getBoundingClientRect().height : -1; })(),
      toast: (document.querySelector('.toast') || {}).textContent || '',
    }));
    check('Ячейка вытаскивается строкой в секции из 16 квадратов (предел снят)', [mode6, after6.n], ['row', 17]);
    check('Место под бросок совпадает с настоящей высотой строки (не больше 2 px)', Math.abs(Math.round(gap6) - Math.round(after6.rowH)) <= 2, true);
    check('Подпись: таб стал строкой — «Таб-вставка перемещена»', after6.toast, 'Таб-вставка перемещена');
    await page.screenshot({ path: path.join(OUT_DIR, '02-row-after-drop-17-squares.png') });

    // ── 7. Песня с 17 квадратами сохраняется и открывается заново ─────────
    await page.evaluate(() => { try { window.saveCurrentSong(); } catch (e) { window.__saveErr = String(e); } });
    await wait(1200);
    await page.evaluate(() => { try { loadSong(0); } catch (e) { window.__loadErr = String(e); } });
    await wait(1500);
    const reload7 = await page.evaluate(() => ({
      n: sections[0] ? sections[0].squares.length : -1,
      err: window.__loadErr || null,
      saveErr: window.__saveErr || null,
    }));
    check('После сохранения и открытия в секции по-прежнему 17 квадратов', [reload7.n, reload7.err, reload7.saveErr], [17, null, null]);

    // ── 8. Строку можно бросить в чужую полную секцию (предел снят) ───────
    await makeSong(page, { n: 2 });
    await page.evaluate(() => {
      addSection('B');
      const row = () => ({ id: nextId++, repeat: 1, customBeats: 16, events: [{ chord: 'C', span: 4 }, { chord: 'C', span: 4 }, { chord: 'C', span: 4 }, { chord: 'C', span: 4 }] });
      sections[1].squares = Array.from({ length: 16 }, () => row());
      renderSectionsGrid();
    });
    await wait(1000);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const tab8 = await rect(page, `document.querySelector('.square--tab')`);
    await clearToast(page);
    await holdAt(page, { x: tab8.cx, y: tab8.t + 20 });
    await page.evaluate(() => document.querySelectorAll('.section-card')[1].scrollIntoView({ block: 'start' }));
    await wait(350);
    const list8 = await rect(page, `document.querySelectorAll('.squares-list')[1]`);
    // Первое движение — к началу второй секции. Открытое место в первой
    // секции сразу раздвигает страницу, поэтому точку броска пересчитываем:
    // целимся НИЖЕ места, иначе курсор окажется внутри него.
    await glide(page, { x: list8.cx, y: list8.t + 4 });
    const card8 = await rect(page, `document.querySelectorAll('.section-card')[1]`);
    const dropY8 = await page.evaluate(() => {
      const r = document.querySelectorAll('.section-card')[1].getBoundingClientRect();
      return Math.min(window.innerHeight - 40, Math.max(60, r.top + 120));
    });
    await glide(page, { x: card8.cx, y: dropY8 }, 6);
    // Режим «строкой» включается у самой границы ряда (первые 20 px сверху),
    // поэтому третий заход — точно на верхнюю кромку первого видимого ряда.
    const edge8 = await page.evaluate(() => {
      const card = document.querySelectorAll('.section-card')[1];
      const rows = [...card.querySelectorAll('.squares-list > .square')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.top > 40 && r.top < window.innerHeight - 60);
      const row = rows[0];
      return row ? { y: row.top + 3 } : null;
    });
    if (edge8) await glide(page, { x: card8.cx, y: edge8.y }, 5);
    const mode8 = await page.evaluate(() => (tabSquareDrag && tabSquareDrag.target ? tabSquareDrag.target.mode : null));
    await page.mouse.up();
    await wait(700);
    const after8 = await page.evaluate(() => ({
      counts: sections.map((s) => s.squares.length),
      toast: (document.querySelector('.toast') || {}).textContent || '',
    }));
    check('Строка встаёт в чужую секцию с 16 квадратами — отказа нет', [mode8, after8.counts], ['row', [2, 17]]);
    check('Подпись при переносе строки — «Таб-вставка перемещена»', after8.toast, 'Таб-вставка перемещена');

    // ── 9. Подпись «стала ячейкой ряда» и «переставлена» ──────────────────
    await makeSong(page, { n: 3, cellAt: 0 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.chord-wrapper--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const cell9 = await rect(page, `document.querySelector('.chord-wrapper--tab')`);
    await clearToast(page);
    await holdAt(page, { x: cell9.cx, y: cell9.cy });
    const target9 = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.squares-list > .square')];
      const w = rows[2].querySelectorAll('.square-inner > .chord-wrapper')[2];
      const r = w.getBoundingClientRect();
      return { x: r.left + 6, y: r.top + r.height / 2 };
    });
    await glide(page, target9);
    await page.mouse.up();
    await wait(600);
    check('Подпись при переходе в другой ряд — «Таб-вставка стала ячейкой ряда»', await toastText(page), 'Таб-вставка стала ячейкой ряда');

    // перестановка внутри того же ряда
    await page.evaluate(() => document.querySelector('.tab-insert--cell').scrollIntoView({ block: 'center' }));
    await wait(300);
    const cell9b = await rect(page, `document.querySelector('.tab-insert--cell')`);
    await clearToast(page);
    await holdAt(page, { x: cell9b.cx, y: cell9b.cy });
    const sameRow9 = await page.evaluate(() => {
      const row = document.querySelector('.tab-insert--cell').closest('.square');
      const wraps = [...row.querySelectorAll('.square-inner > .chord-wrapper')];
      const last = wraps[wraps.length - 1].getBoundingClientRect();
      return { x: last.right - 4, y: last.top + last.height / 2 };
    });
    await glide(page, sameRow9);
    await page.mouse.up();
    await wait(600);
    check('Перестановка внутри ряда — «Таб-ячейка переставлена»', await toastText(page), 'Таб-ячейка переставлена');

    // ── 10. Одно Ctrl+Z возвращает прежний порядок ────────────────────────
    await makeSong(page, { n: 3 });
    await wait(900);
    await page.evaluate(() => document.querySelector('.square--tab').scrollIntoView({ block: 'center' }));
    await wait(300);
    const tab10 = await rect(page, `document.querySelector('.square--tab')`);
    const before10 = await kinds(page);
    await holdAt(page, { x: tab10.cx, y: tab10.t + 20 });
    const first10 = await rect(page, `document.querySelector('.squares-list > .square')`);
    await glide(page, { x: first10.cx, y: first10.t + 4 });
    await page.mouse.up();
    await wait(600);
    const moved10 = await kinds(page);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyZ');
    await page.keyboard.up('Control');
    await wait(600);
    // Таб уехал в начало строкой: K A A T → T K A A, отмена возвращает K A A T.
    check('Одно Ctrl+Z возвращает прежний порядок', [moved10, await kinds(page)], ['TKAA', before10]);

    // ── 11. Телефон: место под бросок тоже настоящей высоты ───────────────
    const ph = await browser.newPage();
    ph.on('pageerror', (e) => pageErrors.push(`phone: ${e.message}`));
    await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await ph.goto(URL, { waitUntil: 'load' });
    await ph.evaluate(() => { document.documentElement.dataset.scheme = 'default'; });
    await makeSong(ph, { n: 3, cellAt: 0, withTabRow: false });
    await wait(1000);
    await ph.evaluate(() => document.querySelector('.chord-wrapper--tab').scrollIntoView({ block: 'center' }));
    await wait(350);
    const cell11 = await rect(ph, `document.querySelector('.chord-wrapper--tab')`);
    const x11 = Math.max(18, Math.min(372, cell11.cx));
    await ph.touchscreen.touchStart(x11, cell11.cy);
    await wait(760);
    const row11 = await ph.evaluate(() => {
      const rows = [...document.querySelectorAll('.squares-list > .square')];
      const r = rows[rows.length - 1].getBoundingClientRect();
      return { t: r.top };
    });
    for (let i = 1; i <= 12; i++) {
      await ph.touchscreen.touchMove(x11 + (60 - x11) * (i / 12), cell11.cy + (row11.t + 3 - cell11.cy) * (i / 12));
      await wait(35);
    }
    await wait(320);
    const phone11 = await ph.evaluate(() => ({
      mode: tabSquareDrag && tabSquareDrag.target ? tabSquareDrag.target.mode : null,
      gap: (() => { const g = document.querySelector('.tab-drop-gap'); return g ? g.getBoundingClientRect().height : null; })(),
    }));
    await ph.screenshot({ path: path.join(OUT_DIR, '03-phone-gap-390.png') });
    await ph.touchscreen.touchEnd();
    await wait(800);
    const phoneRow11 = await ph.evaluate(() => {
      const c = document.querySelector('.square--tab');
      return c ? { h: c.getBoundingClientRect().height, n: sections[0].squares.length } : null;
    });
    check('Телефон: касанием ячейка вытаскивается строкой', [phone11.mode, phoneRow11 && phoneRow11.n], ['row', 4]);
    check('Телефон: место под бросок совпадает с высотой строки (не больше 2 px)', Math.abs(Math.round(phone11.gap) - Math.round(phoneRow11.h)) <= 2, true);
    await ph.screenshot({ path: path.join(OUT_DIR, '04-phone-after-drop-390.png') });
    await ph.close();

    check('На страницах не было ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ version: '0.699', results, passed, total: results.length }, null, 2));
    console.log(`\n${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
