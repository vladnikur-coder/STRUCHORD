#!/usr/bin/env node
/**
 * 0.691 Acceptance & Screenshot Test — B-12.12, «пауза больше не дорисовывается»:
 * 1) пустая вставка → выбрали половинную → нажали цифру: в такте одна половинная нота,
 *    никакой лишней паузы не появилось, такт не переполнен (2 из 4, не 5 из 4);
 * 2) после любой правки хвост из автоматических пауз убирается, поэтому смена
 *    длительности ноты не оставляет «старую» паузу и не делает такт переполненным;
 * 3) серая пауза-заполнитель видна только при наведении мыши на крайнюю настоящую
 *    долю перед пустым местом; сам курсор её не рисует, в полностью пустом такте — тоже;
 * 4) «Заполнить паузами» по-прежнему доводит такт до полного видимыми паузами,
 *    а если потом увеличить ноту, лишняя пауза подрезается, а не копится.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.691');
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
    check('Версия в шапке не ниже 0.691', /ver 0\.69[1-9]/.test(ver), true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(400);

    const reset = async (notes = [], beats = 4, theme = 'light') => {
      await page.evaluate(
        ({ n, b, th }) => {
          document.documentElement.dataset.theme = th;
          const e = tabInsertEditorState;
          e.source.beats = b;
          e.source.notes = structuredClone(n);
          e.draft = structuredClone(e.source);
          e.history = [];
          e.forward = [];
          e.gpSelection = null;
          e.gpNotice = null;
          e.techPanel = null;
          tabAtInput = { dValue: 4, dots: 0, triplet: false };
          tabGpImport(e);
          renderTabInsertEditor(e);
          tabGpSetTime(e, 0, 0);
          tabAtHostEl?.focus({ preventScroll: true });
        },
        { n: notes, b: beats, th: theme },
      );
      await wait(550);
    };

    const key = async (k) => {
      await page.evaluate((key) => {
        document.querySelector('.tab-at-host').dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            code: /^[0-9]$/.test(key) ? 'Digit' + key : key,
            bubbles: true,
            cancelable: true,
          }),
        );
      }, k);
      await wait(300);
    };

    const pressDur = async (d) => {
      await page.evaluate((d) => document.querySelector(`[data-tab-dur="${d}"]`).click(), d);
      await wait(350);
    };

    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const host = e.overlay.querySelector('.tab-at-host');
        const err = e.overlay.querySelector('[data-tab-gp-error]');
        const ph = [...host.querySelectorAll('.tab-gp-placeholder')];
        return {
          bars: e.gpBars.map((bar) =>
            bar.map((g) => ({ dur: tabGpLength(g), notes: (g.notes || []).length, whole: !!g.wholeBar })),
          ),
          usedPerBar: e.gpBars.map((bar) => tabGpUsedUnits(bar)),
          totalNotes: e.gpBars.flat().reduce((s, g) => s + (g.notes || []).length, 0),
          // только видимые паузы: служебные «заполнители» хвоста не считаем
          restsInBar: e.gpBars.map(
            (bar) => bar.filter((g) => !(g.notes || []).length && !g.wholeBar && !g.filler && !g.implicit).length,
          ),
          placeholderCount: ph.length,
          placeholderVisible: ph.filter((n) => Number(getComputedStyle(n).opacity) > 0.5).length,
          errorHidden: err ? err.hidden : true,
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          padButton: err?.querySelector('[data-tab-gp-fix="pad"]')?.textContent.trim() || null,
          applyDisabled: !!e.overlay.querySelector('[data-tab-apply]')?.disabled,
        };
      });

    // Наведение на крайнюю настоящую долю перед пустым местом
    const hoverEdge = async (barIndex = 0) => {
      const point = await page.evaluate((bi) => {
        const tail = tabAtState?.tails?.get(bi);
        const start = tail ? [...tail.keys][0] : null;
        if (start == null) return null;
        const bb = tabAtBeatBoundsAt(tabAtApi, start);
        if (!bb || !bb.visualBounds) return null;
        const r = document.querySelector('.tab-at-host').getBoundingClientRect();
        return { x: r.x + bb.visualBounds.x + Math.min(bb.visualBounds.w * 0.5, 14), y: r.y + bb.visualBounds.y + bb.visualBounds.h / 2 };
      }, barIndex);
      if (!point) return false;
      await page.mouse.move(point.x, point.y);
      await wait(380);
      return true;
    };

    // === 1. Сценарий владельца: половинная длительность, затем цифра ===
    await reset([], 4);
    await pressDur(2);
    await key('3');
    let ui = await readUi();
    check(
      'Половинная длительность + цифра: в такте одна половинная нота, лишней паузы нет',
      [ui.totalNotes, ui.bars[0].map((g) => g.dur), ui.usedPerBar],
      [1, [2], [2]],
    );
    check(
      'Такт не переполнен: подсказка «2 из 4 — не заполнен», «Применить» доступна',
      [ui.errorText.includes('2 из 4 — не заполнен'), ui.applyDisabled, ui.restsInBar],
      [true, false, [0]],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '01-half-note-light.png') });

    // === 2. Смена длительности не оставляет «старую» паузу ===
    await reset([], 4);
    await key('3');
    ui = await readUi();
    check('Четвертная нота: одна доля, паузы в такте нет', [ui.usedPerBar, ui.restsInBar], [[1], [0]]);
    await pressDur(2);
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 0, 0));
    await wait(250);
    await pressDur(2);
    ui = await readUi();
    check(
      'Нота стала половинной — такт 2 из 4, а не 5 из 4 и без хвостовой паузы',
      [ui.usedPerBar, ui.bars[0].map((g) => g.dur), ui.errorText.includes('2 из 4 — не заполнен')],
      [[2], [2], true],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '02-duration-change-light.png') });

    // === 3. Серая пауза — только при наведении на крайнюю долю ===
    ui = await readUi();
    check('Сам курсор серую паузу не рисует', ui.placeholderVisible, 0);
    check('Наведение на крайнюю долю показывает серую паузу', await hoverEdge(0) && (await readUi()).placeholderVisible, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '03-grey-on-hover-light.png') });
    await page.mouse.move(5, 5);
    await wait(250);
    ui = await readUi();
    check('Мышь ушла — серая пауза снова спрятана', ui.placeholderVisible, 0);

    // В полностью пустом такте крайней доли нет: наведение ничего не рисует
    await reset([], 4);
    const emptyPoint = await page.evaluate(() => {
      const n = document.querySelector('.tab-gp-placeholder');
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (emptyPoint) {
      await page.mouse.move(emptyPoint.x, emptyPoint.y);
      await wait(350);
    }
    ui = await readUi();
    check('В полностью пустом такте наведение паузу не рисует', ui.placeholderVisible, 0);
    await page.mouse.move(5, 5);
    await wait(200);

    // === 4. «Заполнить паузами» и подрезка паузы при увеличении ноты ===
    await reset([{ start: 0, dur: 2, string: 0, fret: 3 }], 4);
    ui = await readUi();
    // 0.691: подсказка и кнопка на месте, но сохранение недописанный такт не держит.
    check('Недозаполненный такт предлагает «Заполнить паузами»', [ui.padButton, ui.applyDisabled], ['Заполнить паузами', false]);
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(500);
    ui = await readUi();
    check('После «Заполнить паузами» такт полный и «Применить» доступна', [ui.usedPerBar, ui.applyDisabled, ui.errorHidden], [[4], false, true]);
    await page.click('[data-tab-dur="1"]');
    await wait(600);
    ui = await readUi();
    check(
      'Нота выросла до целой — служебная пауза подрезана, такт по-прежнему полный',
      [ui.usedPerBar, ui.bars[0].map((g) => g.dur), ui.applyDisabled],
      [[4], [4], false],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '04-pad-then-grown-light.png') });

    // === 5. Тёмная тема ===
    await reset([{ start: 0, dur: 2, string: 0, fret: 3 }], 4, 'dark');
    ui = await readUi();
    check('Тёмная тема: половинная нота без лишней паузы', [ui.usedPerBar, ui.restsInBar, ui.placeholderVisible], [[2], [0], 0]);
    await hoverEdge(0);
    ui = await readUi();
    check('Тёмная тема: серая пауза появляется при наведении', ui.placeholderVisible, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '05-dark-hover-grey.png') });

    // === 6. Ошибок JavaScript нет ===
    check('На странице нет ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.691', passed, total: results.length, results }, null, 2),
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
