#!/usr/bin/env node
/**
 * 0.688 Acceptance & Screenshot Test — B-12.12, как в Guitar Pro 8:
 * 1) свободный хвост неполного такта больше не закрашивается паузой — там просто
 *    пустое место; серая пауза появляется, только когда курсор стоит на крайней
 *    доле перед пустотой (или в самой пустоте), а также при наведении мыши;
 * 2) неполный такт подсвечивается лёгкой красной заливкой вместо красной рамки,
 *    причём такт под курсором не заливается вовсе (как в GP);
 * 3) слова «Такт N: M из K — не заполнен» и кнопка «Заполнить паузами» остаются
 *    на месте, кнопка по-прежнему доводит такт до полного и разрешает «Применить».
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.688');
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
const TRANSPARENT = /^(rgba\(0, 0, 0, 0\)|transparent)$/;

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
    check('Версия в шапке не ниже 0.688', /ver 0\.68[8-9]|ver 0\.69\d/.test(ver), true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(250);

    const setFixture = async (notes, cursorStart = 0, cursorStr = 0, beats = 8, theme = 'light') => {
      await page.evaluate(
        ({ notesIn, cStart, cStr, b, th }) => {
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
          tabGpSetTime(e, cStart, cStr);
          tabAtHostEl?.focus({ preventScroll: true });
        },
        { notesIn: notes, cStart: cursorStart, cStr: cursorStr, b: beats, th: theme },
      );
      await wait(450);
    };

    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const host = e.overlay.querySelector('.tab-at-host');
        const err = e.overlay.querySelector('[data-tab-gp-error]');
        const apply = e.overlay.querySelector('[data-tab-apply]');
        const boxes = [...host.querySelectorAll('.tab-gp-invalid')];
        const ph = [...host.querySelectorAll('.tab-gp-placeholder')];
        const ghost = [...host.querySelectorAll('.tab-gp-ghost')];
        return {
          bars: e.gpBars.length,
          groupsPerBar: e.gpBars.map((bar) => bar.length),
          invalidCount: boxes.length,
          invalidFill: boxes.map((n) => getComputedStyle(n).backgroundColor),
          invalidCurrent: boxes.map((n) => n.classList.contains('is-current')),
          placeholderCount: ph.length,
          placeholderVisible: ph.filter((n) => Number(getComputedStyle(n).opacity) > 0.5).length,
          placeholderFill: ph.length ? getComputedStyle(ph[0].querySelector('text')).fill : null,
          ghostAll: ghost.length,
          errorHidden: err ? err.hidden : true,
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          padButton: err?.querySelector('[data-tab-gp-fix="pad"]')?.textContent.trim() || null,
          usedPerBar: e.gpBars.map((bar) => tabGpUsedUnits(bar)),
          applyDisabled: !!apply?.disabled,
          cursorPoint: { ...e.gpCursor },
        };
      });

    // 0.691: серая пауза появляется при наведении на крайнюю настоящую долю перед пустотой.
    const hoverEdge = async (barIndex = 0) => {
      const point = await page.evaluate((bi) => {
        const tails = tabAtState?.tails;
        const tail = tails && tails.get(bi);
        const start = tail ? [...tail.keys][0] : null;
        if (start == null) return null;
        const bb = tabAtBeatBoundsAt(tabAtApi, start);
        if (!bb || !bb.visualBounds) return null;
        const host = document.querySelector('.tab-at-host');
        const r = host.getBoundingClientRect();
        // правая часть самой доли (ноты), чтобы попасть именно в неё
        return { x: r.x + bb.visualBounds.x + Math.min(bb.visualBounds.w * 0.5, 14), y: r.y + bb.visualBounds.y + bb.visualBounds.h / 2 };
      }, barIndex);
      if (!point) return null;
      await page.mouse.move(point.x, point.y);
      await wait(350);
      return point;
    };

    const moveMouse = async (x, y) => {
      await page.mouse.move(x, y);
      await wait(250);
    };
    const tailSpot = () =>
      page.evaluate(() => {
        const n = document.querySelector('.tab-gp-placeholder');
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { x: r.x + Math.max(6, r.width / 2), y: r.y + r.height / 2 };
      });

    // Такт 1: две ноты (неполный), такт 2: четыре ноты (полный)
    const twoBars = [
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 4, dur: 1, string: 0, fret: 7 },
      { start: 5, dur: 1, string: 1, fret: 8 },
      { start: 6, dur: 1, string: 2, fret: 10 },
      { start: 7, dur: 1, string: 3, fret: 12 },
    ];

    // === 1. Курсор в первом (неполном) такте ===
    await setFixture(twoBars, 0, 0);
    let ui = await readUi();
    check(
      'Неполный такт подсвечен, а такт под курсором — нет (без заливки)',
      [ui.bars, ui.invalidCount, ui.invalidCurrent, ui.invalidFill.map((c) => TRANSPARENT.test(c))],
      [2, 1, [true], [true]],
    );
    check(
      'Пустой хвост не закрашен паузой: заполнитель в раскладке есть, но не виден',
      [ui.placeholderCount > 0, ui.placeholderVisible],
      [true, 0],
    );
    check(
      'Слова «2 из 4 — не заполнен» и кнопка «Заполнить паузами» на месте',
      [ui.errorText.includes('Такт 1: 2 из 4 — не заполнен'), ui.padButton],
      [true, 'Заполнить паузами'],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '01-tail-empty-light.png') });

    // === 2. Наведение мыши на крайнюю долю перед пустотой — серая пауза ===
    // 0.691: сам курсор паузу больше не рисует, только наведение мыши.
    await page.evaluate(() => {
      const e = tabInsertEditorState;
      tabGpSetTime(e, 1, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(300);
    ui = await readUi();
    check(
      'Курсор на крайней доле без наведения: серой паузы нет',
      [ui.cursorPoint.bar, ui.placeholderVisible],
      [0, 0],
    );
    await hoverEdge(0);
    ui = await readUi();
    check(
      'Наведение мыши на крайнюю долю: серая пауза в хвосте появляется',
      [ui.placeholderVisible, ui.placeholderFill],
      [1, 'rgb(142, 142, 158)'],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '02-grey-rest-light.png') });
    await page.mouse.move(5, 5);
    await wait(200);

    // === 3. Наведение мыши на хвост — тоже серая пауза ===
    await setFixture(twoBars, 0, 0);
    await hoverEdge(0);
    ui = await readUi();
    check('Наведение мыши на пустой хвост показывает серую паузу', ui.placeholderVisible, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '03-hover-light.png') });
    await moveMouse(5, 5);
    ui = await readUi();
    check('Мышь ушла — серая пауза снова спрятана', ui.placeholderVisible, 0);

    // === 4. Курсор во втором такте: первый залит лёгким красным ===
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 4, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(300);
    ui = await readUi();
    check(
      'Курсор ушёл из неполного такта — появляется лёгкая красная заливка',
      [ui.invalidCount, ui.invalidCurrent, ui.invalidFill.map((c) => TRANSPARENT.test(c))],
      [1, [false], [false]],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '04-red-fill-light.png') });

    // === 5. «Заполнить паузами» по-прежнему работает ===
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 0, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(200);
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(400);
    ui = await readUi();
    check(
      '«Заполнить паузами» доводит такт и разрешает «Применить»',
      [ui.errorHidden, ui.applyDisabled, ui.placeholderCount, ui.usedPerBar],
      [true, false, 0, [4, 4]],
    );

    // === 6. Обычная пауза в конце такта остаётся видимой ===
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 3 },
        { start: 1, dur: 1, string: 0, fret: 5 },
        { start: 2, dur: 1, string: 0, fret: 7 },
        { start: 3, dur: 1, pause: true },
      ],
      0,
      0,
      4,
    );
    ui = await readUi();
    check(
      'Настоящая пауза в конце такта видна и такт считается полным',
      [ui.placeholderCount, ui.invalidCount, ui.applyDisabled, ui.errorHidden],
      [0, 0, false, true],
    );

    // === 7. Пустой такт: с 0.690 пауза-заполнитель скрыта, такт не краснеет ===
    await setFixture([], 0, 0, 4);
    ui = await readUi();
    check(
      'Пустой такт: пауза скрыта (появится при наведении), такт не подсвечен, «Применить» доступна',
      [ui.placeholderCount, ui.placeholderVisible, ui.invalidCount, ui.applyDisabled],
      [1, 0, 0, false],
    );

    // === 8. Тёмная тема: заливка есть и видна ===
    await setFixture(twoBars, 4, 0, 8, 'dark');
    ui = await readUi();
    check(
      'Тёмная тема: неполный такт залит (не прозрачный), такт под курсором — нет',
      [ui.invalidCount, ui.invalidCurrent, ui.invalidFill.map((c) => TRANSPARENT.test(c))],
      [1, [false], [false]],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '05-red-fill-dark.png') });
    await setFixture(twoBars, 1, 0, 8, 'dark');
    await hoverEdge(0);
    ui = await readUi();
    check('Тёмная тема: серая пауза в хвосте видна при наведении', ui.placeholderVisible, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '06-grey-rest-dark.png') });

    // === 9. Ошибок JavaScript нет ===
    check('На странице нет ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.688', passed, total: results.length, results }, null, 2),
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
