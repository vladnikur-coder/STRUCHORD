#!/usr/bin/env node
/**
 * 0.693 Acceptance & Screenshot Test — B-12.12, «Ctrl+Z после списков»:
 * 1) выбор в «Длина» и «Позиция» больше не забирает место ввода на спрятанный
 *    список — оно остаётся на стане;
 * 2) сразу после выбора работают все клавиши редактора: Ctrl+Z, цифры ладов,
 *    стрелки, пробел (прослушивание);
 * 3) то же для списков панели приёмов (слайд, вибрато, тип бенда, точка);
 * 4) спрятанные списки больше не обёрнуты меткой поля, а настоящее поле ввода
 *    по-прежнему не перехватывается редактором (обычная отмена браузера);
 * 5) отмена в редакторе не трогает историю песни;
 * 6) кнопка «+ Такт» и Ctrl+Z работают как раньше.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.693');
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

// Готовим песню с одной таб-вставкой и открываем редактор.
async function prepare(page) {
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    startNewSongFromHome();
    addSection('Verse');
    const sec = sections[0];
    sec.squares = [];
    sec.squares.push({
      id: nextId++,
      type: 'tab',
      repeat: 1,
      beats: 4,
      notes: [
        { start: 0, dur: 1, string: 0, fret: 3 },
        { start: 1, dur: 1, string: 1, fret: 3 },
      ],
      events: [],
      customBeats: null,
    });
    renderSectionsGrid();
  });
  await wait(2200);
  await page.evaluate(() => {
    openTabInsertEditor(sections[0].id, sections[0].squares[0].id);
  });
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(1200);
}

const state = (page) =>
  page.evaluate(() => {
    const e = tabInsertEditorState;
    const a = document.activeElement;
    return {
      bars: e.gpBars ? e.gpBars.length : null,
      notes: (e.draft.notes || []).length,
      history: (e.history || []).length,
      beats: e.draft.beats,
      // Место ввода: стан или что-то другое (список, кнопка, поле).
      onStaff: !!a && a.classList && a.classList.contains('tab-at-host'),
      active: a ? a.tagName + (a.className ? '.' + String(a.className).split(' ')[0] : '') : '?',
      frets: (e.draft.notes || []).filter((n) => !n.pause).map((n) => n.fret),
      cursor: e.gpCursor ? { bar: e.gpCursor.bar, index: e.gpCursor.index } : null,
      songHistory: window.historyDebugState ? window.historyDebugState().length : null,
      playing: !!e.draftPlay?.playing,
    };
  });

async function pickLength(page, re) {
  await page.$eval('.tab-editor-length .tab-select-pill', (el) => el.click());
  await wait(250);
  const found = await page.evaluate((source) => {
    const rx = new RegExp(source);
    const el = [...document.querySelectorAll('.tab-editor-length .tab-select-option')].find((e) => rx.test(e.textContent));
    if (!el) return false;
    el.click();
    return true;
  }, re.source);
  await wait(800);
  return found;
}

const pressCtrlZ = (page) =>
  page.evaluate(() => {
    const t = document.activeElement || document.body;
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, code: 'KeyZ', key: 'z' });
    t.dispatchEvent(ev);
    return ev.defaultPrevented;
  });

(async () => {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });

    const ver = await page.$eval('#devPanelTrigger', (el) => el.textContent.trim());
    check('Версия в шапке не ниже 0.693', /ver 0\.69[3-9]/.test(ver), true);

    await prepare(page);

    // ── 1. Разметка: спрятанные списки больше не обёрнуты меткой поля ──────
    const markup = await page.evaluate(() => {
      const wraps = [...document.querySelectorAll('.tab-insert-editor .tab-editor-length')];
      const techWraps = [...document.querySelectorAll('.tab-insert-editor .tab-tech-inline-select')].filter((el) =>
        el.querySelector('select.meta-select-native'),
      );
      return {
        lengthTags: wraps.map((el) => el.tagName),
        techTags: techWraps.map((el) => el.tagName),
      };
    });
    check('«Длина» и «Позиция» — обычная обёртка, а не метка поля', markup.lengthTags, ['DIV', 'DIV']);
    check('Списки приёмов тоже без метки поля', markup.techTags.every((t) => t !== 'LABEL'), true);

    // ── 2. Открыть и закрыть меню «Длина», ничего не выбирая ───────────────
    await page.$eval('.tab-editor-length .tab-select-pill', (el) => el.click());
    await wait(250);
    await page.$eval('.tab-editor-length .tab-select-pill', (el) => el.click());
    await wait(250);
    check('Открытие-закрытие меню не уводит место ввода со стана', (await state(page)).onStaff, true);

    // ── 3. «Длина» → место ввода на стане, Ctrl+Z отменяет ─────────────────
    const before = await state(page);
    check('Выбор «2 такта» сработал', await pickLength(page, /^2\s*такт/), true);
    const afterPick = await state(page);
    check('После выбора «Длина» такт добавлен', [before.bars, afterPick.bars], [1, 2]);
    check('После выбора «Длина» место ввода — на стане', afterPick.onStaff, true);
    await page.screenshot({ path: path.join(OUT_DIR, '01-after-length-focus-on-staff.png') });

    const prevented = await pressCtrlZ(page);
    await wait(700);
    const afterUndo = await state(page);
    check('Ctrl+Z сразу после списка убирает добавленный такт', [prevented, afterUndo.bars], [true, 1]);
    check('Отмена в редакторе не тронула историю песни', [afterUndo.songHistory, before.songHistory], [before.songHistory, before.songHistory]);

    // ── 4. Цифры ладов, стрелки и пробел сразу после списка ────────────────
    await pickLength(page, /^2\s*такт/);
    await page.keyboard.press('Digit7');
    await wait(500);
    const afterDigit = await state(page);
    check('Цифра лада работает сразу после списка', afterDigit.frets.includes(7), true);

    await page.evaluate(() => {
      const e = tabInsertEditorState;
      e.gpBars.length = 1;
      e.history = [];
      e.forward = [];
      tabGpSync(e);
      e.gpCursor = { bar: 0, index: 0 };
      tabGpDecorate(e);
      document.querySelector('.tab-at-host').focus();
    });
    await wait(400);
    const arrowFrom = (await state(page)).cursor;
    await page.keyboard.press('ArrowRight');
    await wait(300);
    const arrowTo = (await state(page)).cursor;
    check('Стрелка работает сразу после списка', [arrowFrom.index, arrowTo.index], [0, 1]);

    const spaceHandled = await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Space', key: ' ' });
      document.activeElement.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    await wait(500);
    const afterSpace = await state(page);
    check('Пробел запускает прослушивание сразу после списка', [spaceHandled, afterSpace.playing], [true, true]);
    await page.evaluate(() => {
      if (tabInsertEditorState.draftPlay) tabEditorStopPlay(tabInsertEditorState);
    });
    await wait(300);

    // ── 5. «Позиция»: то же самое ──────────────────────────────────────────
    await page.evaluate(() => {
      const pill = document.querySelectorAll('.tab-editor-length .tab-select-pill')[1];
      pill.click();
    });
    await wait(250);
    const posPicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.tab-editor-length .tab-select-option')].find((e) => /в начале секции/.test(e.textContent));
      if (!el) return false;
      el.click();
      return true;
    });
    await wait(600);
    const afterPos = await state(page);
    check('После выбора «Позиция» место ввода — на стане', [posPicked, afterPos.onStaff], [true, true]);

    // ── 6. Списки приёмов возвращают место ввода на стан ────────────────────
    await page.$eval('.tab-tech-inline-select .tab-select-pill', (el) => el.click());
    await wait(250);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.tab-tech-inline-select .tab-select-option')].find((e) => e.textContent.trim());
      if (el) el.click();
    });
    await wait(700);
    const afterTech = await state(page);
    check('После выбора в списке приёмов место ввода — на стане', afterTech.onStaff, true);

    // ── 7. Настоящее поле ввода по-прежнему не перехватывается редактором ──
    const fieldCase = await page.evaluate(() => {
      const host = document.querySelector('.tab-insert-editor .tab-editor-length');
      const probe = document.createElement('input');
      probe.type = 'text';
      probe.setAttribute('data-test-real-field', '1');
      probe.style.cssText = 'position:absolute;left:-9999px;';
      host.appendChild(probe);
      probe.focus();
      const e = tabInsertEditorState;
      e.history ||= [];
      const historyBefore = e.history.length;
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, code: 'KeyZ', key: 'z' });
      probe.dispatchEvent(ev);
      const out = {
        prevented: ev.defaultPrevented,
        historyChanged: e.history.length !== historyBefore,
        focusKind: document.activeElement.tagName,
      };
      probe.remove();
      document.querySelector('.tab-at-host')?.focus();
      return out;
    });
    check('В настоящем поле ввода отмена остаётся браузерной', [fieldCase.prevented, fieldCase.historyChanged], [false, false]);

    // ── 8. Кнопка «+ Такт» и Ctrl+Z (как в 0.692) ──────────────────────────
    await wait(300);
    const beforeBtn = await state(page);
    await page.click('[data-tab-gp="bar"]');
    await wait(700);
    const afterBtn = await state(page);
    await pressCtrlZ(page);
    await wait(700);
    const afterBtnUndo = await state(page);
    check(
      'Кнопка «+ Такт» добавляет такт, Ctrl+Z его убирает',
      [afterBtn.bars - beforeBtn.bars, afterBtnUndo.bars],
      [1, beforeBtn.bars],
    );

    // ── 9. Телефон: после списка клавиши не глохнут ────────────────────────
    const phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phone.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await phone.waitForSelector('#devPanelTrigger', { timeout: 30000 });
    await prepare(phone);
    await phone.evaluate(() => {
      const pill = document.querySelector('.tab-insert-editor .tab-editor-length .tab-select-pill');
      pill?.click();
    });
    await wait(250);
    const phonePicked = await phone.evaluate(() => {
      const el = [...document.querySelectorAll('.tab-editor-length .tab-select-option')].find((e) => /^2\s*такт/.test(e.textContent));
      if (!el) return false;
      el.click();
      return true;
    });
    await wait(800);
    const phoneState = await state(phone);
    await pressCtrlZ(phone);
    await wait(700);
    const phoneUndo = await state(phone);
    check('Телефон 390: после списка место ввода на стане и Ctrl+Z работает', [phonePicked, phoneState.onStaff, phoneUndo.bars], [true, true, 1]);
    await phone.screenshot({ path: path.join(OUT_DIR, '02-phone-after-length.png') });
    await phone.close();

    await page.screenshot({ path: path.join(OUT_DIR, '03-editor-after-undo.png') });
    check('На странице нет ошибок JavaScript', pageErrors, []);

    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.693', passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2) + '\n',
    );
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
