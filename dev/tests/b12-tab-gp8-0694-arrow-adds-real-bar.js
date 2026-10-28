#!/usr/bin/env node
/**
 * 0.694 Acceptance & Screenshot Test — B-12.12, «стрелка → и длина вставки»:
 * 1) стрелка → в конце последнего такта добавляет НАСТОЯЩИЙ такт — как кнопка
 *    «+ Такт» и как в Guitar Pro 8;
 * 2) этот такт сохраняется по «Применить» (раньше молча исчезал);
 * 3) стрелка ← такты больше не удаляет — как в GP8;
 * 4) Ctrl+Z убирает такт, добавленный стрелкой;
 * 5) предела в 4 такта больше нет: 7 тактов стрелками сохраняются и
 *    открываются снова, «Длина» показывает «7 тактов»;
 * 6) клавиша Insert по-прежнему добавляет такт;
 * 7) «Длина» умеет показывать длинные вставки, а не только 1–4 такта.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.694');
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

async function openFresh(page) {
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
        { start: 2, dur: 1, string: 2, fret: 4 },
        { start: 3, dur: 1, string: 3, fret: 5 },
      ],
      events: [],
      customBeats: null,
    });
    renderSectionsGrid();
  });
  await wait(1600);
  await page.evaluate(() => {
    openTabInsertEditor(sections[0].id, sections[0].squares[0].id);
  });
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(1100);
  await page.evaluate(() => {
    const e = tabInsertEditorState;
    e.gpCursor = { bar: 0, index: e.gpBars[0].length - 1 };
    tabGpSync(e);
    document.querySelector('.tab-at-host').focus();
  });
  await wait(300);
}

const state = (page) =>
  page.evaluate(() => {
    const e = tabInsertEditorState;
    const sq = sections[0].squares.find((q) => q.type === 'tab');
    const units = getGridUnitsPerBar(sections[0].timeSig || globalTimeSig);
    return {
      bars: e.gpBars.length,
      history: (e.history || []).length,
      cursorBar: e.gpCursor.bar,
      lenText: (document.querySelector('[data-tab-beats]')?.selectedOptions?.[0]?.textContent || '').trim(),
      songBars: Math.round(sq.beats / units),
      songNotes: sq.notes.filter((n) => !n.pause).length,
      dirty: tabGpComparableJson(e.gpBars) !== e.initialGpBarsJson,
    };
  });

// Состояние уже сохранённой песни (окно редактора при этом закрыто).
const songState = (page) =>
  page.evaluate(() => {
    const sq = sections[0].squares.find((q) => q.type === 'tab');
    const units = getGridUnitsPerBar(sections[0].timeSig || globalTimeSig);
    return sq ? { songBars: Math.round(sq.beats / units), songNotes: sq.notes.filter((n) => !n.pause).length } : null;
  });

const apply = async (page) => {
  await page.evaluate(() => {
    [...document.querySelectorAll('.tab-insert-editor button')].find((x) => /Применить/.test(x.textContent))?.click();
  });
  await wait(1300);
};

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
    check('Версия в шапке не ниже 0.694',
      (() => { const mm = String(ver).match(/ver\s+0\.(\d+)/); return !!mm && Number(mm[1]) >= 694; })(),
      true);

    // ── 1. Стрелка → добавляет такт, «Длина» это видит ──────────────────────
    await openFresh(page);
    const start = await state(page);
    await page.keyboard.press('ArrowRight');
    await wait(500);
    const oneMore = await state(page);
    check(
      'Стрелка → добавляет такт сразу',
      [start.bars, oneMore.bars, oneMore.lenText],
      [1, 2, '2 такта'],
    );

    // ── 2. ← такты не удаляет ───────────────────────────────────────────────
    await page.keyboard.press('ArrowRight');
    await wait(500);
    const threeBars = await state(page);
    await page.keyboard.press('ArrowLeft');
    await wait(500);
    const afterBack = await state(page);
    check(
      'Стрелка ← такты не удаляет',
      [threeBars.bars, afterBack.bars, afterBack.cursorBar],
      [3, 3, 1],
    );

    // ── 3. Ctrl+Z убирает такт, добавленный стрелкой ────────────────────────
    const undoWorked = await pressCtrlZ(page);
    await wait(600);
    const afterUndo = await state(page);
    check(
      'Ctrl+Z убирает такт, добавленный стрелкой',
      [undoWorked, afterUndo.bars],
      [true, 2],
    );

    // ── 4. Такт от стрелки сохраняется по «Применить» ───────────────────────
    await page.keyboard.press('ArrowRight');
    await wait(500);
    const beforeSave = await state(page);
    await apply(page);
    const saved = await songState(page);
    check(
      '«Применить» сохраняет такт, добавленный стрелкой',
      [beforeSave.bars, saved.songBars, saved.songNotes],
      [3, 3, 4],
    );
    check('Окно редактора закрылось после сохранения', await page.evaluate(() => !document.querySelector('.tab-insert-editor')), true);
    await page.screenshot({ path: path.join(OUT_DIR, '01-three-bars-saved.png') });

    // ── 5. Предела в 4 такта нет: 7 тактов ─────────────────────────────────
    await openFresh(page);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
      await wait(380);
    }
    const seven = await state(page);
    check('Стрелкой можно добавить больше четырёх тактов (7 тактов)', [seven.bars, seven.lenText], [7, '7 тактов']);
    await page.screenshot({ path: path.join(OUT_DIR, '02-seven-bars-in-editor.png') });
    await apply(page);
    const savedSeven = await songState(page);
    check('Семь тактов сохраняются в песне', savedSeven.songBars, 7);

    // Повторно открываем — длина и число тактов на месте
    await page.evaluate(() => {
      const sq = sections[0].squares.find((q) => q.type === 'tab');
      openTabInsertEditor(sections[0].id, sq.id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(1300);
    const reopened = await state(page);
    check('После повторного открытия — те же 7 тактов и «7 тактов» в «Длине»', [reopened.bars, reopened.lenText], [7, '7 тактов']);
    check('Такт, добавленный стрелкой, считается изменением (не теряется при закрытии)', reopened.dirty, false);

    // ── 6. «Длина» показывает длинные вставки ───────────────────────────────
    const lenOptions = await page.evaluate(() => {
      const sel = document.querySelector('[data-tab-beats]');
      sel.closest('.tab-select-wrap').querySelector('.tab-select-pill').click();
      return [...sel.options].map((o) => o.textContent.trim());
    });
    await wait(300);
    await page.evaluate(() => document.body.click());
    check(
      'В списке «Длина» есть варианты длиннее четырёх тактов',
      [lenOptions.includes('8 тактов'), lenOptions.filter((t) => /такт/.test(t)).length >= 8],
      [true, true],
    );

    // Выбор длинного пункта должен не только существовать, но и работать:
    // до 0.694 список обещал до 8 тактов, а обработчик молча отказывал после 4.
    const longLen = await page.evaluate(() => new Promise((resolve) => {
      const sel = document.querySelector('[data-tab-beats]');
      const opt = [...sel.options].find((o) => o.textContent.trim() === '8 тактов');
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => resolve({
        bars: tabInsertEditorState.gpBars.length,
        lenText: sel.closest('.tab-select-wrap').querySelector('.tab-select-pill').textContent.trim(),
      }), 500);
    }));
    check('Выбор «8 тактов» в «Длине» действительно растягивает вставку', [longLen.bars, longLen.lenText], [8, '8 тактов']);

    // ── 7. Insert по-прежнему добавляет такт ───────────────────────────────
    await page.evaluate(() => document.querySelector('.tab-at-host')?.focus());
    const beforeInsert = await state(page);
    await page.keyboard.press('Insert');
    await wait(500);
    const afterInsert = await state(page);
    check('Клавиша Insert по-прежнему добавляет такт', afterInsert.bars - beforeInsert.bars, 1);

    // ── 8. Новая пустая вставка: стрелка и сохранение ───────────────────────
    await page.evaluate(() => {
      const bar = document.querySelector('.tab-insert-editor [data-tab-cancel]');
      bar?.click();
    });
    await wait(400);
    await page.evaluate(() => {
      document.querySelector('[data-tab-confirm-leave]')?.click();
    });
    await wait(600);
    await page.evaluate(() => {
      startNewSongFromHome();
      addSection('Verse');
      const sec = sections[0];
      sec.squares = [];
      addSquare(sec.id);
      sec.squares[0].events[0].chord = 'Em';
      renderSectionsGrid();
    });
    await wait(1600);
    await page.evaluate(() => addTabInsert(sections[0].id));
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(1300);
    await page.keyboard.press('ArrowRight');
    await wait(600);
    const freshBars = await page.evaluate(() => tabInsertEditorState.gpBars.length);
    await apply(page);
    const freshSaved = await page.evaluate(() => {
      const sq = sections[0].squares.find((q) => q.type === 'tab');
      return sq ? { bars: Math.round(sq.beats / getGridUnitsPerBar(sections[0].timeSig || globalTimeSig)), notes: sq.notes.length } : null;
    });
    check('Новая пустая вставка: такт от стрелки сохраняется (2 такта, без нот)', [freshBars, freshSaved], [2, { bars: 2, notes: 0 }]);
    await page.screenshot({ path: path.join(OUT_DIR, '03-empty-insert-two-bars.png') });

    check('На странице нет ошибок JavaScript', pageErrors, []);

    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.694', passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2) + '\n',
    );
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
