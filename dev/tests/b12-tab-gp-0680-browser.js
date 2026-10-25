#!/usr/bin/env node
// B-12.12 0.680: приёмка по отчёту 07 §7 (P0-1..P1-6) в настоящем Chromium:
// 1) ⌥↑/⌥↓ (Move Up / Move Down) с сохранением лада/приёмов, защитой от коллизий, звуком и Undo;
// 2) Ctrl+Del / ⌃− / ⌘Backspace (удаление такта / всех выделенных тактов), Shift+Del (доли),
//    ⇧⌘←/→ (выделение тактов целиком, Esc снимает), Backspace (удаление доли со сдвигом на последней ноте);
// 3) Space / ⇧Space (прослушивание черновика без закрытия окна, начальный фокус на .tab-at-host);
// 4) возврат панели .tab-tools на десктопе без сенсорного 0–9 лад-пада, индикатор «6 (6-я)», ширина до 52rem;
// 5) Shift+↑/↓ прямоугольное выделение «доли × струны» без схлопывания;
// 6) мгновенные клавиши L, ⇧L, B, ⌥Y с отметкой на стане и подсказкой в #tabGpError.
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROMIUM = process.env.CHROMIUM_BIN || process.env.CHROME_PATH || '/tmp/chromium';
const OUT_DIR = process.env.B12_GP_0680_RESULTS || '';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, actual, expected = true) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    const msg = `FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
    failures.push(msg);
    console.error(msg);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (start, fret, dur = 1, string = 0, extra = {}) => ({ start, fret, dur, string, ...extra });

async function runDesktopSuite(browser, width, height, theme, captureShots = false) {
  const prefix = `${width}x${height}/${theme}`;
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof addTabInsert === 'function' && typeof partsEnsureAlphaTab === 'function');

  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    startNewSongFromHome();
    if (!sections.length) addSection();
    if (!sections[0].squares.length) addSquare(sections[0].id);
    addTabInsert(sections[0].id);
  }, theme);
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(350);

  // --- P0-3 & P1-4: Initial focus on .tab-at-host + desktop/tablet toolbar & layout ---
  const initialUi = await page.evaluate(() => {
    const modal = document.querySelector('.tab-insert-editor .strum-modal-content');
    const body = document.querySelector('.tab-editor-body');
    const tools = document.querySelector('.tab-tools');
    const fretRow = document.querySelector('.tab-tools-row--frets');
    const strEl = document.querySelector('[data-tab-surface-readout]');
    const helpBtn = document.querySelector('[data-tab-help]');
    const actions = document.querySelector('.tab-editor-actions');
    const mr = modal.getBoundingClientRect();
    const hr = helpBtn.getBoundingClientRect();
    const ar = actions.getBoundingClientRect();
    return {
      desktopMedia: matchMedia('(min-width: 64.125rem) and (hover: hover) and (pointer: fine)').matches,
      activeIsHost: document.activeElement === document.querySelector('.tab-at-host'),
      modalWidth: Math.round(mr.width),
      modalBottomInViewport: mr.bottom <= window.innerHeight + 1,
      noModalOverflow: modal.scrollHeight <= modal.clientHeight + 2 && body.scrollHeight <= body.clientHeight + 2,
      toolsDisplay: getComputedStyle(tools).display,
      fretRowDisplay: getComputedStyle(fretRow).display,
      stringReadout: strEl ? strEl.textContent.trim() : null,
      playBtnVisible: !!document.querySelector('[data-tab-gp="play"]'),
      helpVisible: hr.width >= 28 && hr.height >= 28,
      actionsFullyVisible: ar.bottom <= mr.bottom + 1,
    };
  });
  check(`${prefix} P0-3: начальный фокус на .tab-at-host, не на Отмена`, initialUi.activeIsHost, true);
  if (width >= 1026) {
    check(`${prefix} P1-4: desktop pointer media активен`, initialUi.desktopMedia, true);
    check(`${prefix} P1-4: .tab-tools видна, лад-пад 0–9 скрыт`, [initialUi.toolsDisplay, initialUi.fretRowDisplay], ['flex', 'none']);
  } else {
    check(`${prefix} P1-4: на 1024 планшетный лад-пад 0–9 виден`, initialUi.fretRowDisplay, 'block');
  }
  check(`${prefix} P1-4: ширина модалки снята с зажима 520px`, initialUi.modalWidth >= 760, true);
  check(`${prefix} P1-4: индикатор струны «6-я струна» в шапке стана`, initialUi.stringReadout?.includes('6-я струна'), true);
  check(`${prefix} P1-4: кнопка прослушивания видна`, initialUi.playBtnVisible, true);
  check(`${prefix} P1-4: кнопка «?» и действия целиком помещаются без обрезки`, [
    initialUi.modalBottomInViewport,
    initialUi.noModalOverflow,
    initialUi.helpVisible,
    initialUi.actionsFullyVisible,
  ], [true, true, true, true]);

  if (captureShots && OUT_DIR) {
    await page.screenshot({ path: path.join(OUT_DIR, `01-desktop-${width}x${height}-${theme}.png`) });
  }

  const key = async (code, mod = null, shift = false) => {
    if (mod) await page.keyboard.down(mod);
    if (shift) await page.keyboard.down('Shift');
    await page.keyboard.press(code);
    if (shift) await page.keyboard.up('Shift');
    if (mod) await page.keyboard.up(mod);
    await wait(55);
  };

  const fixture = async (notes, cursorStart = 0, beats = 4, cursorString = 0) => {
    await page.evaluate(
      ({ notes: ns, cursorStart: cs, beats: b, cursorString: cstr }) => {
        const e = tabInsertEditorState;
        const sq = e.source;
        sq.beats = b;
        sq.notes = structuredClone(ns);
        e.draft = structuredClone(sq);
        e.history = [];
        e.forward = [];
        e.gpSelection = null;
        e.gpNotice = null;
        e.techPanel = null;
        tabGpImport(e);
        renderTabInsertEditor(e);
        tabGpSetTime(e, cs, cstr);
        tabAtHostEl?.focus({ preventScroll: true });
      },
      { notes, cursorStart, beats, cursorString },
    );
    await wait(90);
  };

  const state = () =>
    page.evaluate(() => {
      const e = tabInsertEditorState;
      const err = e?.overlay?.querySelector('[data-tab-gp-error]');
      return {
        open: !!document.querySelector('.tab-insert-editor'),
        beats: e?.draft?.beats,
        barsCount: e?.gpBars?.length,
        notes: structuredClone(e?.draft?.notes || []),
        cursor: { ...tabAtCursor },
        stringReadout: document.querySelector('[data-tab-surface-readout]')?.textContent?.trim(),
        history: e?.history?.length || 0,
        disabled: !!e?.overlay?.querySelector('[data-tab-apply]')?.disabled,
        errorHidden: err ? err.hidden : true,
        errorNotice: err ? err.classList.contains('is-notice') : false,
        errorText: err ? err.textContent : '',
        selection: e?.gpSelection ? structuredClone(e.gpSelection) : null,
        draftPlay: e?.draftPlay
          ? {
              playing: e.draftPlay.playing,
              fromBeat: e.draftPlay.fromBeat,
              scheduledCount: e.draftPlay.scheduledCount,
            }
          : null,
        techPanel: e?.techPanel || null,
      };
    });

  // --- P0-1: ⌥↑ / ⌥↓ Move Up / Move Down ---
  await page.evaluate(() => {
    window.__playedTabNotes = [];
    const orig = playTabNote;
    playTabNote = function (s, f) {
      window.__playedTabNotes.push([s, f]);
      return orig.apply(this, arguments);
    };
  });
  await fixture([note(0, 3, 1, 0, { vibrato: 'slight' }), note(1, 5), note(2, 7), note(3, 9)], 0, 4, 0);
  for (let i = 0; i < 4; i++) await key('ArrowUp', 'Alt');
  let s = await state();
  check(
    `${prefix} P0-1: 4× ⌥↑ переносит лад 3 с 6-й на 2-ю струну с сохранением вибрато`,
    [s.notes[0].string, s.notes[0].fret, s.notes[0].vibrato, s.cursor.string, s.stringReadout?.includes('2-я струна')],
    [4, 3, 'slight', 4, true],
  );
  const playedLog = await page.evaluate(() => window.__playedTabNotes.slice(-4));
  check(`${prefix} P0-1: звук playTabNote сыграл на каждом переносе`, playedLog, [
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
  ]);
  await key('ArrowUp', 'Alt');
  await key('ArrowUp', 'Alt'); // упор на 1-й струне (string 5)
  s = await state();
  check(`${prefix} P0-1: упор на 1-й струне без потери ноты и лишнего Undo`, [s.notes[0].string, s.history, s.stringReadout?.includes('1-я струна')], [5, 5, true]);

  // Проверка защиты от коллизии на занятой струне и группового сдвига интервала
  await fixture(
    [
      note(0, 3, 1, 0),
      note(0, 5, 1, 1),
      note(1, 5, 1, 0),
      note(1, 7, 1, 1),
      note(2, 7, 1, 0),
      note(3, 9, 1, 0),
    ],
    0,
    4,
    0,
  );
  await key('ArrowUp', 'Alt'); // одиночная нота string 0 упирается в string 1 на той же доле
  s = await state();
  check(`${prefix} P0-1: защита от затирания соседней ноты созвучия`, [
    s.notes.filter((n) => n.start === 0).map((n) => [n.string, n.fret]),
    s.history,
  ], [
    [
      [0, 3],
      [1, 5],
    ],
    0,
  ]);
  await key('ArrowRight', null, true); // выделяем доли 0..1 целиком
  await key('ArrowUp', 'Alt'); // обе струны интервала движутся вместе 0,1 -> 1,2 за 1 шаг Undo!
  s = await state();
  check(`${prefix} P0-1: выделенный интервал сдвигается целиком без сплющивания`, [
    s.notes.filter((n) => n.start <= 1).map((n) => [n.start, n.string, n.fret]),
    s.history,
  ], [
    [
      [0, 1, 3],
      [0, 2, 5],
      [1, 1, 5],
      [1, 2, 7],
    ],
    1,
  ]);
  await key('KeyZ', 'Meta');
  s = await state();
  check(`${prefix} P0-1: один ⌘Z возвращает интервал на струны 6 и 5`, s.notes.filter((n) => n.start <= 1).map((n) => [n.start, n.string, n.fret]), [
    [0, 0, 3],
    [0, 1, 5],
    [1, 0, 5],
    [1, 1, 7],
  ]);

  // --- P0-2: Ctrl+Del / ⌘Backspace / ⇧⌘→ / Shift+Del / Backspace ---
  const twoBars = [
    note(0, 3),
    note(1, 5),
    note(2, 7),
    note(3, 9),
    note(4, 2, 1, 1),
    note(5, 4, 1, 1),
    note(6, 5, 1, 1),
    note(7, 7, 1, 1),
  ];
  await fixture(twoBars, 4, 8, 1);
  await key('Delete', 'Control');
  s = await state();
  check(`${prefix} P0-2: Ctrl+Delete удаляет текущий такт`, [s.barsCount, s.beats, s.notes.map((n) => n.fret)], [1, 4, [3, 5, 7, 9]]);
  await key('KeyZ', 'Meta');
  s = await state();
  check(`${prefix} P0-2: Undo после Ctrl+Delete возвращает второй такт`, [s.barsCount, s.notes.length], [2, 8]);

  // Выделение целых тактов по ⇧⌘→, снятие Esc и удаление всех выделенных тактов до 1 пустого
  await fixture(twoBars, 0, 8, 0);
  await key('ArrowRight', 'Meta', true);
  s = await state();
  check(`${prefix} P0-2: один ⇧⌘→ выделяет оба такта целиком`, [s.selection?.barMode, s.selection?.anchor?.bar, s.selection?.focus?.bar], [true, 0, 1]);
  await key('Escape');
  s = await state();
  check(`${prefix} P0-2: Esc снимает выделение тактов, не закрывая окно`, [s.open, s.selection], [true, null]);
  await key('ArrowLeft', 'Meta', true);
  s = await state();
  check(`${prefix} P0-2: один ⇧⌘← из второго такта также выделяет оба такта целиком`, [s.selection?.barMode, s.selection?.anchor?.bar, s.selection?.focus?.bar], [true, 0, 1]);
  await key('Delete', 'Control');
  s = await state();
  check(`${prefix} P0-2: Ctrl+Delete по всем выделенным тактам оставляет 1 чистый пустой такт`, [s.barsCount, s.beats, s.notes.length, s.disabled], [1, 4, 0, false]);
  await key('KeyZ', 'Meta');
  s = await state();
  check(`${prefix} P0-2: один ⌘Z возвращает все удалённые такты`, [s.barsCount, s.notes.length], [2, 8]);

  // ⌘Backspace на Mac также удаляет такт
  await fixture(twoBars, 4, 8, 1);
  await key('Backspace', 'Meta');
  s = await state();
  check(`${prefix} P0-2: ⌘Backspace удаляет такт`, [s.barsCount, s.notes.map((n) => n.fret)], [1, [3, 5, 7, 9]]);

  // Shift+Delete удаляет долю со сдвигом
  await fixture([note(0, 3), note(1, 5), note(2, 7), note(3, 9)], 1, 4, 0);
  await key('Delete', null, true);
  s = await state();
  check(`${prefix} P0-2: Shift+Delete удаляет долю со сдвигом`, s.notes.map((n) => [n.start, n.fret]), [
    [0, 3],
    [1, 7],
    [2, 9],
  ]);

  // Backspace без модификаторов в пустом такте с одной нотой очищает такт без явной паузы
  await fixture([], 0, 4, 0);
  await key('3');
  await key('Backspace');
  s = await state();
  check(`${prefix} P0-2: Backspace единственной ноты в такте возвращает чистый пустой такт без паузы`, [s.notes.length, s.disabled], [0, false]);

  // --- P0-3: Space и ⇧Space проигрывают черновик, не закрывая модалку ---
  await fixture([note(0, 3), note(1, 5), note(2, 7), note(3, 9)], 3, 4, 0);
  await key('Space');
  s = await state();
  check(
    `${prefix} P0-3: Space на последней позиции играет все 4 ноты с начала и НЕ закрывает окно`,
    [s.open, s.draftPlay?.playing, s.draftPlay?.fromBeat, s.draftPlay?.scheduledCount],
    [true, true, 0, 4],
  );
  await key('Space');
  s = await state();
  check(`${prefix} P0-3: повторный Space останавливает проигрывание`, [s.open, s.draftPlay], [true, null]);

  await fixture([note(0, 3), note(1, 5), note(2, 7), note(3, 9)], 1, 4, 0);
  await key('Space');
  s = await state();
  check(`${prefix} P0-3: Space с середины играет с позиции курсора (3 ноты)`, [s.draftPlay?.playing, s.draftPlay?.fromBeat, s.draftPlay?.scheduledCount], [true, 1, 3]);
  await key('Space', null, true); // ⇧Space перезапускает с начала
  s = await state();
  check(`${prefix} P0-3: ⇧Space всегда перезапускает черновик с начала такта 1 (4 ноты)`, [s.draftPlay?.playing, s.draftPlay?.fromBeat, s.draftPlay?.scheduledCount], [true, 0, 4]);
  await key('Space'); // стоп

  // --- P1-5: Shift+↑ / Shift+↓ прямоугольное выделение (доли × струны) ---
  const gridNotes = [
    note(0, 3, 1, 0), note(0, 4, 1, 1), note(0, 5, 1, 2), note(0, 8, 1, 4),
    note(1, 3, 1, 0), note(1, 4, 1, 1), note(1, 5, 1, 2), note(1, 8, 1, 4),
    note(2, 3, 1, 0), note(2, 4, 1, 1), note(2, 5, 1, 2), note(2, 8, 1, 4),
    note(3, 0, 1, 0),
  ];
  await fixture(gridNotes, 0, 4, 0);
  await key('ArrowRight', null, true);
  await key('ArrowRight', null, true); // 3 доли (0..2)
  await key('ArrowUp', null, true); // струны 6..5 (0..1)
  const rectInfo = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.tab-at-host .tab-gp-selected')].map((el) => el.getBoundingClientRect());
    const barB = tabAtBarBounds(tabAtApi, 0);
    return {
      count: boxes.length,
      boxHeight: boxes[0] ? Math.round(boxes[0].height) : 0,
      barHeight: barB ? Math.round(barB.h) : 0,
      sel: structuredClone(tabInsertEditorState.gpSelection),
    };
  });
  check(
    `${prefix} P1-5: Shift+→×2 затем Shift+↑ расширяет прямоугольник 3 доли × 2 струны без схлопывания`,
    [
      rectInfo.count,
      rectInfo.sel.anchor.index,
      rectInfo.sel.focus.index,
      rectInfo.sel.anchorString,
      rectInfo.sel.focusString,
      rectInfo.sel.stringScoped,
      rectInfo.boxHeight < rectInfo.barHeight,
    ],
    [3, 0, 2, 0, 1, true, true],
  );
  if (captureShots && OUT_DIR && theme === 'light' && width === 1600) {
    await page.screenshot({ path: path.join(OUT_DIR, `02-rect-selection-1600x1000-light.png`) });
  }
  await key('Delete');
  s = await state();
  check(
    `${prefix} P1-5: Delete по прямоугольнику 3×2 удаляет только струны 6 и 5, сохраняя струны 4 и 2`,
    s.notes.filter((n) => n.start <= 2).map((n) => [n.start, n.string, n.fret]),
    [
      [0, 2, 5], [0, 4, 8],
      [1, 2, 5], [1, 4, 8],
      [2, 2, 5], [2, 4, 8],
    ],
  );
  await key('KeyZ', 'Meta');
  check(`${prefix} P1-5: Undo прямоугольного Delete возвращает все 13 нот`, (await state()).notes.length, 13);

  // --- P1-6: L, ⇧L, B, ⌥Y мгновенное применение/снятие и статус в #tabGpError ---
  await fixture([note(0, 5, 1, 0), note(1, 5, 1, 0), note(2, 7, 1, 2), note(3, 9, 1, 0)], 0, 4, 0);
  await key('KeyL'); // курсор на ЛЕВОЙ из двух одинаковых нот лада 5
  s = await state();
  check(`${prefix} P1-6: L на левой из двух соседних нот ставит лигу`, [!!s.notes[1].tie, s.disabled], [true, false]);
  await key('KeyL'); // повторное L снимает лигу
  check(`${prefix} P1-6: повторное L на левой ноте снимает лигу`, !!((await state()).notes[1].tie), false);

  await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 0));
  await wait(40);
  await key('KeyL'); // курсор на ПРАВОЙ ноте
  check(`${prefix} P1-6: L на правой ноте ставит лигу`, !!((await state()).notes[1].tie), true);

  // L без подходящего соседа показывает объяснение в #tabGpError без блокировки Apply
  await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 3, 0));
  await wait(40);
  await key('KeyL');
  s = await state();
  check(
    `${prefix} P1-6: L без соседней ноты того же лада пишет подсказку в #tabGpError, не блокируя Применить`,
    [!s.errorHidden, s.errorNotice, s.errorText.includes('лиги'), s.disabled],
    [true, true, true, false],
  );

  // ⇧L ставит лигу на всё созвучие сразу
  await fixture(
    [
      note(0, 3, 1, 0), note(0, 5, 1, 1),
      note(1, 3, 1, 0), note(1, 5, 1, 1),
      note(2, 7, 1, 0), note(3, 9, 1, 0),
    ],
    1,
    4,
    0,
  );
  await key('KeyL', null, true);
  s = await state();
  check(
    `${prefix} P1-6: ⇧L связывает обе ноты созвучия`,
    s.notes.filter((n) => n.start === 1).map((n) => !!n.tie),
    [true, true],
  );

  // B сразу ставит Full bend и открывает кривую; повторный B снимает бенд и закрывает панель
  await fixture([note(0, 5, 1, 0), note(1, 5, 1, 0, { tie: true }), note(2, 7, 1, 2), note(3, 9, 1, 1)], 2, 4, 2);
  await key('KeyB');
  let svgMarks = await page.evaluate(() =>
    [...document.querySelectorAll('.tab-at-host svg text')].map((t) => t.textContent.trim()).join(' '),
  );
  s = await state();
  check(
    `${prefix} P1-6: B сразу ставит Full бенд на стан и открывает панель кривой`,
    [s.notes[2].bend?.type, s.notes[2].bend?.points, s.techPanel, svgMarks.toLowerCase().includes('full')],
    ['bend', [[0, 0], [1, 2]], 'bend', true],
  );
  if (captureShots && OUT_DIR && theme === 'light' && width === 1600) {
    await page.screenshot({ path: path.join(OUT_DIR, `03-bend-shortcut-1600x1000-light.png`) });
  }
  await key('KeyB');
  s = await state();
  check(`${prefix} P1-6: повторный B снимает бенд и закрывает панель`, [!!s.notes[2].bend, s.techPanel], [false, null]);

  // ⌥Y сразу ставит искусственный флажолет (+12 пт) и открывает поле ноты; повторный ⌥Y снимает
  await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 3, 1)); // струна 5 (A2) + лад 9 = F#3 -> +12 = F#4
  await wait(40);
  await key('KeyY', 'Alt');
  svgMarks = await page.evaluate(() =>
    [...document.querySelectorAll('.tab-at-host svg text')].map((t) => t.textContent.trim()).join(' '),
  );
  const harmInputVal = await page.evaluate(() => document.querySelector('[data-tab-tech-harm]')?.value || '');
  s = await state();
  check(
    `${prefix} P1-6: ⌥Y сразу ставит A.H. (+12 пт) на стан и заполняет поле ноты`,
    [s.notes[3].harm, s.techPanel, harmInputVal, svgMarks.includes('A.H.')],
    [{ type: 'artificial', note: 'F#4' }, 'harm', 'F#4', true],
  );
  if (captureShots && OUT_DIR && theme === 'dark' && width === 1280) {
    await page.screenshot({ path: path.join(OUT_DIR, `04-aharm-1280x800-dark.png`) });
  }
  await key('KeyY', 'Alt');
  s = await state();
  check(`${prefix} P1-6: повторный ⌥Y снимает искусственный флажолет и закрывает панель`, [!!s.notes[3].harm, s.techPanel], [false, null]);

  check(`${prefix}: нет ошибок страницы`, pageErrors, []);
  await page.close();
}

async function runMobileCheck(browser) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof addTabInsert === 'function');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    startNewSongFromHome();
    if (!sections.length) addSection();
    if (!sections[0].squares.length) addSquare(sections[0].id);
    addTabInsert(sections[0].id);
  });
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(350);
  const mobileUi = await page.evaluate(() => ({
    fretRowDisplay: getComputedStyle(document.querySelector('.tab-tools-row--frets')).display,
    has6String: !!document.querySelector('[data-tab-surface-readout]')?.textContent?.includes('6-я струна'),
    noDocOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  }));
  check('390x844 touch: лад-пад 0–9 остаётся видимым на телефоне', mobileUi, {
    fretRowDisplay: 'block',
    has6String: true,
    noDocOverflow: true,
  });
  if (OUT_DIR) {
    await page.screenshot({ path: path.join(OUT_DIR, '06-mobile-390x844-light.png') });
  }
  check('390x844 touch: нет ошибок страницы', pageErrors, []);
  await page.close();
}

(async () => {
  if (OUT_DIR) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--blink-settings=primaryPointerType=4,primaryHoverType=2',
    ],
  });
  try {
    await runDesktopSuite(browser, 1600, 1000, 'light', true);
    await runDesktopSuite(browser, 1280, 800, 'light', true);
    await runDesktopSuite(browser, 1280, 800, 'dark', true);
    await runDesktopSuite(browser, 1024, 768, 'light', false);

    if (OUT_DIR) {
      // 5-й кадр галереи: 1024x768 с 2 выделенными тактами (⇧⌘→)
      const shotPage = await browser.newPage();
      await shotPage.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
      await shotPage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await shotPage.waitForFunction(() => typeof addTabInsert === 'function');
      await shotPage.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        startNewSongFromHome();
        if (!sections.length) addSection();
        if (!sections[0].squares.length) addSquare(sections[0].id);
        addTabInsert(sections[0].id);
      });
      await shotPage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
      await wait(300);
      await shotPage.evaluate(() => {
        const e = tabInsertEditorState, sq = e.source;
        sq.beats = 8;
        sq.notes = [
          { start: 0, fret: 3, dur: 1, string: 0 },
          { start: 1, fret: 5, dur: 1, string: 0 },
          { start: 2, fret: 7, dur: 1, string: 1 },
          { start: 3, fret: 7, dur: 1, string: 1, tie: true },
          { start: 4, fret: 5, dur: 1, string: 2 },
          { start: 5, fret: 7, dur: 1, string: 2 },
          { start: 6, fret: 8, dur: 1, string: 3 },
          { start: 7, fret: 9, dur: 1, string: 2 },
        ];
        e.draft = structuredClone(sq);
        tabGpImport(e);
        renderTabInsertEditor(e);
        tabGpSetTime(e, 0, 0);
      });
      await wait(120);
      await shotPage.keyboard.down('Meta');
      await shotPage.keyboard.down('Shift');
      await shotPage.keyboard.press('ArrowRight');
      await shotPage.keyboard.up('Shift');
      await shotPage.keyboard.up('Meta');
      await wait(100);
      await shotPage.screenshot({ path: path.join(OUT_DIR, '05-bar-selection-1024x768-light.png') });
      await shotPage.close();
    }

    // Мобильный прогон без desktop pointer override
    const mobileBrowser = await puppeteer.launch({
      executablePath: CHROMIUM,
      env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    try {
      await runMobileCheck(mobileBrowser);
    } finally {
      await mobileBrowser.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exit(1);
})();
