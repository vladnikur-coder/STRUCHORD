#!/usr/bin/env node
/**
 * 0.690 Acceptance & Screenshot Test — B-12.12, пустой такт без тревоги:
 * 1) такт без единой доли (только что созданная вставка, «+ Такт» или такт, из которого
 *    удалили все доли) больше не рисует целую паузу: на стане пусто, такт честно
 *    заканчивается сразу после тактовой черты;
 * 2) серая пауза-заполнитель видна, только когда курсор стоит в этом такте
 *    или на такт наведена мышь;
 * 3) пустой такт не подсвечивается красным и не запрещает «Применить» —
 *    в отличие от недозаполненного такта, который остаётся как в 0.688;
 * 4) сохранение пустой такт не выбрасывает: количество тактов и длина вставки
 *    остаются прежними, после повторного открытия всё так же пусто.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.690');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  results.push({ name, ok, actual, expected });
  if (!ok) {
    console.error(`FAIL: ${name}\n  expected: ${b}\n  actual:   ${a}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const execPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 2 });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });

    const ver = await page.$eval('#devPanelTrigger', (el) => el.textContent.trim());
    check('Версия в шапке не ниже 0.690', /ver 0\.69[0-9]/.test(ver), true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(350);

    const setFixture = async (notes, time = 0, theme = 'light', beats = 8) => {
      await page.evaluate(
        ({ notesIn, t, th, b }) => {
          document.documentElement.dataset.theme = th;
          const toastEl = document.getElementById('toast');
          if (toastEl) toastEl.classList.remove('show');
          const e = tabInsertEditorState;
          const sq = e.source;
          sq.beats = b;
          sq.notes = structuredClone(notesIn);
          e.draft = structuredClone(sq);
          e.history = [];
          e.forward = [];
          e.gpSelection = null;
          e.gpNotice = null;
          e.techPanel = null;
          tabGpImport(e);
          renderTabInsertEditor(e);
          tabGpSetTime(e, t, 0);
          tabAtHostEl?.focus({ preventScroll: true });
        },
        { notesIn: notes, t: time, th: theme, b: beats },
      );
      await wait(500);
    };

    const key = async (code, { shift = false } = {}) => {
      await page.evaluate(
        ({ c, s }) => {
          document.querySelector('.tab-at-host').dispatchEvent(
            new KeyboardEvent('keydown', { key: c, code: c, shiftKey: s, bubbles: true, cancelable: true }),
          );
        },
        { c: code, s: shift },
      );
      await wait(220);
    };

    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const host = e.overlay.querySelector('.tab-at-host');
        const err = e.overlay.querySelector('[data-tab-gp-error]');
        const apply = e.overlay.querySelector('[data-tab-apply]');
        const ph = [...host.querySelectorAll('.tab-gp-placeholder')];
        const boxes = [...host.querySelectorAll('.tab-gp-invalid')];
        return {
          bars: e.gpBars.length,
          groupsPerBar: e.gpBars.map((bar) => bar.length),
          usedPerBar: e.gpBars.map((bar) => tabGpUsedUnits(bar)),
          placeholderCount: ph.length,
          placeholderVisible: ph.filter((n) => Number(getComputedStyle(n).opacity) > 0.5).length,
          invalidCount: boxes.length,
          invalidFill: boxes.map((n) => getComputedStyle(n).backgroundColor),
          errorHidden: err ? err.hidden : true,
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          padButton: err?.querySelector('[data-tab-gp-fix="pad"]')?.textContent.trim() || null,
          applyDisabled: !!apply?.disabled,
          cursorPoint: { ...e.gpCursor },
        };
      });

    const notes4 = [
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ];

    // === 1. Свежая вставка: такт пустой, но без тревоги ===
    await page.evaluate(() => {
      const e = tabInsertEditorState;
      e.source.beats = 4;
      e.source.notes = [];
      e.draft = structuredClone(e.source);
      e.history = [];
      e.forward = [];
      e.gpSelection = null;
      e.gpNotice = null;
      e.techPanel = null;
      tabGpImport(e);
      renderTabInsertEditor(e);
      tabGpSetTime(e, 0, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(600);
    let ui = await readUi();
    check(
      'Свежий пустой такт: пауза не нарисована, красного нет, «Применить» доступна',
      [ui.usedPerBar, ui.placeholderVisible, ui.invalidCount, ui.applyDisabled],
      [[0], 1, 0, false],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '01-fresh-bar-light.png') });

    // Курсор уходит в пустоту — пауза скрывается
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 1, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(350);
    ui = await readUi();
    check('В пустом такте пауза видна только под курсором', ui.placeholderVisible, 1);

    // === 2. Такт, из которого удалили все доли ===
    await setFixture(notes4, 0, 'light', 4);
    ui = await readUi();
    check('Такт с четырьмя нотами полный: не подсвечен, «Применить» доступна', [ui.usedPerBar, ui.invalidCount, ui.applyDisabled], [[4], 0, false]);
    for (let i = 0; i < 4; i++) await key('Delete', { shift: true });
    await wait(350);
    ui = await readUi();
    check(
      'После удаления всех долей такт пуст, но не тревожен: пауза скрыта, красного нет, «Применить» доступна',
      [ui.usedPerBar, ui.placeholderCount, ui.invalidCount, ui.applyDisabled, ui.errorHidden],
      [[0], 1, 0, false, true],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '02-emptied-bar-light.png') });

    // === 3. Два такта: первый заполнен, второй пустой ===
    await setFixture(notes4, 0, 'light', 8);
    ui = await readUi();
    check(
      'Первый такт полный, второй пустой и не подсвечен',
      [ui.usedPerBar, ui.invalidCount, ui.applyDisabled],
      [[4, 0], 0, false],
    );
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 4, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(350);
    ui = await readUi();
    check('Курсор в пустом такте: серая пауза видна, красного нет', [ui.placeholderVisible, ui.invalidCount], [1, 0]);
    await page.screenshot({ path: path.join(OUT_DIR, '03-second-bar-empty-light.png') });

    // === 4. Недозаполненный такт остаётся как в 0.688 ===
    await setFixture(notes4.slice(0, 3), 0, 'light', 4);
    ui = await readUi();
    check(
      'Недозаполненный такт по-прежнему объясняет себя и ждёт «Заполнить паузами»',
      [ui.usedPerBar, ui.errorText.includes('3 из 4 — не заполнен'), ui.padButton, ui.applyDisabled],
      [[3], true, 'Заполнить паузами', true],
    );
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 3, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(300);
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(450);
    ui = await readUi();
    check('«Заполнить паузами» доводит такт и разрешает «Применить»', [ui.usedPerBar, ui.errorHidden, ui.applyDisabled], [[4], true, false]);

    // === 5. Тёмная тема ===
    await setFixture(notes4, 4, 'dark', 8);
    ui = await readUi();
    check('Тёмная тема: пустой такт без красного, его пауза под курсором видна', [ui.usedPerBar, ui.invalidCount, ui.placeholderVisible], [[4, 0], 0, 1]);
    await page.screenshot({ path: path.join(OUT_DIR, '04-empty-bar-dark.png') });

    // === 6. Сохранение не выбрасывает пустой такт ===
    await setFixture(notes4, 0, 'light', 8);
    await page.evaluate(() => document.querySelector('[data-tab-apply]').click());
    await wait(900);
    const saved = await page.evaluate(() => {
      const sec = sections[0];
      const sq = sec.squares.find((s) => s.type === 'tab');
      return sq ? { beats: sq.beats, notes: sq.notes.length } : null;
    });
    check('После «Применить» вставка сохранила 8 долей (два такта) и четыре ноты', saved, { beats: 8, notes: 4 });

    await page.evaluate(() => {
      const sec = sections[0];
      const sq = sec.squares.find((s) => s.type === 'tab');
      openTabInsertEditor(sec.id, sq.id);
    });
    await wait(1200);
    ui = await readUi();
    check(
      'После повторного открытия пустой такт снова пустой, без красного и без запрета',
      [ui.bars, ui.usedPerBar, ui.invalidCount, ui.applyDisabled],
      [2, [4, 0], 0, false],
    );

    // === 7. Ошибок JavaScript нет ===
    check('На странице нет ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.690', passed, total: results.length, results }, null, 2),
    );
    console.log(`\n${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
