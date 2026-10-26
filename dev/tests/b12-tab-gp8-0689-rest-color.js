#!/usr/bin/env node
/**
 * 0.689 Acceptance & Screenshot Test — B-12.12, цвет пауз как в Guitar Pro 8:
 * 1) настоящая пауза (нота → пауза) и целая пауза в пустом такте рисуются тем же
 *    цветом, что и ноты — и в светлой, и в тёмной теме;
 * 2) приглушённым остаётся только заполнитель свободного хвоста (серая пауза
 *    под курсором на крайней доле), он заметно светлее настоящих пауз;
 * 3) поведение 0.688 не меняется: хвост пустой, заливка неполного такта на месте,
 *    «Заполнить паузами» работает.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.689');
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
    check('Версия в шапке не ниже 0.689', /ver 0\.68[9]|ver 0\.69\d/.test(ver), true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(250);

    const setFixture = async (notes, time = 0, theme = 'light', beats = 12) => {
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

    // Что нарисовано и каким цветом
    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const host = e.overlay.querySelector('.tab-at-host');
        const css = getComputedStyle(document.documentElement);
        const beats = [...tabAtState.beatInfo.entries()].map(([beat, info]) => {
          const text = host.querySelector(`.b${beat.id} text`);
          return {
            bar: info.bar,
            start: info.start,
            rest: !!info.rest,
            placeholder: !!info.placeholder,
            fill: text ? getComputedStyle(text).fill : null,
            opacity: (() => {
              const g = host.querySelector(`.b${beat.id}`);
              return g ? Number(getComputedStyle(g).opacity) : null;
            })(),
          };
        });
        const boxes = [...host.querySelectorAll('.tab-gp-invalid')];
        return {
          beats,
          vars: {
            primary: css.getPropertyValue('--color-text-primary').trim().toUpperCase(),
            secondary: css.getPropertyValue('--color-text-secondary').trim().toUpperCase(),
            tertiary: css.getPropertyValue('--color-text-tertiary').trim().toUpperCase(),
          },
          noteFill: beats.find((b) => !b.rest)?.fill || null,
          realRestFill: beats.find((b) => b.rest && !b.placeholder)?.fill || null,
          placeholderFill: beats.find((b) => b.rest && b.placeholder)?.fill || null,
          placeholderVisible: beats.filter((b) => b.placeholder && b.opacity > 0.5).length,
          invalidCount: boxes.length,
          invalidFill: boxes.map((n) => getComputedStyle(n).backgroundColor),
          applyDisabled: !!e.overlay.querySelector('[data-tab-apply]')?.disabled,
        };
      });

    // Такт 1: нота, настоящая пауза, нота, пустой хвост.
    // Такт 2: две ноты и пустой хвост. Такт 3: пустой такт (целая пауза).
    const fixture = [
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, pause: true },
      { start: 2, dur: 1, string: 1, fret: 5 },
      { start: 4, dur: 1, string: 0, fret: 7 },
      { start: 5, dur: 1, string: 1, fret: 8 },
      { start: 8, dur: 4, pause: true },
    ];

    // === 1. Светлая тема: курсор на крайней доле второго такта ===
    await setFixture(fixture, 5, 'light');
    let ui = await readUi();
    check(
      'Светлая тема: настоящая пауза — того же цвета, что и ноты',
      [ui.noteFill, ui.realRestFill],
      ['rgb(30, 30, 47)', 'rgb(30, 30, 47)'],
    );
    check(
      'Светлая тема: целая пауза в пустом такте — тоже цветом нот',
      ui.beats.find((b) => b.bar === 2)?.fill,
      'rgb(30, 30, 47)',
    );
    check(
      'Светлая тема: заполнитель в хвосте светлее настоящей паузы',
      [ui.placeholderFill, ui.placeholderFill !== ui.realRestFill],
      ['rgb(142, 142, 158)', true],
    );
    check('Светлая тема: заполнитель виден под курсором', ui.placeholderVisible, 1);
    await page.screenshot({ path: path.join(OUT_DIR, '01-rests-light.png') });

    // === 2. Тёмная тема ===
    await setFixture(fixture, 5, 'dark');
    ui = await readUi();
    check(
      'Тёмная тема: настоящая пауза — того же цвета, что и ноты',
      [ui.noteFill, ui.realRestFill],
      ['rgb(236, 236, 234)', 'rgb(236, 236, 234)'],
    );
    check(
      'Тёмная тема: целая пауза в пустом такте — тоже цветом нот',
      ui.beats.find((b) => b.bar === 2)?.fill,
      'rgb(236, 236, 234)',
    );
    check(
      'Тёмная тема: заполнитель заметно приглушён',
      [ui.placeholderFill, ui.placeholderFill !== ui.realRestFill],
      ['rgb(125, 125, 120)', true],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '02-rests-dark.png') });

    // === 3. Поведение 0.688 не тронуто ===
    await setFixture(fixture, 0, 'light');
    ui = await readUi();
    check(
      'Пустой хвост по-прежнему без паузы, а неполный такт — с красной заливкой',
      [ui.placeholderVisible, ui.invalidCount > 0, ui.invalidFill.some((c) => !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(c))],
      [0, true, true],
    );
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 2, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(350);
    ui = await readUi();
    check('Крайняя доля перед пустотой показывает серую паузу', ui.placeholderVisible, 1);

    // «Заполнить паузами» доводит такт и разрешает «Применить»
    await page.evaluate(() => {
      tabGpSetTime(tabInsertEditorState, 0, 0);
      tabAtHostEl?.focus({ preventScroll: true });
    });
    await wait(200);
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(450);
    ui = await readUi();
    check(
      'После «Заполнить паузами» заполнителей нет, «Применить» доступна',
      [ui.beats.filter((b) => b.placeholder).length, ui.applyDisabled],
      [0, false],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '03-after-pad-light.png') });

    // === 4. Ошибок JavaScript нет ===
    check('На странице нет ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.689', passed, total: results.length, results }, null, 2),
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
